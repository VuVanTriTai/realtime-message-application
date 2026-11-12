package com.project.realtime._messaging_application.modules.Conversation.service;

import com.project.realtime._messaging_application.modules.Conversation.dto.MemberReceiptResponse;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.websocket.ChatWebSocketHandler.DeliveryReceipt;
import com.project.realtime._messaging_application.websocket.ChatWebSocketHandler.ReadReceipt;
import com.project.realtime._messaging_application.websocket.pubsub.RedisEventType;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Service quản lý Dual ACK Cursor (delivered & read) với cơ chế:
 * 1. Monotonic Update: con trỏ chỉ tăng, chống out-of-order ACK do mạng.
 * 2. Ghi trước vào Redis (In-memory buffer) & bắn Pub/Sub realtime cho người gửi.
 * 3. Scheduled Background Job gom lô (Micro-batching) mỗi 3 giây ghi xuống PostgreSQL
 *    bằng 1 câu lệnh UPDATE ... FROM (VALUES ...) duy nhất.
 */
@Service
public class ReceiptService {

    private static final Logger log = LoggerFactory.getLogger(ReceiptService.class);

    public static final String KEY_DELIVERED_PREFIX = "receipt:delivered:";
    public static final String KEY_READ_PREFIX      = "receipt:read:";
    public static final String KEY_DIRTY_MEMBERS    = "receipt:dirty_members";

    private final StringRedisTemplate           redisTemplate;
    private final RedisMessagePublisher         redisPublisher;
    private final JdbcTemplate                  jdbcTemplate;
    private final ConversationMemberRepository  memberRepo;
    private final MessageRepository             messageRepo;

    // Lua script: cập nhật con trỏ delivered chỉ khi seq mới > seq cũ
    private final DefaultRedisScript<Long> deliveredScript;
    // Lua script: cập nhật con trỏ read chỉ khi seq mới > seq cũ (đồng thời đảm bảo delivered >= read)
    private final DefaultRedisScript<Long> readScript;

    public ReceiptService(StringRedisTemplate redisTemplate,
                          RedisMessagePublisher redisPublisher,
                          JdbcTemplate jdbcTemplate,
                          ConversationMemberRepository memberRepo,
                          MessageRepository messageRepo) {
        this.redisTemplate   = redisTemplate;
        this.redisPublisher  = redisPublisher;
        this.jdbcTemplate    = jdbcTemplate;
        this.memberRepo      = memberRepo;
        this.messageRepo     = messageRepo;

        this.deliveredScript = new DefaultRedisScript<>();
        this.deliveredScript.setResultType(Long.class);
        this.deliveredScript.setScriptText("""
                local current = redis.call('HGET', KEYS[1], ARGV[1])
                if not current or tonumber(ARGV[2]) > tonumber(current) then
                    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
                    redis.call('SADD', KEYS[2], ARGV[3])
                    return 1
                end
                return 0
                """);

        this.readScript = new DefaultRedisScript<>();
        this.readScript.setResultType(Long.class);
        this.readScript.setScriptText("""
                local currentRead = redis.call('HGET', KEYS[1], ARGV[1])
                local updated = 0
                if not currentRead or tonumber(ARGV[2]) > tonumber(currentRead) then
                    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
                    redis.call('SADD', KEYS[3], ARGV[3])
                    updated = 1
                end
                local currentDelivered = redis.call('HGET', KEYS[2], ARGV[1])
                if not currentDelivered or tonumber(ARGV[2]) > tonumber(currentDelivered) then
                    redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
                    redis.call('SADD', KEYS[3], ARGV[3])
                end
                return updated
                """);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Ghi nhận ACK Delivered (Đã tới thiết bị - 2 tick xám)
    // ──────────────────────────────────────────────────────────────────────────

    public void recordDelivered(Long conversationId, Long userId, Long seq) {
        if (conversationId == null || userId == null || seq == null || seq <= 0) return;

        String hashKey   = KEY_DELIVERED_PREFIX + conversationId;
        String dirtyKey  = KEY_DIRTY_MEMBERS;
        String memberKey = conversationId + ":" + userId;

        try {
            Long result = redisTemplate.execute(
                    deliveredScript,
                    List.of(hashKey, dirtyKey),
                    userId.toString(),
                    seq.toString(),
                    memberKey
            );

            // result == 1 nghĩa là seq mới lớn hơn seq cũ, Redis đã được cập nhật
            if (result != null && result == 1L) {
                // Publish event realtime qua Redis Pub/Sub để người gửi thấy đổi icon ngay
                DeliveryReceipt receipt = new DeliveryReceipt(conversationId, userId, seq);
                redisPublisher.publish(conversationId, RedisEventType.DELIVERY_RECEIPT, receipt);
                log.debug("Recorded DELIVERED conv={} user={} seq={}", conversationId, userId, seq);
            }
        } catch (Exception e) {
            log.warn("Failed to record delivered in Redis: {}", e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Ghi nhận ACK Read (Đã xem - 2 tick xanh)
    // ──────────────────────────────────────────────────────────────────────────

    public void recordRead(Long conversationId, Long userId, Long seq, Long messageId) {
        if (conversationId == null || userId == null) return;

        // Nếu client chỉ truyền messageId (legacy) mà không có seq, tra cứu seq từ messageId
        Long resolvedSeq = seq;
        if (resolvedSeq == null && messageId != null) {
            resolvedSeq = messageRepo.findById(messageId)
                    .map(Message::getSeq)
                    .orElse(null);
        }

        if (resolvedSeq == null || resolvedSeq <= 0) return;

        String readHashKey      = KEY_READ_PREFIX + conversationId;
        String deliveredHashKey = KEY_DELIVERED_PREFIX + conversationId;
        String dirtyKey         = KEY_DIRTY_MEMBERS;
        String memberKey        = conversationId + ":" + userId;

        try {
            Long result = redisTemplate.execute(
                    readScript,
                    List.of(readHashKey, deliveredHashKey, dirtyKey),
                    userId.toString(),
                    resolvedSeq.toString(),
                    memberKey
            );

            if (result != null && result == 1L) {
                ReadReceipt receipt = new ReadReceipt(conversationId, userId, messageId, resolvedSeq);
                redisPublisher.publish(conversationId, RedisEventType.READ_RECEIPT, receipt);
                log.debug("Recorded READ conv={} user={} seq={} msgId={}", conversationId, userId, resolvedSeq, messageId);
            }
        } catch (Exception e) {
            log.warn("Failed to record read in Redis: {}", e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Lấy trạng thái receipts hiện tại của cuộc trò chuyện (kết hợp Redis + DB)
    // ──────────────────────────────────────────────────────────────────────────

    public List<MemberReceiptResponse> getReceipts(Long conversationId) {
        List<ConversationMember> members = memberRepo.findAllByConversationIdWithUser(conversationId);
        if (members.isEmpty()) return Collections.emptyList();

        // Đọc cache từ Redis Hash
        Map<Object, Object> redisDelivered = Collections.emptyMap();
        Map<Object, Object> redisRead      = Collections.emptyMap();
        try {
            redisDelivered = redisTemplate.opsForHash().entries(KEY_DELIVERED_PREFIX + conversationId);
            redisRead      = redisTemplate.opsForHash().entries(KEY_READ_PREFIX + conversationId);
        } catch (Exception e) {
            log.warn("Failed to read receipts from Redis: {}", e.getMessage());
        }

        List<MemberReceiptResponse> list = new ArrayList<>();
        for (ConversationMember cm : members) {
            Long uid = cm.getUser().getId();
            String uidStr = uid.toString();

            long deliveredSeq = cm.getLastDeliveredSeq() != null ? cm.getLastDeliveredSeq() : 0L;
            if (redisDelivered.containsKey(uidStr)) {
                try {
                    deliveredSeq = Math.max(deliveredSeq, Long.parseLong(redisDelivered.get(uidStr).toString()));
                } catch (NumberFormatException ignored) {}
            }

            long readSeq = cm.getLastReadSeq() != null ? cm.getLastReadSeq() : 0L;
            if (redisRead.containsKey(uidStr)) {
                try {
                    readSeq = Math.max(readSeq, Long.parseLong(redisRead.get(uidStr).toString()));
                } catch (NumberFormatException ignored) {}
            }

            list.add(new MemberReceiptResponse(uid, deliveredSeq, readSeq));
        }

        return list;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Micro-batching Background Job: gom các thay đổi từ Redis ghi vào PostgreSQL
    // ──────────────────────────────────────────────────────────────────────────

    @Scheduled(fixedDelayString = "${app.receipt.flush-delay-ms:3000}")
    public void flushDirtyReceiptsToDb() {
        Set<String> dirtyMembers;
        try {
            dirtyMembers = redisTemplate.opsForSet().members(KEY_DIRTY_MEMBERS);
        } catch (Exception e) {
            log.warn("Cannot access Redis dirty_members: {}", e.getMessage());
            return;
        }

        if (dirtyMembers == null || dirtyMembers.isEmpty()) {
            return;
        }

        List<String> items = new ArrayList<>(dirtyMembers);
        int chunkSize = 500; // Mỗi chunk tối đa 500 records trong 1 câu SQL

        for (int i = 0; i < items.size(); i += chunkSize) {
            List<String> batch = items.subList(i, Math.min(i + chunkSize, items.size()));
            flushChunk(batch);
        }
    }

    private void flushChunk(List<String> memberKeys) {
        // Thu thập tuple (convId, userId, deliveredSeq, readSeq)
        List<Object[]> rows = new ArrayList<>();
        List<String> flushedKeys = new ArrayList<>();

        for (String memberKey : memberKeys) {
            String[] parts = memberKey.split(":");
            if (parts.length != 2) continue;

            try {
                Long convId = Long.parseLong(parts[0]);
                Long userId = Long.parseLong(parts[1]);

                String delVal  = (String) redisTemplate.opsForHash().get(KEY_DELIVERED_PREFIX + convId, userId.toString());
                String readVal = (String) redisTemplate.opsForHash().get(KEY_READ_PREFIX + convId, userId.toString());

                long deliveredSeq = delVal != null ? Long.parseLong(delVal) : 0L;
                long readSeq      = readVal != null ? Long.parseLong(readVal) : 0L;

                if (deliveredSeq > 0 || readSeq > 0) {
                    rows.add(new Object[]{convId, userId, deliveredSeq, readSeq});
                    flushedKeys.add(memberKey);
                }
            } catch (Exception e) {
                log.warn("Error parsing dirty member {}: {}", memberKey, e.getMessage());
            }
        }

        if (rows.isEmpty()) {
            if (!memberKeys.isEmpty()) {
                redisTemplate.opsForSet().remove(KEY_DIRTY_MEMBERS, memberKeys.toArray());
            }
            return;
        }

        // Tạo câu SQL: UPDATE conversation_members AS cm ... FROM (VALUES (?, ?, ?, ?), ...)
        StringBuilder sql = new StringBuilder("""
                UPDATE conversation_members AS cm
                SET last_delivered_seq = GREATEST(COALESCE(cm.last_delivered_seq, 0), v.delivered_seq),
                    last_read_seq      = GREATEST(COALESCE(cm.last_read_seq, 0), v.read_seq)
                FROM (VALUES\s""");

        List<Object> params = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append("(?::bigint, ?::bigint, ?::bigint, ?::bigint)");
            Object[] r = rows.get(i);
            params.add(r[0]);
            params.add(r[1]);
            params.add(r[2]);
            params.add(r[3]);
        }

        sql.append(") AS v(conv_id, uid, delivered_seq, read_seq) ");
        sql.append("WHERE cm.conversation_id = v.conv_id AND cm.user_id = v.uid;");

        try {
            int updated = jdbcTemplate.update(sql.toString(), params.toArray());
            log.debug("Flushed {} receipts to DB (updated {} rows)", rows.size(), updated);

            // Xóa các key đã flush thành công khỏi Redis dirty set
            redisTemplate.opsForSet().remove(KEY_DIRTY_MEMBERS, flushedKeys.toArray());
        } catch (Exception e) {
            log.error("Failed to batch update receipts to PostgreSQL: {}", e.getMessage(), e);
        }
    }

    @PreDestroy
    public void onShutdown() {
        log.info("ReceiptService shutting down, flushing remaining dirty receipts to DB...");
        try {
            flushDirtyReceiptsToDb();
        } catch (Exception e) {
            log.error("Error during shutdown flush: {}", e.getMessage());
        }
    }
}


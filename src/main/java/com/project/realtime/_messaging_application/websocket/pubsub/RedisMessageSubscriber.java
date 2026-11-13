package com.project.realtime._messaging_application.websocket.pubsub;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.realtime._messaging_application.modules.Conversation.dto.UserInboxEvent;
import com.project.realtime._messaging_application.modules.Conversation.service.ConversationMemberCacheService;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.websocket.ChatWebSocketHandler.DeliveryReceipt;
import com.project.realtime._messaging_application.websocket.ChatWebSocketHandler.ReadReceipt;
import com.project.realtime._messaging_application.websocket.ChatWebSocketHandler.TypingEvent;
import com.project.realtime._messaging_application.websocket.WebSocketEventListener.PresenceEvent;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * RedisMessageSubscriber – nhận event từ Redis, forward tới WebSocket clients.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Mỗi instance server đăng ký listener này với RedisMessageListenerContainer.
 * Khi có message trên Redis, Redis đẩy tới tất cả subscriber (tất cả instance).
 * Mỗi instance nhận, deserialize, rồi dùng SimpMessagingTemplate push tới
 * WebSocket clients đang kết nối VỚI INSTANCE ĐÓ.
 *
 * Kết quả: dù Alice kết nối Instance A, Bob kết nối Instance B,
 * tin nhắn vẫn tới được Bob.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * STOMP destinations được push theo từng event type:
 *   NEW_MESSAGE  → /topic/conversation.{id} (dành cho client đang mở phòng chat)
 *                  + /topic/user.{userId}   (Single Inbox Channel cho TẤT CẢ thành viên)
 *   TYPING       → /topic/conversation.{id}.typing
 *   READ_RECEIPT → /topic/conversation.{id}.read
 *   PRESENCE     → /topic/conversation.{id}.presence
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OPTIMIZATION (Hot Path – Zero DB in fanout):
 *   - Danh sách thành viên được cache In-Memory (Caffeine, TTL 5 phút).
 *   - countUnread bị loại khỏi hot path: Frontend tự tăng badge +1 khi nhận
 *     event. Đây là pattern chuẩn của Slack/Telegram/Discord.
 *   - Toàn bộ fanout chạy ZERO Database Connection.
 * ─────────────────────────────────────────────────────────────────────────
 */
@Component
public class RedisMessageSubscriber implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(RedisMessageSubscriber.class);

    private final SimpMessagingTemplate           messagingTemplate;
    private final ObjectMapper                    objectMapper;
    private final Timer                           fanoutDurationTimer;
    private final ConversationMemberCacheService  memberCache;
    // ── Stage Timers ──
    private final Timer                           stageRedisTransitTimer;
    private final Timer                           stageConsumerToSocketTimer;
    private final Timer                           stageSubscriberParseTimer;
    private final Timer                           stageSubscriberDedupeTimer;

    // ── In-Memory Deduplication Cache (Caffeine) ──
    // Giữ 100.000 messageId gần nhất trong RAM, TTL 10 phút.
    // Kiểm tra và chặn trùng lặp chỉ mất ~0.0001 ms, hoàn toàn Zero-Network I/O.
    private final com.github.benmanes.caffeine.cache.Cache<Long, Boolean> localDedupeCache =
            com.github.benmanes.caffeine.cache.Caffeine.newBuilder()
                    .maximumSize(100_000)
                    .expireAfterWrite(Duration.ofMinutes(10))
                    .build();

    public RedisMessageSubscriber(SimpMessagingTemplate messagingTemplate,
                                  ObjectMapper objectMapper,
                                  Timer fanoutDurationTimer,
                                  ConversationMemberCacheService memberCache,
                                  Timer stageRedisTransitTimer,
                                  Timer stageConsumerToSocketTimer,
                                  Timer stageSubscriberParseTimer,
                                  Timer stageSubscriberDedupeTimer) {
        this.messagingTemplate          = messagingTemplate;
        this.objectMapper               = objectMapper;
        this.fanoutDurationTimer        = fanoutDurationTimer;
        this.memberCache                = memberCache;
        this.stageRedisTransitTimer     = stageRedisTransitTimer;
        this.stageConsumerToSocketTimer = stageConsumerToSocketTimer;
        this.stageSubscriberParseTimer  = stageSubscriberParseTimer;
        this.stageSubscriberDedupeTimer = stageSubscriberDedupeTimer;
    }

    /**
     * Được gọi bởi Redis mỗi khi có message trên channel đã subscribe.
     *
     * @param message   raw bytes từ Redis (JSON của RedisEnvelope)
     * @param pattern   pattern đã match (nếu dùng pSubscribe) – không dùng ở đây
     */
    @Override
    public void onMessage(Message message, byte[] pattern) {
        // ── 1. ĐO ĐÚNG: Ghi nhận thời điểm nhận frame ngay dòng đầu tiên ──
        final long onMessageEntryMillis = System.currentTimeMillis();
        final long startParse = System.nanoTime();

        try {
            // Parse 1 lần duy nhất từ byte[] (Single-pass parse trực tiếp từ buffer)
            RedisEnvelope envelope = objectMapper.readValue(message.getBody(), RedisEnvelope.class);
            Long          convId   = envelope.getConversationId();
            JsonNode      payload  = envelope.getPayload();

            // ── Stage 3: Pure Redis Transit Latency ──
            // Đo thuần túy từ lúc PUBLISH lên Redis đến lúc listener thread nhận và chạm onMessage
            // (loại bỏ hoàn toàn chi phí parse, dedupe và network round-trip)
            if (envelope.getPublishedAt() != null && envelope.getPublishedAt() > 0) {
                long pureTransitMs = onMessageEntryMillis - envelope.getPublishedAt();
                if (pureTransitMs >= 0 && pureTransitMs < 30_000) {
                    stageRedisTransitTimer.record(pureTransitMs, TimeUnit.MILLISECONDS);
                }
            }

            switch (envelope.getEventType()) {

                case NEW_MESSAGE -> {
                    // Chuyển JsonNode đã parse sẵn sang MessageResponse (không re-lex JSON String)
                    MessageResponse msg = objectMapper.treeToValue(payload, MessageResponse.class);
                    stageSubscriberParseTimer.record(System.nanoTime() - startParse, TimeUnit.NANOSECONDS);

                    // ── Lớp phòng thủ cốt lõi: In-memory Dedupe (0.001 ms, ZERO network call) ──
                    if (msg.id() != null) {
                        long startDedupe = System.nanoTime();
                        Boolean isFirst = localDedupeCache.asMap().putIfAbsent(msg.id(), Boolean.TRUE) == null;
                        stageSubscriberDedupeTimer.record(System.nanoTime() - startDedupe, TimeUnit.NANOSECONDS);

                        if (!isFirst) {
                            log.debug("[Consumer-Dedupe] Duplicate message msgId={}, dropped", msg.id());
                            return;
                        }
                    }

                    // ── Stage 4: Consumer → ghi xuống tất cả socket (fanout) ─
                    long startFanout = System.nanoTime();

                    // 1. [Active Chat Room Topic]
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId, msg);

                    // 2. [Single Inbox Channel / User Channel - Chuẩn Enterprise]
                    fanoutToUserChannels(convId, msg);

                    long fanoutNs = System.nanoTime() - startFanout;
                    fanoutDurationTimer.record(fanoutNs, TimeUnit.NANOSECONDS);
                    stageConsumerToSocketTimer.record(fanoutNs, TimeUnit.NANOSECONDS);
                    log.debug("Forwarded NEW_MESSAGE conv={} msg={}", convId, msg.id());
                }

                case TYPING -> {
                    TypingEvent typingEvent = objectMapper.treeToValue(payload, TypingEvent.class);
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId + ".typing", typingEvent);
                    log.trace("Forwarded TYPING conv={} user={}", convId, typingEvent.userId());
                }

                case DELIVERY_RECEIPT -> {
                    DeliveryReceipt receipt = objectMapper.treeToValue(payload, DeliveryReceipt.class);
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId + ".delivered", receipt);
                    log.trace("Forwarded DELIVERY_RECEIPT conv={} user={} seq={}", convId, receipt.userId(), receipt.seq());
                }

                case READ_RECEIPT -> {
                    ReadReceipt receipt = objectMapper.treeToValue(payload, ReadReceipt.class);
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId + ".read", receipt);
                    log.trace("Forwarded READ_RECEIPT conv={} user={} seq={}", convId, receipt.userId(), receipt.seq());
                }

                case PRESENCE -> {
                    PresenceEvent presenceEvent = objectMapper.treeToValue(payload, PresenceEvent.class);
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId + ".presence", presenceEvent);
                    log.debug("Forwarded PRESENCE conv={} user={} online={}",
                            convId, presenceEvent.userId(), presenceEvent.online());
                }

                case CONVERSATION_JOINED, CONVERSATION_LEFT -> {
                    // envelope.getConversationId() chứa target userId
                    messagingTemplate.convertAndSend(
                            "/topic/user." + convId, payload != null ? payload.toString() : "");
                    log.debug("Forwarded {} to /topic/user.{}", envelope.getEventType(), convId);
                }

                case CACHE_EVICT_CONV_MEMBERS -> {
                    memberCache.evictLocal(convId);
                    log.debug("Cache invalidated for conv={} via Redis Pub/Sub", convId);
                }

                default -> log.warn("Unknown event type: {}", envelope.getEventType());
            }

        } catch (Exception e) {
            log.error("Failed to process Redis message error: {}", e.getMessage(), e);
        }
    }

    /**
     * Bắn event rút gọn tới kênh cá nhân /topic/user.{userId} của từng thành viên.
     *
     * ─── ZERO DB HOT PATH ───
     * - Danh sách userId: Lấy từ Caffeine Cache (RAM) thay vì query PostgreSQL.
     *   Cache được warm lần đầu khi conversation có tin nhắn, TTL 5 phút.
     * - unreadCount: Không còn SELECT COUNT(*) FROM messages.
     *   Thay vào đó gửi unreadIncrement=1 để Frontend tự tăng badge +1.
     *   Pattern này chuẩn với Slack / Telegram / Discord.
     * ────────────────────────
     */
    private void fanoutToUserChannels(Long convId, MessageResponse msg) {
        try {
            // [Cache] Lấy danh sách userId từ Caffeine – ZERO DB nếu cache hit
            List<Long> memberIds = memberCache.getMemberIds(convId);
            Long senderId = (msg.sender() != null) ? msg.sender().id() : null;

            for (Long memberId : memberIds) {
                // unreadIncrement=1: Frontend tự cộng badge, không cần server đếm DB
                // senderId nhận 0 (người gửi không tăng badge của chính họ)
                long unreadIncrement = (senderId != null && senderId.equals(memberId)) ? 0L : 1L;

                UserInboxEvent inboxEvent = UserInboxEvent.of(convId, msg, unreadIncrement);
                messagingTemplate.convertAndSend("/topic/user." + memberId, inboxEvent);
            }
        } catch (Exception e) {
            log.error("Failed to fan-out inbox event to user channels for convId={}: {}", convId, e.getMessage());
        }
    }
}

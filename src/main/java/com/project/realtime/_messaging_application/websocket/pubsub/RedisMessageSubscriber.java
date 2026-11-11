package com.project.realtime._messaging_application.websocket.pubsub;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.realtime._messaging_application.modules.Conversation.dto.UserInboxEvent;
import com.project.realtime._messaging_application.modules.Conversation.service.ConversationMemberCacheService;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
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

    public RedisMessageSubscriber(SimpMessagingTemplate messagingTemplate,
                                  ObjectMapper objectMapper,
                                  Timer fanoutDurationTimer,
                                  ConversationMemberCacheService memberCache) {
        this.messagingTemplate   = messagingTemplate;
        this.objectMapper        = objectMapper;
        this.fanoutDurationTimer = fanoutDurationTimer;
        this.memberCache         = memberCache;
    }

    /**
     * Được gọi bởi Redis mỗi khi có message trên channel đã subscribe.
     *
     * @param message   raw bytes từ Redis (JSON của RedisEnvelope)
     * @param pattern   pattern đã match (nếu dùng pSubscribe) – không dùng ở đây
     */
    @Override
    public void onMessage(Message message, byte[] pattern) {
        String json = new String(message.getBody());

        try {
            RedisEnvelope envelope = objectMapper.readValue(json, RedisEnvelope.class);
            Long          convId   = envelope.getConversationId();
            String        payload  = envelope.getPayload();

            switch (envelope.getEventType()) {

                case NEW_MESSAGE -> {
                    MessageResponse msg = objectMapper.readValue(payload, MessageResponse.class);
                    long startFanout = System.nanoTime();

                    // 1. [Active Chat Room Topic]
                    // Push tới những ai đang MỞ phòng chat này (/topic/conversation.{convId})
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId, msg);

                    // 2. [Single Inbox Channel / User Channel - Chuẩn Enterprise]
                    // Push tới kênh cá nhân (/topic/user.{userId}) của TẤT CẢ thành viên
                    // Giúp cập nhật sidebar realtime, số tin chưa đọc, preview tin nhắn mới
                    // mà KHÔNG CẦN client phải subscribe hàng trăm phòng chat!
                    fanoutToUserChannels(convId, msg);

                    fanoutDurationTimer.record(System.nanoTime() - startFanout, TimeUnit.NANOSECONDS);
                    log.debug("Forwarded NEW_MESSAGE conv={} msg={}", convId, msg.id());
                }

                case TYPING -> {
                    TypingEvent typingEvent = objectMapper.readValue(payload, TypingEvent.class);
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId + ".typing", typingEvent);
                    log.trace("Forwarded TYPING conv={} user={}", convId, typingEvent.userId());
                }

                case READ_RECEIPT -> {
                    ReadReceipt receipt = objectMapper.readValue(payload, ReadReceipt.class);
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId + ".read", receipt);
                    log.trace("Forwarded READ_RECEIPT conv={} user={}", convId, receipt.userId());
                }

                case PRESENCE -> {
                    PresenceEvent presenceEvent = objectMapper.readValue(payload, PresenceEvent.class);
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId + ".presence", presenceEvent);
                    log.debug("Forwarded PRESENCE conv={} user={} online={}",
                            convId, presenceEvent.userId(), presenceEvent.online());
                }

                case CONVERSATION_JOINED, CONVERSATION_LEFT -> {
                    // envelope.getConversationId() chứa target userId
                    messagingTemplate.convertAndSend(
                            "/topic/user." + convId, payload);
                    log.debug("Forwarded {} to /topic/user.{}", envelope.getEventType(), convId);
                }

                default -> log.warn("Unknown event type: {}", envelope.getEventType());
            }

        } catch (Exception e) {
            log.error("Failed to process Redis message: {} | error: {}", json, e.getMessage(), e);
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

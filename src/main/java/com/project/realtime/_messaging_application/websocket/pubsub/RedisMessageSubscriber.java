package com.project.realtime._messaging_application.websocket.pubsub;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.websocket.ChatWebSocketHandler.ReadReceipt;
import com.project.realtime._messaging_application.websocket.ChatWebSocketHandler.TypingEvent;
import com.project.realtime._messaging_application.websocket.WebSocketEventListener.PresenceEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

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
 *   NEW_MESSAGE  → /topic/conversation.{id}
 *   TYPING       → /topic/conversation.{id}.typing
 *   READ_RECEIPT → /topic/conversation.{id}.read
 *   PRESENCE     → /topic/conversation.{id}.presence
 */
@Component
public class RedisMessageSubscriber implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(RedisMessageSubscriber.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper          objectMapper;

    public RedisMessageSubscriber(SimpMessagingTemplate messagingTemplate,
                                  ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper      = objectMapper;
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
                    // Push tới tất cả subscriber của conversation trên instance này
                    messagingTemplate.convertAndSend(
                            "/topic/conversation." + convId, msg);
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
}

package com.project.realtime._messaging_application.websocket.pubsub;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * RedisMessagePublisher – PUBLISH event lên Redis channel.
 *
 * Convention đặt tên channel:
 *   "chat:conv:{conversationId}"
 *
 * Ví dụ conversation id = 5 → channel = "chat:conv:5"
 * Tất cả instance đang subscribe "chat:conv:5" đều nhận được message ngay lập tức.
 *
 * Tại sao dùng StringRedisTemplate thay vì RedisTemplate<String,Object>?
 * - Tránh phụ thuộc vào serializer cụ thể (Java Serialization có vấn đề với versioning).
 * - JSON String là format trung lập, dễ debug (có thể đọc trực tiếp trong redis-cli).
 * - Subscriber dùng cùng ObjectMapper để deserialize → nhất quán.
 */
@Service
public class RedisMessagePublisher {

    private static final Logger log = LoggerFactory.getLogger(RedisMessagePublisher.class);

    /** Prefix của tất cả channel chat */
    public static final String CHANNEL_PREFIX = "chat:conv:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper        objectMapper;

    public RedisMessagePublisher(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper  = objectMapper;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Publish một object bất kỳ lên channel của conversation.
     *
     * @param conversationId id của conversation
     * @param eventType      loại event (NEW_MESSAGE, TYPING, READ_RECEIPT, PRESENCE)
     * @param payload        object sẽ được serialize thành JSON
     */
    public void publish(Long conversationId, RedisEventType eventType, Object payload) {
        try {
            // Serialize payload thành JSON String
            String payloadJson = objectMapper.writeValueAsString(payload);

            // Bọc vào envelope
            RedisEnvelope envelope = new RedisEnvelope(eventType, conversationId, payloadJson);
            String envelopeJson    = objectMapper.writeValueAsString(envelope);

            // Tên channel
            String channel = CHANNEL_PREFIX + conversationId;

            // PUBLISH – O(1), fire-and-forget
            redisTemplate.convertAndSend(channel, envelopeJson);

            log.debug("Published {} to channel '{}': {}", eventType, channel, payloadJson);

        } catch (JsonProcessingException e) {
            log.error("Failed to serialize payload for channel chat:conv:{}: {}",
                    conversationId, e.getMessage());
        }
    }
}

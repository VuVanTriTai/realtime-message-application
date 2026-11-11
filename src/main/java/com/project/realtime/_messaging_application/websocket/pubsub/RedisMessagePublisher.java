package com.project.realtime._messaging_application.websocket.pubsub;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * RedisMessagePublisher de PUBLISH event len Redis channel.
 *
 * Convention dat ten channel: "chat:conv:{conversationId}"
 *
 * Co 3 method publish:
 *  - publish(convId, eventType, Object)   : serialize Object -> JSON roi publish
 *  - publishRaw(convId, eventType, String): payload JSON da co san, dung boi OutboxPoller
 *  - publishCacheEvict(convId)            : broadcast lệnh xóa cache tới tất cả instance
 */
@Service
public class RedisMessagePublisher {

    private static final Logger log = LoggerFactory.getLogger(RedisMessagePublisher.class);

    public static final String CHANNEL_PREFIX             = "chat:conv:";
    public static final String USER_CHANNEL_PREFIX        = "chat:user:";
    /** Channel riêng cho distributed cache invalidation – không lẫn vào luồng chat */
    public static final String CACHE_EVICT_CHANNEL_PREFIX = "cache:evict:convMembers:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper        objectMapper;

    public RedisMessagePublisher(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper  = objectMapper;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Publish mot object bat ky len channel cua conversation.
     * Dung boi ChatWebSocketHandler cho TYPING, READ_RECEIPT, PRESENCE (van inline).
     */
    public void publish(Long conversationId, RedisEventType eventType, Object payload) {
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            publishRaw(conversationId, eventType, payloadJson);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize payload for channel chat:conv:{}: {}",
                    conversationId, e.getMessage());
        }
    }

    /**
     * Publish event ca nhan cho mot user cu the (vi du: duoc add vao nhom moi).
     */
    public void publishToUser(Long userId, RedisEventType eventType, Object payload) {
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            RedisEnvelope envelope = new RedisEnvelope(eventType, userId, payloadJson);
            String envelopeJson = objectMapper.writeValueAsString(envelope);
            String channel = USER_CHANNEL_PREFIX + userId;

            redisTemplate.convertAndSend(channel, envelopeJson);
            log.debug("Published {} to user channel '{}': {}", eventType, channel, payloadJson);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize payload for user {}: {}", userId, e.getMessage());
        } catch (Exception e) {
            log.warn("Failed to publish to Redis user channel {}: {}", userId, e.getMessage());
        }
    }

    /**
     * Publish voi payload JSON da duoc serialize san.
     * Dung boi OutboxPoller: payload da duoc luu trong outbox, khong can serialize lai.
     * Throw RuntimeException neu publish that bai de OutboxPoller co the xu ly retry.
     */
    public void publishRaw(Long conversationId, RedisEventType eventType, String payloadJson) {
        try {
            RedisEnvelope envelope     = new RedisEnvelope(eventType, conversationId, payloadJson);
            String        envelopeJson = objectMapper.writeValueAsString(envelope);
            String        channel      = CHANNEL_PREFIX + conversationId;

            redisTemplate.convertAndSend(channel, envelopeJson);

            log.debug("Published {} to channel '{}': {}", eventType, channel, payloadJson);
        } catch (JsonProcessingException e) {
            log.error("Failed to wrap envelope for chat:conv:{}: {}", conversationId, e.getMessage());
            throw new RuntimeException("Redis publishRaw failed", e);
        }
    }

    /**
     * Broadcast yêu cầu xóa cache thành viên tới TẤT CẢ instance trong cluster.
     *
     * Pattern Distributed Cache Invalidation via Pub/Sub:
     *   - Channel: "cache:evict:convMembers:{convId}" (tách biệt khỏi luồng chat)
     *   - Mọi instance subscribe "cache:*" đều nhận và tự evict local cache.
     *   - Không throw exception để không làm hỏng luồng nghiệp vụ chính;
     *     TTL 5 phút là safety net cuối cùng nếu publish thất bại.
     *
     * @param conversationId ID của conversation cần invalidate cache thành viên
     */
    public void publishCacheEvict(Long conversationId) {
        try {
            RedisEnvelope envelope     = new RedisEnvelope(
                    RedisEventType.CACHE_EVICT_CONV_MEMBERS, conversationId, "{}");
            String        envelopeJson = objectMapper.writeValueAsString(envelope);
            String        channel      = CACHE_EVICT_CHANNEL_PREFIX + conversationId;

            redisTemplate.convertAndSend(channel, envelopeJson);
            log.debug("Published CACHE_EVICT_CONV_MEMBERS to channel '{}'", channel);
        } catch (Exception e) {
            log.warn("Failed to publish cache evict for convId={}: {}", conversationId, e.getMessage());
        }
    }
}

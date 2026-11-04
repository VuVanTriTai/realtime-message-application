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
 * Co 2 method publish:
 *  - publish(convId, eventType, Object)   : serialize Object -> JSON roi publish
 *  - publishRaw(convId, eventType, String): payload JSON da co san, dung boi OutboxPoller
 */
@Service
public class RedisMessagePublisher {

    private static final Logger log = LoggerFactory.getLogger(RedisMessagePublisher.class);

    public static final String CHANNEL_PREFIX = "chat:conv:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper        objectMapper;

    public RedisMessagePublisher(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper  = objectMapper;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Public API
    // ────────────────────────────────────────────────────────────────────────

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
}
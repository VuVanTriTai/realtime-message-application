package com.project.realtime._messaging_application.websocket.pubsub;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Phong bì (envelope) bọc mọi loại event trước khi publish lên Redis.
 *
 * Tối ưu Single-Pass JSON:
 *   payload là JsonNode (object lồng trực tiếp) thay vì String JSON bị escape.
 *   Giúp serialize 1 lần ở Publisher và parse 1 lần duy nhất ở Subscriber,
 *   loại bỏ lãng phí CPU và GC do parse 2 lần.
 */
public class RedisEnvelope {

    private RedisEventType eventType;
    private Long           conversationId;

    /**
     * Nội dung thực sự của event – được parse 1 lần duy nhất cùng với Envelope.
     */
    private JsonNode payload;

    /**
     * Thời điểm publish lên Redis (epoch millis) để đo độ trễ chặng Redis (transit latency).
     */
    private Long publishedAt;

    // ──────────────────────────────────────────────────────────────────────
    // Constructors
    // ──────────────────────────────────────────────────────────────────────

    public RedisEnvelope() {}

    public RedisEnvelope(RedisEventType eventType, Long conversationId, JsonNode payload) {
        this(eventType, conversationId, payload, System.currentTimeMillis());
    }

    public RedisEnvelope(RedisEventType eventType, Long conversationId, JsonNode payload, Long publishedAt) {
        this.eventType      = eventType;
        this.conversationId = conversationId;
        this.payload        = payload;
        this.publishedAt    = publishedAt != null ? publishedAt : System.currentTimeMillis();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Getters & Setters
    // ──────────────────────────────────────────────────────────────────────

    public RedisEventType getEventType()                     { return eventType; }
    public void setEventType(RedisEventType eventType)       { this.eventType = eventType; }

    public Long getConversationId()                          { return conversationId; }
    public void setConversationId(Long conversationId)       { this.conversationId = conversationId; }

    public JsonNode getPayload()                             { return payload; }
    public void setPayload(JsonNode payload)                 { this.payload = payload; }

    public Long getPublishedAt()                             { return publishedAt; }
    public void setPublishedAt(Long publishedAt)             { this.publishedAt = publishedAt; }
}

package com.project.realtime._messaging_application.websocket.pubsub;

/**
 * Phong bì (envelope) bọc mọi loại event trước khi publish lên Redis.
 *
 * Tại sao dùng một channel chung thay vì nhiều channel?
 * ─────────────────────────────────────────────────────────────────
 * Dùng một channel "chat:conv:{conversationId}" cho mọi event của conversation:
 *   - Ít SUBSCRIBE hơn (1 subscription / conversation / instance)
 *   - Dễ quản lý lifecycle (subscribe khi có thành viên join, unsubscribe khi tất cả rời)
 *   - eventType phân biệt loại event để subscriber xử lý đúng cách
 *
 * Cấu trúc JSON trong Redis:
 * {
 *   "eventType": "NEW_MESSAGE",
 *   "conversationId": 1,
 *   "payload": "{ ...MessageResponse JSON... }"
 * }
 *
 * payload là String (JSON đã serialize) để tránh generic type erasure khi deserialize.
 */
public class RedisEnvelope {

    private RedisEventType eventType;
    private Long           conversationId;

    /**
     * Nội dung thực sự của event – đã serialize thành JSON String.
     * Subscriber sẽ deserialize lại tuỳ theo eventType.
     */
    private String payload;

    // ──────────────────────────────────────────────────────────────────────
    // Constructors
    // ──────────────────────────────────────────────────────────────────────

    public RedisEnvelope() {}

    public RedisEnvelope(RedisEventType eventType, Long conversationId, String payload) {
        this.eventType      = eventType;
        this.conversationId = conversationId;
        this.payload        = payload;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Getters & Setters (Jackson cần để serialize/deserialize)
    // ──────────────────────────────────────────────────────────────────────

    public RedisEventType getEventType()                     { return eventType; }
    public void setEventType(RedisEventType eventType)       { this.eventType = eventType; }

    public Long getConversationId()                          { return conversationId; }
    public void setConversationId(Long conversationId)       { this.conversationId = conversationId; }

    public String getPayload()                               { return payload; }
    public void setPayload(String payload)                   { this.payload = payload; }
}

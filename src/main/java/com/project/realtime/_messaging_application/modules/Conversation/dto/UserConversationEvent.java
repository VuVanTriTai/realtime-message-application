package com.project.realtime._messaging_application.modules.Conversation.dto;

/**
 * Event cá nhân gửi riêng cho một user qua WebSocket (topic: /topic/user.{userId})
 * khi user được thêm vào nhóm mới, có cuộc trò chuyện mới hoặc bị kick khỏi nhóm.
 */
public record UserConversationEvent(
        String                      type,           // "JOINED" | "LEFT"
        ConversationSummaryResponse conversation,   // thông tin conversation (khi type = "JOINED")
        Long                        conversationId  // id của conversation
) {
    public static UserConversationEvent joined(ConversationSummaryResponse conv) {
        return new UserConversationEvent("JOINED", conv, conv != null ? conv.id() : null);
    }

    public static UserConversationEvent left(Long convId) {
        return new UserConversationEvent("LEFT", null, convId);
    }
}


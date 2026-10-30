package com.project.realtime._messaging_application.modules.Conversation.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Request tạo conversation DIRECT (chat 1-1).
 */
public record CreateDirectConversationRequest(
        @NotNull(message = "Phải chỉ định người nhận")
        Long targetUserId
) {}

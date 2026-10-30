package com.project.realtime._messaging_application.modules.Message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request gửi tin nhắn qua REST hoặc WebSocket (STOMP payload).
 *
 * clientMessageId: UUID do client tự sinh trước khi gửi.
 *   - Dùng để dedupe khi client retry sau khi mất mạng.
 *   - Cần unique per (conversationId, senderId, clientMessageId).
 *
 * replyToId: id của tin nhắn được trả lời. Null = tin mới.
 */
public record SendMessageRequest(

        @NotNull(message = "conversationId không được null")
        Long conversationId,

        @NotBlank(message = "clientMessageId không được để trống")
        @Size(max = 64, message = "clientMessageId tối đa 64 ký tự")
        String clientMessageId,

        @NotBlank(message = "Nội dung tin nhắn không được để trống")
        @Size(max = 4000, message = "Tin nhắn tối đa 4000 ký tự")
        String content,

        String type,        // mặc định TEXT nếu null

        Long replyToId      // null nếu không phải reply
) {
}

package com.project.realtime._messaging_application.modules.Message.dto;

import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.User.dto.UserProfileResponse;

import java.time.Instant;

/**
 * DTO trả về thông tin một tin nhắn cho client.
 *
 * Khi tin bị xoá mềm (deleted_at != null):
 *  - content   → null (ẩn nội dung)
 *  - isDeleted → true
 * Client hiển thị placeholder "Tin nhắn đã bị xoá".
 */
public record MessageResponse(
        Long               id,
        Long               conversationId,
        UserProfileResponse sender,        // null nếu tin SYSTEM
        String             clientMessageId,
        String             content,        // null khi isDeleted = true
        String             type,
        ReplyPreview       replyTo,        // null nếu không phải reply
        Instant            createdAt,
        Instant            editedAt,
        boolean            isEdited,
        boolean            isDeleted
) {
    public static MessageResponse fromEntity(Message m) {
        boolean deleted = m.isDeleted();
        return new MessageResponse(
                m.getId(),
                m.getConversation().getId(),
                m.getSender() != null
                        ? UserProfileResponse.fromEntityPublic(m.getSender())
                        : null,
                m.getClientMessageId(),
                deleted ? null : m.getContent(),   // ẩn nội dung khi bị xoá
                m.getType().name(),
                m.getReplyTo() != null
                        ? ReplyPreview.fromEntity(m.getReplyTo())
                        : null,
                m.getCreatedAt(),
                m.getEditedAt(),
                m.isEdited(),
                deleted
        );
    }

    /**
     * Preview ngắn của tin nhắn được trả lời.
     * Hiển thị dưới dạng trích dẫn trong bubble chat.
     */
    public record ReplyPreview(
            Long    id,
            String  senderUsername,
            String  contentPreview   // tối đa 100 ký tự
    ) {
        public static ReplyPreview fromEntity(Message replied) {
            String preview = replied.isDeleted()
                    ? "Tin nhắn đã bị xoá"
                    : (replied.getContent().length() > 100
                    ? replied.getContent().substring(0, 100) + "…"
                    : replied.getContent());
            return new ReplyPreview(
                    replied.getId(),
                    replied.getSender() != null ? replied.getSender().getUsername() : "System",
                    preview
            );
        }
    }
}

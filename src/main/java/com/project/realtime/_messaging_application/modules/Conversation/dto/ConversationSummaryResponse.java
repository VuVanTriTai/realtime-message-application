package com.project.realtime._messaging_application.modules.Conversation.dto;

import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.Message.entity.MessageType;
import com.project.realtime._messaging_application.modules.User.Entity.User;

import java.time.Instant;
import java.time.LocalDateTime;

/**
 * DTO tra ve thong tin mot conversation trong danh sach chat (sidebar).
 */
public record ConversationSummaryResponse(
        Long              id,
        String            type,
        String            name,
        String            directKey,
        Long              createdById,
        LocalDateTime     createdAt,
        Long              lastMessageId,
        Instant           lastMessageAt,
        long              unreadCount,
        Long              otherUserId,       // (DIRECT only) userId cua nguoi kia
        String            otherUserName,     // (DIRECT only) ten hien thi cua nguoi kia
        String            avatarUrl,         // [ADDED] avatarUrl cua conversation (DIRECT la avatar cua otherUser)
        boolean           isOnline,          // trang thai online hien tai
        boolean           isStranger,        // (DIRECT only) true neu nguoi kia chua phai ban be
        LastMessagePreview lastMessage        // [ADDED] preview tin nhan cuoi cho sidebar
) {

    /**
     * Preview ngan cua tin nhan cuoi - hien thi trong sidebar conversation list.
     */
    public record LastMessagePreview(
            Long    id,
            String  content,
            String  type,
            String  fileName,
            String  senderName,
            String  senderUsername,
            Long    senderId,
            boolean deleted,
            Instant createdAt
    ) {
        public static LastMessagePreview fromMessage(Message m) {
            if (m == null) return null;
            boolean isDeleted = m.isDeleted();
            String sName = m.getSender() != null
                    ? (m.getSender().getDisplayName() != null && !m.getSender().getDisplayName().isBlank()
                        ? m.getSender().getDisplayName()
                        : m.getSender().getUsername())
                    : "System";

            String previewContent;
            if (isDeleted) {
                previewContent = "Tin nhắn đã thu hồi";
            } else if (m.getType() == MessageType.IMAGE) {
                previewContent = "[Hình ảnh]" + (m.getFileName() != null && !m.getFileName().isBlank() ? " " + m.getFileName() : "");
            } else if (m.getType() == MessageType.FILE) {
                previewContent = "[Tệp] " + (m.getFileName() != null && !m.getFileName().isBlank() ? m.getFileName() : "đính kèm");
            } else {
                String c = m.getContent();
                if (c != null && (c.startsWith("http://") || c.startsWith("https://")) && (c.contains("cloudinary") || c.contains("/upload/"))) {
                    previewContent = "[Tệp đính kèm]";
                } else {
                    previewContent = c;
                }
            }

            return new LastMessagePreview(
                    m.getId(),
                    previewContent,
                    m.getType() != null ? m.getType().name() : "TEXT",
                    m.getFileName(),
                    sName,
                    m.getSender() != null ? m.getSender().getUsername() : null,
                    m.getSender() != null ? m.getSender().getId() : null,
                    isDeleted,
                    m.getCreatedAt()
            );
        }
    }

    /** Tao response cho GROUP conversation. */
    public static ConversationSummaryResponse fromEntity(
            Conversation conv,
            ConversationMember myMembership,
            long unreadCount,
            Message lastMsg
    ) {
        return new ConversationSummaryResponse(
                conv.getId(),
                conv.getType().name(),
                conv.getName(),
                conv.getDirectKey(),
                conv.getCreatedBy() != null ? conv.getCreatedBy().getId() : null,
                conv.getCreatedAt(),
                conv.getLastMessageId(),
                conv.getLastMessageAt(),
                unreadCount,
                null,
                null,
                null,
                false,
                false,
                LastMessagePreview.fromMessage(lastMsg)
        );
    }

    /** Tao response cho DIRECT conversation - kem thong tin nguoi kia va trang thai online. */
    public static ConversationSummaryResponse fromEntityWithOtherUser(
            Conversation conv,
            ConversationMember myMembership,
            long unreadCount,
            User otherUser,
            boolean isOnline,
            boolean isStranger,
            Message lastMsg
    ) {
        String displayName = (otherUser.getDisplayName() != null && !otherUser.getDisplayName().isBlank())
                ? otherUser.getDisplayName()
                : otherUser.getUsername();

        return new ConversationSummaryResponse(
                conv.getId(),
                conv.getType().name(),
                conv.getName(),
                conv.getDirectKey(),
                conv.getCreatedBy() != null ? conv.getCreatedBy().getId() : null,
                conv.getCreatedAt(),
                conv.getLastMessageId(),
                conv.getLastMessageAt(),
                unreadCount,
                otherUser.getId(),
                displayName,
                otherUser.getAvatarUrl(),
                isOnline,
                isStranger,
                LastMessagePreview.fromMessage(lastMsg)
        );
    }
}
package com.project.realtime._messaging_application.modules.Conversation.dto;

import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
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
        boolean           isOnline,          // trang thai online hien tai
        LastMessagePreview lastMessage        // [ADDED] preview tin nhan cuoi cho sidebar
) {

    /**
     * Preview ngan cua tin nhan cuoi - hien thi trong sidebar conversation list.
     */
    public record LastMessagePreview(
            Long    id,
            String  content,
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
            return new LastMessagePreview(
                    m.getId(),
                    isDeleted ? null : m.getContent(),
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
                isOnline,
                LastMessagePreview.fromMessage(lastMsg)
        );
    }
}
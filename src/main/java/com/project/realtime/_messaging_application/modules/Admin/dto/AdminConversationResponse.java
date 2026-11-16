package com.project.realtime._messaging_application.modules.Admin.dto;

import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;

import java.time.Instant;
import java.time.LocalDateTime;

public record AdminConversationResponse(
        Long id,
        String name,
        String type,
        String directKey,
        String createdByName,
        LocalDateTime createdAt,
        Instant lastMessageAt,
        long memberCount
) {
    public static AdminConversationResponse fromEntity(Conversation conv, long memberCount) {
        String creator = conv.getCreatedBy() != null
                ? (conv.getCreatedBy().getDisplayName() != null ? conv.getCreatedBy().getDisplayName() : conv.getCreatedBy().getUsername())
                : "System";

        return new AdminConversationResponse(
                conv.getId(),
                conv.getName() != null && !conv.getName().isBlank() ? conv.getName() : (conv.getType().name() + " #" + conv.getId()),
                conv.getType().name(),
                conv.getDirectKey(),
                creator,
                conv.getCreatedAt(),
                conv.getLastMessageAt(),
                memberCount
        );
    }
}

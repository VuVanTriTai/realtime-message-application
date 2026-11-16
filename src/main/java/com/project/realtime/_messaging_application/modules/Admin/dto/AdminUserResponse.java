package com.project.realtime._messaging_application.modules.Admin.dto;

import com.project.realtime._messaging_application.modules.User.Entity.User;

import java.time.Instant;
import java.time.LocalDateTime;

public record AdminUserResponse(
        Long id,
        String username,
        String displayName,
        String email,
        String avatarUrl,
        String role,
        String status,
        LocalDateTime createdAt,
        Instant lastSeenAt,
        Instant bannedAt,
        String banReason
) {
    public static AdminUserResponse fromEntity(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getEmail(),
                user.getAvatarUrl(),
                user.getRole() != null ? user.getRole().name() : "USER",
                user.getStatus() != null ? user.getStatus().name() : "ACTIVE",
                user.getCreatedAt(),
                user.getLastSeenAt(),
                user.getBannedAt(),
                user.getBanReason()
        );
    }
}

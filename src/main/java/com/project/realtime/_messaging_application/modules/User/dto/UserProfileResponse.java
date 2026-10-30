package com.project.realtime._messaging_application.modules.User.dto;

import com.project.realtime._messaging_application.modules.User.Entity.User;

import java.time.Instant;

/**
 * DTO trả về thông tin public của một user.
 * Không bao gồm password, ban_reason hay thông tin nhạy cảm.
 *
 * Dùng trong:
 *  - /api/auth/me  (thông tin người dùng hiện tại)
 *  - Danh sách thành viên cuộc trò chuyện
 *  - Kết quả tìm kiếm người dùng
 */
public record UserProfileResponse(
        Long id,
        String username,
        String displayName,
        String avatarUrl,
        String email,           // chỉ trả về khi là chính user đó
        String role,
        String status,
        Instant lastSeenAt,
        boolean isOnline        // client tính từ lastSeenAt, server có thể override
) {
    /**
     * Tạo từ entity – dùng khi trả về profile của CHÍNH người dùng hiện tại.
     * Bao gồm email.
     */
    public static UserProfileResponse fromEntity(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                user.getEmail(),
                user.getRole().name(),
                user.getStatus().name(),
                user.getLastSeenAt(),
                isOnline(user.getLastSeenAt())
        );
    }

    /**
     * Tạo từ entity – dùng khi hiển thị profile của NGƯỜI KHÁC.
     * Ẩn email.
     */
    public static UserProfileResponse fromEntityPublic(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                null,           // ẩn email
                user.getRole().name(),
                user.getStatus().name(),
                user.getLastSeenAt(),
                isOnline(user.getLastSeenAt())
        );
    }

    /**
     * Kiểm tra user đang online: lastSeenAt trong vòng 65 giây gần đây
     * (heartbeat gửi mỗi 20-30s, ngưỡng 60s + buffer 5s).
     */
    private static boolean isOnline(Instant lastSeenAt) {
        if (lastSeenAt == null) return false;
        return Instant.now().minusSeconds(65).isBefore(lastSeenAt);
    }
}

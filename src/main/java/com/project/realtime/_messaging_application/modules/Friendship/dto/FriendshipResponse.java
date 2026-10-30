package com.project.realtime._messaging_application.modules.Friendship.dto;

import com.project.realtime._messaging_application.modules.Friendship.entity.Friendship;
import com.project.realtime._messaging_application.modules.User.dto.UserProfileResponse;

import java.time.Instant;

/**
 * DTO trả về thông tin một mối quan hệ bạn bè.
 * Bao gồm public profile của người kia trong mối quan hệ.
 */
public record FriendshipResponse(
        Long               id,
        UserProfileResponse otherUser,      // profile của người kia
        String             status,
        String             direction,       // "SENT" (tôi gửi) hoặc "RECEIVED" (tôi nhận)
        Instant            createdAt,
        Instant            updatedAt
) {
    /**
     * Tạo DTO từ entity, nhìn từ góc độ của myUserId.
     * otherUser = người kia trong mối quan hệ.
     * direction = "SENT" nếu tôi là requester, "RECEIVED" nếu tôi là addressee.
     */
    public static FriendshipResponse fromEntity(Friendship f, Long myUserId) {
        boolean iAmRequester = f.getRequester().getId().equals(myUserId);

        UserProfileResponse otherUser = UserProfileResponse.fromEntityPublic(
                iAmRequester ? f.getAddressee() : f.getRequester()
        );

        return new FriendshipResponse(
                f.getId(),
                otherUser,
                f.getStatus().name(),
                iAmRequester ? "SENT" : "RECEIVED",
                f.getCreatedAt(),
                f.getUpdatedAt()
        );
    }
}

package com.project.realtime._messaging_application.modules.Conversation.dto;

import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.User.dto.UserProfileResponse;

import java.time.LocalDateTime;

/**
 * DTO trả về thông tin một thành viên trong cuộc trò chuyện.
 */
public record ConversationMemberResponse(
        Long           memberId,
        UserProfileResponse user,
        String         role,
        LocalDateTime  joinedAt,
        Long           lastReadMessageId
) {
    public static ConversationMemberResponse fromEntity(ConversationMember cm) {
        return new ConversationMemberResponse(
                cm.getId(),
                UserProfileResponse.fromEntityPublic(cm.getUser()),
                cm.getRole().name(),
                cm.getJoinedAt(),
                cm.getLastReadMessageId()
        );
    }
}

package com.project.realtime._messaging_application.modules.Friendship.dto;

import jakarta.validation.constraints.NotNull;

/** Request gửi lời mời kết bạn tới một user */
public record SendFriendRequestDto(
        @NotNull(message = "addresseeId không được null")
        Long addresseeId
) {}

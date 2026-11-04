package com.project.realtime._messaging_application.modules.Conversation.dto;

/**
 * Request body cho API rời nhóm.
 * newOwnerId: bắt buộc nếu người rời là OWNER và còn thành viên khác.
 */
public record LeaveGroupRequest(Long newOwnerId) {}


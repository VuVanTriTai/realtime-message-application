package com.project.realtime._messaging_application.modules.Conversation.dto;

/**
 * Thông tin preview của nhóm khi user truy cập link mời.
 * Endpoint public (không yêu cầu xác thực) để user có thể xem trước
 * khi nhận được link và chưa đăng nhập hoặc chưa là thành viên.
 *
 * @param conversationId  ID của conversation nhóm
 * @param name            Tên nhóm
 * @param memberCount     Số thành viên hiện tại
 * @param createdByName   Tên người tạo nhóm
 */
public record GroupPreviewResponse(
        Long   conversationId,
        String name,
        int    memberCount,
        String createdByName
) {}


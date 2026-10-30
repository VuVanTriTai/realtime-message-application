package com.project.realtime._messaging_application.modules.Conversation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Request tạo conversation GROUP (nhóm chat).
 *
 * memberIds: danh sách user sẽ được thêm vào nhóm (không tính người tạo).
 * Người tạo tự động được thêm với role OWNER.
 */
public record CreateGroupConversationRequest(

        @NotBlank(message = "Tên nhóm không được để trống")
        @Size(max = 100, message = "Tên nhóm tối đa 100 ký tự")
        String name,

        @NotEmpty(message = "Nhóm phải có ít nhất 1 thành viên khác")
        List<Long> memberIds
) {}

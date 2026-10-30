package com.project.realtime._messaging_application.modules.User.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * DTO cho phép user cập nhật thông tin hiển thị của mình.
 * Chỉ cho phép đổi display_name và avatar_url.
 */
public record UpdateProfileRequest(

        @NotBlank(message = "Tên hiển thị không được để trống")
        @Size(min = 1, max = 100, message = "Tên hiển thị phải từ 1 đến 100 ký tự")
        String displayName,

        String avatarUrl    // null = không thay đổi avatar
) {
}

package com.project.realtime._messaging_application.modules.Admin.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateUserRoleRequest(
        @NotBlank(message = "Vai trò không được để trống")
        String role // "ADMIN" hoặc "USER"
) {}

package com.project.realtime._messaging_application.modules.Admin.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateUserStatusRequest(
        @NotBlank(message = "Trạng thái không được để trống")
        String status, // "ACTIVE" hoặc "BANNED"
        String reason
) {}

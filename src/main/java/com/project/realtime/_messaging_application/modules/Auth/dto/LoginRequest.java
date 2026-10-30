package com.project.realtime._messaging_application.modules.Auth.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        String email,

        @NotBlank(message = "Username không được để trống")
        String username,

        @NotBlank(message = "Password không được để trống")
        String password
) {
}

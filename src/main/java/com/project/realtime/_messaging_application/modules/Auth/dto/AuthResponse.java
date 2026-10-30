package com.project.realtime._messaging_application.modules.Auth.dto;

public record AuthResponse(
        String accessToken,
        String tokenType
) {
    public AuthResponse(String accessToken) {
        this(accessToken, "Bearer");
    }
}

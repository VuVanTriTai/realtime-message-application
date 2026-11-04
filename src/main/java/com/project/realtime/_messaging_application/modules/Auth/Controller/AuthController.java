package com.project.realtime._messaging_application.modules.Auth.Controller;

import com.project.realtime._messaging_application.common.ratelimit.RateLimit;
import com.project.realtime._messaging_application.modules.Auth.Service.AuthService;
import com.project.realtime._messaging_application.modules.Auth.dto.AuthTokens;
import com.project.realtime._messaging_application.modules.Auth.dto.ChangePasswordRequest;
import com.project.realtime._messaging_application.modules.Auth.dto.LoginRequest;
import com.project.realtime._messaging_application.modules.Auth.dto.RegisterRequest;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.dto.UserProfileResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @RateLimit(key = "register", limit = 3, durationInSeconds = 60)
    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        try {
            authService.register(request);
            return ResponseEntity.ok(Map.of("message", "Đăng ký tài khoản thành công!"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @RateLimit(key = "login", limit = 5, durationInSeconds = 60)
    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            AuthTokens tokens = authService.login(request);
            return ResponseEntity.ok(tokens);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", "Tên đăng nhập hoặc mật khẩu không chính xác"));
        }
    }

    /**
     * Cấp lại access token mới bằng refresh token (kèm xoay vòng refresh token).
     */
    @RateLimit(key = "refresh", limit = 10, durationInSeconds = 60)
    @PostMapping("/refresh")
    public ResponseEntity<?> refreshToken(@RequestBody Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        try {
            AuthTokens tokens = authService.refreshToken(refreshToken);
            return ResponseEntity.ok(tokens);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(401).body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * Logout thiết bị hiện tại.
     * Client gửi refreshToken trong body.
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestBody Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        authService.logout(refreshToken);
        return ResponseEntity.ok(Map.of("message", "Đăng xuất thành công"));
    }

    /**
     * Logout tất cả thiết bị (thu hồi mọi phiên của user hiện tại).
     */
    @PostMapping("/logout-all")
    public ResponseEntity<?> logoutAll(Principal connectedUser) {
        if (connectedUser == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized or token expired"));
        }
        authService.logoutAll(connectedUser.getName());
        return ResponseEntity.ok(Map.of("message", "Tất cả các phiên đăng nhập đã được thu hồi"));
    }

    @RateLimit(key = "change_password", limit = 5, durationInSeconds = 60)
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest request, Principal connectedUser) {
        if (connectedUser == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized or token expired"));
        }
        try {
            authService.changePassword(request, connectedUser);
            return ResponseEntity.ok(Map.of("message", "Đổi mật khẩu thành công"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", "Đã xảy ra lỗi: " + e.getMessage()));
        }
    }

    /**
     * Lấy thông tin user hiện tại (kiểm tra authentication và role)
     */
    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(Principal connectedUser) {
        if (connectedUser == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized"));
        }
        User user = authService.getUserByUsername(connectedUser.getName());
        return ResponseEntity.ok(UserProfileResponse.fromEntity(user));
    }
}

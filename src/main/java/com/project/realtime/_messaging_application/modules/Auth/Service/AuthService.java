package com.project.realtime._messaging_application.modules.Auth.Service;

import com.project.realtime._messaging_application.common.util.JwtTokenProvider;
import com.project.realtime._messaging_application.modules.Auth.dto.AuthTokens;
import com.project.realtime._messaging_application.modules.Auth.dto.ChangePasswordRequest;
import com.project.realtime._messaging_application.modules.Auth.dto.LoginRequest;
import com.project.realtime._messaging_application.modules.Auth.dto.RegisterRequest;
import com.project.realtime._messaging_application.modules.User.Entity.Role;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.Principal;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final AuthenticationManager authenticationManager;
    private final RefreshTokenService refreshTokenService;

    public AuthService(PasswordEncoder passwordEncoder,
                       UserRepository userRepository,
                       JwtTokenProvider tokenProvider,
                       AuthenticationManager authenticationManager,
                       RefreshTokenService refreshTokenService) {
        this.passwordEncoder = passwordEncoder;
        this.userRepository = userRepository;
        this.tokenProvider = tokenProvider;
        this.authenticationManager = authenticationManager;
        this.refreshTokenService = refreshTokenService;
    }

    public void register(RegisterRequest request) {
        if (userRepository.existsUserByUsername(request.username())) {
            throw new IllegalArgumentException("Username đã tồn tại!");
        }
        if (userRepository.existsUserByEmail(request.email())) {
            throw new IllegalArgumentException("Email đã được sử dụng!");
        }

        User user = new User(
                request.username(),
                request.email(),
                passwordEncoder.encode(request.password()));
        userRepository.save(user);
    }

    public AuthTokens login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password()));
        String username = authentication.getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found: " + username));
        String role = user.getRole() != null ? user.getRole().name() : "USER";

        String accessToken = tokenProvider.generateToken(username, role);
        String refreshToken = refreshTokenService.createRefreshToken(username);
        return new AuthTokens(accessToken, refreshToken);
    }

    public void changePassword(ChangePasswordRequest request, Principal connectedUser) {
        String username = connectedUser.getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found: " + username));

        // Kiểm tra mật khẩu cũ
        if (!passwordEncoder.matches(request.currentPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Mật khẩu hiện tại không chính xác");
        }
        if (!request.newPassword().equals(request.confirmationPassword())) {
            throw new IllegalArgumentException("Mật khẩu xác nhận không khớp");
        }
        user.setPassword(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        // Tự động thu hồi tất cả phiên đăng nhập sau khi đổi mật khẩu
        refreshTokenService.revokeAllSessions(username);
    }

    /**
     * Cấp lại access token mới từ refresh token hợp lệ (thực hiện xoay vòng token).
     */
    public AuthTokens refreshToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new IllegalArgumentException("Refresh token is required");
        }
        // Consume token cũ (GETDEL atomic)
        String username = refreshTokenService.consumeRefreshToken(refreshToken);
        if (username == null) {
            throw new IllegalArgumentException("Refresh token is invalid or expired");
        }
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found: " + username));

        String role = user.getRole() != null ? user.getRole().name() : "USER";

        // Cấp Access Token mới & Refresh Token mới (Token Rotation)
        String newAccessToken = tokenProvider.generateToken(username, role);
        String newRefreshToken = refreshTokenService.createRefreshToken(username);

        return new AuthTokens(newAccessToken, newRefreshToken);
    }

    /**
     * Logout thiết bị hiện tại — xóa một refresh token.
     */
    public void logout(String refreshToken) {
        refreshTokenService.deleteRefreshToken(refreshToken);
    }

    /**
     * Logout tất cả thiết bị — thu hồi mọi phiên của username.
     */
    public void logoutAll(String username) {
        refreshTokenService.revokeAllSessions(username);
    }

    public User getUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found: " + username));
    }
}

package com.project.realtime._messaging_application.modules.Demo;

import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AdminDemoController {

    private final UserRepository userRepository;

    public AdminDemoController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Endpoint chỉ dành riêng cho quyền ADMIN
     */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/dashboard")
    public ResponseEntity<?> getAdminDashboard(Principal principal) {
        long totalUsers = userRepository.count();
        return ResponseEntity.ok(Map.of(
                "message", "Chào mừng Quản trị viên đến với Bảng điều khiển Quản trị!",
                "admin", principal.getName(),
                "totalUsers", totalUsers,
                "systemStatus", "Hoạt động bình thường",
                "features", List.of("Quản lý tài khoản", "Xem thống kê hệ thống", "Cấp quyền", "Phân tích bảo mật")
        ));
    }

    /**
     * Endpoint dành cho cả USER và ADMIN đã xác thực
     */
    @PreAuthorize("hasAnyRole('USER', 'ADMIN')")
    @GetMapping("/user/profile")
    public ResponseEntity<?> getUserProfile(Principal principal) {
        User user = userRepository.findByUsername(principal.getName()).orElse(null);
        return ResponseEntity.ok(Map.of(
                "message", "Thông tin hồ sơ cá nhân",
                "username", principal.getName(),
                "role", user != null && user.getRole() != null ? user.getRole().name() : "USER"
        ));
    }
}

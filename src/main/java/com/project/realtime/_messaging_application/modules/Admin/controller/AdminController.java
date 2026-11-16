package com.project.realtime._messaging_application.modules.Admin.controller;

import com.project.realtime._messaging_application.modules.Admin.dto.AdminConversationResponse;
import com.project.realtime._messaging_application.modules.Admin.dto.AdminStatsResponse;
import com.project.realtime._messaging_application.modules.Admin.dto.AdminUserResponse;
import com.project.realtime._messaging_application.modules.Admin.dto.UpdateUserRoleRequest;
import com.project.realtime._messaging_application.modules.Admin.dto.UpdateUserStatusRequest;
import com.project.realtime._messaging_application.modules.Admin.service.AdminService;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationType;
import com.project.realtime._messaging_application.modules.User.Entity.Role;
import com.project.realtime._messaging_application.modules.User.Entity.Status;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    /**
     * Lấy các chỉ số KPI thống kê tổng quan
     */
    @GetMapping("/stats")
    public ResponseEntity<AdminStatsResponse> getStats() {
        return ResponseEntity.ok(adminService.getStats());
    }

    /**
     * Tìm kiếm và phân trang danh sách người dùng
     */
    @GetMapping("/users")
    public ResponseEntity<Page<AdminUserResponse>> getUsers(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "15") int size
    ) {
        Status statusEnum = (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status))
                ? Status.valueOf(status.toUpperCase()) : null;
        Role roleEnum = (role != null && !role.isBlank() && !"ALL".equalsIgnoreCase(role))
                ? Role.valueOf(role.toUpperCase()) : null;

        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, size), Sort.by("id").descending());
        return ResponseEntity.ok(adminService.getUsers(search, statusEnum, roleEnum, pageable));
    }

    /**
     * Khóa hoặc Mở khóa tài khoản người dùng
     */
    @PatchMapping("/users/{id}/status")
    public ResponseEntity<?> updateUserStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserStatusRequest req,
            Principal principal
    ) {
        try {
            AdminUserResponse response = adminService.updateUserStatus(id, req, principal.getName());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * Cấp quyền hoặc hạ quyền người dùng (ADMIN <-> USER)
     */
    @PatchMapping("/users/{id}/role")
    public ResponseEntity<?> updateUserRole(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRoleRequest req,
            Principal principal
    ) {
        try {
            AdminUserResponse response = adminService.updateUserRole(id, req, principal.getName());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * Tìm kiếm và phân trang danh sách các cuộc trò chuyện / nhóm chat
     */
    @GetMapping("/conversations")
    public ResponseEntity<Page<AdminConversationResponse>> getConversations(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "15") int size
    ) {
        ConversationType typeEnum = (type != null && !type.isBlank() && !"ALL".equalsIgnoreCase(type))
                ? ConversationType.valueOf(type.toUpperCase()) : null;

        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, size));
        return ResponseEntity.ok(adminService.getConversations(search, typeEnum, pageable));
    }

    /**
     * Xóa hoặc giải tán một cuộc trò chuyện
     */
    @DeleteMapping("/conversations/{id}")
    public ResponseEntity<?> deleteConversation(@PathVariable Long id, Principal principal) {
        try {
            adminService.deleteConversation(id, principal.getName());
            return ResponseEntity.ok(Map.of("message", "Đã xóa cuộc trò chuyện thành công"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * Dashboard demo endpoint (giữ tương thích ngược)
     */
    @GetMapping("/dashboard")
    public ResponseEntity<?> getAdminDashboard(Principal principal) {
        AdminStatsResponse stats = adminService.getStats();
        return ResponseEntity.ok(Map.of(
                "message", "Chào mừng Quản trị viên đến với Bảng điều khiển Quản trị!",
                "admin", principal.getName(),
                "totalUsers", stats.totalUsers(),
                "systemStatus", "Hoạt động bình thường",
                "features", List.of("Quản lý tài khoản", "Xem thống kê hệ thống", "Cấp quyền", "Phân tích bảo mật")
        ));
    }
}

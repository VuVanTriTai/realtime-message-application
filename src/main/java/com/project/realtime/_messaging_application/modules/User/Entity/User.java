package com.project.realtime._messaging_application.modules.User.Entity;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * Bảng users – lưu tài khoản người dùng của ứng dụng nhắn tin thời gian thực.
 *
 * Các trường quan trọng:
 *  - username / email    : định danh đăng nhập, unique
 *  - display_name        : tên hiển thị trong cuộc trò chuyện (có thể khác username)
 *  - avatar_url          : ảnh đại diện
 *  - last_seen_at        : dùng để hiển thị trạng thái "Online" / "X phút trước"
 *  - status              : ACTIVE | BANNED (kiểm soát truy cập)
 *  - deleted_at          : soft-delete, không xóa vật lý để giữ nguyên lịch sử tin nhắn
 *  - banned_at / ban_reason : ghi nhận lý do khoá tài khoản
 */
@Entity
@Table(
        name = "users",
        indexes = {
                @Index(name = "idx_users_username", columnList = "username"),
                @Index(name = "idx_users_email",    columnList = "email"),
                @Index(name = "idx_users_last_seen", columnList = "last_seen_at")
        }
)
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Tên đăng nhập – dùng để authenticate, unique, không dấu cách */
    @Column(name = "username", nullable = false, unique = true, length = 50)
    private String username;

    /** Email – dùng để xác thực và khôi phục tài khoản */
    @Column(name = "email", nullable = false, unique = true, length = 100)
    private String email;

    /** Mật khẩu đã được mã hoá BCrypt – không bao giờ lưu mật khẩu thô */
    @Column(name = "password_hash", nullable = false)
    private String password;

    /**
     * Tên hiển thị trong giao diện chat (ví dụ: "Nguyễn Văn A").
     * Có thể giống hoặc khác username; mặc định lấy từ username khi đăng ký.
     */
    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    /** URL ảnh đại diện (có thể null – dùng avatar mặc định ở phía client) */
    @Column(name = "avatar_url")
    private String avatarUrl;

    // ──────────────────────────────────────────────────────────────────────
    // Timestamps
    // ──────────────────────────────────────────────────────────────────────

    /** Thời điểm tạo tài khoản – không bao giờ thay đổi sau khi ghi */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Thời điểm tài khoản được cập nhật lần cuối (đổi avatar, display name…) */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /**
     * Thời điểm người dùng online lần cuối.
     * Được cập nhật mỗi khi client gửi heartbeat WebSocket hoặc ngắt kết nối.
     * Dùng để hiển thị "Online" / "Hoạt động X phút trước" trên giao diện.
     * Kiểu Instant (UTC) để tránh lỗi múi giờ khi so sánh.
     */
    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    // ──────────────────────────────────────────────────────────────────────
    // Trạng thái & phân quyền
    // ──────────────────────────────────────────────────────────────────────

    /** Phân quyền hệ thống: USER (mặc định) hoặc ADMIN */
    @Column(name = "role", nullable = false, length = 20)
    @Enumerated(EnumType.STRING)
    private Role role;

    /** Trạng thái tài khoản: ACTIVE (hoạt động) hoặc BANNED (bị khoá) */
    @Column(name = "status", nullable = false, length = 20)
    @Enumerated(EnumType.STRING)
    private Status status;

    // ──────────────────────────────────────────────────────────────────────
    // Soft-delete & ban
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Soft-delete: khi người dùng xoá tài khoản, ghi thời điểm này thay vì xoá vật lý.
     * Lý do: tên người gửi vẫn cần hiển thị được trong lịch sử tin nhắn.
     */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    /** Thời điểm bị khoá bởi admin */
    @Column(name = "banned_at")
    private Instant bannedAt;

    /** Lý do khoá tài khoản (hiển thị cho người dùng biết) */
    @Column(name = "ban_reason", length = 500)
    private String banReason;

    // ──────────────────────────────────────────────────────────────────────
    // Constructors
    // ──────────────────────────────────────────────────────────────────────

    /** Constructor đầy đủ cho testing / admin tool */
    public User(Long id, String username, String email, String password,
                String displayName, Role role, Status status) {
        this.id          = id;
        this.username    = username;
        this.email       = email;
        this.password    = password;
        this.displayName = displayName != null ? displayName : username;
        this.role        = role   != null ? role   : Role.USER;
        this.status      = status != null ? status : Status.ACTIVE;
        this.createdAt   = LocalDateTime.now();
    }

    /** Constructor đăng ký thông thường – displayName mặc định = username */
    public User(String username, String email, String password) {
        this.username    = username;
        this.email       = email;
        this.password    = password;
        this.displayName = username;   // mặc định hiển thị theo username
        this.role        = Role.USER;
        this.status      = Status.ACTIVE;
        this.createdAt   = LocalDateTime.now();
    }

    /** Constructor đăng ký với display name tuỳ chỉnh */
    public User(String username, String email, String password, String displayName) {
        this.username    = username;
        this.email       = email;
        this.password    = password;
        this.displayName = displayName != null ? displayName : username;
        this.role        = Role.USER;
        this.status      = Status.ACTIVE;
        this.createdAt   = LocalDateTime.now();
    }

    public User() {
    }

    // ──────────────────────────────────────────────────────────────────────
    // JPA Lifecycle hooks
    // ──────────────────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (status == null)   status   = Status.ACTIVE;
        if (role == null)     role     = Role.USER;
        // displayName luôn có giá trị – fallback về username nếu null
        if (displayName == null || displayName.isBlank()) {
            displayName = username;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Business helpers
    // ──────────────────────────────────────────────────────────────────────

    /** true nếu tài khoản đã bị xoá mềm */
    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    /** true nếu tài khoản đang bị khoá */
    public boolean isBanned() {
        return this.bannedAt != null;
    }

    /**
     * Cập nhật lastSeenAt về thời điểm hiện tại.
     * Gọi mỗi khi client gửi heartbeat WebSocket hoặc khi ngắt kết nối.
     */
    public void markOnline() {
        this.lastSeenAt = Instant.now();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Getters & Setters
    // ──────────────────────────────────────────────────────────────────────

    public Long getId()                        { return id; }
    public void setId(Long id)                 { this.id = id; }

    public String getUsername()                { return username; }
    public void setUsername(String username)   { this.username = username; }

    public String getEmail()                   { return email; }
    public void setEmail(String email)         { this.email = email; }

    public String getPassword()                { return password; }
    public void setPassword(String password)   { this.password = password; }

    public String getDisplayName()             { return displayName; }
    public void setDisplayName(String displayName) {
        this.displayName = displayName != null ? displayName : username;
    }

    public String getAvatarUrl()               { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public LocalDateTime getCreatedAt()        { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt()        { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public Instant getLastSeenAt()             { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }

    public Role getRole()                      { return role; }
    public void setRole(Role role)             { this.role = role; }

    public Status getStatus()                  { return status; }
    public void setStatus(Status status)       { this.status = status; }

    public Instant getDeletedAt()              { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }

    public Instant getBannedAt()               { return bannedAt; }
    public void setBannedAt(Instant bannedAt)  { this.bannedAt = bannedAt; }

    public String getBanReason()               { return banReason; }
    public void setBanReason(String banReason) { this.banReason = banReason; }

    // ──────────────────────────────────────────────────────────────────────
    // UserDetails implementation
    // ──────────────────────────────────────────────────────────────────────

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        String roleName = role != null ? role.name() : "USER";
        return List.of(new SimpleGrantedAuthority("ROLE_" + roleName));
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return !isBanned();
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return status == Status.ACTIVE && deletedAt == null;
    }
}

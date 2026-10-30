package com.project.realtime._messaging_application.modules.User.repository;

import com.project.realtime._messaging_application.modules.User.Entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    // ──────────────────────────────────────────────────────────────────────
    // Tìm kiếm cơ bản
    // ──────────────────────────────────────────────────────────────────────

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    /** Dùng cho CustomUserDetailService – bỏ qua user đã bị xoá mềm */
    Optional<User> findByUsernameAndDeletedAtIsNull(String username);

    Optional<User> findByEmailAndDeletedAtIsNull(String email);

    // ──────────────────────────────────────────────────────────────────────
    // Kiểm tra tồn tại (validation khi đăng ký)
    // ──────────────────────────────────────────────────────────────────────

    boolean existsUserByUsername(String username);

    boolean existsUserByEmail(String email);

    // ──────────────────────────────────────────────────────────────────────
    // Tìm kiếm người dùng (tính năng tìm bạn / invite vào nhóm)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tìm user theo username hoặc display_name (ILIKE – không phân biệt hoa/thường).
     * Dùng cho tính năng tìm kiếm người dùng để chat.
     * Chỉ trả về user còn hoạt động (chưa bị xoá / khoá).
     */
    @Query("""
            SELECT u FROM User u
            WHERE u.deletedAt IS NULL
              AND u.status = 'ACTIVE'
              AND (LOWER(u.username)    LIKE LOWER(CONCAT('%', :keyword, '%'))
                OR LOWER(u.displayName) LIKE LOWER(CONCAT('%', :keyword, '%')))
            ORDER BY u.username ASC
            LIMIT 20
            """)
    List<User> searchActiveUsers(@Param("keyword") String keyword);

    // ──────────────────────────────────────────────────────────────────────
    // Presence – trạng thái online
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Cập nhật last_seen_at ngay tại DB (không cần load cả entity).
     * Gọi khi client gửi heartbeat WebSocket hoặc khi ngắt kết nối.
     */
    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.lastSeenAt = :now WHERE u.id = :userId")
    void updateLastSeenAt(@Param("userId") Long userId, @Param("now") Instant now);

    /**
     * Lấy danh sách user đang online (lastSeenAt trong vòng threshold giây gần đây).
     * Dùng để hiển thị danh sách bạn bè đang online.
     */
    @Query("""
            SELECT u FROM User u
            WHERE u.deletedAt IS NULL
              AND u.lastSeenAt >= :threshold
            """)
    List<User> findOnlineUsers(@Param("threshold") Instant threshold);

    // ──────────────────────────────────────────────────────────────────────
    // Batch lookup (dùng trong conversation service)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Lấy nhiều user theo danh sách id – dùng khi load thành viên cuộc trò chuyện.
     * Chỉ lấy user chưa bị xoá.
     */
    @Query("SELECT u FROM User u WHERE u.id IN :ids AND u.deletedAt IS NULL")
    List<User> findAllByIdInAndNotDeleted(@Param("ids") List<Long> ids);
}

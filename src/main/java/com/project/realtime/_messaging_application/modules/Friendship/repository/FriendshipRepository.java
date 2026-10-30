package com.project.realtime._messaging_application.modules.Friendship.repository;

import com.project.realtime._messaging_application.modules.Friendship.entity.Friendship;
import com.project.realtime._messaging_application.modules.Friendship.entity.FriendshipStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    // ──────────────────────────────────────────────────────────────────────
    // Lookup quan hệ giữa 2 user cụ thể
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tìm record giữa 2 user (bất kể ai là requester / addressee).
     * Dùng để kiểm tra quan hệ trước khi tạo mới hoặc cập nhật.
     */
    @Query("""
            SELECT f FROM Friendship f
            WHERE (f.requester.id = :userA AND f.addressee.id = :userB)
               OR (f.requester.id = :userB AND f.addressee.id = :userA)
            """)
    Optional<Friendship> findBetween(
            @Param("userA") Long userA,
            @Param("userB") Long userB
    );

    /**
     * Tìm record giữa 2 user với status cụ thể.
     * Dùng để kiểm tra: "Hai người này có phải bạn bè không?"
     */
    @Query("""
            SELECT f FROM Friendship f
            WHERE ((f.requester.id = :userA AND f.addressee.id = :userB)
                OR (f.requester.id = :userB AND f.addressee.id = :userA))
              AND f.status = :status
            """)
    Optional<Friendship> findBetweenWithStatus(
            @Param("userA")   Long userA,
            @Param("userB")   Long userB,
            @Param("status")  FriendshipStatus status
    );

    // ──────────────────────────────────────────────────────────────────────
    // Danh sách bạn bè & lời mời
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Danh sách tất cả bạn bè đã ACCEPTED của userId.
     * JOIN FETCH user để load thông tin hiển thị trong 1 query.
     */
    @Query("""
            SELECT f FROM Friendship f
            JOIN FETCH f.requester
            JOIN FETCH f.addressee
            WHERE (f.requester.id = :userId OR f.addressee.id = :userId)
              AND f.status = 'ACCEPTED'
            ORDER BY f.updatedAt DESC
            """)
    List<Friendship> findAcceptedFriends(@Param("userId") Long userId);

    /**
     * Lời mời kết bạn tôi NHẬN ĐƯỢC (và chưa xử lý).
     * Hiển thị trong tab "Lời mời kết bạn".
     */
    @Query("""
            SELECT f FROM Friendship f
            JOIN FETCH f.requester
            WHERE f.addressee.id = :userId
              AND f.status = 'PENDING'
            ORDER BY f.createdAt DESC
            """)
    List<Friendship> findPendingReceived(@Param("userId") Long userId);

    /**
     * Lời mời kết bạn tôi ĐÃ GỬI nhưng chưa được phản hồi.
     * Hiển thị để user biết đang chờ ai.
     */
    @Query("""
            SELECT f FROM Friendship f
            JOIN FETCH f.addressee
            WHERE f.requester.id = :userId
              AND f.status = 'PENDING'
            ORDER BY f.createdAt DESC
            """)
    List<Friendship> findPendingSent(@Param("userId") Long userId);

    // ──────────────────────────────────────────────────────────────────────
    // Block list
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Danh sách user tôi đã chặn (blockedBy = userId).
     */
    @Query("""
            SELECT f FROM Friendship f
            JOIN FETCH f.requester
            JOIN FETCH f.addressee
            WHERE f.blockedBy = :userId
              AND f.status = 'BLOCKED'
            """)
    List<Friendship> findBlockedByUser(@Param("userId") Long userId);

    /**
     * Kiểm tra xem userId có bị blockerId chặn không.
     * Dùng để chặn gửi tin nhắn / xem profile.
     */
    @Query("""
            SELECT COUNT(f) > 0 FROM Friendship f
            WHERE ((f.requester.id = :blockerId AND f.addressee.id = :targetId)
                OR (f.requester.id = :targetId  AND f.addressee.id = :blockerId))
              AND f.status = 'BLOCKED'
              AND f.blockedBy = :blockerId
            """)
    boolean isBlockedBy(
            @Param("blockerId") Long blockerId,
            @Param("targetId")  Long targetId
    );

    // ──────────────────────────────────────────────────────────────────────
    // Cập nhật trạng thái nhanh (không load entity)
    // ──────────────────────────────────────────────────────────────────────

    @Modifying
    @Transactional
    @Query("""
            UPDATE Friendship f
            SET f.status = :status, f.updatedAt = CURRENT_TIMESTAMP
            WHERE f.id = :id
            """)
    void updateStatus(
            @Param("id")     Long id,
            @Param("status") FriendshipStatus status
    );

    // ──────────────────────────────────────────────────────────────────────
    // Gợi ý bạn bè (bạn của bạn) – MVP đơn giản
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Lấy danh sách userId của tất cả bạn bè ACCEPTED.
     * Dùng để tính "bạn chung" hoặc danh sách presence online.
     */
    @Query("""
            SELECT CASE
                WHEN f.requester.id = :userId THEN f.addressee.id
                ELSE f.requester.id
            END
            FROM Friendship f
            WHERE (f.requester.id = :userId OR f.addressee.id = :userId)
              AND f.status = 'ACCEPTED'
            """)
    List<Long> findFriendIds(@Param("userId") Long userId);
}

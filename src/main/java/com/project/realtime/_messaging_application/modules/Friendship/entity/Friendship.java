package com.project.realtime._messaging_application.modules.Friendship.entity;

import com.project.realtime._messaging_application.modules.User.Entity.User;
import jakarta.persistence.*;

import java.time.Instant;

/**
 * Bảng friendships – lưu quan hệ bạn bè giữa hai user.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Thiết kế hướng:
 *
 * Mỗi row đại diện cho một CHIỀU của mối quan hệ.
 * - requester : người GỬI lời mời
 * - addressee : người NHẬN lời mời
 *
 * Unique constraint: (requester_id, addressee_id) – một cặp chỉ có 1 record.
 * Constraint CHECK: requester_id != addressee_id (không tự kết bạn).
 *
 * Ưu điểm so với thiết kế 2 chiều (2 row / cặp bạn):
 *  - Đơn giản hơn (1 row / cặp)
 *  - Rõ ai gửi lời mời, ai nhận
 *  - BLOCKED chỉ cần 1 record, tường minh ai chặn ai
 *
 * Truy vấn "danh sách bạn của userId":
 *   SELECT * FROM friendships
 *   WHERE (requester_id = :userId OR addressee_id = :userId)
 *     AND status = 'ACCEPTED'
 *
 * Truy vấn "lời mời tôi nhận được":
 *   SELECT * FROM friendships
 *   WHERE addressee_id = :userId AND status = 'PENDING'
 * ──────────────────────────────────────────────────────────────────────────
 */
@Entity
@Table(
        name = "friendships",
        uniqueConstraints = {
                // Một cặp (A, B) chỉ có đúng 1 record
                @UniqueConstraint(
                        name = "uq_friendship_pair",
                        columnNames = {"requester_id", "addressee_id"}
                )
        },
        indexes = {
                // Tìm tất cả bạn bè / lời mời của một user
                @Index(name = "idx_fs_requester", columnList = "requester_id"),
                @Index(name = "idx_fs_addressee", columnList = "addressee_id"),
                // Lọc theo status (PENDING, ACCEPTED, BLOCKED...)
                @Index(name = "idx_fs_status",    columnList = "status")
        }
)
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Người GỬI lời mời kết bạn */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_id", nullable = false, updatable = false)
    private User requester;

    /** Người NHẬN lời mời kết bạn */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "addressee_id", nullable = false, updatable = false)
    private User addressee;

    /**
     * Trạng thái hiện tại của mối quan hệ.
     * Chuyển trạng thái hợp lệ:
     *   PENDING → ACCEPTED  (addressee chấp nhận)
     *   PENDING → DECLINED  (addressee từ chối)
     *   PENDING → BLOCKED   (một trong hai chặn)
     *   ACCEPTED → BLOCKED  (một trong hai chặn sau khi đã là bạn)
     */
    @Column(name = "status", nullable = false, length = 15)
    @Enumerated(EnumType.STRING)
    private FriendshipStatus status;

    /** Thời điểm gửi lời mời */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** Thời điểm trạng thái thay đổi lần cuối (chấp nhận / từ chối / chặn) */
    @Column(name = "updated_at")
    private Instant updatedAt;

    /**
     * Người thực hiện hành động chặn (nếu status = BLOCKED).
     * Dùng để: người chặn có thể thấy record này, người bị chặn thì không thấy.
     * null khi status != BLOCKED.
     */
    @Column(name = "blocked_by")
    private Long blockedBy;

    // ──────────────────────────────────────────────────────────────────────
    // JPA Lifecycle
    // ──────────────────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (status    == null) status    = FriendshipStatus.PENDING;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Static factory
    // ──────────────────────────────────────────────────────────────────────

    public static Friendship createRequest(User requester, User addressee) {
        Friendship f  = new Friendship();
        f.requester   = requester;
        f.addressee   = addressee;
        f.status      = FriendshipStatus.PENDING;
        f.createdAt   = Instant.now();
        return f;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Business helpers
    // ──────────────────────────────────────────────────────────────────────

    public boolean isPending()  { return FriendshipStatus.PENDING  == this.status; }
    public boolean isAccepted() { return FriendshipStatus.ACCEPTED == this.status; }
    public boolean isBlocked()  { return FriendshipStatus.BLOCKED  == this.status; }

    public void accept() {
        this.status    = FriendshipStatus.ACCEPTED;
        this.updatedAt = Instant.now();
    }

    public void decline() {
        this.status    = FriendshipStatus.DECLINED;
        this.updatedAt = Instant.now();
    }

    public void block(Long blockerId) {
        this.status    = FriendshipStatus.BLOCKED;
        this.blockedBy = blockerId;
        this.updatedAt = Instant.now();
    }

    /** Lấy userId của người kia trong mối quan hệ */
    public Long getOtherUserId(Long myUserId) {
        return requester.getId().equals(myUserId)
                ? addressee.getId()
                : requester.getId();
    }

    /** true nếu userId là người bị chặn (không được phép thấy record này) */
    public boolean isBlockedBy(Long userId) {
        return isBlocked() && !userId.equals(blockedBy);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Getters & Setters
    // ──────────────────────────────────────────────────────────────────────

    public Long getId()                            { return id; }
    public void setId(Long id)                     { this.id = id; }

    public User getRequester()                     { return requester; }
    public void setRequester(User requester)       { this.requester = requester; }

    public User getAddressee()                     { return addressee; }
    public void setAddressee(User addressee)       { this.addressee = addressee; }

    public FriendshipStatus getStatus()            { return status; }
    public void setStatus(FriendshipStatus status) { this.status = status; }

    public Instant getCreatedAt()                  { return createdAt; }
    public void setCreatedAt(Instant createdAt)    { this.createdAt = createdAt; }

    public Instant getUpdatedAt()                  { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt)    { this.updatedAt = updatedAt; }

    public Long getBlockedBy()                     { return blockedBy; }
    public void setBlockedBy(Long blockedBy)       { this.blockedBy = blockedBy; }
}

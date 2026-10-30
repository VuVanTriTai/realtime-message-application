package com.project.realtime._messaging_application.modules.Conversation.entity;

import com.project.realtime._messaging_application.modules.User.Entity.User;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDateTime;

/**
 * Bảng conversations – đại diện cho một khung chat.
 *
 * Thiết kế quan trọng:
 *
 * 1. direct_key (chỉ dùng cho DIRECT):
 *    Chuỗi dạng "minUserId_maxUserId" (luôn đặt id nhỏ trước).
 *    Đảm bảo hai user không thể tạo nhiều hơn 1 cuộc trò chuyện 1-1 với nhau.
 *    Ví dụ: userId=3 và userId=7 → direct_key = "3_7"
 *
 * 2. last_message_id / last_message_at (denormalize):
 *    Lưu sẵn tin nhắn cuối để sắp xếp danh sách chat theo thứ tự mới nhất
 *    mà không cần JOIN vào bảng messages.
 *    Mỗi khi tin nhắn mới được gửi, hai trường này phải được cập nhật ngay.
 *
 * 3. Soft-delete không cần thiết ở bảng này:
 *    Khi group bị giải tán → xoá physical (cascade xoá conversation_members).
 *    Với DIRECT: không xoá, chỉ ẩn phía client (hide_for_user_id lưu ở conversation_members).
 */
@Entity
@Table(
        name = "conversations",
        indexes = {
                @Index(name = "idx_conv_direct_key",   columnList = "direct_key", unique = true),
                @Index(name = "idx_conv_created_by",   columnList = "created_by"),
                @Index(name = "idx_conv_last_msg_at",  columnList = "last_message_at")
        }
)
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Loại cuộc trò chuyện: DIRECT (1-1) hoặc GROUP (nhóm).
     * Không thể thay đổi sau khi tạo.
     */
    @Column(name = "type", nullable = false, length = 10, updatable = false)
    @Enumerated(EnumType.STRING)
    private ConversationType type;

    /**
     * Tên nhóm (chỉ dùng cho GROUP).
     * Với DIRECT = null; giao diện sẽ hiển thị tên của người kia.
     */
    @Column(name = "name", length = 100)
    private String name;

    /**
     * Chuỗi định danh duy nhất cho cuộc trò chuyện DIRECT.
     * Cách sinh: String.format("%d_%d", Math.min(uid1, uid2), Math.max(uid1, uid2))
     * Có unique index → đảm bảo 2 user không tạo nhiều hơn 1 cuộc chat 1-1.
     * Với GROUP = null.
     */
    @Column(name = "direct_key", unique = true, length = 40)
    private String directKey;

    // ──────────────────────────────────────────────────────────────────────
    // Người tạo & thời gian tạo
    // ──────────────────────────────────────────────────────────────────────

    /**
     * User tạo conversation (chủ nhóm với GROUP, bất kỳ ai khởi tạo với DIRECT).
     * Nullable là false – luôn phải có người tạo.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private User createdBy;

    /** Thời điểm tạo conversation – không thay đổi */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // ──────────────────────────────────────────────────────────────────────
    // Denormalized last-message (tối ưu query danh sách chat)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * ID của tin nhắn cuối cùng trong cuộc trò chuyện (denormalize).
     * Dùng để: (1) hiển thị preview tin nhắn cuối, (2) sắp xếp danh sách chat.
     * Được cập nhật NGAY khi tin nhắn mới được gửi thành công.
     * Nullable: null khi conversation vừa tạo, chưa có tin nhắn nào.
     */
    @Column(name = "last_message_id")
    private Long lastMessageId;

    /**
     * Thời điểm của tin nhắn cuối cùng (denormalize).
     * Đây là trường dùng để ORDER BY trong query danh sách chat.
     */
    @Column(name = "last_message_at")
    private Instant lastMessageAt;

    // ──────────────────────────────────────────────────────────────────────
    // JPA Lifecycle
    // ──────────────────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Static factory helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tạo direct_key từ 2 userId.
     * Luôn đặt id nhỏ hơn trước để đảm bảo tính nhất quán.
     */
    public static String buildDirectKey(Long userId1, Long userId2) {
        return Math.min(userId1, userId2) + "_" + Math.max(userId1, userId2);
    }

    /**
     * Factory: tạo conversation DIRECT giữa 2 user.
     */
    public static Conversation createDirect(User initiator, Long otherUserId) {
        Conversation c = new Conversation();
        c.type      = ConversationType.DIRECT;
        c.createdBy = initiator;
        c.directKey = buildDirectKey(initiator.getId(), otherUserId);
        c.createdAt = LocalDateTime.now();
        return c;
    }

    /**
     * Factory: tạo conversation GROUP.
     */
    public static Conversation createGroup(User creator, String groupName) {
        Conversation c = new Conversation();
        c.type      = ConversationType.GROUP;
        c.name      = groupName;
        c.createdBy = creator;
        c.createdAt = LocalDateTime.now();
        return c;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Business helpers
    // ──────────────────────────────────────────────────────────────────────

    public boolean isDirect() { return ConversationType.DIRECT == this.type; }
    public boolean isGroup()  { return ConversationType.GROUP  == this.type; }

    /**
     * Cập nhật tin nhắn cuối – gọi ngay sau khi lưu tin nhắn mới.
     */
    public void updateLastMessage(Long messageId, Instant sentAt) {
        this.lastMessageId = messageId;
        this.lastMessageAt = sentAt;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Constructors
    // ──────────────────────────────────────────────────────────────────────

    public Conversation() {}

    // ──────────────────────────────────────────────────────────────────────
    // Getters & Setters
    // ──────────────────────────────────────────────────────────────────────

    public Long getId()                          { return id; }
    public void setId(Long id)                   { this.id = id; }

    public ConversationType getType()            { return type; }
    public void setType(ConversationType type)   { this.type = type; }

    public String getName()                      { return name; }
    public void setName(String name)             { this.name = name; }

    public String getDirectKey()                 { return directKey; }
    public void setDirectKey(String directKey)   { this.directKey = directKey; }

    public User getCreatedBy()                   { return createdBy; }
    public void setCreatedBy(User createdBy)     { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt()          { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public Long getLastMessageId()               { return lastMessageId; }
    public void setLastMessageId(Long lastMessageId) { this.lastMessageId = lastMessageId; }

    public Instant getLastMessageAt()            { return lastMessageAt; }
    public void setLastMessageAt(Instant lastMessageAt) { this.lastMessageAt = lastMessageAt; }
}

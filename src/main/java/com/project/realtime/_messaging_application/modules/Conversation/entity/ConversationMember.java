package com.project.realtime._messaging_application.modules.Conversation.entity;

import com.project.realtime._messaging_application.modules.User.Entity.User;
import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * Bảng conversation_members – lưu thành viên của từng cuộc trò chuyện.
 *
 * Đây là bảng trung gian giữa Conversation và User (many-to-many).
 *
 * Các trường đáng chú ý:
 *  - role              : MEMBER / ADMIN / OWNER (phân quyền trong nhóm)
 *  - joined_at         : thời điểm vào nhóm / bắt đầu cuộc chat
 *  - last_read_message_id : tin nhắn cuối người này đã đọc
 *                         → dùng để tính số tin nhắn chưa đọc (unread count):
 *                         SELECT COUNT(*) FROM messages WHERE conversation_id = ?
 *                           AND id > last_read_message_id
 *                         → và hiển thị badge "N chưa đọc" trên giao diện
 */
@Entity
@Table(
        name = "conversation_members",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uq_conv_member",
                        columnNames = {"conversation_id", "user_id"}
                )
        },
        indexes = {
                // Tìm tất cả conversation của một user (danh sách chat)
                @Index(name = "idx_cm_user_id",           columnList = "user_id"),
                // Tìm tất cả thành viên của một conversation
                @Index(name = "idx_cm_conversation_id",   columnList = "conversation_id")
        }
)
public class ConversationMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Cuộc trò chuyện mà thành viên này thuộc về */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false)
    private Conversation conversation;

    /** Người dùng là thành viên */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * Vai trò trong nhóm: MEMBER / ADMIN / OWNER.
     * Với conversation DIRECT, cả 2 đều là MEMBER.
     */
    @Column(name = "role", nullable = false, length = 10)
    @Enumerated(EnumType.STRING)
    private MemberRole role;

    /** Thời điểm tham gia cuộc trò chuyện */
    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    /**
     * ID của tin nhắn cuối cùng người này đã ĐỌC.
     *
     * Cách tính unread count:
     *   SELECT COUNT(*) FROM messages
     *   WHERE conversation_id = :convId
     *     AND id > :lastReadMessageId
     *
     * Cách cập nhật: mỗi khi người dùng mở khung chat / cuộn đến cuối,
     * gọi API PATCH /api/conversations/{id}/read với messageId mới nhất.
     *
     * Null = chưa đọc bất kỳ tin nhắn nào trong conversation này.
     */
    @Column(name = "last_read_message_id")
    private Long lastReadMessageId;

    // ──────────────────────────────────────────────────────────────────────
    // JPA Lifecycle
    // ──────────────────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (joinedAt == null) joinedAt = LocalDateTime.now();
        if (role == null)     role     = MemberRole.MEMBER;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Static factory
    // ──────────────────────────────────────────────────────────────────────

    public static ConversationMember create(Conversation conversation, User user, MemberRole role) {
        ConversationMember cm = new ConversationMember();
        cm.conversation = conversation;
        cm.user         = user;
        cm.role         = role;
        cm.joinedAt     = LocalDateTime.now();
        return cm;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Business helpers
    // ──────────────────────────────────────────────────────────────────────

    public boolean isOwner()  { return MemberRole.OWNER == this.role; }
    public boolean isAdmin()  { return MemberRole.ADMIN == this.role || isOwner(); }
    public boolean isMember() { return this.role != null; }

    /** Đánh dấu đã đọc đến messageId này */
    public void markRead(Long messageId) {
        if (messageId != null &&
                (this.lastReadMessageId == null || messageId > this.lastReadMessageId)) {
            this.lastReadMessageId = messageId;
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Constructors
    // ──────────────────────────────────────────────────────────────────────

    public ConversationMember() {}

    // ──────────────────────────────────────────────────────────────────────
    // Getters & Setters
    // ──────────────────────────────────────────────────────────────────────

    public Long getId()                             { return id; }
    public void setId(Long id)                      { this.id = id; }

    public Conversation getConversation()           { return conversation; }
    public void setConversation(Conversation conversation) { this.conversation = conversation; }

    public User getUser()                           { return user; }
    public void setUser(User user)                  { this.user = user; }

    public MemberRole getRole()                     { return role; }
    public void setRole(MemberRole role)            { this.role = role; }

    public LocalDateTime getJoinedAt()              { return joinedAt; }
    public void setJoinedAt(LocalDateTime joinedAt) { this.joinedAt = joinedAt; }

    public Long getLastReadMessageId()              { return lastReadMessageId; }
    public void setLastReadMessageId(Long lastReadMessageId) {
        this.lastReadMessageId = lastReadMessageId;
    }
}

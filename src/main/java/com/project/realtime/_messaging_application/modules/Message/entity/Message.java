package com.project.realtime._messaging_application.modules.Message.entity;

import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import jakarta.persistence.*;

import java.time.Instant;

/**
 * Bảng messages – lưu từng tin nhắn trong cuộc trò chuyện.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Thiết kế quan trọng:
 *
 * 1. client_message_id (idempotency / dedupe):
 *    Client tự sinh UUID trước khi gửi (UUID.randomUUID().toString()).
 *    Khi client retry (do mất mạng), server dùng unique constraint
 *    (conversation_id, sender_id, client_message_id) để phát hiện trùng
 *    và trả về tin đã lưu thay vì lưu mới. → Người nhận không thấy tin trùng.
 *
 * 2. id tăng dần = thứ tự tin nhắn (ordering):
 *    Sắp xếp theo id (bigserial) thay vì created_at vì client có thể gửi
 *    với giờ sai. Server gán id nên thứ tự luôn nhất quán.
 *
 * 3. reply_to_id (self-referential FK):
 *    null = tin nhắn mới. Có giá trị = trả lời tin có id đó.
 *    Khi hiển thị, client query để lấy preview tin được trả lời.
 *
 * 4. Soft-delete (deleted_at):
 *    Không xoá vật lý để giữ thứ tự và không phá dedupe.
 *    Client kiểm tra deleted_at != null → hiển thị "Tin nhắn đã bị xoá".
 *
 * 5. Index chính: (conversation_id, id DESC):
 *    Dùng cho cursor pagination – lấy 50 tin gần nhất, cuộn lên lấy thêm.
 *    Query: WHERE conversation_id = ? AND id < :cursor ORDER BY id DESC LIMIT 50
 * ──────────────────────────────────────────────────────────────────────────
 */
@Entity
@Table(
        name = "messages",
        indexes = {
                // Index chính: lấy lịch sử tin nhắn theo cursor pagination
                @Index(name = "idx_messages_conv_id_desc", columnList = "conversation_id, id DESC"),
                // Index phụ: tìm tin của một sender trong conversation
                @Index(name = "idx_messages_sender_id",    columnList = "sender_id"),
                // Index phụ: sắp xếp theo thời gian gửi
                @Index(name = "idx_messages_created_at",   columnList = "created_at")
        },
        uniqueConstraints = {
                // Dedupe: một client không thể gửi cùng một client_message_id
                // cho cùng conversation quá 1 lần
                @UniqueConstraint(
                        name  = "uq_message_client_id",
                        columnNames = {"conversation_id", "sender_id", "client_message_id"}
                )
        }
)
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ──────────────────────────────────────────────────────────────────────
    // Quan hệ
    // ──────────────────────────────────────────────────────────────────────

    /** Cuộc trò chuyện chứa tin nhắn này */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false, updatable = false)
    private Conversation conversation;

    /**
     * Người gửi. Null chỉ với tin SYSTEM do server tự tạo.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", updatable = false)
    private User sender;

    /**
     * Tin nhắn được trả lời (reply).
     * null = tin mới. Không null = trả lời tin có id này.
     * Dùng LAZY để không load toàn bộ cây reply ngay lập tức.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_to_id")
    private Message replyTo;

    // ──────────────────────────────────────────────────────────────────────
    // Idempotency
    // ──────────────────────────────────────────────────────────────────────

    /**
     * UUID do client sinh ngay trước khi gửi.
     * Mục đích: server dedupe khi client retry – nếu unique constraint vi phạm
     * thì server trả về tin đã lưu, không lưu lại.
     * Nullable với tin SYSTEM (server tự tạo).
     */
    @Column(name = "client_message_id", length = 64, updatable = false)
    private String clientMessageId;

    // ──────────────────────────────────────────────────────────────────────
    // Nội dung
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Nội dung tin nhắn.
     * - TEXT  : chuỗi văn bản (tối đa 4000 ký tự, validate ở service)
     * - IMAGE : URL của ảnh đã upload
     * - FILE  : URL của file đã upload
     * - SYSTEM: mô tả sự kiện (ví dụ "Alice đã rời nhóm")
     *
     * Dùng @Lob hoặc columnDefinition = "TEXT" để hỗ trợ nội dung dài.
     */
    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    /** Loại tin nhắn */
    @Column(name = "type", nullable = false, length = 10)
    @Enumerated(EnumType.STRING)
    private MessageType type;

    // ──────────────────────────────────────────────────────────────────────
    // Media fields (chi dung khi type = IMAGE hoac FILE)
    // ──────────────────────────────────────────────────────────────────────

    /** Cloudinary secure_url cua file/anh da upload */
    @Column(name = "media_url", columnDefinition = "TEXT")
    private String mediaUrl;

    /** MIME type: image/jpeg, image/png, application/pdf, ... */
    @Column(name = "media_type", length = 100)
    private String mediaType;

    /** Ten file goc nguoi dung chon (hien thi o UI) */
    @Column(name = "file_name", length = 255)
    private String fileName;

    /** Kich thuoc file tinh bang bytes */
    @Column(name = "file_size")
    private Long fileSize;

    /** URL thumbnail (Cloudinary tu tao cho anh/video, null cho file khac) */
    @Column(name = "thumb_url", columnDefinition = "TEXT")
    private String thumbUrl;

    // ──────────────────────────────────────────────────────────────────────
    // Timestamps & trạng thái
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Thời điểm server lưu tin nhắn (không phải giờ client).
     * Dùng Instant (UTC) để tránh lỗi múi giờ.
     * Đây cũng là thứ tự chuẩn cùng với id tăng dần.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Thời điểm tin nhắn được sửa lần cuối.
     * null = chưa bao giờ sửa.
     */
    @Column(name = "edited_at")
    private Instant editedAt;

    /**
     * Soft-delete: thời điểm tin nhắn bị xoá.
     * null = chưa xoá.
     * Khi != null, client hiển thị "Tin nhắn đã bị xoá" thay vì nội dung thật.
     */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    // ──────────────────────────────────────────────────────────────────────
    // JPA Lifecycle
    // ──────────────────────────────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (type == null)      type      = MessageType.TEXT;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Static factories
    // ──────────────────────────────────────────────────────────────────────

    /** Factory: tạo tin nhắn TEXT thông thường */
    public static Message createText(Conversation conversation, User sender,
                                     String content, String clientMessageId) {
        Message m = new Message();
        m.conversation    = conversation;
        m.sender          = sender;
        m.content         = content;
        m.type            = MessageType.TEXT;
        m.clientMessageId = clientMessageId;
        m.createdAt       = Instant.now();
        return m;
    }

    /** Factory: tạo tin nhắn dạng trả lời (reply) */
    public static Message createReply(Conversation conversation, User sender,
                                      String content, String clientMessageId,
                                      Message replyTo) {
        Message m = createText(conversation, sender, content, clientMessageId);
        m.replyTo = replyTo;
        return m;
    }

    /** Factory: tạo tin nhắn SYSTEM (không có sender) */
    public static Message createSystem(Conversation conversation, String systemContent) {
        Message m = new Message();
        m.conversation = conversation;
        m.sender       = null;
        m.content      = systemContent;
        m.type         = MessageType.SYSTEM;
        m.createdAt    = Instant.now();
        return m;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Business helpers
    // ──────────────────────────────────────────────────────────────────────

    public boolean isDeleted() { return this.deletedAt != null; }
    public boolean isEdited()  { return this.editedAt  != null; }
    public boolean isSystem()  { return this.type == MessageType.SYSTEM; }

    /**
     * Soft-delete tin nhắn. Nội dung vẫn giữ nguyên trong DB
     * để không phá vỡ dedupe và thứ tự id.
     */
    public void softDelete() {
        this.deletedAt = Instant.now();
    }

    /**
     * Sửa nội dung tin nhắn.
     * Chỉ chủ sở hữu (sender) mới được sửa – validate ở service.
     */
    public void edit(String newContent) {
        this.content  = newContent;
        this.editedAt = Instant.now();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Getters & Setters
    // ──────────────────────────────────────────────────────────────────────

    public Long getId()                            { return id; }
    public void setId(Long id)                     { this.id = id; }

    public Conversation getConversation()          { return conversation; }
    public void setConversation(Conversation c)    { this.conversation = c; }

    public User getSender()                        { return sender; }
    public void setSender(User sender)             { this.sender = sender; }

    public Message getReplyTo()                    { return replyTo; }
    public void setReplyTo(Message replyTo)        { this.replyTo = replyTo; }

    public String getClientMessageId()             { return clientMessageId; }
    public void setClientMessageId(String id)      { this.clientMessageId = id; }

    public String getContent()                     { return content; }
    public void setContent(String content)         { this.content = content; }

    public MessageType getType()                   { return type; }
    public void setType(MessageType type)          { this.type = type; }

    public Instant getCreatedAt()                  { return createdAt; }
    public void setCreatedAt(Instant createdAt)    { this.createdAt = createdAt; }

    public Instant getEditedAt()                   { return editedAt; }
    public void setEditedAt(Instant editedAt)      { this.editedAt = editedAt; }

    public Instant getDeletedAt()                  { return deletedAt; }
    public void setDeletedAt(Instant deletedAt)    { this.deletedAt = deletedAt; }

    // Media getters/setters
    public String getMediaUrl()                    { return mediaUrl; }
    public void setMediaUrl(String mediaUrl)       { this.mediaUrl = mediaUrl; }

    public String getMediaType()                   { return mediaType; }
    public void setMediaType(String mediaType)     { this.mediaType = mediaType; }

    public String getFileName()                    { return fileName; }
    public void setFileName(String fileName)       { this.fileName = fileName; }

    public Long getFileSize()                      { return fileSize; }
    public void setFileSize(Long fileSize)         { this.fileSize = fileSize; }

    public String getThumbUrl()                    { return thumbUrl; }
    public void setThumbUrl(String thumbUrl)       { this.thumbUrl = thumbUrl; }
}

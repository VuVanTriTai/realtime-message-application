package com.project.realtime._messaging_application.modules.Message.repository;

import com.project.realtime._messaging_application.modules.Message.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

    // ──────────────────────────────────────────────────────────────────────
    // Cursor pagination (lịch sử tin nhắn)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Lấy 50 tin nhắn gần nhất của một conversation (trang đầu tiên).
     * Sử dụng index (conversation_id, id DESC) → rất nhanh.
     * Client cuộn lên sẽ gọi findBeforeCursor với cursor = id của tin nhắn đầu tiên đã nhận.
     */
    @Query("""
            SELECT m FROM Message m
            WHERE m.conversation.id = :conversationId
            ORDER BY m.id DESC
            LIMIT 50
            """)
    List<Message> findLatest(@Param("conversationId") Long conversationId);

    /**
     * Cursor pagination: lấy 50 tin có id < cursor (cuộn lên xem tin cũ hơn).
     * Pattern: WHERE id < :cursor ORDER BY id DESC LIMIT 50.
     * Không dùng OFFSET vì OFFSET chậm với bảng lớn.
     */
    @Query("""
            SELECT m FROM Message m
            WHERE m.conversation.id = :conversationId
              AND m.id < :cursor
            ORDER BY m.id DESC
            LIMIT 50
            """)
    List<Message> findBeforeCursor(
            @Param("conversationId") Long conversationId,
            @Param("cursor")         Long cursor
    );

    // ──────────────────────────────────────────────────────────────────────
    // Idempotency / dedupe
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tìm tin nhắn theo client_message_id để phát hiện retry.
     * Nếu tìm thấy → client đang retry, trả về tin cũ, không lưu lại.
     */
    @Query("""
            SELECT m FROM Message m
            WHERE m.conversation.id  = :conversationId
              AND m.sender.id        = :senderId
              AND m.clientMessageId  = :clientMessageId
            """)
    Optional<Message> findByClientMessageId(
            @Param("conversationId")   Long conversationId,
            @Param("senderId")         Long senderId,
            @Param("clientMessageId")  String clientMessageId
    );

    // ──────────────────────────────────────────────────────────────────────
    // Đồng bộ lại sau khi mất kết nối
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Lấy tất cả tin nhắn có id > lastReceivedMessageId.
     * Client gửi lastReceivedMessageId khi reconnect → server trả phần còn thiếu.
     * Giới hạn 200 để tránh payload quá lớn.
     */
    @Query("""
            SELECT m FROM Message m
            WHERE m.conversation.id = :conversationId
              AND m.id > :lastReceivedId
            ORDER BY m.id ASC
            LIMIT 200
            """)
    List<Message> findMissedMessages(
            @Param("conversationId")  Long conversationId,
            @Param("lastReceivedId")  Long lastReceivedId
    );

    // ──────────────────────────────────────────────────────────────────────
    // Unread count
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Đếm số tin chưa đọc: id > lastReadMessageId và không phải do mình gửi.
     * Dùng cho badge "N chưa đọc" trên sidebar conversation.
     * Null-safe: nếu lastReadMessageId = null → đếm toàn bộ tin trong conversation.
     */
    @Query("""
            SELECT COUNT(m) FROM Message m
            WHERE m.conversation.id = :conversationId
              AND m.sender.id      != :userId
              AND m.deletedAt      IS NULL
              AND (:lastReadMessageId IS NULL OR m.id > :lastReadMessageId)
            """)
    long countUnread(
            @Param("conversationId")   Long conversationId,
            @Param("userId")           Long userId,
            @Param("lastReadMessageId") Long lastReadMessageId
    );

    // ──────────────────────────────────────────────────────────────────────
    // Soft-delete & edit (chỉnh sửa trực tiếp tại DB để tránh load entity)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tìm kiếm tin nhắn theo nội dung trong cuộc trò chuyện (chỉ tin chưa bị xoá).
     */
    @Query("""
            SELECT m FROM Message m
            WHERE m.conversation.id = :conversationId
              AND m.deletedAt IS NULL
              AND LOWER(m.content) LIKE LOWER(CONCAT('%', :query, '%'))
            ORDER BY m.id DESC
            LIMIT 50
            """)
    List<Message> searchMessages(
            @Param("conversationId") Long conversationId,
            @Param("query")          String query
    );

    /**
     * Lấy danh sách media (ảnh, file) và tin nhắn TEXT có liên kết URL trong cuộc trò chuyện.
     * Chỉ lấy TEXT message có URL (không lấy IMAGE/FILE riêng để tránh trùng) — frontend
     * dùng type để phân loại vào tab Ảnh, File, hoặc Liên kết.
     */
    @Query("""
            SELECT m FROM Message m
            WHERE m.conversation.id = :conversationId
              AND m.deletedAt IS NULL
              AND (
                m.type IN ('IMAGE', 'FILE')
                OR (m.type = 'TEXT' AND (m.content LIKE '%http://%' OR m.content LIKE '%https://%'))
              )
            ORDER BY m.id DESC
            LIMIT 150
            """)
    List<Message> findMediaMessages(
            @Param("conversationId") Long conversationId
    );

    /**
     * Soft-delete một tin nhắn.
     * Chỉ người gửi mới được xoá → phải kiểm tra senderId ở service trước.
     */
    @Modifying
    @Transactional
    @Query("""
            UPDATE Message m
            SET m.deletedAt = CURRENT_TIMESTAMP
            WHERE m.id = :messageId
              AND m.sender.id = :senderId
              AND m.deletedAt IS NULL
            """)
    int softDelete(
            @Param("messageId") Long messageId,
            @Param("senderId")  Long senderId
    );

    /**
     * Sửa nội dung tin nhắn.
     * Chỉ người gửi, chỉ tin chưa bị xoá, chỉ tin TEXT mới được sửa.
     */
    @Modifying
    @Transactional
    @Query("""
            UPDATE Message m
            SET m.content  = :newContent,
                m.editedAt = CURRENT_TIMESTAMP
            WHERE m.id         = :messageId
              AND m.sender.id  = :senderId
              AND m.deletedAt  IS NULL
              AND m.type       = 'TEXT'
            """)
    int editContent(
            @Param("messageId")  Long messageId,
            @Param("senderId")   Long senderId,
            @Param("newContent") String newContent
    );
}

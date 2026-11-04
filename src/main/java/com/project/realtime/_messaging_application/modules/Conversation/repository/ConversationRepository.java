package com.project.realtime._messaging_application.modules.Conversation.repository;

import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
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
public interface ConversationRepository extends JpaRepository<Conversation, Long> {

    // ──────────────────────────────────────────────────────────────────────
    // DIRECT conversation
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tìm conversation DIRECT theo direct_key.
     * Dùng trước khi tạo để tránh duplicate (direct_key đã có unique constraint).
     */
    Optional<Conversation> findByDirectKey(String directKey);

    /**
     * Tìm conversation GROUP theo invite_token.
     * Dùng ở trang /join/:token để xem preview và tham gia nhóm.
     */
    Optional<Conversation> findByInviteToken(String inviteToken);

    // ──────────────────────────────────────────────────────────────────────
    // Danh sách chat của một user (sidebar)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Lấy tất cả conversation mà userId là thành viên,
     * sắp xếp theo tin nhắn mới nhất (last_message_at DESC).
     * Dùng để render danh sách chat ở sidebar.
     *
     * Trả về Conversation kèm ConversationMember của user đó
     * để biết unread count (last_read_message_id).
     */
    @Query("""
            SELECT c FROM Conversation c
            JOIN ConversationMember cm ON cm.conversation = c
            WHERE cm.user.id = :userId
            ORDER BY c.lastMessageAt DESC NULLS LAST
            """)
    List<Conversation> findAllByMemberUserId(@Param("userId") Long userId);

    // ──────────────────────────────────────────────────────────────────────
    // Denormalized last-message update
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Cập nhật last_message_id và last_message_at ngay tại DB.
     * Gọi trong cùng transaction với lưu tin nhắn mới để đảm bảo tính nhất quán.
     */
    @Modifying
    @Transactional
    @Query("""
            UPDATE Conversation c
            SET c.lastMessageId = :messageId, c.lastMessageAt = :sentAt
            WHERE c.id = :conversationId
            """)
    void updateLastMessage(
            @Param("conversationId") Long conversationId,
            @Param("messageId")      Long messageId,
            @Param("sentAt")         Instant sentAt
    );

    // ──────────────────────────────────────────────────────────────────────
    // Kiểm tra quyền (dùng ở service layer trước khi xử lý)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Kiểm tra user có phải là thành viên của conversation không.
     * Dùng để guard các API endpoint (gửi tin nhắn, xem lịch sử…).
     */
    @Query("""
            SELECT COUNT(cm) > 0 FROM ConversationMember cm
            WHERE cm.conversation.id = :conversationId
              AND cm.user.id = :userId
            """)
    boolean isMember(
            @Param("conversationId") Long conversationId,
            @Param("userId")         Long userId
    );
}

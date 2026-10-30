package com.project.realtime._messaging_application.modules.Conversation.repository;

import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Conversation.entity.MemberRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface ConversationMemberRepository extends JpaRepository<ConversationMember, Long> {

    // ──────────────────────────────────────────────────────────────────────
    // Lookup
    // ──────────────────────────────────────────────────────────────────────

    /** Lấy membership của một user trong một conversation */
    Optional<ConversationMember> findByConversationIdAndUserId(Long conversationId, Long userId);

    /** Lấy tất cả thành viên của một conversation (load user để hiển thị) */
    @Query("""
            SELECT cm FROM ConversationMember cm
            JOIN FETCH cm.user
            WHERE cm.conversation.id = :conversationId
            ORDER BY cm.joinedAt ASC
            """)
    List<ConversationMember> findAllByConversationIdWithUser(@Param("conversationId") Long conversationId);

    // ──────────────────────────────────────────────────────────────────────
    // Unread count
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Đánh dấu đã đọc đến messageId cho user trong conversation.
     * Gọi khi user mở conversation hoặc cuộn đến tin nhắn mới nhất.
     */
    @Modifying
    @Transactional
    @Query("""
            UPDATE ConversationMember cm
            SET cm.lastReadMessageId = :messageId
            WHERE cm.conversation.id = :conversationId
              AND cm.user.id = :userId
              AND (cm.lastReadMessageId IS NULL OR cm.lastReadMessageId < :messageId)
            """)
    void markRead(
            @Param("conversationId") Long conversationId,
            @Param("userId")         Long userId,
            @Param("messageId")      Long messageId
    );

    // ──────────────────────────────────────────────────────────────────────
    // Quản lý thành viên nhóm
    // ──────────────────────────────────────────────────────────────────────

    /** Thay đổi role của một thành viên (ví dụ: promote lên ADMIN) */
    @Modifying
    @Transactional
    @Query("""
            UPDATE ConversationMember cm
            SET cm.role = :role
            WHERE cm.conversation.id = :conversationId
              AND cm.user.id = :userId
            """)
    void updateRole(
            @Param("conversationId") Long conversationId,
            @Param("userId")         Long userId,
            @Param("role")           MemberRole role
    );

    /** Xoá thành viên khỏi nhóm (kick) */
    @Modifying
    @Transactional
    void deleteByConversationIdAndUserId(Long conversationId, Long userId);

    /** Đếm số thành viên của một conversation */
    int countByConversationId(Long conversationId);

    /** Lấy danh sách userId của tất cả thành viên (dùng để push notification WebSocket) */
    @Query("SELECT cm.user.id FROM ConversationMember cm WHERE cm.conversation.id = :conversationId")
    List<Long> findUserIdsByConversationId(@Param("conversationId") Long conversationId);

    /**
     * Lấy tất cả conversationId mà user tham gia.
     * Dùng khi disconnect: publish PRESENCE offline tới tất cả conversation của user.
     */
    @Query("SELECT cm.conversation.id FROM ConversationMember cm WHERE cm.user.id = :userId")
    List<Long> findConversationIdsByUserId(@Param("userId") Long userId);
}

package com.project.realtime._messaging_application.modules.Message.repository;

import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox;
import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox.Status;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface MessageOutboxRepository extends JpaRepository<MessageOutbox, Long> {

    /**
     * Lay toi da :limit ban ghi PENDING, sap xep theo created_at ASC
     * (xu ly theo thu tu den).
     */
    @Query("""
            SELECT o FROM MessageOutbox o
            WHERE o.status = :status
            ORDER BY o.createdAt ASC
            LIMIT :limit
            """)
    List<MessageOutbox> findByStatusOrderByCreatedAt(
            @Param("status") Status status,
            @Param("limit")  int limit
    );

    /**
     * SELECT FOR UPDATE SKIP LOCKED — an toan cho multi-instance deployment.
     *
     * Chỉ bốc các tin PENDING đã tồn tại quá 3 giây (những tin mà Fast Path đã thất bại hoặc bị crash).
     * Tránh đụng độ hoặc gửi trùng với Fast Path tức thì.
     */
    @Query(value = """
            SELECT * FROM message_outbox
            WHERE status = 'PENDING'
              AND created_at < NOW() - INTERVAL '3 seconds'
            ORDER BY created_at ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<MessageOutbox> findPendingWithLock(@Param("limit") int limit);

    /**
     * Fast Path: Đánh dấu DONE theo message_id ngay khi publish trực tiếp thành công.
     */
    @Modifying
    @Transactional
    @Query("UPDATE MessageOutbox o SET o.status = 'DONE', o.processedAt = CURRENT_TIMESTAMP WHERE o.messageId = :messageId")
    int markDoneByMessageId(@Param("messageId") Long messageId);

    /**
     * Batch update: Đánh dấu DONE hàng loạt trong 1 câu lệnh duy nhất (tối ưu IO).
     */
    @Modifying
    @Transactional
    @Query("UPDATE MessageOutbox o SET o.status = 'DONE', o.processedAt = CURRENT_TIMESTAMP WHERE o.id IN :ids")
    int markAllDone(@Param("ids") List<Long> ids);

    /**
     * Xoa sach cac ban ghi DONE de giu bang gon.
     * Goi boi cleanup scheduler (e.g. moi gio).
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM MessageOutbox o WHERE o.status = 'DONE'")
    int deleteDoneRecords();
}

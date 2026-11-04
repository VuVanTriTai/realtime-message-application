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
     * Dung LIMIT de tranh doc qua nhieu ban ghi trong 1 batch.
     *
     * Chi dung khi single-instance (khong co lock).
     * Voi multi-instance, goi findPendingWithLock() thay the.
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
     * Moi instance giu lock tren cac row no dang xu ly;
     * instance khac tu dong bo qua cac row da bi lock (SKIP LOCKED),
     * tranh duplicate publish khi scale ngang.
     *
     * Dung native query vi JPQL khong ho tro FOR UPDATE SKIP LOCKED.
     */
    @Query(value = """
            SELECT * FROM message_outbox
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<MessageOutbox> findPendingWithLock(@Param("limit") int limit);

    /**
     * Xoa sach cac ban ghi DONE de giu bang gon.
     * Goi boi cleanup scheduler (e.g. moi gio).
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM MessageOutbox o WHERE o.status = 'DONE'")
    int deleteDoneRecords();
}
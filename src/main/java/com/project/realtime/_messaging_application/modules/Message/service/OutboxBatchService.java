package com.project.realtime._messaging_application.modules.Message.service;

import com.project.realtime._messaging_application.modules.Message.repository.MessageOutboxRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * OutboxBatchService — Gom nhóm việc đánh dấu DONE cho message_outbox theo lô (batching).
 *
 * Chiến lược:
 *   - Fast-path publish xong chỉ đẩy messageId vào ConcurrentLinkedQueue (RAM, 0 DB connection).
 *   - Định kỳ mỗi 2 giây (@Scheduled fixedDelay = 2000), background worker gom toàn bộ
 *     messageId trong queue và chạy 1 query UPDATE DUY NHẤT:
 *     UPDATE message_outbox SET status = 'DONE' WHERE message_id IN (:ids) AND status = 'PENDING'
 *   - Giảm số lượng DB transactions từ hàng trăm lần/giây xuống còn 0.5 lần/giây (giảm 99.8% áp lực lên HikariCP).
 *   - Idempotent: kết quả số dòng ảnh hưởng chỉ dùng để log.
 */
@Service
public class OutboxBatchService {

    private static final Logger log = LoggerFactory.getLogger(OutboxBatchService.class);

    private static final int MAX_FLUSH_BATCH_SIZE = 1000;

    private final MessageOutboxRepository outboxRepo;
    private final ConcurrentLinkedQueue<Long> pendingQueue = new ConcurrentLinkedQueue<>();

    public OutboxBatchService(MessageOutboxRepository outboxRepo) {
        this.outboxRepo = outboxRepo;
    }

    /**
     * Fast-path gọi method này sau khi publish Redis thành công.
     * Cực nhẹ: chỉ enqueue vào RAM queue, không chiếm Hikari connection.
     */
    public void enqueueDone(Long messageId) {
        if (messageId != null) {
            pendingQueue.offer(messageId);
        }
    }

    /**
     * Định kỳ mỗi 2 giây gom và flush hàng loạt xuống PostgreSQL.
     * Quy tắc an toàn: Chu kỳ flush 2s << Ngưỡng Poller bốc (10s).
     */
    @Scheduled(fixedDelay = 2000)
    public void flushBatch() {
        if (pendingQueue.isEmpty()) {
            return;
        }

        List<Long> batch = new ArrayList<>(Math.min(pendingQueue.size(), MAX_FLUSH_BATCH_SIZE));
        Long id;
        while (batch.size() < MAX_FLUSH_BATCH_SIZE && (id = pendingQueue.poll()) != null) {
            batch.add(id);
        }

        if (batch.isEmpty()) {
            return;
        }

        try {
            int updated = outboxRepo.markAllDoneByMessageIds(batch);
            log.debug("[OutboxBatch] Flushed batch of {} messageIds to DONE (affected rows: {})",
                    batch.size(), updated);
        } catch (Exception e) {
            log.warn("[OutboxBatch] Failed to batch update outbox DONE: {}", e.getMessage());
            // Poller sau 10s sẽ làm lưới an toàn rescue nếu có lỗi
        }
    }

    @PreDestroy
    public void flushOnShutdown() {
        log.info("[OutboxBatch] Shutting down, flushing remaining {} outbox records...", pendingQueue.size());
        while (!pendingQueue.isEmpty()) {
            flushBatch();
        }
    }
}

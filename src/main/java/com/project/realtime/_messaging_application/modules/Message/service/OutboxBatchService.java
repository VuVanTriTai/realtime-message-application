
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

    private static final int MAX_FLUSH_BATCH_SIZE = 2000;

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
     * Định kỳ mỗi 500ms gom và flush toàn bộ queue xuống PostgreSQL theo từng lô MAX_FLUSH_BATCH_SIZE.
     * Dùng vòng lặp drain sạch pendingQueue để đảm bảo throughput không bị nghẽn ở 500 msg/s,
     * ngăn chặn tin PENDING vượt ngưỡng 10s kích hoạt OutboxPoller giả lập cứu hộ.
     */
    @Scheduled(fixedDelay = 500)
    public void flushBatch() {
        while (!pendingQueue.isEmpty()) {
            List<Long> batch = new ArrayList<>(Math.min(pendingQueue.size(), MAX_FLUSH_BATCH_SIZE));
            Long id;
            while (batch.size() < MAX_FLUSH_BATCH_SIZE && (id = pendingQueue.poll()) != null) {
                batch.add(id);
            }

            if (batch.isEmpty()) {
                break;
            }

            try {
                int deleted = outboxRepo.deleteAllByMessageIds(batch);
                log.debug("[OutboxBatch] Delete-on-success flushed batch of {} messageIds (deleted rows: {})",
                        batch.size(), deleted);
            } catch (Exception e) {
                log.warn("[OutboxBatch] Failed to batch delete outbox records: {}", e.getMessage());
                break;
            }
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


package com.project.realtime._messaging_application.websocket.pubsub;

import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox;
import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox.Status;
import com.project.realtime._messaging_application.modules.Message.repository.MessageOutboxRepository;
import io.micrometer.core.instrument.Timer;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * OutboxPoller doc cac ban ghi PENDING tu message_outbox va publish len Redis.
 *
 * Kien truc toi uu kep (Hybrid: Event-Driven + Drain Loop + Safety Net):
 *  1. [Event-Driven]: Khi tin nhan commit vao DB -> phat OutboxTriggerEvent (AFTER_COMMIT).
 *     Worker thuc day va publish ngay lap tuc (Latency ~0ms, khong phai cho polling).
 *  2. [Drain Loop]: Neu so luong tin nhan vuot qua BATCH_SIZE (tai cao / dot bien spike),
 *     worker tiep tuc vet sach cac batch tiep theo ngay ma KHONG ngu giua cac batch.
 *  3. [Safety Net]: @Scheduled chay dinh ky (mac dinh 1000ms) phong truong hop mat event
 *     hoac server restart giua chung.
 *  4. [Multi-Instance Safe]: SELECT FOR UPDATE SKIP LOCKED giu lock tung batch an toan.
 */
@Component
public class OutboxPoller {

    private static final Logger log = LoggerFactory.getLogger(OutboxPoller.class);

    /** So lan thu toi da truoc khi danh dau FAILED */
    private static final int MAX_RETRY_COUNT = 5;

    /** So ban ghi xu ly moi batch */
    private static final int BATCH_SIZE = 100;

    /** Gioi han toi da so round vet lien tuc trong mot lan chay de tranh doc chiem CPU */
    private static final int MAX_DRAIN_ROUNDS = 50;

    private final MessageOutboxRepository outboxRepo;
    private final RedisMessagePublisher   redisPublisher;
    private final Timer                   outboxDelayTimer;
    private final TransactionTemplate     transactionTemplate;

    /** Co danh dau dang co luong xu ly outbox chay */
    private final AtomicBoolean isProcessing   = new AtomicBoolean(false);
    /** Co danh dau co yeu cau can vet tiep (tranh bo sot tin den trong khi dang xu ly) */
    private final AtomicBoolean hasPendingWork = new AtomicBoolean(false);

    /** Dedicated thread cho outbox drainer */
    private final ExecutorService pollerExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "outbox-poller-worker");
        t.setDaemon(true);
        return t;
    });

    public OutboxPoller(MessageOutboxRepository outboxRepo,
                        RedisMessagePublisher redisPublisher,
                        Timer outboxDelayTimer,
                        TransactionTemplate transactionTemplate) {
        this.outboxRepo          = outboxRepo;
        this.redisPublisher      = redisPublisher;
        this.outboxDelayTimer    = outboxDelayTimer;
        this.transactionTemplate = transactionTemplate;
    }

    // ================================================================
    // Event-Driven Trigger (AFTER_COMMIT)
    // ================================================================

    /**
     * Lang nghe su kien OutboxTriggerEvent tu MessageService.
     * Chi chay khi transaction ghi message + outbox da commit thanh cong vao PostgreSQL.
     * Do do thuc day poller xu ly tuc thi ma khong lo dirty read.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onOutboxEvent(OutboxTriggerEvent event) {
        triggerPoll();
    }

    /**
     * Kich hoat luong xu ly outbox theo co che co-alescing (gop su kien).
     * Neu co 1000 tin den cung luc, khong spawn 1000 thread ma chi thuc day 1 luong vet lien tuc.
     */
    public void triggerPoll() {
        hasPendingWork.set(true);
        if (isProcessing.compareAndSet(false, true)) {
            pollerExecutor.submit(this::drainLoop);
        }
    }

    /**
     * Vong lap chinh chay trong worker thread:
     * Tiep tuc vet cho den khi khong con tin nhan PENDING nao.
     */
    private void drainLoop() {
        try {
            while (hasPendingWork.getAndSet(false)) {
                drainQueue();
            }
        } finally {
            isProcessing.set(false);
            // Kiem tra lai lan cuoi phong truong hop event moi den ngay truoc khi reset cờ
            if (hasPendingWork.get()) {
                triggerPoll();
            }
        }
    }

    /**
     * [Cai tien 1: Greedy Drain Loop]
     * Vet lien tuc tung batch BATCH_SIZE cho den khi het tin hoac dat MAX_DRAIN_ROUNDS.
     */
    private void drainQueue() {
        int processed;
        int rounds = 0;
        do {
            processed = processBatchInTransaction();
            rounds++;
        } while (processed == BATCH_SIZE && rounds < MAX_DRAIN_ROUNDS);
    }

    /**
     * Xu ly 1 batch trong 1 Database Transaction rieng biet.
     * Cam ket release lock sau moi batch 100 tin, tranh giu lock qua lau.
     */
    private int processBatchInTransaction() {
        Integer count = transactionTemplate.execute(status -> {
            List<MessageOutbox> pending = outboxRepo.findPendingWithLock(BATCH_SIZE);
            if (pending.isEmpty()) {
                return 0;
            }

            log.info("[Outbox-Rescue] Rescuing {} un-dispatched PENDING records", pending.size());
            List<Long> doneIds = new java.util.ArrayList<>();
            for (MessageOutbox item : pending) {
                if (processItem(item)) {
                    doneIds.add(item.getId());
                }
            }

            if (!doneIds.isEmpty()) {
                outboxRepo.markAllDone(doneIds);
            }
            return pending.size();
        });

        return count != null ? count : 0;
    }

    // ================================================================
    // Scheduled Safety Net & Polling
    // ================================================================

    /**
     * [Lưới an toàn dự phòng]:
     * Dinh ky (mac dinh 1000ms) chay de dam bao khong tin nhan nao bi ton dong
     * neu gap su co mat event mang hoac he thong vua restart.
     */
    @Scheduled(fixedDelayString = "${chat.outbox.poll-delay-ms:1000}")
    public void scheduledPoll() {
        triggerPoll();
    }

    /**
     * Xu ly 1 outbox item: publish Redis. Tra ve true neu thanh cong de batch update.
     */
    private boolean processItem(MessageOutbox item) {
        try {
            // Do thoi gian tin nhan nam cho trong hang doi outbox
            if (item.getCreatedAt() != null) {
                long delayMs = Duration.between(item.getCreatedAt(), Instant.now()).toMillis();
                outboxDelayTimer.record(delayMs, TimeUnit.MILLISECONDS);
            }

            // Publish payload JSON len Redis
            redisPublisher.publishRaw(item.getConversationId(),
                    RedisEventType.NEW_MESSAGE,
                    item.getPayload());

            return true;

        } catch (Exception e) {
            item.incrementRetry();

            if (item.getRetryCount() >= MAX_RETRY_COUNT) {
                item.markFailed();
                log.error("[Outbox] Marked FAILED after {} retries: outboxId={} msgId={} error={}",
                        MAX_RETRY_COUNT, item.getId(), item.getMessageId(), e.getMessage());
            } else {
                log.warn("[Outbox] Retry {}/{} for outboxId={}: {}",
                        item.getRetryCount(), MAX_RETRY_COUNT, item.getId(), e.getMessage());
            }

            outboxRepo.save(item);
            return false;
        }
    }
                item.markFailed();
                log.error("[Outbox] Marked FAILED after {} retries: outboxId={} msgId={} error={}",
                        MAX_RETRY_COUNT, item.getId(), item.getMessageId(), e.getMessage());
            } else {
                log.warn("[Outbox] Retry {}/{} for outboxId={}: {}",
                        item.getRetryCount(), MAX_RETRY_COUNT, item.getId(), e.getMessage());
            }

            outboxRepo.save(item);
        }
    }

    // ================================================================
    // Cleanup job & Lifecycle
    // ================================================================

    /**
     * Moi 1 gio: xoa sach cac ban ghi DONE de giu bang gon.
     */
    @Scheduled(fixedDelay = 3_600_000)
    @Transactional
    public void cleanupDone() {
        int deleted = outboxRepo.deleteDoneRecords();
        if (deleted > 0) {
            log.info("[Outbox] Cleaned up {} DONE records", deleted);
        }
    }

    @PreDestroy
    public void shutdown() {
        log.info("[Outbox] Shutting down poller executor...");
        pollerExecutor.shutdown();
        try {
            if (!pollerExecutor.awaitTermination(3, TimeUnit.SECONDS)) {
                pollerExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            pollerExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}

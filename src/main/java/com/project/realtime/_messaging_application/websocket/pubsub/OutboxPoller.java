package com.project.realtime._messaging_application.websocket.pubsub;

import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox;
import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox.Status;
import com.project.realtime._messaging_application.modules.Message.repository.MessageOutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * OutboxPoller doc cac ban ghi PENDING tu message_outbox va publish len Redis.
 *
 * Thiet ke:
 *  - Chay moi 500ms (fixedDelay = 500ms tinh tu khi batch truoc XONG)
 *  - Moi batch xu ly toi da 100 ban ghi
 *  - Retry toi da MAX_RETRY_COUNT lan; sau do danh dau FAILED de khong bi loop mai mai
 *  - Cleanup ban ghi DONE chay moi 1 gio
 *
 * Tai sao fixedDelay thay vi fixedRate?
 *  - fixedRate: co the chong cheo batch neu batch truoc mat qua lau
 *  - fixedDelay: dam bao batch truoc xong moi bat dau batch moi -> an toan hon
 *
 * Multi-instance safety:
 *  - Su dung SELECT FOR UPDATE SKIP LOCKED (findPendingWithLock).
 *  - Instance nao lock row truoc thi xu ly, instance khac tu dong bo qua.
 *  - Dam bao moi tin chi duoc publish 1 lan du co nhieu server instance.
 *  - pollAndPublish() co @Transactional de giu lock trong suot vong lap xu ly.
 */
@Component
public class OutboxPoller {

    private static final Logger log = LoggerFactory.getLogger(OutboxPoller.class);

    /** So lan thu toi da truoc khi danh dau FAILED */
    private static final int MAX_RETRY_COUNT = 5;

    /** So ban ghi xu ly moi batch */
    private static final int BATCH_SIZE = 100;

    private final MessageOutboxRepository outboxRepo;
    private final RedisMessagePublisher   redisPublisher;

    public OutboxPoller(MessageOutboxRepository outboxRepo,
                        RedisMessagePublisher redisPublisher) {
        this.outboxRepo     = outboxRepo;
        this.redisPublisher = redisPublisher;
    }

    // ================================================================
    // Main polling loop
    // ================================================================

    /**
     * Moi 500ms: doc PENDING records (voi FOR UPDATE SKIP LOCKED), publish Redis, danh dau DONE.
     *
     * @Transactional o day de:
     *  1. Lock duoc giu trong suot vong lap xu ly (SKIP LOCKED hieu qua).
     *  2. Neu toan bo batch fail -> rollback trang thai -> retry o lan sau.
     *
     * Ghi chu: moi item van duoc xu ly don le qua processSingle() de
     * item nay fail khong block item khac (exception duoc bat ben trong).
     */
    @Scheduled(fixedDelay = 500)
    @Transactional
    public void pollAndPublish() {
        // FOR UPDATE SKIP LOCKED: an toan khi chay nhieu instance song song
        List<MessageOutbox> pending = outboxRepo.findPendingWithLock(BATCH_SIZE);

        if (pending.isEmpty()) return;

        log.debug("[Outbox] Processing {} PENDING records", pending.size());

        for (MessageOutbox item : pending) {
            processItem(item);
        }
    }

    /**
     * Xu ly 1 outbox item: publish Redis, cap nhat trang thai.
     *
     * Khong co @Transactional rieng — chay trong transaction cua pollAndPublish().
     * Bat exception de item nay fail khong anh huong item khac trong batch.
     */
    private void processItem(MessageOutbox item) {
        try {
            // Publish payload JSON len Redis theo dung eventType NEW_MESSAGE
            redisPublisher.publishRaw(item.getConversationId(),
                    RedisEventType.NEW_MESSAGE,
                    item.getPayload());

            item.markDone();
            outboxRepo.save(item);

            log.debug("[Outbox] Published and marked DONE: outboxId={} msgId={}",
                    item.getId(), item.getMessageId());

        } catch (Exception e) {
            item.incrementRetry();

            if (item.getRetryCount() >= MAX_RETRY_COUNT) {
                item.markFailed();
                log.error("[Outbox] Marked FAILED after {} retries: outboxId={} msgId={} error={}",
                        MAX_RETRY_COUNT, item.getId(), item.getMessageId(), e.getMessage());
            } else {
                // Giu PENDING, se duoc retry o batch tiep theo
                log.warn("[Outbox] Retry {}/{} for outboxId={}: {}",
                        item.getRetryCount(), MAX_RETRY_COUNT, item.getId(), e.getMessage());
            }

            outboxRepo.save(item);
        }
    }

    // ================================================================
    // Cleanup job
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
}

-- ============================================================
-- V3: Transactional Outbox Pattern
-- Mỗi khi lưu message, cũng INSERT một bản ghi vào bảng này
-- trong CÙNG transaction → đảm bảo atomic.
-- OutboxPoller (@Scheduled) đọc PENDING và publish lên Redis.
-- ============================================================

CREATE TABLE message_outbox (
    id              BIGSERIAL    PRIMARY KEY,
    message_id      BIGINT       NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id BIGINT       NOT NULL,
    payload         TEXT         NOT NULL,   -- MessageResponse JSON đã serialize
    status          VARCHAR(10)  NOT NULL DEFAULT 'PENDING',  -- PENDING | DONE | FAILED
    retry_count     INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ
);

-- Index để OutboxPoller query PENDING nhanh
CREATE INDEX idx_outbox_status_created ON message_outbox (status, created_at ASC);


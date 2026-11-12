-- V10__add_delivered_and_read_seq.sql
-- Thêm cột last_delivered_seq và last_read_seq vào conversation_members phục vụ Dual Ack Cursor

-- 1. Thêm cột last_delivered_seq và last_read_seq
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS last_delivered_seq BIGINT NOT NULL DEFAULT 0;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS last_read_seq BIGINT NOT NULL DEFAULT 0;

-- 2. Backfill last_read_seq từ last_read_message_id
UPDATE conversation_members cm
SET last_read_seq = COALESCE((
    SELECT m.seq FROM messages m WHERE m.id = cm.last_read_message_id
), 0)
WHERE cm.last_read_seq = 0 AND cm.last_read_message_id IS NOT NULL;

-- 3. Đồng bộ last_delivered_seq tối thiểu bằng last_read_seq (tin đã đọc thì chắc chắn đã tới thiết bị)
UPDATE conversation_members
SET last_delivered_seq = last_read_seq
WHERE last_delivered_seq < last_read_seq;


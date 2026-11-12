-- V9__add_message_seq_support.sql
-- Thêm cột last_seq vào conversations và seq vào messages phục vụ Client Gap Detection & Sync

-- 1. Thêm cột last_seq vào conversations (khởi tạo 0)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_seq BIGINT NOT NULL DEFAULT 0;

-- 2. Thêm cột seq vào messages (khởi tạo 0)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT 0;

-- 3. Backfill dữ liệu cũ: đánh số thứ tự 1, 2, 3... liên tục theo id tăng dần cho từng conversation
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY id ASC) AS new_seq
    FROM messages
)
UPDATE messages m
SET seq = n.new_seq
FROM numbered n
WHERE m.id = n.id AND m.seq = 0;

-- 4. Đồng bộ last_seq trong conversations bằng MAX(seq) hiện tại của messages
UPDATE conversations c
SET last_seq = COALESCE((SELECT MAX(seq) FROM messages WHERE conversation_id = c.id), 0);

-- 5. Tạo index phục vụ Gap Detection query (ORDER BY seq ASC) và đảm bảo tính duy nhất trong conversation
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_conv_seq ON messages (conversation_id, seq);

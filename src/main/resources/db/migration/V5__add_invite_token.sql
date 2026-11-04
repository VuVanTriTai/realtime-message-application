-- V5: Thêm cột invite_token vào bảng conversations (Group Invite Link)
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_invite_token
    ON conversations (invite_token)
    WHERE invite_token IS NOT NULL;


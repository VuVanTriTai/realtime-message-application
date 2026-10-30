-- ============================================================
-- V1__init_schema.sql
-- Khởi tạo toàn bộ schema cho Realtime Messaging Application
-- Thứ tự: users → conversations → conversation_members → messages
-- ============================================================

-- ============================================================
-- EXTENSION
-- ============================================================
-- pgcrypto: dùng cho gen_random_uuid() nếu cần UUID sau này
-- Bỏ comment nếu muốn dùng UUID thay vì bigserial
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUM TYPES
-- ============================================================
-- PostgreSQL cho phép định nghĩa ENUM type riêng, type-safe hơn VARCHAR
-- Tuy nhiên để dễ migration sau này (thêm giá trị) ta dùng VARCHAR + CHECK constraint.
-- Hibernate @Enumerated(EnumType.STRING) tương thích hoàn toàn với cách này.

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL       PRIMARY KEY,

    -- Đăng nhập
    username      VARCHAR(50)     NOT NULL UNIQUE,
    email         VARCHAR(100)    NOT NULL UNIQUE,
    password_hash TEXT            NOT NULL,

    -- Hiển thị
    display_name  VARCHAR(100)    NOT NULL,
    avatar_url    TEXT,

    -- Timestamps
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ,
    last_seen_at  TIMESTAMPTZ,               -- presence: null = chưa bao giờ login

    -- Phân quyền & trạng thái
    role          VARCHAR(20)     NOT NULL DEFAULT 'USER'
                                  CHECK (role IN ('USER', 'ADMIN')),
    status        VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE'
                                  CHECK (status IN ('ACTIVE', 'BANNED')),

    -- Soft-delete & ban
    deleted_at    TIMESTAMPTZ,               -- null = chưa xoá
    banned_at     TIMESTAMPTZ,
    ban_reason    VARCHAR(500)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_users_username  ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at);

COMMENT ON TABLE  users                 IS 'Tài khoản người dùng';
COMMENT ON COLUMN users.password_hash  IS 'BCrypt hash, không bao giờ lưu mật khẩu thô';
COMMENT ON COLUMN users.display_name   IS 'Tên hiển thị trong khung chat, mặc định = username';
COMMENT ON COLUMN users.last_seen_at   IS 'Cập nhật khi heartbeat WS hoặc disconnect';
COMMENT ON COLUMN users.deleted_at     IS 'Soft-delete: null = chưa xoá. Giữ để lịch sử tin nhắn còn đủ';

-- ============================================================
-- TABLE: conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id               BIGSERIAL       PRIMARY KEY,

    type             VARCHAR(10)     NOT NULL
                                     CHECK (type IN ('DIRECT', 'GROUP')),

    -- Chỉ GROUP mới có name
    name             VARCHAR(100),

    -- Chỉ DIRECT mới có direct_key: "min(uid1,uid2)_max(uid1,uid2)"
    -- UNIQUE cho phép nhiều NULL (mỗi GROUP có direct_key = NULL)
    direct_key       VARCHAR(40)     UNIQUE,

    -- Người tạo
    created_by       BIGINT          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Denormalized: lưu sẵn để ORDER BY danh sách chat nhanh, không JOIN messages
    last_message_id  BIGINT,                  -- FK sang messages, thêm sau để tránh circular
    last_message_at  TIMESTAMPTZ,

    -- Constraint: GROUP phải có name, DIRECT phải có direct_key
    CONSTRAINT chk_direct_key CHECK (
        (type = 'DIRECT' AND direct_key IS NOT NULL) OR
        (type = 'GROUP'  AND direct_key IS NULL)
    ),
    CONSTRAINT chk_group_name CHECK (
        (type = 'GROUP'  AND name IS NOT NULL) OR
        (type = 'DIRECT' AND name IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_conv_created_by  ON conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg_at ON conversations (last_message_at DESC NULLS LAST);

COMMENT ON TABLE  conversations                  IS 'Một khung chat (1-1 hoặc nhóm)';
COMMENT ON COLUMN conversations.direct_key       IS 'min(uid1,uid2)_max(uid1,uid2) – unique để tránh tạo trùng chat 1-1';
COMMENT ON COLUMN conversations.last_message_id  IS 'Denormalize từ messages.id để sort sidebar nhanh';
COMMENT ON COLUMN conversations.last_message_at  IS 'Denormalize từ messages.created_at để ORDER BY nhanh';

-- ============================================================
-- TABLE: conversation_members
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_members (
    id                    BIGSERIAL    PRIMARY KEY,

    conversation_id       BIGINT       NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id               BIGINT       NOT NULL REFERENCES users          (id) ON DELETE RESTRICT,

    role                  VARCHAR(10)  NOT NULL DEFAULT 'MEMBER'
                                       CHECK (role IN ('MEMBER', 'ADMIN', 'OWNER')),

    joined_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Dùng tính unread count: COUNT(*) WHERE id > last_read_message_id
    last_read_message_id  BIGINT,      -- null = chưa đọc bất kỳ tin nào

    -- Mỗi user chỉ xuất hiện 1 lần trong mỗi conversation
    CONSTRAINT uq_conv_member UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_user_id         ON conversation_members (user_id);
CREATE INDEX IF NOT EXISTS idx_cm_conversation_id ON conversation_members (conversation_id);

COMMENT ON TABLE  conversation_members                        IS 'Thành viên của từng cuộc trò chuyện';
COMMENT ON COLUMN conversation_members.last_read_message_id  IS 'Tin cuối đã đọc; unread = COUNT WHERE msg.id > this';

-- ============================================================
-- TABLE: messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id                BIGSERIAL       PRIMARY KEY,   -- tăng dần = thứ tự tin nhắn

    conversation_id   BIGINT          NOT NULL REFERENCES conversations (id) ON DELETE RESTRICT,
    sender_id         BIGINT          REFERENCES users (id) ON DELETE SET NULL, -- null với SYSTEM

    -- Idempotency: client tự sinh UUID trước khi gửi
    -- unique(conv, sender, client_id) → server dedupe khi client retry
    client_message_id VARCHAR(64),

    content           TEXT            NOT NULL,
    type              VARCHAR(10)     NOT NULL DEFAULT 'TEXT'
                                      CHECK (type IN ('TEXT', 'IMAGE', 'FILE', 'SYSTEM')),

    -- Reply
    reply_to_id       BIGINT          REFERENCES messages (id) ON DELETE SET NULL,

    -- Timestamps & trạng thái
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    edited_at         TIMESTAMPTZ,               -- null = chưa sửa
    deleted_at        TIMESTAMPTZ,               -- soft-delete: null = chưa xoá

    -- Unique constraint cho dedupe
    CONSTRAINT uq_message_client_id UNIQUE (conversation_id, sender_id, client_message_id)
);

-- Index chính: cursor pagination  →  WHERE conversation_id = ? AND id < :cursor ORDER BY id DESC
CREATE INDEX IF NOT EXISTS idx_messages_conv_id_desc ON messages (conversation_id, id DESC);
-- Index phụ
CREATE INDEX IF NOT EXISTS idx_messages_sender_id    ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at   ON messages (created_at);

COMMENT ON TABLE  messages                      IS 'Từng tin nhắn trong cuộc trò chuyện';
COMMENT ON COLUMN messages.id                   IS 'bigserial tăng dần = thứ tự chuẩn; KHÔNG sort theo created_at vì giờ client có thể sai';
COMMENT ON COLUMN messages.client_message_id    IS 'UUID client sinh; cùng conv+sender → dedupe, trả về tin đã lưu';
COMMENT ON COLUMN messages.reply_to_id          IS 'Self-referential FK; null = tin mới, có giá trị = trả lời tin đó';
COMMENT ON COLUMN messages.deleted_at           IS 'Soft-delete: giữ chỗ trong sequence, client hiển thị placeholder';

-- ============================================================
-- FK VÒNG: conversations.last_message_id → messages.id
-- Thêm sau khi messages đã tạo xong để tránh circular dependency
-- ============================================================
ALTER TABLE conversations
    ADD CONSTRAINT fk_conv_last_message
    FOREIGN KEY (last_message_id) REFERENCES messages (id) ON DELETE SET NULL;

-- ============================================================
-- TABLE: friendships
-- ============================================================
-- Thiết kế 1 chiều (directional):
--   requester = người GỬI lời mời
--   addressee = người NHẬN lời mời
--
-- Một cặp (requester_id, addressee_id) chỉ có đúng 1 row.
-- status:
--   PENDING  → A gửi, B chưa phản hồi
--   ACCEPTED → B chấp nhận, hai người là bạn
--   DECLINED → B từ chối (cho phép gửi lại sau)
--   BLOCKED  → một trong hai chặn (blocked_by ghi ai chặn)
--
-- Truy vấn bạn bè: WHERE (requester_id = ? OR addressee_id = ?) AND status = 'ACCEPTED'
-- Truy vấn bị chặn: WHERE (... OR ...) AND status = 'BLOCKED' AND blocked_by != myId
-- ============================================================
CREATE TABLE IF NOT EXISTS friendships (
    id            BIGSERIAL       PRIMARY KEY,

    requester_id  BIGINT          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    addressee_id  BIGINT          NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    status        VARCHAR(15)     NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED')),

    created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ,

    -- Ghi nhận ai là người thực hiện BLOCK (null khi status != 'BLOCKED')
    blocked_by    BIGINT          REFERENCES users (id) ON DELETE SET NULL,

    -- Không tự kết bạn với chính mình
    CONSTRAINT chk_no_self_friend CHECK (requester_id != addressee_id),

    -- Mỗi cặp chỉ có đúng 1 record
    CONSTRAINT uq_friendship_pair UNIQUE (requester_id, addressee_id)
);

-- Index: tìm nhanh theo từng chiều (requester hoặc addressee)
CREATE INDEX IF NOT EXISTS idx_fs_requester ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS idx_fs_addressee ON friendships (addressee_id);
-- Index: lọc theo status (tìm tất cả ACCEPTED / PENDING)
CREATE INDEX IF NOT EXISTS idx_fs_status    ON friendships (status);
-- Index kết hợp: tìm bạn bè ACCEPTED của userId nhanh hơn
CREATE INDEX IF NOT EXISTS idx_fs_req_status ON friendships (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_fs_addr_status ON friendships (addressee_id, status);

COMMENT ON TABLE  friendships             IS 'Quan hệ bạn bè – 1 chiều, 1 row/cặp';
COMMENT ON COLUMN friendships.requester_id IS 'Người GỬI lời mời kết bạn';
COMMENT ON COLUMN friendships.addressee_id IS 'Người NHẬN lời mời kết bạn';
COMMENT ON COLUMN friendships.blocked_by   IS 'userId của người thực hiện BLOCK; null khi status != BLOCKED';

-- ============================================================
-- VIEW TIỆN DỤNG (optional – bỏ comment nếu muốn dùng)
-- ============================================================
-- Danh sách conversation kèm số tin chưa đọc của từng thành viên
-- CREATE VIEW v_unread_counts AS
--     SELECT  cm.conversation_id,
--             cm.user_id,
--             COUNT(m.id) AS unread_count
--     FROM    conversation_members cm
--     LEFT JOIN messages m
--             ON  m.conversation_id = cm.conversation_id
--             AND m.sender_id      != cm.user_id
--             AND m.deleted_at      IS NULL
--             AND (cm.last_read_message_id IS NULL OR m.id > cm.last_read_message_id)
--     GROUP BY cm.conversation_id, cm.user_id;

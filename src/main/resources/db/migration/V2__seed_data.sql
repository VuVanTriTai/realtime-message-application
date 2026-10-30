-- ============================================================
-- V2__seed_data.sql
-- Dữ liệu mẫu để phát triển và test
-- KHÔNG chạy trên production (dùng Flyway location riêng cho prod)
-- ============================================================

-- ============================================================
-- Admin user (password: Admin@123)
-- BCrypt hash của "Admin@123" với 10 rounds
-- ============================================================
INSERT INTO users (username, email, password_hash, display_name, role, status)
VALUES
    ('admin',
     'admin@realtime.app',
     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVDQTTKoHC',
     'Administrator',
     'ADMIN',
     'ACTIVE')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- Test users (password: Test@123 cho tất cả)
-- BCrypt hash của "Test@123"
-- ============================================================
INSERT INTO users (username, email, password_hash, display_name, role, status)
VALUES
    ('alice',
     'alice@example.com',
     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVDQTTKoHC',
     'Alice Nguyen',
     'USER',
     'ACTIVE'),

    ('bob',
     'bob@example.com',
     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVDQTTKoHC',
     'Bob Tran',
     'USER',
     'ACTIVE'),

    ('charlie',
     'charlie@example.com',
     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVDQTTKoHC',
     'Charlie Le',
     'USER',
     'ACTIVE')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- Conversation DIRECT: alice ↔ bob
-- direct_key = min(alice_id, bob_id)_max(alice_id, bob_id)
-- Dùng subquery để lấy id động thay vì hard-code
-- ============================================================
WITH
    alice_id   AS (SELECT id FROM users WHERE username = 'alice'),
    bob_id     AS (SELECT id FROM users WHERE username = 'bob'),
    direct_key AS (
        SELECT CONCAT(
            LEAST((SELECT id FROM alice_id), (SELECT id FROM bob_id)),
            '_',
            GREATEST((SELECT id FROM alice_id), (SELECT id FROM bob_id))
        ) AS key
    )
INSERT INTO conversations (type, direct_key, created_by)
SELECT 'DIRECT', (SELECT key FROM direct_key), (SELECT id FROM alice_id)
WHERE NOT EXISTS (
    SELECT 1 FROM conversations WHERE direct_key = (SELECT key FROM direct_key)
);

-- Thêm alice và bob vào conversation vừa tạo
INSERT INTO conversation_members (conversation_id, user_id, role)
SELECT
    c.id,
    u.id,
    'MEMBER'
FROM conversations c
JOIN users u ON u.username IN ('alice', 'bob')
WHERE c.direct_key = CONCAT(
    LEAST((SELECT id FROM users WHERE username = 'alice'),
          (SELECT id FROM users WHERE username = 'bob')),
    '_',
    GREATEST((SELECT id FROM users WHERE username = 'alice'),
             (SELECT id FROM users WHERE username = 'bob'))
)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- ============================================================
-- Conversation GROUP: Nhóm "Dev Team"
-- ============================================================
WITH creator AS (SELECT id FROM users WHERE username = 'admin')
INSERT INTO conversations (type, name, created_by)
SELECT 'GROUP', 'Dev Team', (SELECT id FROM creator)
WHERE NOT EXISTS (
    SELECT 1 FROM conversations WHERE type = 'GROUP' AND name = 'Dev Team'
);

-- Thêm admin (OWNER), alice, bob, charlie vào nhóm
INSERT INTO conversation_members (conversation_id, user_id, role)
SELECT
    c.id,
    u.id,
    CASE u.username WHEN 'admin' THEN 'OWNER' ELSE 'MEMBER' END
FROM conversations c
JOIN users u ON u.username IN ('admin', 'alice', 'bob', 'charlie')
WHERE c.type = 'GROUP' AND c.name = 'Dev Team'
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- ============================================================
-- Tin nhắn mẫu trong conversation DIRECT alice ↔ bob
-- ============================================================
WITH conv AS (
    SELECT c.id as conv_id
    FROM conversations c
    WHERE c.direct_key = CONCAT(
        LEAST((SELECT id FROM users WHERE username = 'alice'),
              (SELECT id FROM users WHERE username = 'bob')),
        '_',
        GREATEST((SELECT id FROM users WHERE username = 'alice'),
                 (SELECT id FROM users WHERE username = 'bob'))
    )
),
alice AS (SELECT id FROM users WHERE username = 'alice'),
bob   AS (SELECT id FROM users WHERE username = 'bob')
INSERT INTO messages (conversation_id, sender_id, content, type, client_message_id, created_at)
VALUES
    ((SELECT conv_id FROM conv), (SELECT id FROM alice),
     'Chào Bob! Bạn có thể test WebSocket không?',
     'TEXT', 'seed-msg-001',
     NOW() - INTERVAL '10 minutes'),

    ((SELECT conv_id FROM conv), (SELECT id FROM bob),
     'Được chứ! Mình đang kết nối rồi. Gửi tin nào.',
     'TEXT', 'seed-msg-002',
     NOW() - INTERVAL '9 minutes'),

    ((SELECT conv_id FROM conv), (SELECT id FROM alice),
     'Tuyệt vời! Hệ thống realtime hoạt động ổn rồi 🚀',
     'TEXT', 'seed-msg-003',
     NOW() - INTERVAL '8 minutes')
ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING;

-- Cập nhật denormalized last_message cho conversation alice ↔ bob
UPDATE conversations
SET
    last_message_id = (
        SELECT id FROM messages
        WHERE conversation_id = conversations.id
        ORDER BY id DESC
        LIMIT 1
    ),
    last_message_at = (
        SELECT created_at FROM messages
        WHERE conversation_id = conversations.id
        ORDER BY id DESC
        LIMIT 1
    )
WHERE direct_key = CONCAT(
    LEAST((SELECT id FROM users WHERE username = 'alice'),
          (SELECT id FROM users WHERE username = 'bob')),
    '_',
    GREATEST((SELECT id FROM users WHERE username = 'alice'),
             (SELECT id FROM users WHERE username = 'bob'))
);

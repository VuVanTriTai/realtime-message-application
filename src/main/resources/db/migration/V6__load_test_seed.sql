-- ============================================================
-- V6__load_test_seed.sql
-- Du lieu cho Load Test voi k6
--
-- Tao 200 user (testuser001..testuser200) voi password LoadTest@123
-- Tao 1 nhom lon "LargeGroup" voi tat ca 200 user
-- Tao 100 cuoc tro chuyen 1-1 giua cac cap user
-- Tao 500 tin nhan mau trong LargeGroup
--
-- Password LoadTest@123 -> BCrypt $2a$10$... (hash co san)
-- BCrypt hash cua "LoadTest@123" voi 10 rounds:
--   $2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQbLgtnOoKsWc.6U6CqZNMUAAHB3m2
-- ============================================================

-- ============================================================
-- 1. Tao 200 load-test user (bo qua neu da ton tai)
-- ============================================================
DO $$
DECLARE
  i         INT;
  uname     TEXT;
  uemail    TEXT;
  uhash     TEXT := '$2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQbLgtnOoKsWc.6U6CqZNMUAAHB3m2';
  udisplay  TEXT;
BEGIN
  FOR i IN 1..200 LOOP
    uname    := 'testuser' || LPAD(i::TEXT, 3, '0');
    uemail   := uname || '@loadtest.local';
    udisplay := 'LoadTest User #' || i;

    INSERT INTO users (username, email, password_hash, display_name, role, status)
    VALUES (uname, uemail, uhash, udisplay, 'USER', 'ACTIVE')
    ON CONFLICT (username) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================
-- 2. Tao nhom lon "LargeGroup" do admin tao
--    (dung de test fanout voi 200 member)
-- ============================================================
DO $$
DECLARE
  admin_id  BIGINT;
  group_id  BIGINT;
  uid       BIGINT;
  uname     TEXT;
BEGIN
  SELECT id INTO admin_id FROM users WHERE username = 'admin';

  -- Tao group neu chua co
  IF NOT EXISTS (
    SELECT 1 FROM conversations WHERE type = 'GROUP' AND name = 'LargeGroup'
  ) THEN
    INSERT INTO conversations (type, name, created_by)
    VALUES ('GROUP', 'LargeGroup', admin_id)
    RETURNING id INTO group_id;
  ELSE
    SELECT id INTO group_id FROM conversations WHERE type = 'GROUP' AND name = 'LargeGroup';
  END IF;

  -- Them admin lam OWNER
  INSERT INTO conversation_members (conversation_id, user_id, role)
  VALUES (group_id, admin_id, 'OWNER')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- Them 200 load-test user vao group
  FOR i IN 1..200 LOOP
    uname := 'testuser' || LPAD(i::TEXT, 3, '0');
    SELECT id INTO uid FROM users WHERE username = uname;
    IF uid IS NOT NULL THEN
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES (group_id, uid, 'MEMBER')
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 3. Tao 100 cuoc tro chuyen 1-1 giua cac cap user lien tiep
--    testuser001 <-> testuser002, testuser003 <-> testuser004, ...
-- ============================================================
DO $$
DECLARE
  uid1      BIGINT;
  uid2      BIGINT;
  dkey      TEXT;
  conv_id   BIGINT;
  i         INT;
BEGIN
  FOR i IN 1..100 LOOP
    -- Cap so le va chan: (1,2), (3,4), (5,6), ...
    SELECT id INTO uid1 FROM users WHERE username = 'testuser' || LPAD((2*i-1)::TEXT, 3, '0');
    SELECT id INTO uid2 FROM users WHERE username = 'testuser' || LPAD((2*i)::TEXT,   3, '0');

    IF uid1 IS NULL OR uid2 IS NULL THEN CONTINUE; END IF;

    dkey := CONCAT(LEAST(uid1, uid2), '_', GREATEST(uid1, uid2));

    IF NOT EXISTS (SELECT 1 FROM conversations WHERE direct_key = dkey) THEN
      INSERT INTO conversations (type, direct_key, created_by)
      VALUES ('DIRECT', dkey, uid1)
      RETURNING id INTO conv_id;

      -- Them 2 thanh vien
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES (conv_id, uid1, 'MEMBER'), (conv_id, uid2, 'MEMBER')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. Tao 500 tin nhan mau trong LargeGroup
--    (de k6 co lich su tin khi load test)
-- ============================================================
DO $$
DECLARE
  group_id  BIGINT;
  admin_id  BIGINT;
  uid       BIGINT;
  i         INT;
  uname     TEXT;
  msg_id    BIGINT;
  base_time TIMESTAMPTZ := NOW() - INTERVAL '7 days';
BEGIN
  SELECT id INTO group_id FROM conversations WHERE type = 'GROUP' AND name = 'LargeGroup';
  SELECT id INTO admin_id FROM users WHERE username = 'admin';

  IF group_id IS NULL THEN RETURN; END IF;

  FOR i IN 1..500 LOOP
    -- Chon nguoi gui (round-robin trong 20 user dau)
    uname := 'testuser' || LPAD(((i-1) % 20 + 1)::TEXT, 3, '0');
    SELECT id INTO uid FROM users WHERE username = uname;
    IF uid IS NULL THEN uid := admin_id; END IF;

    INSERT INTO messages (
      conversation_id, sender_id, content, type, client_message_id, created_at
    ) VALUES (
      group_id,
      uid,
      'Load test seed message #' || i || ' from ' || uname,
      'TEXT',
      'load-seed-group-' || i,
      base_time + (i * INTERVAL '1 minute')
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO msg_id;
  END LOOP;

  -- Cap nhat last_message cho LargeGroup
  UPDATE conversations
  SET
    last_message_id = (SELECT id  FROM messages WHERE conversation_id = group_id ORDER BY id DESC LIMIT 1),
    last_message_at = (SELECT created_at FROM messages WHERE conversation_id = group_id ORDER BY id DESC LIMIT 1)
  WHERE id = group_id;
END;
$$;

-- ============================================================
-- 5. Tao 200 tin nhan mau trong cac cuoc tro chuyen 1-1
--    (testuser001 va testuser002 noi chuyen voi nhau)
-- ============================================================
DO $$
DECLARE
  uid1    BIGINT;
  uid2    BIGINT;
  dkey    TEXT;
  conv_id BIGINT;
  i       INT;
BEGIN
  SELECT id INTO uid1 FROM users WHERE username = 'testuser001';
  SELECT id INTO uid2 FROM users WHERE username = 'testuser002';

  IF uid1 IS NULL OR uid2 IS NULL THEN RETURN; END IF;

  dkey := CONCAT(LEAST(uid1, uid2), '_', GREATEST(uid1, uid2));
  SELECT id INTO conv_id FROM conversations WHERE direct_key = dkey;

  IF conv_id IS NULL THEN RETURN; END IF;

  FOR i IN 1..200 LOOP
    INSERT INTO messages (conversation_id, sender_id, content, type, client_message_id, created_at)
    VALUES (
      conv_id,
      CASE WHEN i % 2 = 1 THEN uid1 ELSE uid2 END,
      'Direct msg #' || i || ' between testuser001 and testuser002',
      'TEXT',
      'load-seed-direct-' || i,
      NOW() - INTERVAL '1 day' + (i * INTERVAL '5 minutes')
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Cap nhat last_message
  UPDATE conversations
  SET
    last_message_id = (SELECT id FROM messages WHERE conversation_id = conv_id ORDER BY id DESC LIMIT 1),
    last_message_at = (SELECT created_at FROM messages WHERE conversation_id = conv_id ORDER BY id DESC LIMIT 1)
  WHERE id = conv_id;
END;
$$;


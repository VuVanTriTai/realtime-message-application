-- ============================================================
-- V8__scale_up_load_test_seed.sql
-- Mở rộng dữ liệu test lên 1000 users và 500 cặp hội thoại 1-1
-- ============================================================

-- 1. Tạo thêm 800 users (testuser201 .. testuser1000)
DO $$
DECLARE
  i         INT;
  uname     TEXT;
  uemail    TEXT;
  uhash     TEXT := '$2a$10$9Z6BMktFg2mquyyExW.NvOr298eQ8jlazTVJogeVm76fusD2kGUtK';
  udisplay  TEXT;
BEGIN
  FOR i IN 201..1000 LOOP
    uname    := 'testuser' || CASE WHEN i < 1000 THEN LPAD(i::TEXT, 3, '0') ELSE i::TEXT END;
    uemail   := uname || '@loadtest.local';
    udisplay := 'LoadTest User #' || i;

    INSERT INTO users (username, email, password_hash, display_name, role, status)
    VALUES (uname, uemail, uhash, udisplay, 'USER', 'ACTIVE')
    ON CONFLICT (username) DO NOTHING;
  END LOOP;
END;
$$;

-- 2. Tạo 400 cặp trò chuyện 1-1 tiếp theo (cặp 101 .. 500)
DO $$
DECLARE
  uid1      BIGINT;
  uid2      BIGINT;
  dkey      TEXT;
  conv_id   BIGINT;
  i         INT;
  uname1    TEXT;
  uname2    TEXT;
BEGIN
  FOR i IN 101..500 LOOP
    uname1 := 'testuser' || CASE WHEN (2*i-1) < 1000 THEN LPAD((2*i-1)::TEXT, 3, '0') ELSE (2*i-1)::TEXT END;
    uname2 := 'testuser' || CASE WHEN (2*i) < 1000 THEN LPAD((2*i)::TEXT, 3, '0') ELSE (2*i)::TEXT END;

    SELECT id INTO uid1 FROM users WHERE username = uname1;
    SELECT id INTO uid2 FROM users WHERE username = uname2;

    IF uid1 IS NULL OR uid2 IS NULL THEN CONTINUE; END IF;

    dkey := CONCAT(LEAST(uid1, uid2), '_', GREATEST(uid1, uid2));

    IF NOT EXISTS (SELECT 1 FROM conversations WHERE direct_key = dkey) THEN
      INSERT INTO conversations (type, direct_key, created_by)
      VALUES ('DIRECT', dkey, uid1)
      RETURNING id INTO conv_id;

      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES (conv_id, uid1, 'MEMBER'), (conv_id, uid2, 'MEMBER')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;


-- ============================================================
-- V4: Media support — them cot media cho bang messages
-- Cho phep gui anh (IMAGE) va file (FILE) qua Cloudinary.
--
-- Thiet ke:
--   content    : van dung de luu URL cua media (Cloudinary secure_url)
--   media_url  : Cloudinary secure_url (redundant voi content de ro rang)
--   media_type : MIME type (image/jpeg, application/pdf, ...)
--   file_name  : ten file goc nguoi dung upload
--   file_size  : kich thuoc bytes
--   thumb_url  : thumbnail URL (Cloudinary tu tao cho anh/video)
-- ============================================================

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS media_url   TEXT,
    ADD COLUMN IF NOT EXISTS media_type  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS file_name   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS file_size   BIGINT,
    ADD COLUMN IF NOT EXISTS thumb_url   TEXT;

-- Index giup query tin nhan co media trong 1 conversation
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages (type)
    WHERE type IN ('IMAGE', 'FILE');


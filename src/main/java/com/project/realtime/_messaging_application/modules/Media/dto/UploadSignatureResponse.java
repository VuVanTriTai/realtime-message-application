package com.project.realtime._messaging_application.modules.Media.dto;

/**
 * Response tra ve cho client sau khi server tao upload signature.
 * Client dung thong tin nay de upload truc tiep len Cloudinary.
 *
 * Flow client:
 *   1. Nhan response nay tu POST /api/media/upload-signature
 *   2. POST toi uploadUrl voi form-data:
 *        file        = <file bytes>
 *        api_key     = apiKey
 *        timestamp   = timestamp
 *        signature   = signature
 *        folder      = folder
 *        public_id   = publicId  (neu co)
 *   3. Cloudinary tra ve JSON co "secure_url", "public_id", "width", "height"
 *   4. Dung secure_url lam content khi gui STOMP message
 */
public record UploadSignatureResponse(
        String signature,       // HMAC-SHA1 signature de xac thuc upload
        long   timestamp,       // Unix timestamp (giay) khi signature duoc tao
        String apiKey,          // Cloudinary API key (public, khong phai secret)
        String cloudName,       // Ten cloud Cloudinary
        String uploadUrl,       // URL de POST len: https://api.cloudinary.com/v1_1/{cloud}/...
        String folder,          // Thu muc luu tren Cloudinary
        String resourceType     // "image" hoac "raw" (cho file khac)
) {}


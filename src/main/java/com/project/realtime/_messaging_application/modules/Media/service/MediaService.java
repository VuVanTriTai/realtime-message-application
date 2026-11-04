package com.project.realtime._messaging_application.modules.Media.service;

import com.cloudinary.Cloudinary;
import com.project.realtime._messaging_application.modules.Media.dto.UploadSignatureRequest;
import com.project.realtime._messaging_application.modules.Media.dto.UploadSignatureResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * MediaService — Xu ly logic lien quan den upload file len Cloudinary.
 *
 * Tai sao dung Signed Upload thay vi Unsigned?
 *   - Unsigned: bat ky ai cung co the upload vao cloud cua ban.
 *   - Signed: chi request co signature hop le (do server tao) moi upload duoc.
 *   - Server kiem soat duoc: ai duoc phep upload, file gi, thu muc nao, kich thuoc.
 *
 * Flow:
 *   1. Client POST /api/media/upload-signature {fileType, fileSize, fileName}
 *   2. Server validate (kich thuoc, loai file) → tao signature → tra ve
 *   3. Client POST truc tiep len Cloudinary API voi signature
 *   4. Cloudinary tra ve {secure_url, public_id, width, height, ...}
 *   5. Client gui STOMP message voi secure_url lam content
 *
 * api_secret chi ton tai o server — client khong bao gio thay.
 */
@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    /** Cac MIME type duoc phep upload */
    private static final java.util.Set<String> ALLOWED_MIME_TYPES = java.util.Set.of(
            // Anh
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
            // Video ngan (tuy chon)
            "video/mp4", "video/quicktime",
            // File van phong
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  // .docx
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        // .xlsx
            "text/plain"
    );

    private final Cloudinary cloudinary;

    @Value("${cloudinary.cloud-name}")
    private String cloudName;

    @Value("${cloudinary.api-key}")
    private String apiKey;

    @Value("${cloudinary.upload-folder}")
    private String uploadFolder;

    @Value("${cloudinary.max-file-size}")
    private long maxFileSize;

    public MediaService(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    // ================================================================
    // Tao upload signature
    // ================================================================

    /**
     * Tao Cloudinary signed upload params cho client.
     *
     * @param req  thong tin file muon upload
     * @param userId id nguoi dung (de log, co the dung lam folder con)
     * @return params de client upload truc tiep len Cloudinary
     */
    public UploadSignatureResponse generateUploadSignature(UploadSignatureRequest req,
                                                           Long userId) {
        // 1. Validate kich thuoc
        if (req.fileSize() > maxFileSize) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    String.format("File qua lon. Toi da %d MB.",
                            maxFileSize / 1024 / 1024));
        }

        // 2. Validate loai file
        String mime = req.fileType() != null ? req.fileType().toLowerCase() : "";
        if (!ALLOWED_MIME_TYPES.contains(mime)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Loai file khong duoc ho tro: " + req.fileType());
        }

        // 3. Quyet dinh resourceType: "image" cho anh/video, "raw" cho file khac
        boolean isImageOrVideo = mime.startsWith("image/") || mime.startsWith("video/");
        String resourceType = isImageOrVideo ? "image" : "raw";

        // 4. Tao public_id ngau nhien (tranh xung dot ten)
        String publicId = uploadFolder + "/" + userId + "/" + UUID.randomUUID();

        // 5. Tao timestamp va signature
        long timestamp = System.currentTimeMillis() / 1000L;

        try {
            Map<String, Object> params = new HashMap<>();
            params.put("folder",    uploadFolder);
            params.put("timestamp", timestamp);

            String signature = cloudinary.apiSignRequest(params, cloudinary.config.apiSecret);

            // 6. URL upload tuong ung resource type
            String uploadUrl = String.format(
                    "https://api.cloudinary.com/v1_1/%s/%s/upload",
                    cloudName, resourceType);

            log.debug("[Media] Generated signature for userId={} file={} size={}bytes",
                    userId, req.fileName(), req.fileSize());

            return new UploadSignatureResponse(
                    signature,
                    timestamp,
                    apiKey,
                    cloudName,
                    uploadUrl,
                    uploadFolder,
                    resourceType
            );

        } catch (Exception e) {
            log.error("[Media] Failed to generate signature: {}", e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Khong the tao upload signature: " + e.getMessage());
        }
    }
}

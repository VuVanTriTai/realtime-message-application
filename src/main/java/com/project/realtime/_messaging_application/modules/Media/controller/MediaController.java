package com.project.realtime._messaging_application.modules.Media.controller;

import com.project.realtime._messaging_application.modules.Media.dto.UploadSignatureRequest;
import com.project.realtime._messaging_application.modules.Media.dto.UploadSignatureResponse;
import com.project.realtime._messaging_application.modules.Media.service.MediaService;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * MediaController — REST endpoints lien quan den upload file/anh.
 *
 * Endpoint duy nhat hien tai:
 *   POST /api/media/upload-signature
 *     → Tra ve Cloudinary signed upload params
 *     → Client dung params nay de upload TRUC TIEP len Cloudinary (khong qua server)
 *
 * Tai sao upload TRUC TIEP (client → Cloudinary) thay vi qua server?
 *   - Server khong phai xu ly file bytes → tiet kiem bang thong, RAM, CPU
 *   - File co the lon (10MB) ma server van xu ly binh thuong
 *   - Cloudinary co CDN toan cau → delivery nhanh hon
 *   - Server chi luu URL sau khi upload xong
 *
 * Sau khi client upload xong len Cloudinary:
 *   Client nhan duoc secure_url tu Cloudinary
 *   → Gui STOMP message: { type: "IMAGE", content: secure_url, mediaUrl: ..., ... }
 *   → Server luu message voi media fields vao DB
 */
@RestController
@RequestMapping("/api/media")
public class MediaController {

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    /**
     * Tao signed upload params cho Cloudinary.
     *
     * Request body:
     * {
     *   "fileType": "image/jpeg",
     *   "fileSize": 204800,
     *   "fileName": "photo.jpg"
     * }
     *
     * Response:
     * {
     *   "signature":    "abc123...",
     *   "timestamp":    1698800000,
     *   "apiKey":       "xxx",
     *   "cloudName":    "your-cloud",
     *   "uploadUrl":    "https://api.cloudinary.com/v1_1/your-cloud/image/upload",
     *   "folder":       "realtime-chat",
     *   "resourceType": "image"
     * }
     */
    @PostMapping("/upload-signature")
    public ResponseEntity<UploadSignatureResponse> getUploadSignature(
            @RequestBody UploadSignatureRequest req,
            @AuthenticationPrincipal User user) {

        UploadSignatureResponse response = mediaService.generateUploadSignature(req, user.getId());
        return ResponseEntity.ok(response);
    }
}


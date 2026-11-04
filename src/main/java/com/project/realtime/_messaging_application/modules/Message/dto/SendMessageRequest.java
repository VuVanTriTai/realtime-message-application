package com.project.realtime._messaging_application.modules.Message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request gui tin nhan qua WebSocket (STOMP payload) hoac REST.
 *
 * Voi tin TEXT:
 *   content bat buoc (van ban tin nhan)
 *   media* de null
 *
 * Voi tin IMAGE / FILE:
 *   content = Cloudinary secure_url (bat buoc)
 *   mediaUrl = giong content
 *   mediaType, fileName, fileSize bat buoc
 *   thumbUrl tuy chon (Cloudinary tu tao cho anh)
 *   type = "IMAGE" hoac "FILE"
 *
 * Validation:
 *   content: @NotBlank + @Size(max=4000) — du cho URL Cloudinary (< 500 chars)
 *   clientMessageId: UUID de dedupe khi client retry sau mat mang
 */
public record SendMessageRequest(

        @NotNull(message = "conversationId khong duoc null")
        Long conversationId,

        @NotBlank(message = "clientMessageId khong duoc de trong")
        @Size(max = 64, message = "clientMessageId toi da 64 ky tu")
        String clientMessageId,

        @NotBlank(message = "Noi dung tin nhan khong duoc de trong")
        @Size(max = 4000, message = "Tin nhan toi da 4000 ky tu")
        String content,

        String type,        // "TEXT" (mac dinh), "IMAGE", "FILE", "SYSTEM"

        Long replyToId,     // null neu khong phai reply

        // --- Media fields (chi dien khi type = IMAGE hoac FILE) ---
        String mediaUrl,    // Cloudinary secure_url (co the giong content)
        String mediaType,   // MIME type: image/jpeg, application/pdf, ...
        String fileName,    // ten file goc: "photo.jpg", "report.pdf"

        @Size(max = 500, message = "thumbUrl toi da 500 ky tu")
        String thumbUrl,    // Cloudinary thumbnail URL (chi co voi anh/video)

        Long   fileSize     // kich thuoc bytes
) {
}

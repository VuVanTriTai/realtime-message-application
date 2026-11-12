package com.project.realtime._messaging_application.modules.Message.dto;

import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.User.dto.UserProfileResponse;

import java.time.Instant;

/**
 * DTO tra ve thong tin mot tin nhan cho client.
 *
 * Khi tin bi xoa mem (deleted_at != null):
 *  - content, mediaUrl, thumbUrl → null (an noi dung)
 *  - isDeleted → true
 *
 * Khi type = IMAGE hoac FILE:
 *  - content  : Cloudinary secure_url (URL day du)
 *  - mediaUrl : giong content (reduntdant, de frontend ro rang)
 *  - thumbUrl : thumbnail URL (chi co voi IMAGE/VIDEO)
 *  - fileName : ten file goc
 *  - fileSize : kich thuoc bytes
 *  - mediaType: MIME type (image/jpeg, application/pdf, ...)
 */
public record MessageResponse(
        Long                id,
        Long                conversationId,
        Long                seq,             // Sequence liên tục trong conversation (1, 2, 3...)
        UserProfileResponse sender,         // null neu tin SYSTEM
        String              clientMessageId,
        String              content,         // null khi isDeleted = true
        String              type,
        ReplyPreview        replyTo,         // null neu khong phai reply
        Instant             createdAt,
        Instant             editedAt,
        boolean             isEdited,
        boolean             isDeleted,

        // --- Media fields (null neu type = TEXT hoac SYSTEM) ---
        String              mediaUrl,
        String              mediaType,
        String              fileName,
        Long                fileSize,
        String              thumbUrl
) {
    public static MessageResponse fromEntity(Message m) {
        boolean deleted = m.isDeleted();
        return new MessageResponse(
                m.getId(),
                m.getConversation().getId(),
                m.getSeq(),
                m.getSender() != null
                        ? UserProfileResponse.fromEntityPublic(m.getSender())
                        : null,
                m.getClientMessageId(),
                deleted ? null : m.getContent(),
                m.getType().name(),
                m.getReplyTo() != null
                        ? ReplyPreview.fromEntity(m.getReplyTo())
                        : null,
                m.getCreatedAt(),
                m.getEditedAt(),
                m.isEdited(),
                deleted,

                // Media fields — null khi tin bi xoa hoac khong co media
                deleted ? null : m.getMediaUrl(),
                m.getMediaType(),
                m.getFileName(),
                m.getFileSize(),
                deleted ? null : m.getThumbUrl()
        );
    }

    /**
     * Preview ngan cua tin nhan duoc tra loi.
     * Hien thi duoi dang trich dan trong bubble chat.
     */
    public record ReplyPreview(
            Long   id,
            String senderUsername,
            String contentPreview   // toi da 100 ky tu
    ) {
        public static ReplyPreview fromEntity(Message replied) {
            String preview;
            if (replied.isDeleted()) {
                preview = "Tin nhan da bi xoa";
            } else if (replied.getType() == com.project.realtime._messaging_application.modules.Message.entity.MessageType.IMAGE) {
                preview = "[Hinh anh]" + (replied.getFileName() != null ? " " + replied.getFileName() : "");
            } else if (replied.getType() == com.project.realtime._messaging_application.modules.Message.entity.MessageType.FILE) {
                preview = "[File]" + (replied.getFileName() != null ? " " + replied.getFileName() : "");
            } else {
                String c = replied.getContent();
                preview = c.length() > 100 ? c.substring(0, 100) + "…" : c;
            }
            return new ReplyPreview(
                    replied.getId(),
                    replied.getSender() != null ? replied.getSender().getUsername() : "System",
                    preview
            );
        }
    }
}

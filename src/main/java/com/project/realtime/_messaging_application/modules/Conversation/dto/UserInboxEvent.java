package com.project.realtime._messaging_application.modules.Conversation.dto;

import com.project.realtime._messaging_application.modules.Conversation.dto.ConversationSummaryResponse.LastMessagePreview;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;

/**
 * Event push tới kênh cá nhân của từng user (/topic/user.{userId}).
 *
 * Mô hình Single Inbox Channel chuẩn Enterprise:
 * Thay vì mỗi user phải subscribe hàng trăm /topic/conversation.{id},
 * mỗi client chỉ cần subscribe duy nhất 1 topic cá nhân: /topic/user.{myUserId}.
 *
 * Khi có tin nhắn mới tại bất kỳ cuộc trò chuyện nào, server sẽ push UserInboxEvent
 * tới kênh này để Frontend tự động:
 *  1. Cập nhật preview tin nhắn cuối cùng (lastMessage)
 *  2. Đưa cuộc trò chuyện lên đầu danh sách (sort to top)
 *  3. Cập nhật số tin chưa đọc (unreadCount badge)
 *  4. Phát âm thanh / hiện pop-up notification
 */
public record UserInboxEvent(
        String              type,            // "INBOX_MESSAGE"
        Long                conversationId,
        LastMessagePreview  lastMessage,
        Long                unreadCount,
        MessageResponse     message
) {
    public static UserInboxEvent of(Long conversationId, MessageResponse msg, Long unreadCount) {
        LastMessagePreview preview = null;
        if (msg != null) {
            String senderName = msg.sender() != null
                    ? (msg.sender().displayName() != null && !msg.sender().displayName().isBlank()
                        ? msg.sender().displayName()
                        : msg.sender().username())
                    : "System";

            String previewContent;
            if (msg.isDeleted()) {
                previewContent = "Tin nhắn đã thu hồi";
            } else if ("IMAGE".equalsIgnoreCase(msg.type())) {
                previewContent = "[Hình ảnh]" + (msg.fileName() != null && !msg.fileName().isBlank() ? " " + msg.fileName() : "");
            } else if ("FILE".equalsIgnoreCase(msg.type())) {
                previewContent = "[Tệp] " + (msg.fileName() != null && !msg.fileName().isBlank() ? msg.fileName() : "đính kèm");
            } else {
                String c = msg.content();
                if (c != null && (c.startsWith("http://") || c.startsWith("https://")) && (c.contains("cloudinary") || c.contains("/upload/"))) {
                    previewContent = "[Tệp đính kèm]";
                } else {
                    previewContent = c;
                }
            }

            preview = new LastMessagePreview(
                    msg.id(),
                    previewContent,
                    msg.type(),
                    msg.fileName(),
                    senderName,
                    msg.sender() != null ? msg.sender().username() : null,
                    msg.sender() != null ? msg.sender().id() : null,
                    msg.isDeleted(),
                    msg.createdAt()
            );
        }
        return new UserInboxEvent("INBOX_MESSAGE", conversationId, preview, unreadCount, msg);
    }
}


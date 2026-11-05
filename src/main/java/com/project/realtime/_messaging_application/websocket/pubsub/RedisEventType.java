package com.project.realtime._messaging_application.websocket.pubsub;

/**
 * Các loại sự kiện được publish lên Redis channel.
 * Một channel duy nhất "chat:conv:{id}" chứa tất cả event của conversation đó.
 */
public enum RedisEventType {
    /** Tin nhắn mới */
    NEW_MESSAGE,
    /** Đang nhập / dừng nhập */
    TYPING,
    /** Đã đọc đến messageId nào đó */
    READ_RECEIPT,
    /** Thay đổi trạng thái online/offline của một thành viên */
    PRESENCE,
    /** Cuộc trò chuyện mới được tạo hoặc user được thêm vào nhóm */
    CONVERSATION_JOINED,
    /** User bị xoá khỏi nhóm (kick) */
    CONVERSATION_LEFT
}

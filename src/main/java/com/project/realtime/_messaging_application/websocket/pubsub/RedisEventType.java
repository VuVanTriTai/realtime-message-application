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
    /** Đã nhận (delivered tới thiết bị) */
    DELIVERY_RECEIPT,
    /** Đã đọc đến messageId / seq nào đó */
    READ_RECEIPT,
    /** Thay đổi trạng thái online/offline của một thành viên */
    PRESENCE,
    /** Cuộc trò chuyện mới được tạo hoặc user được thêm vào nhóm */
    CONVERSATION_JOINED,
    /** User bị xoá khỏi nhóm (kick) */
    CONVERSATION_LEFT,
    /**
     * Yêu cầu tất cả instance xóa cache danh sách thành viên của conversationId.
     * Publish qua kênh "cache:evict:convMembers:{convId}".
     * Dùng cho Distributed Cache Invalidation khi có thành viên Join/Leave/Kick.
     * Đảm bảo tất cả instance trong cluster đều có cache đồng bộ.
     */
    CACHE_EVICT_CONV_MEMBERS
}

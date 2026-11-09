package com.project.realtime._messaging_application.websocket.pubsub;

/**
 * Sự kiện thông báo có bản ghi Outbox mới được ghi vào cơ sở dữ liệu.
 * Được phát ra sau khi transaction chứa tin nhắn commit thành công (AFTER_COMMIT).
 */
public record OutboxTriggerEvent() {
}


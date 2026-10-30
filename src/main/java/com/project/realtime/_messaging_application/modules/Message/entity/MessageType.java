package com.project.realtime._messaging_application.modules.Message.entity;

/**
 * Loại nội dung của tin nhắn.
 *  - TEXT   : tin nhắn văn bản thông thường
 *  - IMAGE  : ảnh (content chứa URL)
 *  - FILE   : file đính kèm (content chứa URL)
 *  - SYSTEM : thông báo hệ thống (ví dụ: "Alice đã thêm Bob vào nhóm")
 *             – không do user gửi, sender_id có thể null
 */
public enum MessageType {
    TEXT,
    IMAGE,
    FILE,
    SYSTEM
}

package com.project.realtime._messaging_application.modules.Conversation.dto;

/**
 * Trạng thái nhận và đọc của một thành viên trong cuộc trò chuyện.
 * - userId: ID của người dùng
 * - username: username
 * - displayName: tên hiển thị
 * - avatarUrl: ảnh đại diện
 * - lastDeliveredSeq: sequence number cao nhất đã tới thiết bị (2 tick xám)
 * - lastReadSeq: sequence number cao nhất đã được xem (2 tick xanh / avatar read)
 */
public record MemberReceiptResponse(
        Long userId,
        String username,
        String displayName,
        String avatarUrl,
        Long lastDeliveredSeq,
        Long lastReadSeq
) {}


package com.project.realtime._messaging_application.modules.Conversation.dto;

/**
 * Trạng thái nhận và đọc của một thành viên trong cuộc trò chuyện.
 * - lastDeliveredSeq: sequence number cao nhất đã tới thiết bị (2 tick xám)
 * - lastReadSeq: sequence number cao nhất đã được xem (2 tick xanh)
 */
public record MemberReceiptResponse(
        Long userId,
        Long lastDeliveredSeq,
        Long lastReadSeq
) {}


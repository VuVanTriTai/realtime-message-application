package com.project.realtime._messaging_application.modules.Conversation.dto;

/**
 * Response trả về sau khi tạo/lấy invite link cho nhóm.
 *
 * @param token     Token ngẫu nhiên 32 ký tự (hex UUID không dấu gạch ngang)
 * @param inviteUrl URL đầy đủ để chia sẻ, ví dụ: http://localhost:5173/join/{token}
 */
public record InviteLinkResponse(String token, String inviteUrl) {}


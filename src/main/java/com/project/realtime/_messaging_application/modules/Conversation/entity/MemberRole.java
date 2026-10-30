package com.project.realtime._messaging_application.modules.Conversation.entity;

/**
 * Vai trò của một thành viên trong cuộc trò chuyện.
 *  - MEMBER : thành viên thông thường
 *  - ADMIN  : quản trị viên nhóm (có thể thêm/xoá thành viên, đổi tên nhóm)
 *  - OWNER  : chủ nhóm (chuyển quyền, xoá nhóm)
 *
 *  Với conversation DIRECT, tất cả thành viên đều là MEMBER.
 */
public enum MemberRole {
    MEMBER,
    ADMIN,
    OWNER
}

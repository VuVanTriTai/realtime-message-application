import { apiRequest } from './client';

export const conversationApi = {
  getMyConversations: () => apiRequest('/conversations'),

  getOrCreateDirect: (targetUserId) =>
    apiRequest('/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),

  createGroup: (name, memberIds) =>
    apiRequest('/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds }),
    }),

  getMembers: (conversationId) =>
    apiRequest(`/conversations/${conversationId}/members`),

  addMember: (conversationId, userId) =>
    apiRequest(`/conversations/${conversationId}/members?userId=${userId}`, {
      method: 'POST',
    }),

  removeMember: (conversationId, userId) =>
    apiRequest(`/conversations/${conversationId}/members/${userId}`, {
      method: 'DELETE',
    }),

  /** Tự rời nhóm. newOwnerId bắt buộc nếu người rời là OWNER */
  leaveGroup: (conversationId, newOwnerId = null) =>
    apiRequest(`/conversations/${conversationId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerId }),
    }),

  /** Chuyển quyền Owner cho thành viên khác (chỉ OWNER hiện tại) */
  transferOwnership: (conversationId, newOwnerId) =>
    apiRequest(`/conversations/${conversationId}/transfer-owner`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerId }),
    }),

  markRead: (conversationId, messageId) =>
    apiRequest(`/conversations/${conversationId}/read?messageId=${messageId}`, {
      method: 'PATCH',
    }),

  // ── Group Invite Link ────────────────────────────────────────────────────

  /** Tạo hoặc lấy lại invite link (Admin/Owner). Returns { token, inviteUrl } */
  generateInviteLink: (conversationId) =>
    apiRequest(`/conversations/${conversationId}/invite-link`, {
      method: 'POST',
    }),

  /** Làm mới (thu hồi) invite link cũ và tạo link mới (Owner only) */
  resetInviteLink: (conversationId) =>
    apiRequest(`/conversations/${conversationId}/invite-link/reset`, {
      method: 'POST',
    }),

  /**
   * Xem preview nhóm theo token — PUBLIC, không cần auth.
   * Returns { conversationId, name, memberCount, createdByName }
   */
  getGroupPreview: (token) =>
    apiRequest(`/conversations/invite/${token}/preview`, { method: 'GET' }),

  /** Tham gia nhóm bằng invite token (cần đăng nhập). Returns ConversationSummaryResponse */
  joinByToken: (token) =>
    apiRequest(`/conversations/invite/${token}/join`, { method: 'POST' }),
};


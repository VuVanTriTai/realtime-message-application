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

  markRead: (conversationId, messageId) =>
    apiRequest(`/conversations/${conversationId}/read?messageId=${messageId}`, {
      method: 'PATCH',
    }),
};

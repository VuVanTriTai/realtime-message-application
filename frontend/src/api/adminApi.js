import { apiRequest } from './client';

export const adminApi = {
  getStats: () => apiRequest('/admin/stats'),

  getUsers: ({ search = '', status = 'ALL', role = 'ALL', page = 0, size = 15 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status && status !== 'ALL') params.append('status', status);
    if (role && role !== 'ALL') params.append('role', role);
    params.append('page', page);
    params.append('size', size);
    return apiRequest(`/admin/users?${params.toString()}`);
  },

  updateUserStatus: (userId, status, reason = '') =>
    apiRequest(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),

  updateUserRole: (userId, role) =>
    apiRequest(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  getConversations: ({ search = '', type = 'ALL', page = 0, size = 15 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (type && type !== 'ALL') params.append('type', type);
    params.append('page', page);
    params.append('size', size);
    return apiRequest(`/admin/conversations?${params.toString()}`);
  },

  deleteConversation: (conversationId) =>
    apiRequest(`/admin/conversations/${conversationId}`, {
      method: 'DELETE',
    }),
};

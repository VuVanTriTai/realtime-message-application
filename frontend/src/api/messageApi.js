import { apiRequest } from './client';

export const messageApi = {
  getHistory: (conversationId, cursor = null) => {
    let url = `/messages?conversationId=${conversationId}`;
    if (cursor) url += `&cursor=${cursor}`;
    return apiRequest(url);
  },

  syncMissed: (conversationId, lastId) =>
    apiRequest(`/messages/sync?conversationId=${conversationId}&lastId=${lastId}`),

  sendMessage: (conversationId, content, type = 'TEXT', clientMessageId = null) =>
    apiRequest('/messages', {
      method: 'POST',
      body: JSON.stringify({
        conversationId,
        content,
        type,
        clientMessageId: clientMessageId || `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      }),
    }),

  editMessage: (messageId, content) =>
    apiRequest(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (messageId) =>
    apiRequest(`/messages/${messageId}`, {
      method: 'DELETE',
    }),
};

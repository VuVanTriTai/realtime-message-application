import { apiRequest } from './client';

export const messageApi = {
  getHistory: (conversationId, cursor = null) => {
    let url = `/messages?conversationId=${conversationId}`;
    if (cursor) url += `&cursor=${cursor}`;
    return apiRequest(url);
  },

  syncMissed: (conversationId, lastId) =>
    apiRequest(`/messages/sync?conversationId=${conversationId}&lastId=${lastId}`),

  sendMessage: (arg1, arg2, arg3 = 'TEXT', arg4 = null) => {
    const payload = typeof arg1 === 'object' && arg1 !== null
      ? {
          conversationId: arg1.conversationId,
          content: arg1.content,
          type: arg1.type || 'TEXT',
          replyToId: arg1.replyToId || null,
          mediaUrl: arg1.mediaUrl || null,
          mediaType: arg1.mediaType || null,
          fileName: arg1.fileName || null,
          thumbUrl: arg1.thumbUrl || null,
          fileSize: arg1.fileSize || null,
          clientMessageId: arg1.clientMessageId || `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        }
      : {
          conversationId: arg1,
          content: arg2,
          type: arg3,
          clientMessageId: arg4 || `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        };

    return apiRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  editMessage: (messageId, content) =>
    apiRequest(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (messageId) =>
    apiRequest(`/messages/${messageId}`, {
      method: 'DELETE',
    }),

  search: (conversationId, q) =>
    apiRequest(`/messages/search?conversationId=${conversationId}&q=${encodeURIComponent(q)}`),

  getMedia: (conversationId) =>
    apiRequest(`/messages/media?conversationId=${conversationId}`),
};

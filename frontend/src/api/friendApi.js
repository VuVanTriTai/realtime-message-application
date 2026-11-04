import { apiRequest } from './client';

export const normalizeFriendship = (f) => {
  if (!f) return f;
  const other = f.otherUser || f.friend || f.user || {};
  const friendId = other.id ?? f.friendId ?? f.targetUserId;
  const friendUsername = other.username || f.friendUsername || '';
  const friendDisplayName = other.displayName || f.friendDisplayName || friendUsername || 'Người dùng';
  const friendAvatarUrl = other.avatarUrl || f.friendAvatarUrl || null;
  const isOnline = other.isOnline !== undefined ? !!other.isOnline : !!f.isOnline;

  return {
    ...f,
    friendshipId: f.id,
    friendId,
    friendUsername,
    friendDisplayName,
    friendAvatarUrl,
    isOnline,
    // for requests:
    requesterId: friendId,
    requesterUsername: friendUsername,
    requesterDisplayName: friendDisplayName,
    requesterAvatarUrl: friendAvatarUrl,
    addresseeId: friendId,
    addresseeUsername: friendUsername,
    addresseeDisplayName: friendDisplayName,
    addresseeAvatarUrl: friendAvatarUrl,
  };
};

export const friendApi = {
  getFriends: async () => {
    const data = await apiRequest('/friends');
    return Array.isArray(data) ? data.map(normalizeFriendship) : [];
  },

  getReceivedRequests: async () => {
    const data = await apiRequest('/friends/requests/received');
    return Array.isArray(data) ? data.map(normalizeFriendship) : [];
  },

  getSentRequests: async () => {
    const data = await apiRequest('/friends/requests/sent');
    return Array.isArray(data) ? data.map(normalizeFriendship) : [];
  },

  getBlocked: async () => {
    const data = await apiRequest('/friends/blocked');
    return Array.isArray(data) ? data.map(normalizeFriendship) : [];
  },

  sendRequest: (addresseeId) =>
    apiRequest('/friends/requests', {
      method: 'POST',
      body: JSON.stringify({ addresseeId }),
    }),

  acceptRequest: (requestId) =>
    apiRequest(`/friends/requests/${requestId}/accept`, {
      method: 'PATCH',
    }),

  declineRequest: (requestId) =>
    apiRequest(`/friends/requests/${requestId}/decline`, {
      method: 'PATCH',
    }),

  cancelRequest: (requestId) =>
    apiRequest(`/friends/requests/${requestId}`, {
      method: 'DELETE',
    }),

  unfriend: (friendId) =>
    apiRequest(`/friends/${friendId}`, {
      method: 'DELETE',
    }),

  blockUser: (targetId) =>
    apiRequest(`/friends/block/${targetId}`, {
      method: 'POST',
    }),

  unblockUser: (targetId) =>
    apiRequest(`/friends/block/${targetId}`, {
      method: 'DELETE',
    }),
};

/** Tìm kiếm user bất kỳ theo keyword (username / displayName) */
export const userApi = {
  search: (keyword) => apiRequest(`/users/search?keyword=${encodeURIComponent(keyword)}`),
};

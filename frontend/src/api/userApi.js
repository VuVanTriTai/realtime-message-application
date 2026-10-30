import { apiRequest } from './client';

export const userApi = {
  getProfile: () => apiRequest('/users/profile'),

  updateProfile: (displayName, avatarUrl) =>
    apiRequest('/users/profile', {
      method: 'PUT',
      body: JSON.stringify({ displayName, avatarUrl }),
    }),

  searchUsers: (keyword) =>
    apiRequest(`/users/search?keyword=${encodeURIComponent(keyword)}`),
};

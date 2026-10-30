import { apiRequest } from './client';

export const authApi = {
  login: (username, password) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (username, email, password) =>
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  logout: (refreshToken) =>
    apiRequest('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logoutAll: () =>
    apiRequest('/auth/logout-all', {
      method: 'POST',
    }),

  changePassword: (oldPassword, newPassword, confirmPassword) =>
    apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
    }),

  getMe: () => apiRequest('/auth/me'),
};

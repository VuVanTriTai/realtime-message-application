/**
 * Core API Client with automatic JWT injection, error handling, and silent refresh.
 */

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  
  const token = localStorage.getItem('accessToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (netErr) {
    throw new Error('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.');
  }

  // Handle 401 Unauthorized -> Attempt token refresh
  if (response.status === 401 && !options._retry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.dispatchEvent(new Event('auth:unauthorized'));
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          if (!newToken) return reject(new Error('Phiên làm việc đã hết hạn'));
          options._retry = true;
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          };
          resolve(apiRequest(endpoint, options));
        });
      });
    }

    isRefreshing = true;
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!refreshRes.ok) {
        throw new Error('Refresh failed');
      }

      const refreshData = await refreshRes.json();
      localStorage.setItem('accessToken', refreshData.accessToken);
      if (refreshData.refreshToken) {
        localStorage.setItem('refreshToken', refreshData.refreshToken);
      }
      isRefreshing = false;
      onRefreshed(refreshData.accessToken);

      // Retry original request
      options._retry = true;
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${refreshData.accessToken}`,
      };
      return apiRequest(endpoint, options);
    } catch (err) {
      isRefreshing = false;
      onRefreshed(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.dispatchEvent(new Event('auth:unauthorized'));
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
  }

  // Empty response (e.g. 204 No Content)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = (data && data.message) || response.statusText || 'Yêu cầu không thành công';
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

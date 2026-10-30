import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/authApi';
import { userApi } from '../api/userApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('accessToken'));
  const [loading, setLoading] = useState(true);

  // Initialize and check user session
  const loadUser = useCallback(async () => {
    const savedToken = localStorage.getItem('accessToken');
    if (!savedToken) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    try {
      const user = await authApi.getMe();
      setCurrentUser(user);
    } catch (err) {
      console.warn('Failed to fetch user with existing token:', err.message);
      // If unauthorized, token will be cleared by client.js
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setCurrentUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();

    const handleUnauthorized = () => {
      setCurrentUser(null);
      setToken(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [loadUser]);

  const login = async (username, password) => {
    const data = await authApi.login(username, password);
    localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    setToken(data.accessToken);

    // Fetch full profile info
    const me = await authApi.getMe();
    setCurrentUser(me);
    return me;
  };

  const register = async (username, email, password) => {
    return await authApi.register(username, email, password);
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch (e) {
      console.warn('Logout API error:', e.message);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setCurrentUser(null);
      setToken(null);
    }
  };

  const updateProfile = async (displayName, avatarUrl) => {
    const updated = await userApi.updateProfile(displayName, avatarUrl);
    setCurrentUser((prev) => ({
      ...prev,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
    }));
    return updated;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        token,
        isAuthenticated: !!currentUser,
        loading,
        login,
        register,
        logout,
        updateProfile,
        refreshUser: loadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

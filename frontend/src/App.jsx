import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import AuthPage from './components/auth/AuthPage';
import SidebarNav from './components/layout/SidebarNav';
import ChatPage from './components/chat/ChatPage';
import FriendsPage from './components/friends/FriendsPage';
import ProfilePage from './components/profile/ProfilePage';
import { friendApi } from './api/friendApi';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'friends' | 'profile'
  const [activeConv, setActiveConv] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [pendingFriendsCount, setPendingFriendsCount] = useState(0);

  // Load pending friend request count for sidebar badge
  const loadPendingCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await friendApi.getReceivedRequests();
      if (Array.isArray(data)) {
        setPendingFriendsCount(data.length);
      }
    } catch {
      // Ignore background badge check errors
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadPendingCount();
      const interval = setInterval(loadPendingCount, 30000); // 30s refresh
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadPendingCount]);

  // Direct action from Friends page to open chat with that friend
  const handleStartChatWithFriend = (conversation) => {
    setActiveConv(conversation);
    setActiveTab('chat');
  };

  // Initial authentication loading state
  if (loading) {
    return (
      <div className={`app-loading-screen ${isDark ? 'theme-dark' : 'theme-light'}`}>
        <div className="loading-content">
          <Loader2 size={40} className="spin-anim" />
          <p>Đang chuẩn bị không gian trò chuyện...</p>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Auth Page
  if (!isAuthenticated) {
    return <AuthPage isDark={isDark} setIsDark={setIsDark} />;
  }

  // Main Authenticated Application
  return (
    <div className={`app-container ${isDark ? 'theme-dark' : 'theme-light'}`}>
      <SidebarNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingFriendsCount={pendingFriendsCount}
        isDark={isDark}
        setIsDark={setIsDark}
      />

      <main className="main-content-view">
        {activeTab === 'chat' && (
          <ChatPage
            activeConv={activeConv}
            setActiveConv={setActiveConv}
          />
        )}

        {activeTab === 'friends' && (
          <FriendsPage
            onStartChatWithFriend={handleStartChatWithFriend}
          />
        )}

        {activeTab === 'profile' && (
          <ProfilePage />
        )}
      </main>
    </div>
  );
}

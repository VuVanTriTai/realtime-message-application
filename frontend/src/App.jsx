import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import AuthPage from './components/auth/AuthPage';
import SidebarNav from './components/layout/SidebarNav';
import ChatPage from './components/chat/ChatPage';
import FriendsPage from './components/friends/FriendsPage';
import ProfilePage from './components/profile/ProfilePage';
import JoinGroupPage from './components/chat/JoinGroupPage';
import { friendApi } from './api/friendApi';
import { Loader2 } from 'lucide-react';

const getJoinTokenFromUrl = () => {
  const m = window.location.pathname.match(/^\/join\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
};

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'friends' | 'profile'
  const [activeConv, setActiveConv] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [pendingFriendsCount, setPendingFriendsCount] = useState(0);

  // Invite link join state
  const [joinToken, setJoinToken] = useState(() => getJoinTokenFromUrl());
  const [showAuthForJoin, setShowAuthForJoin] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setJoinToken(getJoinTokenFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (isAuthenticated && showAuthForJoin) {
      setShowAuthForJoin(false);
    }
  }, [isAuthenticated, showAuthForJoin]);

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

  // If user is on /join/:token and not currently redirected to login screen
  if (joinToken && !showAuthForJoin) {
    return (
      <div className={isDark ? 'theme-dark' : 'theme-light'}>
        <JoinGroupPage
          token={joinToken}
          onJoined={(conv) => {
            window.history.pushState({}, '', '/');
            setJoinToken(null);
            if (conv) setActiveConv(conv);
            setActiveTab('chat');
          }}
          onGoToLogin={() => setShowAuthForJoin(true)}
          onBack={() => {
            window.history.pushState({}, '', '/');
            setJoinToken(null);
          }}
        />
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

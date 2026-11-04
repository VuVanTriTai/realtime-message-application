import React from 'react';
import {
  MessageSquare,
  Users,
  User,
  LogOut,
  Sun,
  Moon,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import Avatar from '../common/Avatar';

export default function SidebarNav({
  activeTab,
  setActiveTab,
  unreadTotal = 0,
  pendingFriendsCount = 0,
  isDark,
  setIsDark,
}) {
  const { currentUser, logout } = useAuth();
  const { isConnected } = useWebSocket();

  return (
    <aside className="sidebar-nav">
      {/* Brand */}
      <div className="nav-brand" title="EchoWave">
        <div className="brand-icon-wrapper">
          <Zap size={20} fill="white" />
        </div>
      </div>

      {/* Nav Items */}
      <nav className="nav-items">
        <button
          type="button"
          id="nav-chat"
          className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          title="Tin nhắn"
        >
          <div className="nav-btn-icon-wrapper">
            <MessageSquare size={22} />
            {unreadTotal > 0 && (
              <span className="nav-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
            )}
          </div>
        </button>

        <button
          type="button"
          id="nav-friends"
          className={`nav-btn ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
          title="Bạn bè"
        >
          <div className="nav-btn-icon-wrapper">
            <Users size={22} />
            {pendingFriendsCount > 0 && (
              <span className="nav-badge badge-warning">{pendingFriendsCount}</span>
            )}
          </div>
        </button>
      </nav>

      {/* Footer */}
      <div className="nav-footer">
        {/* Connection dot */}
        <div
          className={`ws-status-badge ${isConnected ? 'ws-connected' : 'ws-disconnected'}`}
          title={isConnected ? 'Đang kết nối realtime' : 'Mất kết nối - đang thử lại...'}
        />

        {/* Theme */}
        <button
          type="button"
          id="btn-toggle-theme"
          className="nav-icon-action"
          onClick={() => setIsDark(!isDark)}
          title={isDark ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Avatar - Click vào để mở Hồ sơ */}
        <div
          className={`nav-user-mini ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
          title={`Hồ sơ: ${currentUser?.displayName || currentUser?.username}`}
        >
          <Avatar
            name={currentUser?.displayName || currentUser?.username}
            src={currentUser?.avatarUrl}
            size="sm"
            isOnline={isConnected}
            showStatus={true}
          />
        </div>
      </div>
    </aside>
  );
}

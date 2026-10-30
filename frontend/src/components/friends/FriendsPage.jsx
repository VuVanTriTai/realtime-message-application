import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  Send, 
  ShieldBan, 
  MessageSquare, 
  Trash2, 
  Check, 
  X, 
  Loader2, 
  RefreshCw,
  Search
} from 'lucide-react';
import Avatar from '../common/Avatar';
import AddFriendModal from './AddFriendModal';
import { friendApi } from '../../api/friendApi';
import { conversationApi } from '../../api/conversationApi';
import { formatDateOrRelative } from '../../utils/formatters';

export default function FriendsPage({ onStartChatWithFriend }) {
  const [tab, setTab] = useState('friends'); // 'friends' | 'received' | 'sent' | 'blocked'
  const [friends, setFriends] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [friendsData, receivedData, sentData, blockedData] = await Promise.all([
        friendApi.getFriends().catch(() => []),
        friendApi.getReceivedRequests().catch(() => []),
        friendApi.getSentRequests().catch(() => []),
        friendApi.getBlocked().catch(() => []),
      ]);
      setFriends(Array.isArray(friendsData) ? friendsData : []);
      setReceivedRequests(Array.isArray(receivedData) ? receivedData : []);
      setSentRequests(Array.isArray(sentData) ? sentData : []);
      setBlockedUsers(Array.isArray(blockedData) ? blockedData : []);
    } catch (err) {
      console.error('Error loading friends data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Actions
  const handleStartChat = async (friendId) => {
    if (!friendId) {
      alert('Không tìm thấy thông tin bạn bè để bắt đầu cuộc trò chuyện.');
      return;
    }
    setActionLoadingId(friendId);
    try {
      const conv = await conversationApi.getOrCreateDirect(friendId);
      if (onStartChatWithFriend) {
        onStartChatWithFriend(conv);
      }
    } catch (err) {
      alert('Không thể mở cuộc trò chuyện: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAccept = async (requestId) => {
    setActionLoadingId(requestId);
    try {
      await friendApi.acceptRequest(requestId);
      loadAllData();
    } catch (err) {
      alert('Chấp nhận lời mời thất bại: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = async (requestId) => {
    setActionLoadingId(requestId);
    try {
      await friendApi.declineRequest(requestId);
      loadAllData();
    } catch (err) {
      alert('Từ chối thất bại: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (requestId) => {
    setActionLoadingId(requestId);
    try {
      await friendApi.cancelRequest(requestId);
      loadAllData();
    } catch (err) {
      alert('Hủy yêu cầu thất bại: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnfriend = async (friendId, name) => {
    if (!window.confirm(`Bạn có chắc muốn hủy kết bạn với ${name}?`)) return;
    setActionLoadingId(friendId);
    try {
      await friendApi.unfriend(friendId);
      loadAllData();
    } catch (err) {
      alert('Hủy kết bạn thất bại: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleBlock = async (targetId, name) => {
    if (!window.confirm(`Bạn có chắc muốn chặn ${name}? Bạn sẽ không nhận được tin nhắn từ người này.`)) return;
    setActionLoadingId(targetId);
    try {
      await friendApi.blockUser(targetId);
      loadAllData();
    } catch (err) {
      alert('Chặn thất bại: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnblock = async (targetId) => {
    setActionLoadingId(targetId);
    try {
      await friendApi.unblockUser(targetId);
      loadAllData();
    } catch (err) {
      alert('Bỏ chặn thất bại: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter current list
  const getFilteredList = () => {
    const q = searchFilter.toLowerCase().trim();
    let list = [];
    if (tab === 'friends') list = friends;
    else if (tab === 'received') list = receivedRequests;
    else if (tab === 'sent') list = sentRequests;
    else if (tab === 'blocked') list = blockedUsers;

    if (!q) return list;
    return list.filter((item) => {
      const name = item.friendDisplayName || item.friendUsername || item.addresseeName || item.requesterName || '';
      return name.toLowerCase().includes(q);
    });
  };

  const currentList = getFilteredList();

  return (
    <div className="friends-page-container">
      {/* Top Header */}
      <div className="friends-page-header">
        <div className="header-titles">
          <h2 className="page-heading">Quản lý Bạn bè</h2>
          <p className="page-subheading">Kết nối và trò chuyện với mọi người</p>
        </div>

        <div className="header-actions-group">
          <button
            type="button"
            className="icon-action-btn"
            onClick={loadAllData}
            title="Làm mới"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'spin-anim' : ''} />
          </button>

          <button
            type="button"
            className="btn-add-friend"
            onClick={() => setIsAddModalOpen(true)}
          >
            <UserPlus size={16} />
            <span>Thêm bạn mới</span>
          </button>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="friends-tabs-row">
        <button
          type="button"
          className={`tab-btn ${tab === 'friends' ? 'active' : ''}`}
          onClick={() => setTab('friends')}
        >
          <UserCheck size={16} />
          <span>Bạn bè</span>
          {friends.length > 0 && <span className="tab-counter">{friends.length}</span>}
        </button>

        <button
          type="button"
          className={`tab-btn ${tab === 'received' ? 'active' : ''}`}
          onClick={() => setTab('received')}
        >
          <Users size={16} />
          <span>Lời mời nhận</span>
          {receivedRequests.length > 0 && (
            <span className="tab-counter">{receivedRequests.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`tab-btn ${tab === 'sent' ? 'active' : ''}`}
          onClick={() => setTab('sent')}
        >
          <Send size={16} />
          <span>Đã gửi</span>
          {sentRequests.length > 0 && <span className="tab-counter">{sentRequests.length}</span>}
        </button>

        <button
          type="button"
          className={`tab-btn ${tab === 'blocked' ? 'active' : ''}`}
          onClick={() => setTab('blocked')}
        >
          <ShieldBan size={16} />
          <span>Đã chặn</span>
        </button>
      </div>

      {/* Search within tab */}
      <div className="friends-search-row">
        <div className="search-bar-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Tìm kiếm trong danh sách này..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Main Grid Feed */}
      <div className="friends-grid-feed">
        {loading && currentList.length === 0 ? (
          <div className="friends-loading-state">
            <Loader2 size={32} className="spin-anim" />
            <span>Đang tải danh sách...</span>
          </div>
        ) : currentList.length === 0 ? (
          <div className="friends-empty-card glass-card">
            <Users size={48} className="empty-friends-icon" />
            <h3>
              {tab === 'friends' && 'Chưa có người bạn nào'}
              {tab === 'received' && 'Không có lời mời kết bạn nào'}
              {tab === 'sent' && 'Bạn chưa gửi lời mời nào'}
              {tab === 'blocked' && 'Danh sách chặn trống'}
            </h3>
            <p>
              {tab === 'friends' && 'Hãy bấm "Thêm bạn mới" để tìm kiếm và kết nối bạn bè ngay!'}
              {tab === 'received' && 'Khi ai đó gửi lời mời cho bạn, họ sẽ xuất hiện tại đây.'}
              {tab === 'sent' && 'Các lời mời bạn gửi đi đang chờ đối phương đồng ý sẽ hiện ở đây.'}
              {tab === 'blocked' && 'Những người bạn đã chặn sẽ được hiển thị ở đây.'}
            </p>
          </div>
        ) : (
          <div className="friends-cards-grid">
            {tab === 'friends' &&
              currentList.map((f) => (
                <div key={f.friendshipId || f.friendId} className="friend-card glass-card">
                  <div className="friend-card-top">
                    <Avatar
                      name={f.friendDisplayName || f.friendUsername}
                      src={f.friendAvatarUrl}
                      size="lg"
                      isOnline={f.isOnline}
                      showStatus={true}
                    />
                    <div className="friend-card-info">
                      <div className="friend-card-name">
                        {f.friendDisplayName || f.friendUsername}
                      </div>
                      <span className="friend-card-handle">@{f.friendUsername}</span>
                      <span className={`friend-card-status ${f.isOnline ? 'online' : ''}`}>
                        {f.isOnline ? '● Online' : '○ Ngoại tuyến'}
                      </span>
                    </div>
                  </div>

                  <div className="friend-card-actions">
                    <button
                      type="button"
                      className="btn-card-chat"
                      onClick={() => handleStartChat(f.friendId)}
                      disabled={actionLoadingId === f.friendId}
                    >
                      <MessageSquare size={16} />
                      <span>Nhắn tin</span>
                    </button>

                    <button
                      type="button"
                      className="btn-card-danger"
                      onClick={() => handleUnfriend(f.friendId, f.friendDisplayName || f.friendUsername)}
                      disabled={actionLoadingId === f.friendId}
                      title="Hủy kết bạn"
                    >
                      <Trash2 size={16} />
                    </button>

                    <button
                      type="button"
                      className="btn-card-danger"
                      onClick={() => handleBlock(f.friendId, f.friendDisplayName || f.friendUsername)}
                      disabled={actionLoadingId === f.friendId}
                      title="Chặn người dùng này"
                    >
                      <ShieldBan size={16} />
                    </button>
                  </div>
                </div>
              ))}

            {tab === 'received' &&
              currentList.map((req) => (
                <div key={req.id} className="friend-request-card glass-card">
                  <Avatar
                    name={req.requesterDisplayName || req.requesterUsername}
                    src={req.requesterAvatarUrl}
                    size="md"
                  />
                  <div className="req-card-info">
                    <h4>{req.requesterDisplayName || req.requesterUsername}</h4>
                    <span>@{req.requesterUsername}</span>
                    <span className="req-time">Gửi {formatDateOrRelative(req.createdAt)}</span>
                  </div>

                  <div className="req-card-buttons">
                    <button
                      type="button"
                      className="btn-req-accept"
                      onClick={() => handleAccept(req.id)}
                      disabled={actionLoadingId === req.id}
                    >
                      <Check size={16} /> Chấp nhận
                    </button>
                    <button
                      type="button"
                      className="btn-req-decline"
                      onClick={() => handleDecline(req.id)}
                      disabled={actionLoadingId === req.id}
                    >
                      <X size={16} /> Từ chối
                    </button>
                  </div>
                </div>
              ))}

            {tab === 'sent' &&
              currentList.map((req) => (
                <div key={req.id} className="friend-request-card glass-card">
                  <Avatar
                    name={req.addresseeDisplayName || req.addresseeUsername}
                    src={req.addresseeAvatarUrl}
                    size="md"
                  />
                  <div className="req-card-info">
                    <h4>{req.addresseeDisplayName || req.addresseeUsername}</h4>
                    <span>@{req.addresseeUsername}</span>
                    <span className="req-time">Đã gửi {formatDateOrRelative(req.createdAt)}</span>
                  </div>

                  <div className="req-card-buttons">
                    <button
                      type="button"
                      className="btn-req-cancel"
                      onClick={() => handleCancelRequest(req.id)}
                      disabled={actionLoadingId === req.id}
                    >
                      <X size={16} /> Thu hồi lời mời
                    </button>
                  </div>
                </div>
              ))}

            {tab === 'blocked' &&
              currentList.map((b) => (
                <div key={b.id || b.friendId} className="friend-request-card glass-card">
                  <Avatar
                    name={b.friendDisplayName || b.friendUsername}
                    src={b.friendAvatarUrl}
                    size="md"
                  />
                  <div className="req-card-info">
                    <h4>{b.friendDisplayName || b.friendUsername}</h4>
                    <span>@{b.friendUsername}</span>
                    <span className="blocked-tag">Đang bị chặn</span>
                  </div>

                  <div className="req-card-buttons">
                    <button
                      type="button"
                      className="btn-req-unblock"
                      onClick={() => handleUnblock(b.friendId || b.addresseeId)}
                      disabled={actionLoadingId === (b.friendId || b.addresseeId)}
                    >
                      <ShieldBan size={16} /> Bỏ chặn
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Add Friend Modal */}
      <AddFriendModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onRequestSent={loadAllData}
      />
    </div>
  );
}

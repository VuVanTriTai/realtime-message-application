import React, { useState } from 'react';
import { Search, UserPlus, Check, Loader2, Sparkles } from 'lucide-react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { userApi } from '../../api/userApi';
import { friendApi } from '../../api/friendApi';

export default function AddFriendModal({ isOpen, onClose, onRequestSent }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [sentMap, setSentMap] = useState({});
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setSearching(true);
    setError('');
    try {
      const data = await userApi.searchUsers(keyword.trim());
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Không thể tìm kiếm người dùng');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId) => {
    setSendingId(userId);
    setError('');
    try {
      await friendApi.sendRequest(userId);
      setSentMap((prev) => ({ ...prev, [userId]: true }));
      if (onRequestSent) onRequestSent();
    } catch (err) {
      setError(err.message || 'Gửi lời mời thất bại');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tìm kiếm & Thêm bạn bè" maxWidth="500px">
      <div className="add-friend-modal-content">
        <form onSubmit={handleSearch} className="search-user-form">
          <div className="search-bar-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Nhập tên đăng nhập hoặc tên hiển thị..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="btn-search-user"
            disabled={!keyword.trim() || searching}
          >
            {searching ? <Loader2 size={16} className="spin-anim" /> : 'Tìm'}
          </button>
        </form>

        {error && <div className="modal-error-banner">{error}</div>}

        {/* Results */}
        <div className="search-results-list">
          {searching ? (
            <div className="modal-center-loading">
              <Loader2 size={24} className="spin-anim" />
              <span>Đang tìm kiếm người dùng...</span>
            </div>
          ) : results.length > 0 ? (
            results.map((user) => {
              const isSent = !!sentMap[user.id];
              return (
                <div key={user.id} className="search-user-item">
                  <Avatar
                    name={user.displayName || user.username}
                    src={user.avatarUrl}
                    size="md"
                    isOnline={user.isOnline}
                    showStatus={true}
                  />
                  <div className="search-user-details">
                    <span className="user-name">
                      {user.displayName || user.username}
                    </span>
                    <span className="user-handle">@{user.username}</span>
                  </div>

                  <button
                    type="button"
                    className={`btn-send-friend-req ${isSent ? 'sent' : ''}`}
                    onClick={() => !isSent && handleSendRequest(user.id)}
                    disabled={isSent || sendingId === user.id}
                  >
                    {sendingId === user.id ? (
                      <Loader2 size={15} className="spin-anim" />
                    ) : isSent ? (
                      <>
                        <Check size={15} /> Đã gửi
                      </>
                    ) : (
                      <>
                        <UserPlus size={15} /> Kết bạn
                      </>
                    )}
                  </button>
                </div>
              );
            })
          ) : keyword ? (
            <div className="modal-empty-state">
              <Sparkles size={28} />
              <p>Không tìm thấy người dùng nào phù hợp</p>
            </div>
          ) : (
            <div className="search-tips">
              <p>Nhập từ khóa (tên đăng nhập, họ tên) để tìm kiếm bạn bè trên hệ thống</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

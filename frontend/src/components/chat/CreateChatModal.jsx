import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, Users, Search, Check, Loader2, MessageSquare, Globe } from 'lucide-react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { friendApi, userApi } from '../../api/friendApi';
import { conversationApi } from '../../api/conversationApi';

export default function CreateChatModal({ isOpen, onClose, onConversationCreated }) {
  const [tab, setTab] = useState('direct'); // 'direct' | 'search' | 'group'
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Tab "Tìm người dùng" state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadFriends();
      setSearch('');
      setGroupName('');
      setSelectedFriends([]);
      setError('');
      setTab('direct');
      setUserSearchQuery('');
      setSearchResults([]);
      setSearchDone(false);
    }
  }, [isOpen]);

  const loadFriends = async () => {
    setLoading(true);
    try {
      const data = await friendApi.getFriends();
      setFriends(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Không thể tải danh sách bạn bè');
    } finally {
      setLoading(false);
    }
  };

  // Tìm kiếm user lạ (debounced)
  const handleUserSearch = useCallback(async (q) => {
    setUserSearchQuery(q);
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      setSearchDone(false);
      return;
    }
    setSearchLoading(true);
    setSearchDone(false);
    try {
      const data = await userApi.search(q.trim());
      setSearchResults(Array.isArray(data) ? data : []);
      setSearchDone(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (tab !== 'search') return;
    const t = setTimeout(() => handleUserSearch(userSearchQuery), 400);
    return () => clearTimeout(t);
  }, [userSearchQuery, tab, handleUserSearch]);

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter((f) => {
      const name = (f.friendDisplayName || f.friendUsername || '').toLowerCase();
      const handle = (f.friendUsername || '').toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [friends, search]);

  const handleStartDirectChat = async (userId) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const conv = await conversationApi.getOrCreateDirect(userId);
      onConversationCreated(conv);
      onClose();
    } catch (err) {
      setError(err.message || 'Không thể tạo cuộc trò chuyện');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelectFriend = (friendId) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) { setError('Vui lòng nhập tên nhóm'); return; }
    if (selectedFriends.length === 0) { setError('Vui lòng chọn ít nhất 1 bạn bè'); return; }

    setSubmitting(true);
    setError('');
    try {
      const conv = await conversationApi.createGroup(groupName.trim(), selectedFriends);
      onConversationCreated(conv);
      onClose();
    } catch (err) {
      setError(err.message || 'Không thể tạo nhóm');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedFriendObjects = friends.filter((f) => selectedFriends.includes(f.friendId));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cuộc trò chuyện mới"
      maxWidth="500px"
    >
      <div className="create-chat-modal-body">
        {/* Tab Switcher */}
        <div className="modal-tab-row">
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'direct' ? 'active' : ''}`}
            onClick={() => setTab('direct')}
          >
            <User size={15} /> Bạn bè
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'search' ? 'active' : ''}`}
            onClick={() => setTab('search')}
          >
            <Globe size={15} /> Tìm người
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'group' ? 'active' : ''}`}
            onClick={() => setTab('group')}
          >
            <Users size={15} /> Tạo nhóm
          </button>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        {/* ── Tab: Tìm người dùng bất kỳ ── */}
        {tab === 'search' && (
          <>
            <div className="search-friend-bar search-bar-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Nhập tên hoặc username..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                autoFocus
              />
              {searchLoading && <Loader2 size={15} className="spin-anim" style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: '8px' }} />}
            </div>

            <div className="modal-friends-list">
              {!searchDone && !searchLoading && userSearchQuery.length < 2 ? (
                <div className="modal-empty-state">
                  <Globe size={28} />
                  <p>Nhập ít nhất 2 ký tự để tìm kiếm người dùng</p>
                </div>
              ) : searchLoading ? (
                <div className="modal-center-loading">
                  <Loader2 size={22} className="spin-anim" />
                  <span>Đang tìm kiếm...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="modal-empty-state">
                  <User size={28} />
                  <p>Không tìm thấy người dùng nào</p>
                </div>
              ) : (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="modal-friend-item"
                    onClick={() => handleStartDirectChat(user.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <Avatar
                      name={user.displayName || user.username}
                      src={user.avatarUrl}
                      size="md"
                      isOnline={user.isOnline}
                      showStatus={true}
                    />
                    <div className="modal-friend-info">
                      <div className="modal-friend-name">
                        {user.displayName || user.username}
                      </div>
                      <div className="modal-friend-handle">@{user.username}</div>
                    </div>
                    <MessageSquare size={16} style={{ color: 'var(--brand-blue)', flexShrink: 0 }} />
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ── Tab: Bạn bè (Direct chat) ── */}
        {tab !== 'search' && (
          <>
            {/* Group name */}
            {tab === 'group' && (
              <input
                type="text"
                className="group-name-input"
                placeholder="Tên nhóm chat..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={100}
                autoFocus
              />
            )}

            {/* Selected chips (group only) */}
            {tab === 'group' && selectedFriendObjects.length > 0 && (
              <div className="selected-chips">
                {selectedFriendObjects.map((f) => (
                  <div key={f.friendId} className="chip">
                    <Avatar name={f.friendDisplayName || f.friendUsername} size="xs" />
                    <span>{f.friendDisplayName || f.friendUsername}</span>
                    <button
                      className="chip-remove"
                      onClick={() => toggleSelectFriend(f.friendId)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="search-friend-bar search-bar-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Tìm bạn bè..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Friends list */}
            <div className="modal-friends-list">
              {loading ? (
                <div className="modal-center-loading">
                  <Loader2 size={22} className="spin-anim" />
                  <span>Đang tải...</span>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="modal-empty-state">
                  <Users size={28} />
                  <p>{search ? 'Không tìm thấy bạn bè' : 'Chưa có bạn bè nào'}</p>
                  {!search && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Dùng tab <strong>Tìm người</strong> để nhắn tin với người chưa kết bạn
                    </p>
                  )}
                </div>
              ) : (
                filteredFriends.map((friend) => {
                  const isSelected = selectedFriends.includes(friend.friendId);
                  return (
                    <div
                      key={friend.friendId}
                      className={`modal-friend-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        if (tab === 'direct') {
                          handleStartDirectChat(friend.friendId);
                        } else {
                          toggleSelectFriend(friend.friendId);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <Avatar
                        name={friend.friendDisplayName || friend.friendUsername}
                        src={friend.friendAvatarUrl}
                        size="md"
                        isOnline={friend.isOnline}
                        showStatus={true}
                      />
                      <div className="modal-friend-info">
                        <div className="modal-friend-name">
                          {friend.friendDisplayName || friend.friendUsername}
                        </div>
                        <div className="modal-friend-handle">@{friend.friendUsername}</div>
                      </div>

                      {tab === 'group' && (
                        <div className="modal-select-check">
                          {isSelected && <Check size={13} />}
                        </div>
                      )}

                      {tab === 'direct' && (
                        <MessageSquare size={16} style={{ color: 'var(--brand-blue)', flexShrink: 0 }} />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Create group footer */}
            {tab === 'group' && (
              <button
                type="button"
                className="modal-submit-btn"
                onClick={handleCreateGroup}
                disabled={submitting || !groupName.trim() || selectedFriends.length === 0}
              >
                {submitting ? (
                  <><Loader2 size={16} className="spin-anim" /> Đang tạo...</>
                ) : (
                  <><Users size={16} /> Tạo nhóm ({selectedFriends.length} người)</>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

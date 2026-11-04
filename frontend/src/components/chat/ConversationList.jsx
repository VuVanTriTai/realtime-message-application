import React, { useState, useMemo } from 'react';
import { Search, Plus, RefreshCw, MessageSquarePlus, Inbox } from 'lucide-react';
import ConversationItem from './ConversationItem';

export default function ConversationList({
  conversations = [],
  activeConversation,
  onSelectConversation,
  onOpenCreateModal,
  onRefresh,
  loading = false,
  typingStates = {}, // { [convId]: boolean }
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('main'); // 'main' | 'requests'

  // Tách conversations thành 2 nhóm dựa vào isStranger
  const mainConversations = useMemo(
    () => conversations.filter((c) => !c.isStranger),
    [conversations]
  );
  const requestConversations = useMemo(
    () => conversations.filter((c) => c.isStranger),
    [conversations]
  );

  const currentList = activeTab === 'main' ? mainConversations : requestConversations;

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return currentList;
    const q = searchQuery.toLowerCase().trim();
    return currentList.filter((c) =>
      (c.otherUserName && c.otherUserName.toLowerCase().includes(q)) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.lastMessage?.content && c.lastMessage.content.toLowerCase().includes(q))
    );
  }, [currentList, searchQuery]);

  const requestBadge = requestConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  return (
    <div className="conversation-list-panel">
      {/* Search & Action Header */}
      <div className="conv-header">
        <div className="conv-header-top">
          <h2 className="panel-title">Đoạn chat</h2>
          <div className="header-actions">
            <button
              type="button"
              className="icon-action-btn"
              onClick={onRefresh}
              title="Làm mới danh sách"
              disabled={loading}
            >
              <RefreshCw size={18} className={loading ? 'spin-anim' : ''} />
            </button>
            <button
              type="button"
              className="primary-action-btn"
              onClick={onOpenCreateModal}
              title="Tạo cuộc trò chuyện mới"
            >
              <Plus size={18} />
              <span>Mới</span>
            </button>
          </div>
        </div>

        <div className="search-bar-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Tìm kiếm cuộc trò chuyện..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>

        {/* Tab switcher: Tin nhắn / Lời nhắn */}
        <div className="conv-tab-row">
          <button
            type="button"
            className={`conv-tab-btn ${activeTab === 'main' ? 'active' : ''}`}
            onClick={() => setActiveTab('main')}
          >
            Tin nhắn
            {mainConversations.some((c) => c.unreadCount > 0) && (
              <span className="conv-tab-dot" />
            )}
          </button>
          <button
            type="button"
            className={`conv-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            Lời nhắn
            {requestBadge > 0 && (
              <span className="conv-tab-badge">
                {requestBadge > 99 ? '99+' : requestBadge}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* List Feed */}
      <div className="conv-items-scroll">
        {loading && conversations.length === 0 ? (
          <div className="conv-loading-state">
            <div className="skeleton-item" />
            <div className="skeleton-item" />
            <div className="skeleton-item" />
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={activeConversation?.id === conv.id}
              onSelect={onSelectConversation}
              isTyping={typingStates[conv.id]?.length > 0}
              isStranger={!!conv.isStranger}
            />
          ))
        ) : (
          <div className="empty-conv-state">
            {activeTab === 'requests' ? (
              <>
                <Inbox size={44} className="empty-icon" />
                <p className="empty-title">Không có lời nhắn nào</p>
                <p className="empty-subtitle">
                  Đây là nơi chứa tin nhắn từ những người chưa kết bạn với bạn
                </p>
              </>
            ) : (
              <>
                <MessageSquarePlus size={44} className="empty-icon" />
                <p className="empty-title">
                  {searchQuery ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện nào'}
                </p>
                <p className="empty-subtitle">
                  {searchQuery
                    ? 'Hãy thử tìm kiếm với từ khóa khác'
                    : 'Bắt đầu kết nối bằng cách tạo đoạn chat mới hoặc kết bạn'}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    className="btn-create-first"
                    onClick={onOpenCreateModal}
                  >
                    <Plus size={16} /> Bắt đầu trò chuyện
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

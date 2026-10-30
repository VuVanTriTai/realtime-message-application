import React, { useState, useMemo } from 'react';
import { Search, Plus, MessageSquarePlus, RefreshCw } from 'lucide-react';
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

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) =>
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.lastMessage?.content && c.lastMessage.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

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
            />
          ))
        ) : (
          <div className="empty-conv-state">
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
          </div>
        )}
      </div>
    </div>
  );
}

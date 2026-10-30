import React, { useState } from 'react';
import { Check, CheckCheck, Clock, MoreVertical, Edit2, Trash2, Ban } from 'lucide-react';
import { formatTime } from '../../utils/formatters';
import Avatar from '../common/Avatar';

export default function MessageBubble({
  message,
  isOwn,
  showSender = false,
  onEdit,
  onDelete,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }
    onEdit(message.id, editContent.trim());
    setIsEditing(false);
  };

  const isDeleted = !!message.deleted;

  return (
    <div className={`message-row ${isOwn ? 'own-message-row' : 'other-message-row'}`} translate="no">
      {/* Incoming message sender avatar (in group chat) */}
      {!isOwn && showSender && (
        <Avatar
          name={message.sender?.displayName || message.sender?.username || message.senderName || message.senderUsername || '?'}
          src={message.sender?.avatarUrl || message.senderAvatarUrl}
          size="sm"
          className="msg-sender-avatar"
        />
      )}

      <div className="message-content-wrapper">
        {!isOwn && showSender && (
          <span className="msg-sender-name">
            {message.sender?.displayName || message.sender?.username || message.senderName || message.senderUsername || 'Unknown'}
          </span>
        )}

        <div
          className={`message-bubble ${isOwn ? 'own-bubble' : 'other-bubble'} ${
            isDeleted ? 'deleted-bubble' : ''
          }`}
          onMouseLeave={() => setShowMenu(false)}
        >
          {isDeleted ? (
            <div className="deleted-content">
              <Ban size={14} />
              <span>Tin nhắn đã được thu hồi</span>
            </div>
          ) : isEditing ? (
            <form onSubmit={handleSaveEdit} className="inline-edit-form">
              <input
                type="text"
                className="inline-edit-input"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                autoFocus
              />
              <div className="inline-edit-actions">
                <button type="submit" className="edit-btn-save">
                  Lưu
                </button>
                <button
                  type="button"
                  className="edit-btn-cancel"
                  onClick={() => setIsEditing(false)}
                >
                  Hủy
                </button>
              </div>
            </form>
          ) : (
            <div
              className="bubble-text"
              translate="no"
              dangerouslySetInnerHTML={{ __html: (message.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }}
            />
          )}

          {/* Time & status meta */}
          <div className="bubble-meta">
            {message.isEdited && !isDeleted && (
              <span className="edited-flag">(đã chỉnh sửa)</span>
            )}
            <span className="bubble-time">{formatTime(message.createdAt)}</span>
            {isOwn && !isDeleted && (
              <span className="msg-status-icon">
                {message.status === 'READ' ? (
                  <CheckCheck size={14} className="icon-read" title="Đã xem" />
                ) : message.status === 'DELIVERED' ? (
                  <CheckCheck size={14} className="icon-delivered" title="Đã nhận" />
                ) : message.status === 'SENT' ? (
                  <Check size={14} className="icon-sent" title="Đã gửi" />
                ) : (
                  <Clock size={12} className="icon-pending" title="Đang gửi" />
                )}
              </span>
            )}
          </div>

          {/* Hover Action Menu for own messages */}
          {isOwn && !isDeleted && !isEditing && (
            <div className="bubble-action-trigger">
              <button
                type="button"
                className="action-menu-btn"
                onClick={() => setShowMenu(!showMenu)}
                title="Tùy chọn tin nhắn"
              >
                <MoreVertical size={14} />
              </button>

              {showMenu && (
                <div className="bubble-dropdown-menu">
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setShowMenu(false);
                      setIsEditing(true);
                    }}
                  >
                    <Edit2 size={13} /> Sửa tin nhắn
                  </button>
                  <button
                    type="button"
                    className="dropdown-item dropdown-danger"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(message.id);
                    }}
                  >
                    <Trash2 size={13} /> Thu hồi
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  Edit2,
  Trash2,
  Ban,
  CornerUpLeft,
  FileText,
  Download,
  ExternalLink,
  Users,
} from 'lucide-react';
import { formatTime, formatFileSize } from '../../utils/formatters';
import Avatar from '../common/Avatar';

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

function renderBubbleContent(content) {
  if (!content) return { elements: null, inviteToken: null };

  const parts = content.split(URL_REGEX);
  let inviteToken = null;

  const elements = parts.map((part, index) => {
    if (part.match(URL_REGEX)) {
      const isInternalJoin = part.includes('/join/');
      let token = null;
      if (isInternalJoin) {
        const m = part.match(/\/join\/([a-zA-Z0-9_-]+)/);
        if (m) {
          token = m[1];
          if (!inviteToken) inviteToken = token;
        }
      }

      return (
        <a
          key={index}
          href={part}
          target={isInternalJoin ? '_self' : '_blank'}
          rel="noopener noreferrer"
          className="bubble-link"
          onClick={(e) => {
            if (token) {
              e.preventDefault();
              window.history.pushState({}, '', `/join/${token}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
        >
          {part}
        </a>
      );
    }
    return part;
  });

  return { elements, inviteToken };
}

export default function MessageBubble({
  message,
  isOwn,
  showSender = false,
  onEdit,
  onDelete,
  onReply,
  onScrollToMessage,
}) {
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

  const isDeleted = !!message.deleted || !!message.isDeleted;
  const isImage = message.type === 'IMAGE';
  const isFile = message.type === 'FILE';

  return (
    <div
      id={`msg-${message.id}`}
      className={`message-row ${isOwn ? 'own-message-row' : 'other-message-row'}`}
      translate="no"
    >
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

        <div className={isOwn ? 'own-bubble-container' : 'other-bubble-container'}>
          {/* Quick Hover Actions for OWN messages (nằm ở bên TRÁI bubble của mình) */}
          {isOwn && !isDeleted && !isEditing && (
            <div className="own-action-trigger">
              {onReply && (
                <button
                  type="button"
                  className="action-menu-btn"
                  onClick={() => onReply(message)}
                  title="Trả lời tin nhắn"
                >
                  <CornerUpLeft size={13} />
                </button>
              )}
              {message.type === 'TEXT' && onEdit && (
                <button
                  type="button"
                  className="action-menu-btn"
                  onClick={() => setIsEditing(true)}
                  title="Sửa tin nhắn"
                >
                  <Edit2 size={13} />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="action-menu-btn action-delete-btn"
                  onClick={() => onDelete(message.id)}
                  title="Thu hồi / Xóa tin nhắn"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          <div
            className={`message-bubble ${isOwn ? 'own-bubble' : 'other-bubble'} ${
              isDeleted ? 'deleted-bubble' : ''
            } ${isImage && !isDeleted ? 'image-bubble' : ''}`}
          >
            {/* Replying quote preview */}
            {!isDeleted && message.replyTo && (
              <div
                className="replied-quote"
                onClick={() => onScrollToMessage && onScrollToMessage(message.replyTo.id)}
                title="Bấm để xem tin nhắn gốc"
              >
                <div className="replied-quote-content">
                  <span className="replied-quote-author">
                    {message.replyTo.senderUsername || 'Người dùng'}
                  </span>
                  <span className="replied-quote-text">
                    {message.replyTo.contentPreview || 'Tin nhắn'}
                  </span>
                </div>
              </div>
            )}

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
            ) : isImage ? (
              /* Image Message */
              <div className="bubble-media-image-container">
                <img
                  src={message.mediaUrl || message.content}
                  alt={message.fileName || 'Hình ảnh'}
                  className="bubble-media-image"
                  loading="lazy"
                  onClick={() => window.open(message.mediaUrl || message.content, '_blank')}
                  title="Bấm để mở ảnh kích thước gốc"
                />
              </div>
            ) : isFile ? (
              /* Document / File Message */
              <a
                href={message.mediaUrl || message.content}
                target="_blank"
                rel="noopener noreferrer"
                download={message.fileName || 'file'}
                className="bubble-media-file-card"
                title="Bấm để tải về"
              >
                <div className="file-card-icon">
                  <FileText size={22} />
                </div>
                <div className="file-card-info">
                  <span className="file-card-name">{message.fileName || 'Tệp tin đính kèm'}</span>
                  <span className="file-card-size">{formatFileSize(message.fileSize)}</span>
                </div>
                <div className="file-card-action">
                  <Download size={16} />
                </div>
              </a>
            ) : (
              /* Normal Text Message with Link & Group Invite Card */
              (() => {
                const { elements, inviteToken } = renderBubbleContent(message.content);
                return (
                  <>
                    <div className="bubble-text" translate="no">
                      {elements}
                    </div>

                    {inviteToken && (
                      <div
                        className="bubble-invite-card"
                        onClick={() => {
                          window.history.pushState({}, '', `/join/${inviteToken}`);
                          window.dispatchEvent(new PopStateEvent('popstate'));
                        }}
                        role="button"
                        tabIndex={0}
                        title="Bấm để tham gia nhóm"
                      >
                        <div className="invite-card-left">
                          <div className="invite-card-icon-circle">
                            <Users size={18} />
                          </div>
                          <div className="invite-card-details">
                            <span className="invite-card-title">Lời mời tham gia nhóm</span>
                            <span className="invite-card-subtitle">Bấm để xem và tham gia</span>
                          </div>
                        </div>
                        <span className="invite-card-badge">Tham gia</span>
                      </div>
                    )}
                  </>
                );
              })()
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
          </div>

          {/* Quick Hover Reply Button for OTHER messages (nằm ở bên PHẢI bubble người khác) */}
          {!isOwn && !isDeleted && onReply && (
            <div className="other-action-trigger">
              <button
                type="button"
                className="action-menu-btn"
                onClick={() => onReply(message)}
                title="Trả lời tin nhắn này"
              >
                <CornerUpLeft size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

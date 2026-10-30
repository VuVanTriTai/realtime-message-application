import React from 'react';
import Avatar from '../common/Avatar';
import { formatDateOrRelative } from '../../utils/formatters';
import { Users, CheckCheck } from 'lucide-react';

export default function ConversationItem({ conversation, isActive, onSelect, isTyping = false }) {
  const isGroup = conversation.type === 'GROUP';
    // [FIX] With DIRECT: use otherUserName (backend provides other person's name); GROUP: use name/title
  const title = isGroup
    ? (conversation.name || conversation.title || 'Nhom chua dat ten')
    : (conversation.otherUserName || conversation.title || conversation.name || 'Cuoc tro chuyen');
  const lastMsg = conversation.lastMessage;
  const unreadCount = conversation.unreadCount || 0;

  let subtitle = 'Chưa có tin nhắn nào';
  if (isTyping) {
    subtitle = 'Đang soạn tin nhắn...';
  } else if (lastMsg) {
    if (lastMsg.deleted) {
      subtitle = 'Tin nhắn đã thu hồi';
    } else {
      const senderPrefix = lastMsg.senderName ? `${lastMsg.senderName}: ` : '';
      subtitle = `${senderPrefix}${lastMsg.content || ''}`;
    }
  }

  return (
    <div
      className={`conversation-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
      onClick={() => onSelect(conversation)}
      role="button"
      tabIndex={0}
    >
      <div className="item-avatar-wrapper">
        <Avatar
          name={title}
          src={conversation.avatarUrl}
          size="md"
          showStatus={!isGroup}
          isOnline={conversation.isOnline}
        />
        {isGroup && (
          <span className="group-badge-icon" title="Nhóm chat">
            <Users size={12} />
          </span>
        )}
      </div>

      <div className="item-details">
        <div className="item-header">
          <span className="item-title">{title}</span>
          {lastMsg?.createdAt && (
            <span className="item-time">
              {formatDateOrRelative(lastMsg.createdAt)}
            </span>
          )}
        </div>

        <div className="item-footer">
          <span className={`item-preview ${isTyping ? 'item-typing' : ''}`}>
            {subtitle}
          </span>
          {unreadCount > 0 && (
            <span className="unread-counter">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

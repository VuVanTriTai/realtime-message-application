import React from 'react';
import Avatar from '../common/Avatar';
import { formatDateOrRelative } from '../../utils/formatters';
import { Users, UserX2 } from 'lucide-react';

export default function ConversationItem({ conversation, isActive, onSelect, isTyping = false, isStranger = false }) {
  const isGroup = conversation.type === 'GROUP';
  const title = isGroup
    ? (conversation.name || conversation.title || 'Nhóm chưa đặt tên')
    : (conversation.otherUserName || conversation.title || conversation.name || 'Cuộc trò chuyện');
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
      let text = lastMsg.content || '';
      if (lastMsg.type === 'IMAGE' || (!text && lastMsg.mediaUrl)) {
        text = '[Hình ảnh]' + (lastMsg.fileName ? ` ${lastMsg.fileName}` : '');
      } else if (lastMsg.type === 'FILE') {
        text = `[Tệp] ${lastMsg.fileName || 'đính kèm'}`;
      } else if (typeof text === 'string' && text.startsWith('http') && (text.includes('cloudinary') || text.includes('/upload/'))) {
        text = '[Tệp đính kèm]';
      }
      subtitle = `${senderPrefix}${text}`;
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
        {isStranger && !isGroup && (
          <span className="stranger-badge-icon" title="Người chưa kết bạn">
            <UserX2 size={11} />
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

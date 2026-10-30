import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Info, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import Avatar from '../common/Avatar';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { messageApi } from '../../api/messageApi';
import { conversationApi } from '../../api/conversationApi';
import ErrorBoundary from '../common/ErrorBoundary';

export default function ChatWindow({
  conversation,
  onBack,
  onOpenMembersModal,
  typingUsers = [], // array of display names đang typing
  onMessageSent,
  onTypingEvent,  // [FIX] callback từ ChatPage để cập nhật typingStates
  onPresenceEvent, // [FIX] callback từ ChatPage để cập nhật isOnline
}) {
  const { currentUser } = useAuth();
  const { subscribeToConversation, sendMessage: wsSendMessage, sendTyping: wsSendTyping, sendRead: wsSendRead } = useWebSocket();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);

  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const isInitialScrollRef = useRef(true);

  // [FIX] Dùng ref để giữ stable callbacks - tránh re-subscribe khi parent re-render
  const onMessageSentRef = useRef(onMessageSent);
  const onTypingEventRef = useRef(onTypingEvent);
  const onPresenceEventRef = useRef(onPresenceEvent);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { onMessageSentRef.current = onMessageSent; }, [onMessageSent]);
  useEffect(() => { onTypingEventRef.current = onTypingEvent; }, [onTypingEvent]);
  useEffect(() => { onPresenceEventRef.current = onPresenceEvent; }, [onPresenceEvent]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const isGroup = conversation?.type === 'GROUP';
  // [FIX] DIRECT: dung otherUserName (ten nguoi kia tu backend); GROUP: dung name/title
  const title = isGroup
    ? (conversation?.name || conversation?.title || 'Nhom chat')
    : (conversation?.otherUserName || conversation?.title || conversation?.name || 'Cuoc tro chuyen');

  // Load initial history
  const loadHistory = useCallback(async () => {
    if (!conversation?.id) return;
    setLoading(true);
    try {
      const data = await messageApi.getHistory(conversation.id);
      // Backend returns list of messages (or pagination wrapper)
      const msgList = Array.isArray(data) ? data : (data.content || []);
      setMessages(msgList);
      
      if (msgList.length > 0) {
        setCursor(msgList[0].id); // oldest message id for cursor pagination
        setHasMore(msgList.length >= 30);

        // Mark read the newest message
        const newest = msgList[msgList.length - 1];
        if (newest && newest.id) {
          wsSendRead(conversation.id, newest.id);
          conversationApi.markRead(conversation.id, newest.id).catch(() => {});
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
      isInitialScrollRef.current = true;
    }
  }, [conversation?.id, wsSendRead]);

  // Load older messages (cursor pagination)
  const handleLoadOlder = async () => {
    if (!cursor || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    const prevScrollHeight = messageListRef.current?.scrollHeight || 0;

    try {
      const data = await messageApi.getHistory(conversation.id, cursor);
      const olderList = Array.isArray(data) ? data : (data.content || []);
      if (olderList.length > 0) {
        setMessages((prev) => [...olderList, ...prev]);
        setCursor(olderList[0].id);
        setHasMore(olderList.length >= 30);
      } else {
        setHasMore(false);
      }

      // Preserve scroll position
      setTimeout(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop =
            messageListRef.current.scrollHeight - prevScrollHeight;
        }
      }, 50);
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Subscribe to WebSocket events for this conversation
  // [FIX] Gộp tất cả handlers vào một lần subscribe duy nhất để tránh ghi đè nhau.
  // ChatPage truyền onTypingEvent và onPresenceEvent xuống để ChatWindow forward lên.
  useEffect(() => {
    if (!conversation?.id) return;

    loadHistory();

    const unsubscribe = subscribeToConversation(conversation.id, {
      onMessage: (newMsg) => {
        setMessages((prev) => {
          // If message already exists by id, ignore or replace
          // Match by real id OR by clientMessageId (để dedup optimistic message của sender)
          const index = prev.findIndex(
            (m) => m.id === newMsg.id ||
                   (newMsg.clientMessageId && m.id === newMsg.clientMessageId)
          );
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = newMsg;
            return updated;
          }
          return [...prev, newMsg];
        });

        // Auto mark read if we are looking at this conversation
        if (newMsg.sender?.id !== currentUserRef.current?.id) {
          wsSendRead(conversation.id, newMsg.id);
          conversationApi.markRead(conversation.id, newMsg.id).catch(() => {});
        }

        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);

        if (onMessageSentRef.current) onMessageSentRef.current(newMsg);
      },

      onRead: (receipt) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id <= receipt.messageId && (msg.sender?.id === currentUserRef.current?.id || msg.senderId === currentUserRef.current?.id)
              ? { ...msg, status: 'READ' }
              : msg
          )
        );
      },

      // [FIX] Forward typing event lên ChatPage để cập nhật typingStates
      onTyping: (typingEvent) => {
        if (onTypingEventRef.current) onTypingEventRef.current(typingEvent);
      },

      // [FIX] Forward presence event lên ChatPage để cập nhật isOnline trong conversation list
      onPresence: (presence) => {
        if (onPresenceEventRef.current) onPresenceEventRef.current(presence);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [conversation?.id, loadHistory, subscribeToConversation, wsSendRead]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && isInitialScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isInitialScrollRef.current = false;
    }
  }, [loading, messages]);

  // Send message handler (WS first, fallback to REST)
  const handleSendMessage = async (content) => {
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      conversationId: conversation.id,
      sender: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName || currentUser.username,
        avatarUrl: currentUser.avatarUrl,
      },
      senderId: currentUser.id, // keep for backward compat
      content,
      type: 'TEXT',
      status: 'SENDING',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    try {
      // Send via WebSocket STOMP
      wsSendMessage(conversation.id, content, 'TEXT', tempId);
    } catch (wsErr) {
      console.warn('WS send failed, using REST fallback:', wsErr);
      try {
        const saved = await messageApi.sendMessage(conversation.id, content, 'TEXT', tempId);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      } catch (restErr) {
        console.error('All send mechanisms failed:', restErr);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, status: 'FAILED' } : m
          )
        );
      }
    }
  };

  const handleTyping = (isTyping) => {
    wsSendTyping(conversation.id, isTyping);
  };

  const handleEditMessage = async (msgId, newContent) => {
    try {
      const updated = await messageApi.editMessage(msgId, newContent);
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updated : m)));
    } catch (err) {
      alert('Không thể chỉnh sửa tin nhắn: ' + err.message);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    if (!window.confirm('Bạn có chắc chắn muốn thu hồi tin nhắn này?')) return;
    try {
      await messageApi.deleteMessage(msgId);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, deleted: true } : m))
      );
    } catch (err) {
      alert('Không thể thu hồi tin nhắn: ' + err.message);
    }
  };

  return (
    <div className="chat-window-panel">
      {/* Chat Top Header */}
      <div className="chat-window-header">
        <div className="chat-header-left">
          {onBack && (
            <button
              type="button"
              className="chat-back-btn"
              onClick={onBack}
              title="Quay lại danh sách"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <Avatar
            name={title}
            src={conversation?.avatarUrl}
            size="md"
            showStatus={!isGroup}
            isOnline={conversation?.isOnline}
          />

          <div className="chat-header-info">
            <h3 className="chat-title">{title}</h3>
            <div className="chat-subtitle">
              {typingUsers.length > 0 ? (
                <span className="typing-notice">
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  {typingUsers.join(', ')} đang soạn tin...
                </span>
              ) : isGroup ? (
                <span>Nhóm chat ({conversation?.memberCount || 'nhiều'} thành viên)</span>
              ) : conversation?.isOnline ? (
                <span className="online-tag">Đang hoạt động</span>
              ) : (
                <span className="offline-tag">Ngoại tuyến</span>
              )}
            </div>
          </div>
        </div>

        <div className="chat-header-right">
          {isGroup && (
            <button
              type="button"
              className="header-tool-btn"
              onClick={onOpenMembersModal}
              title="Thành viên nhóm"
            >
              <Users size={19} />
            </button>
          )}
        </div>
      </div>

      {/* Message History Feed */}
      <div className="chat-messages-container" ref={messageListRef} translate="no">
        {hasMore && (
          <div className="load-older-wrapper">
            <button
              type="button"
              className="btn-load-older"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? (
                <>
                  <Loader2 size={14} className="spin-anim" /> Đang tải thêm...
                </>
              ) : (
                'Tải tin nhắn cũ hơn'
              )}
            </button>
          </div>
        )}

        {loading ? (
          <div className="chat-center-loading">
            <Loader2 size={36} className="spin-anim" />
            <span>Đang tải tin nhắn...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty-feed">
            <div className="chat-empty-glow">
              <Sparkles size={36} />
            </div>
            <h4>Chưa có tin nhắn nào</h4>
            <p>Gửi tin nhắn đầu tiên để bắt đầu cuộc trò chuyện tuyệt vời này!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ErrorBoundary key={msg.id}>
              <MessageBubble
                message={msg}
                isOwn={msg.sender?.id === currentUser?.id || msg.senderId === currentUser?.id}
                showSender={isGroup}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
              />
            </ErrorBoundary>
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
      />
    </div>
  );
}
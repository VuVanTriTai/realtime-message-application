import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  onToggleDetailPanel,
  isDetailOpen = false,
  jumpMessageId = null,
  onMarkRead,
}) {
  const { currentUser } = useAuth();
  const {
    subscribeToConversation,
    sendMessage: wsSendMessage,
    sendTyping: wsSendTyping,
    sendDelivered: wsSendDelivered,
    sendRead: wsSendRead,
  } = useWebSocket();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const isInitialScrollRef = useRef(true);

  // [GAP DETECTION & ACK CURSOR REFS]
  const lastSeqRef = useRef(0);
  const pendingDeliveredSeqRef = useRef(0);
  const deliveredTimerRef = useRef(null);
  const pendingReadSeqRef = useRef(0);
  const readTimerRef = useRef(null);

  // [FIX] Dùng ref để giữ stable callbacks - tránh re-subscribe khi parent re-render
  const onMessageSentRef = useRef(onMessageSent);
  const onTypingEventRef = useRef(onTypingEvent);
  const onPresenceEventRef = useRef(onPresenceEvent);
  const onMarkReadRef = useRef(onMarkRead);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { onMessageSentRef.current = onMessageSent; }, [onMessageSent]);
  useEffect(() => { onTypingEventRef.current = onTypingEvent; }, [onTypingEvent]);
  useEffect(() => { onPresenceEventRef.current = onPresenceEvent; }, [onPresenceEvent]);
  useEffect(() => { onMarkReadRef.current = onMarkRead; }, [onMarkRead]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const isGroup = conversation?.type === 'GROUP';
  // [FIX] DIRECT: dung otherUserName (ten nguoi kia tu backend); GROUP: dung name/title
  const title = isGroup
    ? (conversation?.name || conversation?.title || 'Nhom chat')
    : (conversation?.otherUserName || conversation?.title || conversation?.name || 'Cuoc tro chuyen');

  // [FIX ORDER] Helper: sort messages array by createdAt asc
  // Dùng ở mọi nơi setMessages để đảm bảo thứ tự nhất quán giữa sender/receiver
  const sortByTime = (arr) =>
    [...arr].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // [DEBOUNCED ACK DELIVERED (1.5s)]
  const triggerDebouncedDelivered = useCallback((convId, seq) => {
    if (!seq || seq <= 0) return;
    pendingDeliveredSeqRef.current = Math.max(pendingDeliveredSeqRef.current, seq);
    if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current);
    deliveredTimerRef.current = setTimeout(() => {
      const target = pendingDeliveredSeqRef.current;
      if (target > 0) {
        wsSendDelivered(convId, target);
        conversationApi.markDelivered(convId, target).catch(() => {});
      }
    }, 1500);
  }, [wsSendDelivered]);

  // [DEBOUNCED ACK READ (0.8s)]
  const triggerDebouncedRead = useCallback((convId, seq, msgId) => {
    if (!seq && !msgId) return;
    if (seq) pendingReadSeqRef.current = Math.max(pendingReadSeqRef.current, seq);
    if (readTimerRef.current) clearTimeout(readTimerRef.current);
    readTimerRef.current = setTimeout(() => {
      const targetSeq = pendingReadSeqRef.current;
      wsSendRead(convId, msgId, targetSeq > 0 ? targetSeq : null);
      if (targetSeq > 0) {
        conversationApi.markReadSeq(convId, targetSeq, msgId).catch(() => {});
      } else if (msgId) {
        conversationApi.markRead(convId, msgId).catch(() => {});
      }
      if (onMarkReadRef.current) onMarkReadRef.current(convId);
    }, 800);
  }, [wsSendRead]);

  // Load initial history and receipts
  const loadHistory = useCallback(async () => {
    if (!conversation?.id) return;
    setLoading(true);
    try {
      const [historyData, receiptsData] = await Promise.all([
        messageApi.getHistory(conversation.id),
        conversationApi.getReceipts(conversation.id).catch(() => []),
      ]);

      const rawList = Array.isArray(historyData) ? historyData : (historyData.content || []);

      // Lấy maxDeliveredSeq và maxReadSeq của người khác để gán tick cho tin của mình
      const currentUserId = currentUserRef.current?.id;
      const otherReceipts = Array.isArray(receiptsData)
        ? receiptsData.filter((r) => r.userId !== currentUserId)
        : [];
      const maxOtherDelivered = otherReceipts.reduce((max, r) => Math.max(max, r.lastDeliveredSeq || 0), 0);
      const maxOtherRead      = otherReceipts.reduce((max, r) => Math.max(max, r.lastReadSeq || 0), 0);

      const msgList = rawList.map((m) => {
        const isMine = m.sender?.id === currentUserId || m.senderId === currentUserId;
        if (isMine) {
          const s = m.seq || 0;
          let status = m.status || 'SENT';
          if (s > 0 && s <= maxOtherRead) status = 'READ';
          else if (s > 0 && s <= maxOtherDelivered) status = 'DELIVERED';
          return { ...m, status };
        }
        return m;
      });

      setMessages(sortByTime(msgList));

      if (msgList.length > 0) {
        setCursor(msgList[0].id); // oldest message id for cursor pagination
        setHasMore(msgList.length >= 30);

        // Cập nhật con trỏ seq cao nhất hiện có
        const highestSeq = msgList.reduce((max, m) => Math.max(max, m.seq || 0), 0);
        lastSeqRef.current = highestSeq;

        // Tự động gửi ACK delivered & read cho tin nhắn cuối từ người khác
        const newestOther = [...msgList].reverse().find(
          (m) => m.sender?.id !== currentUserId && m.senderId !== currentUserId
        );
        if (newestOther) {
          triggerDebouncedDelivered(conversation.id, newestOther.seq);
          triggerDebouncedRead(conversation.id, newestOther.seq, newestOther.id);
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
  }, [conversation?.id, triggerDebouncedDelivered, triggerDebouncedRead]);

  // Load older messages (cursor pagination)
  const handleLoadOlder = async () => {
    if (!cursor || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    const prevScrollHeight = messageListRef.current?.scrollHeight || 0;

    try {
      const data = await messageApi.getHistory(conversation.id, cursor);
      const olderList = Array.isArray(data) ? data : (data.content || []);
      if (olderList.length > 0) {
        // [FIX ORDER] Merge và sort toàn bộ để tránh duplicates và sai thứ tự
        setMessages((prev) => sortByTime([...olderList, ...prev]));
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
  useEffect(() => {
    if (!conversation?.id) return;

    loadHistory();

    const unsubscribe = subscribeToConversation(conversation.id, {
      onMessage: async (newMsg) => {
        // --- 1. [CLIENT GAP DETECTION] ---
        if (newMsg.seq && lastSeqRef.current > 0 && newMsg.seq > lastSeqRef.current + 1) {
          console.warn(`[GAP DETECTED] Missing messages between seq ${lastSeqRef.current} and ${newMsg.seq}. Syncing gap...`);
          try {
            const missed = await messageApi.syncGapBySeq(conversation.id, lastSeqRef.current);
            if (Array.isArray(missed) && missed.length > 0) {
              setMessages((prev) => {
                const map = new Map(prev.map((m) => [m.id, m]));
                missed.forEach((m) => map.set(m.id, m));
                map.set(newMsg.id, newMsg);
                return sortByTime(Array.from(map.values()));
              });
            }
          } catch (gapErr) {
            console.error('[GAP SYNC ERROR]', gapErr);
          }
        }
        if (newMsg.seq) {
          lastSeqRef.current = Math.max(lastSeqRef.current, newMsg.seq);
        }

        // --- 2. Cập nhật state messages ---
        setMessages((prev) => {
          const index = prev.findIndex(
            (m) => m.id === newMsg.id ||
                   (newMsg.clientMessageId && m.id === newMsg.clientMessageId)
          );
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = { ...newMsg, status: newMsg.status || updated[index].status || 'SENT' };
            return sortByTime(updated);
          }
          return sortByTime([...prev, { ...newMsg, status: newMsg.status || 'SENT' }]);
        });

        // --- 3. [DUAL ACK DEBOUNCE] ---
        if (newMsg.sender?.id !== currentUserRef.current?.id) {
          // Tin đã tới thiết bị -> trigger Debounced Delivered (1.5s)
          triggerDebouncedDelivered(conversation.id, newMsg.seq);

          // Nếu tab đang active / không ẩn -> trigger Debounced Read (0.8s)
          if (!document.hidden) {
            triggerDebouncedRead(conversation.id, newMsg.seq, newMsg.id);
          }
        }

        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);

        if (onMessageSentRef.current) onMessageSentRef.current(newMsg);
      },

      // [REALTIME DELIVERED RECEIPT - 2 TICK XÁM]
      onDelivered: (receipt) => {
        if (receipt.userId !== currentUserRef.current?.id) {
          setMessages((prev) =>
            prev.map((msg) => {
              const isMine = msg.sender?.id === currentUserRef.current?.id || msg.senderId === currentUserRef.current?.id;
              if (isMine && msg.status !== 'READ') {
                if (receipt.seq && msg.seq && msg.seq <= receipt.seq) {
                  return { ...msg, status: 'DELIVERED' };
                }
              }
              return msg;
            })
          );
        }
      },

      // [REALTIME READ RECEIPT - 2 TICK XANH]
      onRead: (receipt) => {
        if (receipt.userId !== currentUserRef.current?.id) {
          setMessages((prev) =>
            prev.map((msg) => {
              const isMine = msg.sender?.id === currentUserRef.current?.id || msg.senderId === currentUserRef.current?.id;
              if (isMine) {
                const matchesSeq = receipt.seq && msg.seq && msg.seq <= receipt.seq;
                const matchesId  = receipt.messageId && msg.id && msg.id <= receipt.messageId;
                if (matchesSeq || matchesId) {
                  return { ...msg, status: 'READ' };
                }
              }
              return msg;
            })
          );
        }
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
      if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current);
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
    };
  }, [conversation?.id, loadHistory, subscribeToConversation, triggerDebouncedDelivered, triggerDebouncedRead]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && isInitialScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isInitialScrollRef.current = false;
    }
  }, [loading, messages]);

  // Scroll to original message when clicking reply quote
  const handleScrollToMessage = useCallback((msgId) => {
    if (!msgId) return;
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('message-highlight');
      setTimeout(() => el.classList.remove('message-highlight'), 1600);
    }
  }, []);

  // Jump to message when triggered from search panel
  useEffect(() => {
    if (jumpMessageId) {
      handleScrollToMessage(jumpMessageId);
    }
  }, [jumpMessageId, handleScrollToMessage]);

  // Set message to reply to
  const handleReply = useCallback((msg) => {
    if (!msg) return;
    let contentPreview = msg.content || '';
    if (msg.type === 'IMAGE') contentPreview = '[Hình ảnh]';
    else if (msg.type === 'FILE') contentPreview = `[Tệp tin] ${msg.fileName || ''}`;
    else if (contentPreview.length > 80) contentPreview = contentPreview.substring(0, 80) + '…';

    setReplyingTo({
      id: msg.id,
      senderUsername: msg.sender?.displayName || msg.sender?.username || msg.senderName || 'Người dùng',
      contentPreview,
    });
  }, []);

  // Send message handler (WS first, fallback to REST)
  const handleSendMessage = async (inputPayload) => {
    const isObj = typeof inputPayload === 'object' && inputPayload !== null;
    const content = isObj ? inputPayload.content : inputPayload;
    const type = isObj ? (inputPayload.type || 'TEXT') : 'TEXT';
    const replyToId = isObj ? inputPayload.replyToId : null;
    const mediaUrl = isObj ? inputPayload.mediaUrl : null;
    const mediaType = isObj ? inputPayload.mediaType : null;
    const fileName = isObj ? inputPayload.fileName : null;
    const fileSize = isObj ? inputPayload.fileSize : null;
    const thumbUrl = isObj ? inputPayload.thumbUrl : null;

    // [FIX] Thêm random suffix để tránh collision khi gửi nhiều tin cùng ms
    const tempId = (isObj && inputPayload.clientMessageId)
      ? inputPayload.clientMessageId
      : `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Construct reply preview for optimistic message
    let replyPreview = null;
    if (replyToId && replyingTo && replyingTo.id === replyToId) {
      replyPreview = {
        id: replyingTo.id,
        senderUsername: replyingTo.senderUsername,
        contentPreview: replyingTo.contentPreview,
      };
    } else if (replyToId) {
      const found = messages.find((m) => m.id === replyToId);
      if (found) {
        replyPreview = {
          id: found.id,
          senderUsername: found.sender?.displayName || found.sender?.username || found.senderName || 'Người dùng',
          contentPreview:
            found.type === 'IMAGE'
              ? '[Hình ảnh]'
              : found.type === 'FILE'
              ? `[Tệp tin] ${found.fileName || ''}`
              : found.content,
        };
      }
    }

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
      type,
      status: 'SENDING',
      createdAt: new Date().toISOString(),
      replyTo: replyPreview,
      mediaUrl,
      mediaType,
      fileName,
      fileSize,
      thumbUrl,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    const fullPayload = {
      conversationId: conversation.id,
      content,
      type,
      replyToId,
      mediaUrl,
      mediaType,
      fileName,
      fileSize,
      thumbUrl,
      clientMessageId: tempId,
    };

    try {
      // Send via WebSocket STOMP
      wsSendMessage(fullPayload);
    } catch (wsErr) {
      console.warn('WS send failed, using REST fallback:', wsErr);
      try {
        const saved = await messageApi.sendMessage(fullPayload);
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
        prev.map((m) =>
          m.id === msgId
            ? { ...m, deleted: true, isDeleted: true, content: null, mediaUrl: null }
            : m
        )
      );
    } catch (err) {
      alert('Không thể thu hồi tin nhắn: ' + (err.message || 'Đã có lỗi xảy ra'));
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
          <button
            type="button"
            className={`header-tool-btn detail-toggle-btn ${isDetailOpen ? 'active' : ''}`}
            onClick={onToggleDetailPanel}
            title={isDetailOpen ? 'Đóng thông tin hội thoại' : 'Mở thông tin hội thoại'}
          >
            <Info size={20} />
          </button>
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
          // State luôn được sort theo createdAt (xem sortByTime ở trên), render trực tiếp
          messages.map((msg) => {
            const myId = currentUser?.id != null ? Number(currentUser.id) : null;
            const senderId = msg.sender?.id != null ? Number(msg.sender.id) : (msg.senderId != null ? Number(msg.senderId) : null);
            const isOwnMsg = myId != null && senderId != null && myId === senderId;

            return (
              <ErrorBoundary key={msg.id}>
                <MessageBubble
                  message={msg}
                  isOwn={isOwnMsg}
                  showSender={isGroup}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onReply={handleReply}
                  onScrollToMessage={handleScrollToMessage}
                />
              </ErrorBoundary>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
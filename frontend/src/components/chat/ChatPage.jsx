import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import CreateChatModal from './CreateChatModal';
import GroupMembersModal from './GroupMembersModal';
import GroupDetailPanel from './GroupDetailPanel';
import { conversationApi } from '../../api/conversationApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { MessageSquareDashed } from 'lucide-react';
import ErrorBoundary from '../common/ErrorBoundary';

export default function ChatPage({ activeConv, setActiveConv }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [jumpMessageId, setJumpMessageId] = useState(null);
  // { [convId]: string[] } — danh sách tên người đang typing trong mỗi conversation
  const [typingStates, setTypingStates] = useState({});
  const { subscribeToConversation, subscribeToUserEvents } = useWebSocket();
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();

  // Ref để dùng trong WS callbacks (tránh stale closure)
  const conversationsRef = useRef([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Dùng ref để tránh stale closures trong subscriptions
  const activeConvRef = useRef(activeConv);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  // Xử lý khi user rời nhóm hoặc bị kick → xoá khỏi danh sách và clear active
  const handleLeaveGroup = useCallback((conversationId) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    setActiveConv((prev) => (prev?.id === conversationId ? null : prev));
    setIsDetailPanelOpen(false);
  }, [setActiveConv]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await conversationApi.getMyConversations();
      const list = Array.isArray(data) ? data : [];

      if (!activeConvRef.current && list.length > 0 && window.innerWidth > 768) {
        const first = list[0];
        setActiveConv(first);
        setConversations(list.map((c, i) => (i === 0 ? { ...c, unreadCount: 0 } : c)));
      } else if (activeConvRef.current) {
        // Đảm bảo active conversation trong sidebar luôn hiển thị unreadCount = 0
        setConversations(
          list.map((c) => (c.id === activeConvRef.current.id ? { ...c, unreadCount: 0 } : c))
        );
      } else {
        setConversations(list);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [setActiveConv]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // [FIX] Subscribe tới tất cả conversations NGOẠI TRỪ activeConv
  // (vì ChatWindow sẽ tự subscribe activeConv với full handlers bao gồm typing/presence)
  // Các conversation không active chỉ cần onMessage để cập nhật danh sách + unread count.
  useEffect(() => {
    if (conversations.length === 0) return;

    const activeId = activeConvRef.current?.id;

    const unsubscribers = conversations
      .filter((conv) => conv.id !== activeId)
      .map((conv) =>
        subscribeToConversation(conv.id, {
          onMessage: (msg) => {
            handleMessageUpdated(msg);
          },
          onTyping: (typingEvent) => {
            handleTypingEvent(typingEvent);
          },
          onPresence: (presence) => {
            // Cập nhật isOnline trong conversation list (cho sidebar)
            setConversations((prev) =>
              prev.map((c) => {
                if (c.type === 'GROUP') return c;
                if (c.otherUserId === presence.userId) {
                  return { ...c, isOnline: presence.online, lastSeenAt: presence.lastSeenAt };
                }
                return c;
              })
            );
          },
        })
      );

    return () => {
      unsubscribers.forEach((unsub) => unsub && unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, activeConv?.id]);

  // Lắng nghe sự kiện cá nhân (được thêm vào nhóm mới, cuộc trò chuyện mới hoặc bị kick)
  useEffect(() => {
    if (!subscribeToUserEvents) return;

    const unsubscribe = subscribeToUserEvents((event) => {
      console.log('[ChatPage] Received user personal event:', event);

      if (event?.type === 'JOINED' && event.conversation) {
        const newConv = event.conversation;
        setConversations((prev) => {
          if (prev.some((c) => c.id === newConv.id)) return prev;
          return [newConv, ...prev];
        });

        // Bắn thông báo desktop / browser
        const groupName = newConv.name || newConv.title || 'Nhóm mới';
        showNotification(
          {
            content: `Bạn đã được thêm vào cuộc trò chuyện "${groupName}"`,
            sender: { displayName: 'Hệ thống' },
            createdAt: new Date().toISOString(),
          },
          newConv,
          () => {
            setActiveConv(newConv);
          }
        );
      } else if (event?.type === 'LEFT' && event.conversationId) {
        handleLeaveGroup(event.conversationId);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [subscribeToUserEvents, handleLeaveGroup, showNotification, setActiveConv]);

  // When a message is sent or received, update the conversation item in list
  const handleMessageUpdated = useCallback((msg) => {
    // [NOTIFICATION] Gọi NGOÀI setConversations — side effect không được phép trong updater function
    // React có thể gọi updater nhiều lần (StrictMode) hoặc bỏ qua side effects bên trong
    const currentConv = conversationsRef.current.find((c) => c.id === msg.conversationId);
    const isFromOther = msg.sender?.id !== currentUser?.id;
    const isNotActiveConv = activeConvRef.current?.id !== msg.conversationId;

    if (currentConv && isFromOther && (document.hidden || isNotActiveConv)) {
      showNotification(msg, currentConv, () => {
        setActiveConv({ ...currentConv });
      });
    }

    // Cập nhật danh sách conversation (pure — không có side effect)
    setConversations((prev) => {
      const index = prev.findIndex((c) => c.id === msg.conversationId);
      if (index === -1) {
        loadConversations();
        return prev;
      }

      const conv = prev[index];
      const isDirect = conv.type === 'DIRECT';
      const senderAvatar = msg.sender?.avatarUrl;
      const newAvatarUrl = (isDirect && msg.sender?.id === conv.otherUserId && senderAvatar)
        ? senderAvatar
        : conv.avatarUrl;

      // Cập nhật luôn activeConv nếu đang mở cuộc trò chuyện này
      if (activeConvRef.current?.id === conv.id && isDirect && senderAvatar) {
        setActiveConv((prevActive) => (prevActive ? { ...prevActive, avatarUrl: senderAvatar } : prevActive));
      }

      const updatedConv = {
        ...conv,
        avatarUrl: newAvatarUrl,
        lastMessage: {
          id: msg.id,
          content: msg.content,
          type: msg.type,
          fileName: msg.fileName,
          senderId: msg.sender?.id,
          senderName: msg.sender?.displayName || msg.sender?.username,
          senderUsername: msg.sender?.username,
          createdAt: msg.createdAt,
          deleted: msg.isDeleted,
        },
        unreadCount: activeConvRef.current?.id === conv.id ? 0 : (conv.unreadCount || 0) + 1,
      };

      const copy = [...prev];
      copy.splice(index, 1);
      return [updatedConv, ...copy];
    });
  }, [loadConversations, currentUser?.id, showNotification, setActiveConv]);

  // [FIX] Handler cho typing event từ ChatWindow (active conversation)
  const handleTypingEvent = useCallback((typingEvent) => {
    const convId = typingEvent.conversationId;
    const name = typingEvent.displayName || typingEvent.username || 'Ai đó';

    setTypingStates((prev) => {
      const current = prev[convId] || [];
      if (typingEvent.isTyping) {
        if (current.includes(name)) return prev;
        return { ...prev, [convId]: [...current, name] };
      } else {
        return { ...prev, [convId]: current.filter((n) => n !== name) };
      }
    });

    // Tự động xoá sau 4 giây
    if (typingEvent.isTyping) {
      setTimeout(() => {
        setTypingStates((prev) => {
          const current = prev[convId] || [];
          return { ...prev, [convId]: current.filter((n) => n !== name) };
        });
      }, 4000);
    }
  }, []);

  // [FIX] Handler cho presence event từ ChatWindow (active conversation)
  const handlePresenceEvent = useCallback((presence) => {
    // Cập nhật isOnline trong danh sách conversation (sidebar)
    setConversations((prev) =>
      prev.map((c) => {
        if (c.type === 'GROUP') return c;
        if (c.otherUserId === presence.userId) {
          return { ...c, isOnline: presence.online, lastSeenAt: presence.lastSeenAt };
        }
        return c;
      })
    );
    // Cập nhật activeConv để header ChatWindow hiển thị trạng thái mới
    setActiveConv((prev) => {
      if (!prev || prev.type === 'GROUP') return prev;
      if (prev.otherUserId === presence.userId) {
        return { ...prev, isOnline: presence.online, lastSeenAt: presence.lastSeenAt };
      }
      return prev;
    });
  }, [setActiveConv]);

  const handleSelectConversation = (conv) => {
    setActiveConv(conv);
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
    );
    // Xoá typing state khi chuyển conversation
    setTypingStates((prev) => ({ ...prev, [conv.id]: [] }));
  };

  const handleConversationRead = useCallback((convId) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleConversationCreated = (conv) => {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === conv.id);
      if (existing) return prev;
      return [conv, ...prev];
    });
    setActiveConv(conv);
  };

  const handleJumpToMessage = (msgId) => {
    setJumpMessageId(msgId);
    setTimeout(() => setJumpMessageId(null), 300);
  };

  // Mở hoặc tạo cuộc trò chuyện trực tiếp 1-1 với một thành viên
  const handleOpenDirectChat = useCallback(async (targetUserId) => {
    if (!targetUserId || targetUserId === currentUser?.id) return;
    try {
      const conv = await conversationApi.getOrCreateDirect(targetUserId);
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === conv.id);
        if (existing) return prev;
        return [conv, ...prev];
      });
      handleSelectConversation(conv);
      setIsMembersModalOpen(false);
    } catch (err) {
      console.error('Failed to open direct chat:', err);
    }
  }, [currentUser?.id]);

  return (
    <div className="chat-layout-page">
      {/* Left panel: Conversation List */}
      <div className={`chat-list-column ${activeConv ? 'hide-on-mobile' : ''}`}>
        <ConversationList
          conversations={conversations}
          activeConversation={activeConv}
          onSelectConversation={handleSelectConversation}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
          onRefresh={loadConversations}
          loading={loading}
          typingStates={typingStates}
        />
      </div>

      {/* Middle panel: Chat Window */}
      <div className={`chat-window-column ${!activeConv ? 'hide-on-mobile' : ''}`}>
        {activeConv ? (
          <ErrorBoundary>
            <ChatWindow
              conversation={activeConv}
              onBack={() => setActiveConv(null)}
              onOpenMembersModal={() => setIsMembersModalOpen(true)}
              typingUsers={typingStates[activeConv.id] || []}
              onMessageSent={handleMessageUpdated}
              onTypingEvent={handleTypingEvent}
              onPresenceEvent={handlePresenceEvent}
              onToggleDetailPanel={() => setIsDetailPanelOpen((prev) => !prev)}
              isDetailOpen={isDetailPanelOpen}
              jumpMessageId={jumpMessageId}
              onMarkRead={handleConversationRead}
            />
          </ErrorBoundary>
        ) : (
          <div className="no-chat-selected-view">
            <div className="empty-bubble-glow">
              <MessageSquareDashed size={56} />
            </div>
            <h2>Chọn một cuộc trò chuyện</h2>
            <p>Chọn từ danh sách bên trái hoặc tạo đoạn chat mới để bắt đầu gửi tin nhắn realtime!</p>
          </div>
        )}
      </div>

      {/* Right panel: Messenger style Group/Conversation Details */}
      {activeConv && isDetailPanelOpen && (
        <div className="chat-detail-column">
          <ErrorBoundary>
            <GroupDetailPanel
              conversation={activeConv}
              onClose={() => setIsDetailPanelOpen(false)}
              onLeaveGroup={handleLeaveGroup}
              onJumpToMessage={handleJumpToMessage}
              onOpenDirectChat={handleOpenDirectChat}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* Modals */}
      <CreateChatModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onConversationCreated={handleConversationCreated}
      />

      {activeConv?.type === 'GROUP' && (
        <GroupMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          conversationId={activeConv.id}
          conversationTitle={activeConv.title || activeConv.name}
          onLeaveGroup={handleLeaveGroup}
          onOpenDirectChat={handleOpenDirectChat}
        />
      )}
    </div>
  );
}
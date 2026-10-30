import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import CreateChatModal from './CreateChatModal';
import GroupMembersModal from './GroupMembersModal';
import { conversationApi } from '../../api/conversationApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { MessageSquareDashed } from 'lucide-react';
import ErrorBoundary from '../common/ErrorBoundary';

export default function ChatPage({ activeConv, setActiveConv }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  // { [convId]: string[] } — danh sách tên người đang typing trong mỗi conversation
  const [typingStates, setTypingStates] = useState({});
  const { subscribeToConversation } = useWebSocket();

  // Dùng ref để tránh stale closures trong subscriptions
  const activeConvRef = useRef(activeConv);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await conversationApi.getMyConversations();
      const list = Array.isArray(data) ? data : [];
      setConversations(list);

      if (!activeConvRef.current && list.length > 0 && window.innerWidth > 768) {
        setActiveConv(list[0]);
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

  // When a message is sent or received, update the conversation item in list
  const handleMessageUpdated = useCallback((msg) => {
    setConversations((prev) => {
      const index = prev.findIndex((c) => c.id === msg.conversationId);
      if (index === -1) {
        loadConversations();
        return prev;
      }

      const conv = prev[index];
      const updatedConv = {
        ...conv,
        lastMessage: {
          id: msg.id,
          content: msg.content,
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
  }, [loadConversations]);

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

  const handleConversationCreated = (conv) => {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === conv.id);
      if (existing) return prev;
      return [conv, ...prev];
    });
    setActiveConv(conv);
  };

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

      {/* Right panel: Chat Window */}
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
          conversationTitle={activeConv.title}
        />
      )}
    </div>
  );
}
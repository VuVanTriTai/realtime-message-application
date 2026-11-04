import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { currentUser, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const stompClientRef = useRef(null);
  // Map<convId, subConfig>
  // subConfig = { convId, handlersRef: { current: {onMessage, onTyping, onRead, onPresence} }, subscriptions: [] }
  const activeSubsRef = useRef(new Map());
  const heartbeatTimerRef = useRef(null);

  // Initialize and connect STOMP client
  useEffect(() => {
    if (!currentUser || !token) {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
        stompClientRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: {
        token: token,
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 4000,
      heartbeatIncoming: 25000,
      heartbeatOutgoing: 25000,

      // Trước mỗi lần (re)connect, cập nhật token mới nhất từ localStorage
      beforeConnect: async () => {
        const freshToken = localStorage.getItem('accessToken');
        if (freshToken) {
          client.connectHeaders = {
            token: freshToken,
            Authorization: `Bearer ${freshToken}`,
          };
        }
      },

      onConnect: () => {
        console.log('[WS] Connected! Re-subscribing', activeSubsRef.current.size, 'convs');
        setIsConnected(true);

        // Start 25s periodic heartbeat to /app/heartbeat
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = setInterval(() => {
          if (client.connected) {
            client.publish({ destination: '/app/heartbeat', body: JSON.stringify({}) });
          }
        }, 25000);

        // Re-subscribe all active subscriptions after reconnect
        activeSubsRef.current.forEach((subConfig) => {
          subConfig.subscriptions.forEach((s) => { try { s.unsubscribe(); } catch (_) {} });
          subConfig.subscriptions = [];
          doSubscribe(client, subConfig);
        });
      },

      onDisconnect: () => {
        console.log('[WS] Disconnected');
        setIsConnected(false);
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      },

      onStompError: (frame) => {
        console.error('STOMP error:', frame.headers['message'], frame.body);
      },
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      activeSubsRef.current.forEach((subConfig) => {
        subConfig.subscriptions.forEach((s) => { try { s.unsubscribe(); } catch (_) {} });
      });
      activeSubsRef.current.clear();
      client.deactivate();
      stompClientRef.current = null;
      setIsConnected(false);
    };
  }, [currentUser?.id, token]);

  /**
   * Tạo STOMP subscriptions thực sự cho 1 subConfig.
   * Callbacks luôn đọc handlers từ subConfig.handlersRef.current (live ref)
   * → tự động gọi đúng handler hiện tại dù handler thay đổi sau.
   */
  const doSubscribe = (client, subConfig) => {
    if (!client || !client.connected) return;

    console.log(`[WS] doSubscribe conv=${subConfig.convId}`);

    const subMsg = client.subscribe(`/topic/conversation.${subConfig.convId}`, (msg) => {
      try {
        const payload = JSON.parse(msg.body);
        console.log(`[WS] NEW_MESSAGE conv=${subConfig.convId}`, payload?.id, 'handler?', !!subConfig.handlersRef.current.onMessage);
        subConfig.handlersRef.current.onMessage?.(payload);
      } catch (err) {
        console.error('[WS] Error parsing message', err);
      }
    });

    const subTyping = client.subscribe(`/topic/conversation.${subConfig.convId}.typing`, (msg) => {
      try {
        const payload = JSON.parse(msg.body);
        subConfig.handlersRef.current.onTyping?.(payload);
      } catch (err) {
        console.error('[WS] Error parsing typing', err);
      }
    });

    const subRead = client.subscribe(`/topic/conversation.${subConfig.convId}.read`, (msg) => {
      try {
        const payload = JSON.parse(msg.body);
        subConfig.handlersRef.current.onRead?.(payload);
      } catch (err) {
        console.error('[WS] Error parsing read', err);
      }
    });

    const subPresence = client.subscribe(`/topic/conversation.${subConfig.convId}.presence`, (msg) => {
      try {
        const payload = JSON.parse(msg.body);
        subConfig.handlersRef.current.onPresence?.(payload);
      } catch (err) {
        console.error('[WS] Error parsing presence', err);
      }
    });

    subConfig.subscriptions = [subMsg, subTyping, subRead, subPresence];
  };

  /**
   * Subscribe to a conversation's events.
   *
   * KEY DESIGN:
   * - handlersRef là một object ref CHUNG cho cả conv đó.
   * - Nhiều caller (ChatPage, ChatWindow) cùng "đăng ký" handlers.
   * - Mỗi caller trả về một cleanup fn chỉ xóa handlers CỦA NÓ (không unsubscribe STOMP).
   * - Khi TẤT CẢ callers đã cleanup → STOMP unsubscribe thực sự.
   * - STOMP chỉ subscribe MỘT LẦN mỗi conv, callbacks luôn đọc handlersRef.current.
   */
  const subscribeToConversation = useCallback((convId, handlers = {}) => {
    if (!convId) return () => {};

    let subConfig = activeSubsRef.current.get(convId);

    if (!subConfig) {
      // Tạo mới subConfig với handlersRef
      subConfig = {
        convId,
        handlersRef: { current: {} },
        subscriptions: [],
        callerCount: 0,
      };
      activeSubsRef.current.set(convId, subConfig);
      console.log(`[WS] subscribeToConversation NEW conv=${convId}`);

      if (stompClientRef.current?.connected) {
        doSubscribe(stompClientRef.current, subConfig);
      }
    } else {
      console.log(`[WS] subscribeToConversation EXISTING conv=${convId} callers=${subConfig.callerCount}`);
    }

    subConfig.callerCount++;

    // Merge handlers vào handlersRef (handlers mới ghi đè handlers cũ nếu có)
    if (handlers.onMessage)  subConfig.handlersRef.current.onMessage  = handlers.onMessage;
    if (handlers.onTyping)   subConfig.handlersRef.current.onTyping   = handlers.onTyping;
    if (handlers.onRead)     subConfig.handlersRef.current.onRead     = handlers.onRead;
    if (handlers.onPresence) subConfig.handlersRef.current.onPresence = handlers.onPresence;

    return () => {
      const current = activeSubsRef.current.get(convId);
      if (!current || current !== subConfig) return; // already gone

      subConfig.callerCount--;
      console.log(`[WS] cleanup conv=${convId} callerCount now=${subConfig.callerCount}`);

      // Xóa các handlers do caller này đăng ký
      if (handlers.onMessage  && subConfig.handlersRef.current.onMessage  === handlers.onMessage)
        delete subConfig.handlersRef.current.onMessage;
      if (handlers.onTyping   && subConfig.handlersRef.current.onTyping   === handlers.onTyping)
        delete subConfig.handlersRef.current.onTyping;
      if (handlers.onRead     && subConfig.handlersRef.current.onRead     === handlers.onRead)
        delete subConfig.handlersRef.current.onRead;
      if (handlers.onPresence && subConfig.handlersRef.current.onPresence === handlers.onPresence)
        delete subConfig.handlersRef.current.onPresence;

      // Dùng timeout nhỏ để tránh React StrictMode double-invoke destroy STOMP ngay lập tức
      // Nếu trong 50ms có caller mới (re-subscribe), callerCount > 0, STOMP không bị unsubscribe
      setTimeout(() => {
        if (subConfig.callerCount <= 0 && activeSubsRef.current.get(convId) === subConfig) {
          console.log(`[WS] no more callers, unsubscribing STOMP conv=${convId}`);
          subConfig.subscriptions.forEach((s) => { try { s.unsubscribe(); } catch (_) {} });
          subConfig.subscriptions = [];
          activeSubsRef.current.delete(convId);
        }
      }, 50);
    };
  }, []);

  /**
   * Send a new chat message via WebSocket /app/chat.send
   * Supports both object payload and positional arguments
   */
  const sendMessage = useCallback((arg1, arg2, arg3 = 'TEXT', arg4 = null) => {
    if (!stompClientRef.current?.connected) {
      throw new Error('Chưa kết nối đến máy chủ WebSocket.');
    }

    const payload = typeof arg1 === 'object' && arg1 !== null
      ? {
          conversationId: arg1.conversationId,
          content: arg1.content,
          type: arg1.type || 'TEXT',
          replyToId: arg1.replyToId || null,
          mediaUrl: arg1.mediaUrl || null,
          mediaType: arg1.mediaType || null,
          fileName: arg1.fileName || null,
          thumbUrl: arg1.thumbUrl || null,
          fileSize: arg1.fileSize || null,
          clientMessageId: arg1.clientMessageId || `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        }
      : {
          conversationId: arg1,
          content: arg2,
          type: arg3,
          clientMessageId: arg4 || `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        };

    stompClientRef.current.publish({
      destination: '/app/chat.send',
      body: JSON.stringify(payload),
    });

    return payload.clientMessageId;
  }, []);

  /**
   * Send typing status /app/chat.typing
   */
  const sendTyping = useCallback((conversationId, isTyping = true) => {
    if (!stompClientRef.current?.connected) return;
    stompClientRef.current.publish({
      destination: '/app/chat.typing',
      body: JSON.stringify({ conversationId, isTyping }),
    });
  }, []);

  /**
   * Send read receipt /app/chat.read
   */
  const sendRead = useCallback((conversationId, messageId) => {
    if (!stompClientRef.current?.connected || !messageId) return;
    stompClientRef.current.publish({
      destination: '/app/chat.read',
      body: JSON.stringify({ conversationId, messageId }),
    });
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        subscribeToConversation,
        sendMessage,
        sendTyping,
        sendRead,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

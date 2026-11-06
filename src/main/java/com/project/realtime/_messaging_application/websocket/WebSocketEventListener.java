package com.project.realtime._messaging_application.websocket;

import com.project.realtime._messaging_application.config.MetricsConfig;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import com.project.realtime._messaging_application.websocket.pubsub.RedisEventType;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import io.micrometer.core.instrument.Counter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

import java.time.Instant;

/**
 * Lắng nghe các sự kiện WebSocket để:
 *   1. Khi kết nối (CONNECT): cập nhật user → online trong Redis + DB + publish PRESENCE online
 *   2. Khi ngắt kết nối (DISCONNECT): cập nhật user → offline trong Redis + DB + publish PRESENCE offline
 *   3. Khi subscribe (SUBSCRIBE): validate quyền xem conversation (chống IDOR)
 */
@Component
public class WebSocketEventListener {

    private static final Logger log = LoggerFactory.getLogger(WebSocketEventListener.class);

    private final PresenceService              presenceService;
    private final UserRepository               userRepository;
    private final SimpMessagingTemplate        messagingTemplate;
    private final RedisMessagePublisher        redisPublisher;
    private final ConversationMemberRepository memberRepository;
    // Metrics — dem ket noi/ngat ket noi de biet bao nhieu session dang mo
    private final MetricsConfig.AtomicGauge    wsActiveSessionsGauge;
    private final Counter                      wsSessionsTotalCounter;
    private final Counter                      wsDisconnectsTotalCounter;

    public WebSocketEventListener(PresenceService presenceService,
                                  UserRepository userRepository,
                                  SimpMessagingTemplate messagingTemplate,
                                  RedisMessagePublisher redisPublisher,
                                  ConversationMemberRepository memberRepository,
                                  MetricsConfig.AtomicGauge wsActiveSessionsGauge,
                                  Counter wsSessionsTotalCounter,
                                  Counter wsDisconnectsTotalCounter) {
        this.presenceService          = presenceService;
        this.userRepository           = userRepository;
        this.messagingTemplate        = messagingTemplate;
        this.redisPublisher           = redisPublisher;
        this.memberRepository         = memberRepository;
        this.wsActiveSessionsGauge    = wsActiveSessionsGauge;
        this.wsSessionsTotalCounter   = wsSessionsTotalCounter;
        this.wsDisconnectsTotalCounter = wsDisconnectsTotalCounter;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Kết nối thành công
    // ─────────────────────────────────────────────────────────────────────

    @EventListener
    public void handleSessionConnected(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        User user = extractUser(accessor);
        if (user == null) return;

        Instant now = Instant.now();

        // Cập nhật Redis: đánh dấu online
        presenceService.markOnline(user.getId());

        // Cập nhật DB: last_seen_at (không cần save() - dùng update query để nhanh)
        userRepository.updateLastSeenAt(user.getId(), now);

        // [FIX] Publish PRESENCE online tới tất cả conversation của user qua Redis
        // Trước đây thiếu bước này → client khác không biết user đang online khi vào web
        PresenceEvent onlineEvent = new PresenceEvent(user.getId(), true, now);
        memberRepository
                .findConversationIdsByUserId(user.getId())
                .forEach(convId ->
                        redisPublisher.publish(convId, RedisEventType.PRESENCE, onlineEvent));

        // Metrics: tang so session dang mo
        wsActiveSessionsGauge.increment();
        wsSessionsTotalCounter.increment();

        log.info("WebSocket connected: user={} (id={})", user.getUsername(), user.getId());
    }

    // ─────────────────────────────────────────────────────────────────────
    // Ngắt kết nối
    // ─────────────────────────────────────────────────────────────────────

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        User user = extractUser(accessor);
        if (user == null) return;

        Instant now = Instant.now();

        // Xoá key Redis: chuyển sang offline ngay lập tức
        presenceService.markOffline(user.getId());

        // Cập nhật DB: last_seen_at lần cuối trước khi offline
        userRepository.updateLastSeenAt(user.getId(), now);

        // Publish PRESENCE offline tới tất cả conversation của user qua Redis
        PresenceEvent offlineEvent = new PresenceEvent(user.getId(), false, now);
        memberRepository
                .findConversationIdsByUserId(user.getId())
                .forEach(convId ->
                        redisPublisher.publish(convId, RedisEventType.PRESENCE, offlineEvent));

        // Metrics: giam so session dang mo
        wsActiveSessionsGauge.decrement();
        wsDisconnectsTotalCounter.increment();

        log.info("WebSocket disconnected: user={} (id={})", user.getUsername(), user.getId());
    }

    // ─────────────────────────────────────────────────────────────────────
    // Subscribe event (log / validate)
    // ─────────────────────────────────────────────────────────────────────

    @EventListener
    public void handleSessionSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = accessor.getDestination();
        User user = extractUser(accessor);

        if (user != null && destination != null) {
            log.debug("User {} subscribed to {}", user.getUsername(), destination);
            // TODO: validate quyền xem conversation
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helper
    // ─────────────────────────────────────────────────────────────────────

    private User extractUser(StompHeaderAccessor accessor) {
        if (accessor.getUser() == null) return null;
        Object principal = accessor.getUser();

        // Principal được set bởi WebSocketAuthInterceptor là UsernamePasswordAuthenticationToken
        // với UserDetails là User entity
        if (principal instanceof org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth) {
            Object details = auth.getPrincipal();
            if (details instanceof User user) return user;
        }
        return null;
    }

    /** Payload cho presence event (online/offline) */
    public record PresenceEvent(Long userId, boolean online, Instant lastSeenAt) {}
}
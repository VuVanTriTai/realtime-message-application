package com.project.realtime._messaging_application.websocket;

import com.project.realtime._messaging_application.common.ratelimit.WebSocketRateLimiterService;
import com.project.realtime._messaging_application.modules.Message.dto.SendMessageRequest;
import com.project.realtime._messaging_application.modules.Message.service.MessageService;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.websocket.pubsub.RedisEventType;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.concurrent.Executor;

/**
 * WebSocket/STOMP handler cho tin nhan chat.
 *
 * Chien luoc thread:
 *   Viec "nhe" (< 1ms): chay tren STOMP inbound thread (stomp-inbound-*)
 *     - extractUser()           → doc tu session header, O(1)
 *     - wsRateLimiter.allow()   → 1 Redis INCR ~ 0.5ms
 *     - typing / read_receipt   → 1 Redis PUBLISH ~ 1ms
 *
 *   Viec "nang" (10-20ms): submit sang taskExecutor (chat-worker-*)
 *     - messageService.sendMessage() → INSERT PostgreSQL + INSERT outbox
 *
 * Tai sao phan tach?
 *   STOMP inbound thread pool: core=8, max=64.
 *   Neu giu thread 20ms cho DB write → 64 threads / 20ms = ~3200 msg/s max.
 *   Neu dai sang chat-worker-*: STOMP thread free ngay → xu ly hang nghin
 *   frame khac (typing, read, heartbeat) ma khong bi chon.
 *
 * Anh huong UX realtime:
 *   - KHONG anh huong latency nhin thay: delivery van qua OutboxPoller (async tu dau).
 *   - Cai thien throughput: server xu ly duoc nhieu hon vi STOMP thread khong bi chiem.
 *   - Error feedback van hoat dong: xu ly trong CompletableFuture.exceptionally().
 */
@Controller
public class ChatWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    private final MessageService              messageService;
    private final SimpMessagingTemplate       messagingTemplate;
    private final PresenceService             presenceService;
    private final RedisMessagePublisher       redisPublisher;
    private final WebSocketRateLimiterService wsRateLimiter;
    private final Executor                    taskExecutor;

    public ChatWebSocketHandler(MessageService messageService,
                                SimpMessagingTemplate messagingTemplate,
                                PresenceService presenceService,
                                RedisMessagePublisher redisPublisher,
                                WebSocketRateLimiterService wsRateLimiter,
                                @Qualifier("taskExecutor") Executor taskExecutor) {
        this.messageService    = messageService;
        this.messagingTemplate = messagingTemplate;
        this.presenceService   = presenceService;
        this.redisPublisher    = redisPublisher;
        this.wsRateLimiter     = wsRateLimiter;
        this.taskExecutor      = taskExecutor;
    }

    // ================================================================
    // Helper: lay User tu STOMP session header
    // ================================================================

    private User extractUser(SimpMessageHeaderAccessor accessor) {
        Principal principal = accessor.getUser();
        if (principal instanceof UsernamePasswordAuthenticationToken token) {
            Object detail = token.getPrincipal();
            if (detail instanceof User user) return user;
        }
        return null;
    }

    // ================================================================
    // Gui tin nhan — STOMP thread chi lam viec nhe, DB chay o chat-worker-*
    // ================================================================

    /**
     * Client gui den: /app/chat.send
     *
     * Flow chi tiet:
     *  [STOMP inbound thread] (<= 2ms tong cong)
     *    1. extractUser()             → O(1)
     *    2. wsRateLimiter.allow()     → 1 Redis INCR ~ 0.5ms
     *    3. taskExecutor.execute()    → submit task, RETURN NGAY
     *
     *  [chat-worker-* thread] (10-20ms, khong block STOMP)
     *    4. messageService.sendMessage() → INSERT message + INSERT outbox (1 transaction)
     *    5a. Thanh cong → log debug
     *    5b. That bai   → gui ErrorPayload ve /queue/errors cua user
     *
     *  [outbox-poller-* thread, sau <= 500ms]
     *    6. OutboxPoller doc PENDING → publish Redis → subscriber forward toi clients
     */
    @MessageMapping("/chat.send")
    public void sendMessage(
            @Payload @Valid SendMessageRequest req,
            SimpMessageHeaderAccessor accessor) {

        // --- [STOMP thread] Xac thuc ---
        User user = extractUser(accessor);
        if (user == null) {
            log.warn("sendMessage: unauthenticated request, ignored");
            return;
        }

        // --- [STOMP thread] Rate limit (<= 1ms) ---
        if (!wsRateLimiter.allowMessage(user.getId())) {
            messagingTemplate.convertAndSendToUser(
                    user.getUsername(),
                    "/queue/errors",
                    new ErrorPayload("RATE_LIMITED",
                            "Ban gui qua nhieu tin nhan. Vui long thu lai sau " +
                            WebSocketRateLimiterService.MSG_WINDOW_S + " giay.")
            );
            return;
        }

        // --- [STOMP thread] Snap user info truoc khi switch thread ---
        // QUAN TRONG: khong truyen 'accessor' sang thread khac — SimpMessageHeaderAccessor
        // khong thread-safe sau khi STOMP frame xu ly xong (co the bi recycle).
        final Long   userId   = user.getId();
        final String username = user.getUsername();

        // --- Submit viec nang sang chat-worker-* (khong block STOMP thread) ---
        taskExecutor.execute(() -> {
            try {
                // Luu Message + MessageOutbox trong 1 transaction
                messageService.sendMessage(userId, req);

                log.debug("[chat-worker] Message saved: conversation={} sender={}",
                        req.conversationId(), username);

            } catch (Exception e) {
                // DB that bai → bao nguoi gui qua private queue
                log.error("[chat-worker] sendMessage failed: user={} error={}",
                        username, e.getMessage(), e);

                messagingTemplate.convertAndSendToUser(
                        username,
                        "/queue/errors",
                        new ErrorPayload("SEND_FAILED", e.getMessage())
                );
            }
        });

        // STOMP inbound thread duoc giai phong NGAY TAI DAY
        // Khong can cho DB — co the xu ly frame tiep theo cua 9.999 client khac
    }

    // ================================================================
    // Typing indicator — nhe, giu tren STOMP thread
    // ================================================================

    /**
     * Client gui den: /app/chat.typing
     * Hoan toan nhe (Redis SET + Redis PUBLISH), khong can chuyen thread.
     */
    @MessageMapping("/chat.typing")
    public void handleTyping(
            @Payload TypingPayload payload,
            SimpMessageHeaderAccessor accessor) {

        User user = extractUser(accessor);
        if (user == null) return;

        // Rate limit typing — im lang drop, khong anh huong UX
        if (!wsRateLimiter.allowTyping(user.getId())) {
            return;
        }

        presenceService.setTyping(payload.conversationId(), user.getId());

        TypingEvent event = new TypingEvent(
                payload.conversationId(),
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                payload.isTyping()
        );

        redisPublisher.publish(payload.conversationId(), RedisEventType.TYPING, event);
    }

    // ================================================================
    // Danh dau da doc — nhe, giu tren STOMP thread
    // ================================================================

    /**
     * Client gui den: /app/chat.read
     */
    @MessageMapping("/chat.read")
    public void markRead(
            @Payload ReadPayload payload,
            SimpMessageHeaderAccessor accessor) {

        User user = extractUser(accessor);
        if (user == null) return;

        try {
            ReadReceipt receipt = new ReadReceipt(
                    payload.conversationId(), user.getId(), payload.messageId());

            // Publish read receipt qua Redis
            redisPublisher.publish(payload.conversationId(), RedisEventType.READ_RECEIPT, receipt);

        } catch (Exception e) {
            log.warn("markRead error user={}: {}", user.getUsername(), e.getMessage());
        }
    }

    // ================================================================
    // Payload records
    // ================================================================

    public record TypingPayload(Long conversationId, boolean isTyping) {}

    public record TypingEvent(Long conversationId, Long userId,
                              String username, String displayName, boolean isTyping) {}

    public record ReadPayload(Long conversationId, Long messageId) {}

    public record ReadReceipt(Long conversationId, Long userId, Long messageId) {}

    public record ErrorPayload(String code, String message) {}
}

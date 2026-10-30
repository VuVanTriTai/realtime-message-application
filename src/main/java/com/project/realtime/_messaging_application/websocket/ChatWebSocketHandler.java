package com.project.realtime._messaging_application.websocket;

import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.modules.Message.dto.SendMessageRequest;
import com.project.realtime._messaging_application.modules.Message.service.MessageService;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.websocket.pubsub.RedisEventType;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * WebSocket/STOMP handler cho tin nhan chat.
 *
 * Dung SimpMessageHeaderAccessor de lay user thay vi @AuthenticationPrincipal
 * vi Spring STOMP voi Spring Security 6+ co the khong inject dung.
 *
 * Destinations ma client GUI ve server (/app/...):
 *   /app/chat.send    -> gui tin nhan
 *   /app/chat.typing  -> thong bao dang nhap
 *   /app/chat.read    -> danh dau da doc
 */
@Controller
public class ChatWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    private final MessageService         messageService;
    private final SimpMessagingTemplate  messagingTemplate;
    private final PresenceService        presenceService;
    private final RedisMessagePublisher  redisPublisher;

    public ChatWebSocketHandler(MessageService messageService,
                                SimpMessagingTemplate messagingTemplate,
                                PresenceService presenceService,
                                RedisMessagePublisher redisPublisher) {
        this.messageService    = messageService;
        this.messagingTemplate = messagingTemplate;
        this.presenceService   = presenceService;
        this.redisPublisher    = redisPublisher;
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
    // Gui tin nhan
    // ================================================================

    /**
     * Client gui den: /app/chat.send
     * Sau khi luu DB thanh cong -> publish len Redis -> tat ca instance forward toi WebSocket clients.
     */
    @MessageMapping("/chat.send")
    public void sendMessage(
            @Payload @Valid SendMessageRequest req,
            SimpMessageHeaderAccessor accessor) {

        User user = extractUser(accessor);
        if (user == null) {
            log.warn("sendMessage: unauthenticated request, ignored");
            return;
        }

        try {
            MessageResponse saved = messageService.sendMessage(user.getId(), req);

            // PUBLISH len Redis -> tat ca instance nhan va forward toi WebSocket clients
            redisPublisher.publish(saved.conversationId(), RedisEventType.NEW_MESSAGE, saved);

            log.debug("Published NEW_MESSAGE: conversation={} sender={} id={}",
                    saved.conversationId(), user.getUsername(), saved.id());

        } catch (Exception e) {
            messagingTemplate.convertAndSendToUser(
                    user.getUsername(),
                    "/queue/errors",
                    new ErrorPayload("SEND_FAILED", e.getMessage())
            );
            log.error("sendMessage error for user={}: {}", user.getUsername(), e.getMessage(), e);
        }
    }

    // ================================================================
    // Typing indicator
    // ================================================================

    /**
     * Client gui den: /app/chat.typing
     * Publish typing event len Redis -> tat ca instance forward toi thanh vien.
     */
    @MessageMapping("/chat.typing")
    public void handleTyping(
            @Payload TypingPayload payload,
            SimpMessageHeaderAccessor accessor) {

        User user = extractUser(accessor);
        if (user == null) return;

        // Cap nhat Redis typing key (TTL 3 giay)
        presenceService.setTyping(payload.conversationId(), user.getId());

        TypingEvent event = new TypingEvent(
                payload.conversationId(),
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                payload.isTyping()
        );

        // Publish qua Redis -> tat ca instance forward
        redisPublisher.publish(payload.conversationId(), RedisEventType.TYPING, event);
    }

    // ================================================================
    // Danh dau da doc
    // ================================================================

    /**
     * Client gui den: /app/chat.read
     * Payload: { "conversationId": 1, "messageId": 500 }
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
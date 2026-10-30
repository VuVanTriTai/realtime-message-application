package com.project.realtime._messaging_application.websocket;

import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.Instant;

/**
 * Heartbeat handler - client gui ping moi ~25 giay de duy tri trang thai online.
 * Dung SimpMessageHeaderAccessor de lay user vi @AuthenticationPrincipal khong inject duoc trong STOMP.
 */
@Controller
public class HeartbeatHandler {

    private static final Logger log = LoggerFactory.getLogger(HeartbeatHandler.class);

    private final PresenceService presenceService;
    private final UserRepository  userRepository;

    public HeartbeatHandler(PresenceService presenceService, UserRepository userRepository) {
        this.presenceService = presenceService;
        this.userRepository  = userRepository;
    }

    @MessageMapping("/heartbeat")
    public void heartbeat(SimpMessageHeaderAccessor accessor) {
        User user = extractUser(accessor);
        if (user == null) return;

        Instant now = Instant.now();
        presenceService.markOnline(user.getId());
        userRepository.updateLastSeenAt(user.getId(), now);

        log.trace("Heartbeat from user={}", user.getUsername());
    }

    private User extractUser(SimpMessageHeaderAccessor accessor) {
        Principal principal = accessor.getUser();
        if (principal instanceof UsernamePasswordAuthenticationToken token) {
            Object detail = token.getPrincipal();
            if (detail instanceof User user) return user;
        }
        return null;
    }
}
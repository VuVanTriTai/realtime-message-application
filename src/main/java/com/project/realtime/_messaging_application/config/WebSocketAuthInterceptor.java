package com.project.realtime._messaging_application.config;

import com.project.realtime._messaging_application.common.util.JwtTokenProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * Channel Interceptor: xác thực JWT tại bước CONNECT của STOMP.
 *
 * Tại sao không dùng JwtAuthenticationFilter (Servlet Filter)?
 * - WebSocket upgrade request đi qua Servlet Filter, nhưng sau khi upgrade
 *   thì các STOMP frame (SEND, SUBSCRIBE...) không đi qua Servlet Filter nữa.
 * - Cần intercept ở tầng MessageChannel của Spring Messaging.
 *
 * Luồng:
 *   1. Client gửi STOMP CONNECT frame kèm header: Authorization: Bearer <token>
 *      Hoặc query param: /ws?token=<token> (SockJS transport)
 *   2. Interceptor này verify JWT, set Principal vào session STOMP.
 *   3. Principal được giữ suốt vòng đời kết nối → dùng được trong @MessageMapping.
 */
@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtTokenProvider    jwtTokenProvider;
    private final UserDetailsService  userDetailsService;

    public WebSocketAuthInterceptor(JwtTokenProvider jwtTokenProvider,
                                    UserDetailsService userDetailsService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.userDetailsService = userDetailsService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null) return message;

        // Chỉ xử lý frame CONNECT (xác thực 1 lần duy nhất khi kết nối)
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String token = extractToken(accessor);

            if (!StringUtils.hasText(token)) {
                throw new IllegalArgumentException("WebSocket: thiếu JWT token");
            }

            if (!jwtTokenProvider.validateToken(token)) {
                throw new IllegalArgumentException("WebSocket: JWT token không hợp lệ hoặc đã hết hạn");
            }

            String username = jwtTokenProvider.getUsernameFromToken(token);
            String role     = jwtTokenProvider.getRoleFromToken(token);

            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(
                            userDetails,
                            null,
                            List.of(new SimpleGrantedAuthority(role))
                    );

            // Gắn authentication vào session STOMP – dùng được ở tất cả frame sau đó
            accessor.setUser(auth);
        }

        return message;
    }

    /**
     * Lấy token từ:
     * 1. STOMP header "Authorization: Bearer <token>"
     * 2. Native header "token" (SockJS gửi qua query param → được forward vào native headers)
     */
    private String extractToken(StompHeaderAccessor accessor) {
        // Ưu tiên Authorization header
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (StringUtils.hasText(authHeader) && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }

        // Fallback: header "token" (dùng khi SockJS không cho set Authorization)
        String tokenHeader = accessor.getFirstNativeHeader("token");
        if (StringUtils.hasText(tokenHeader)) {
            return tokenHeader;
        }

        return null;
    }
}

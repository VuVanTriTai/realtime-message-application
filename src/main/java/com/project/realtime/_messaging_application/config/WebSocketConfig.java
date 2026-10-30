package com.project.realtime._messaging_application.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Cấu hình WebSocket/STOMP.
 *
 * Luồng kết nối:
 * 1. Client kết nối WebSocket tại: ws://host/ws
 * Gửi STOMP CONNECT với header: Authorization: Bearer <JWT>
 * (hoặc native header "token": <JWT> khi dùng SockJS)
 * 2. Client subscribe topic:
 * - /topic/conversation.{id} → nhận tin của một conversation
 * - /user/queue/errors → nhận lỗi cá nhân
 * - /user/queue/typing → nhận typing indicator
 * 3. Client gửi tin về server tại:
 * - /app/chat.send → gửi tin nhắn
 * - /app/chat.typing → thông báo đang nhập
 * - /app/chat.read → đánh dấu đã đọc
 *
 * Broker:
 * - /topic : public topic (broadcast tới tất cả subscriber của conversation)
 * - /user : private queue (Spring tự thêm username vào destination)
 * - /app : prefix cho các @MessageMapping method trong controller
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor authInterceptor;

    public WebSocketConfig(WebSocketAuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry
                .addEndpoint("/ws")
                .setAllowedOriginPatterns("*") // production: đổi thành domain cụ thể
                .withSockJS(); // SockJS fallback cho browser cũ, khi websocket không được hỗ trợ
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.enableSimpleBroker("/topic", "/user");
        registry.setUserDestinationPrefix("/user");
    }

    /**
     * Đăng ký interceptor xác thực JWT tại bước STOMP CONNECT.
     * Các STOMP frame sau đó (SEND, SUBSCRIBE) sẽ tự động có Principal được set.
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authInterceptor);
    }
}

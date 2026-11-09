package com.project.realtime._messaging_application.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

/**
 * WebSocketConfig — Cau hinh WebSocket/STOMP toi uu cho 10k connections.
 *
 * Kien truc Tomcat NIO + STOMP:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Tomcat NIO Acceptor (1 thread)                                  │
 * │      ↓  accept TCP connection                                    │
 * │  Tomcat NIO Poller (2-4 threads)                                 │
 * │      ↓  detect socket readable/writable, KHONG giu cho tat ca   │
 * │  HTTP Upgrade → WebSocket handshake (threads.max pool)           │
 * │      ↓  sau handshake: socket tra ve Poller, khong giu thread    │
 * │  STOMP Inbound Channel (corePoolSize=8, maxPoolSize=64)          │
 * │      ↓  parse STOMP frame, goi @MessageMapping handler           │
 * │  ChatWebSocketHandler (viec nhe: rate-limit, routing)            │
 * │      ↓  viec nang (DB): day sang taskExecutor (chat-worker-*)    │
 * │  STOMP Outbound Channel (corePoolSize=8, maxPoolSize=64)         │
 * │      ↓  gui STOMP frame toi client qua NIO                       │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Destinations:
 *   Client → Server:  /app/chat.send | /app/chat.typing | /app/chat.read
 *   Server → Client:
 *     /topic/conversation.{id}  → broadcast den tat ca thanh vien
 *     /user/queue/errors        → loi ca nhan
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor authInterceptor;
    private final TaskScheduler            brokerTaskScheduler;

    public WebSocketConfig(WebSocketAuthInterceptor authInterceptor,
                           @Qualifier("outboxTaskScheduler") TaskScheduler brokerTaskScheduler) {
        this.authInterceptor     = authInterceptor;
        this.brokerTaskScheduler = brokerTaskScheduler;
    }

    // ================================================================
    // Endpoint
    // ================================================================

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry
                .addEndpoint("/ws")
                .setAllowedOriginPatterns("*") // production: doi thanh domain cu the
                .withSockJS()                  // SockJS fallback cho browser cu
                    .setHeartbeatTime(25_000); // SockJS heartbeat 25s (it hon STOMP heartbeat)
    }

    // ================================================================
    // Message Broker
    // ================================================================

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");

        // Simple in-memory broker (du cho 1 instance)
        // Khi scale: doi sang RabbitMQ/Artemis STOMP relay
        registry.enableSimpleBroker("/topic", "/user")
                // TaskScheduler BAT BUOC khi dat heartbeat — dung de gui heartbeat frame dinh ky
                .setTaskScheduler(brokerTaskScheduler)
                .setHeartbeatValue(new long[]{10_000, 10_000}); // server push + expect client

        registry.setUserDestinationPrefix("/user");
    }

    // ================================================================
    // Transport — gioi han kich thuoc frame / buffer / timeout
    // ================================================================

    /**
     * Gioi han de tranh client doc cham hoac gui frame qua lon lam bao hoa server.
     *
     * sendTimeLimit:    Neu server khong gui xong frame trong 15s → dong ket noi.
     *                   Tranh thread bi chiem boi "slow consumer".
     * sendBufferSizeLimit: Buffer toi da cho 1 session (256KB).
     *                   Neu client doc cham va buffer day → dong ket noi.
     * messageSizeLimit: Frame toi da 64KB (tin nhan text binh thuong < 4KB).
     */
    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration
                .setSendTimeLimit(15 * 1000)           // 15 giay
                .setSendBufferSizeLimit(256 * 1024)     // 256 KB / session
                .setMessageSizeLimit(64 * 1024);        // 64 KB / frame
    }

    // ================================================================
    // Channel Executors — STOMP Inbound & Outbound
    // ================================================================

    /**
     * Inbound channel: xu ly STOMP frames DEN TU client (SEND, SUBSCRIBE...).
     *
     * Sau khi NIO Poller phat hien socket co data, frame duoc parse va day vao
     * inbound channel executor de goi @MessageMapping handler.
     *
     * Sizing:
     *   corePoolSize = 8  : du cho 10k conn vi phan lon frame la typing/read (< 1ms)
     *   maxPoolSize = 64  : burst khi spike sendMessage dong loat
     *
     * Interceptor authInterceptor chay o day (JWT check tai STOMP CONNECT).
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration
                .interceptors(authInterceptor)
                .taskExecutor(buildExecutor("stomp-inbound-", 20, 40, 500));
    }

    /**
     * Outbound channel: gui STOMP frames TU server DEN client.
     *
     * SimpMessagingTemplate.convertAndSend() day message vao day.
     * NIO gui byte tren Poller thread — outbound executor chi serialize va routing.
     *
     * Sizing cao hon inbound vi moi 1 sendMessage co the fan-out toi N thanh vien.
     */
    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.taskExecutor(buildExecutor("stomp-outbound-", 35, 60, 500));
    }

    // ================================================================
    // Helper
    // ================================================================

    private ThreadPoolTaskExecutor buildExecutor(String prefix,
                                                  int core, int max, int queue) {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(core);
        exec.setMaxPoolSize(max);
        exec.setQueueCapacity(queue);
        exec.setThreadNamePrefix(prefix);
        exec.setWaitForTasksToCompleteOnShutdown(true);
        exec.setAwaitTerminationSeconds(10);
        exec.initialize();
        return exec;
    }
}

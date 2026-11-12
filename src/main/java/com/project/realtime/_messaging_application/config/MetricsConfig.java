package com.project.realtime._messaging_application.config;

import io.micrometer.core.instrument.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MetricsConfig — Dang ky cac custom metrics cho load test.
 *
 * Metrics duoc expose qua /actuator/prometheus va scrape boi Prometheus.
 *
 * ── 4 STAGE PIPELINE TIMERS (Server-side White-box) ──
 *   chat.stage.inbound_to_db       — Stage 1: Nhan STOMP frame → commit DB (MessageService.sendMessage)
 *   chat.stage.db_to_redis         — Stage 2: Commit DB → publish len Redis (ChatWebSocketHandler fast-path)
 *   chat.stage.redis_transit       — Stage 3: Publish len Redis → subscriber nhan duoc (do boi publishedAt trong envelope)
 *   chat.stage.consumer_to_socket  — Stage 4: Subscriber nhan → ghi xuong tat ca socket (fanout)
 *
 * ── GENERAL METRICS ──
 *   chat_messages_sent_total         — So tin da gui (counter)
 *   chat_messages_latency_seconds    — Do tre end-to-end (timer, tu payload timestamp)
 *   chat_fanout_duration_seconds     — Thoi gian fanout 1 tin den N member (timer, alias Stage 4)
 *   chat_outbox_delay_seconds        — Thoi gian tin nam cho trong outbox (Outbox Poller rescue path)
 *   chat_ws_sessions_active          — So WebSocket session dang mo (gauge)
 *   chat_ws_sessions_total           — Tong so lan ket noi (counter)
 *   chat_ws_disconnects_total        — Tong so lan ngat ket noi (counter)
 */
@Configuration
public class MetricsConfig {

    // ================================================================
    // Message Metrics
    // ================================================================

    /**
     * Dem tong so tin nhan da gui thanh cong.
     * Tag "type" = TEXT | IMAGE | FILE
     */
    @Bean
    public Counter messagesSentCounter(MeterRegistry registry) {
        return Counter.builder("chat.messages.sent")
                .description("Total number of messages sent successfully")
                .tag("type", "TEXT")
                .register(registry);
    }

    /**
     * Do tre end-to-end: tu luc client gui (timestamp trong payload)
     * den luc server xu ly xong. k6 se tinh chinh xac hon o phia client.
     */
    @Bean
    public Timer messageLatencyTimer(MeterRegistry registry) {
        return Timer.builder("chat.messages.latency")
                .description("End-to-end message processing latency")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .register(registry);
    }

    /**
     * Do thoi gian fanout: tu luc sendMessage() bat dau den luc
     * convertAndSend() den broker hoan tat.
     * Voi nhom 1K/5K/10K member, chi so nay cho thay bottleneck outbound channel.
     */
    @Bean
    public Timer fanoutDurationTimer(MeterRegistry registry) {
        return Timer.builder("chat.fanout.duration")
                .description("Time to fan out a message to all conversation members")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .register(registry);
    }

    /**
     * Do thoi gian tin nhan nam cho trong outbox table truoc khi duoc OutboxPoller boc len publish.
     * Cho biet do tre do polling schedule gay ra.
     */
    @Bean
    public Timer outboxDelayTimer(MeterRegistry registry) {
        return Timer.builder("chat.outbox.delay")
                .description("Time message waited in outbox before being published to Redis")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .register(registry);
    }

    // ================================================================
    // 4-Stage Pipeline Timers (Server White-box Profiling)
    // ================================================================

    /**
     * Stage 1: Nhận STOMP frame → commit DB.
     * Đo tại ChatWebSocketHandler (chat-worker thread).
     * Bắt đầu: ngay trước messageService.sendMessage().
     * Kết thúc: ngay sau sendMessage() trả về.
     * Cho thấy: chi phí INSERT message + INSERT outbox + seq update.
     */
    @Bean
    public Timer stageInboundToDbTimer(MeterRegistry registry) {
        return Timer.builder("chat.stage.inbound_to_db")
                .description("Stage 1: STOMP frame received to DB commit completed")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .tag("stage", "1")
                .register(registry);
    }

    /**
     * Stage 2: Commit DB → publish lên Redis.
     * Đo tại ChatWebSocketHandler (fast-path sau khi sendMessage()).
     * Bắt đầu: sau sendMessage() xong.
     * Kết thúc: sau redisPublisher.publish() trả về.
     * Cho thấy: chi phí serialize JSON + 1 Redis PUBLISH command.
     */
    @Bean
    public Timer stageDbToRedisTimer(MeterRegistry registry) {
        return Timer.builder("chat.stage.db_to_redis")
                .description("Stage 2: DB commit to Redis PUBLISH command issued")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .tag("stage", "2")
                .register(registry);
    }

    /**
     * Stage 3: Redis Pub/Sub transit latency.
     * Đo tại RedisMessageSubscriber: System.currentTimeMillis() - envelope.publishedAt.
     * Cho thấy: độ trễ của Redis Pub/Sub (mạng local ~ 0.1-1ms, cluster ~ 1-5ms).
     */
    @Bean
    public Timer stageRedisTransitTimer(MeterRegistry registry) {
        return Timer.builder("chat.stage.redis_transit")
                .description("Stage 3: Redis PUBLISH to subscriber onMessage() callback")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .tag("stage", "3")
                .register(registry);
    }

    /**
     * Stage 4: Consumer listener → ghi xuống tất cả socket (fanout).
     * Alias của fanoutDurationTimer — đo toàn bộ convertAndSend() đến N members.
     * Cho thấy: bottleneck outbound nếu nhóm quá lớn hoặc STOMP outbound channel bão hòa.
     * (Thực chất cùng metric với chat.fanout.duration — stage tag phân biệt mục đích)
     */
    @Bean
    public Timer stageConsumerToSocketTimer(MeterRegistry registry) {
        return Timer.builder("chat.stage.consumer_to_socket")
                .description("Stage 4: Subscriber received to all WebSocket convertAndSend() done")
                .publishPercentiles(0.5, 0.95, 0.99)
                .publishPercentileHistogram()
                .tag("stage", "4")
                .register(registry);
    }

    // ================================================================
    // WebSocket Session Metrics
    // ================================================================

    /**
     * Gauge: So WebSocket session dang mo tai thoi diem hien tai.
     * Tang khi CONNECT, giam khi DISCONNECT.
     * Dung AtomicInteger de thread-safe.
     */
    @Bean
    public AtomicGauge wsActiveSessionsGauge(MeterRegistry registry) {
        java.util.concurrent.atomic.AtomicInteger activeCount =
                new java.util.concurrent.atomic.AtomicInteger(0);
        Gauge.builder("chat.ws.sessions.active", activeCount,
                        java.util.concurrent.atomic.AtomicInteger::get)
                .description("Number of currently active WebSocket sessions")
                .register(registry);
        return new AtomicGauge(activeCount);
    }

    /**
     * Counter: Tong so lan client ket noi thanh cong.
     */
    @Bean
    public Counter wsSessionsTotalCounter(MeterRegistry registry) {
        return Counter.builder("chat.ws.sessions.total")
                .description("Total number of WebSocket sessions established")
                .register(registry);
    }

    /**
     * Counter: Tong so lan client ngat ket noi (bao gom disconnect boi slow consumer).
     * Tag "reason" = CLIENT | SERVER | TIMEOUT | SLOW_CONSUMER
     */
    @Bean
    public Counter wsDisconnectsTotalCounter(MeterRegistry registry) {
        return Counter.builder("chat.ws.disconnects.total")
                .description("Total number of WebSocket disconnections")
                .tag("reason", "UNKNOWN")
                .register(registry);
    }

    // ================================================================
    // Wrapper de inject AtomicInteger vao WebSocketEventListener
    // ================================================================

    /**
     * Wrapper don gian de Spring co the inject AtomicInteger
     * tu wsActiveSessionsGauge bean vao cac service khac.
     */
    public record AtomicGauge(java.util.concurrent.atomic.AtomicInteger counter) {
        public void increment() { counter.incrementAndGet(); }
        public void decrement() { counter.decrementAndGet(); }
        public int get()        { return counter.get(); }
    }
}


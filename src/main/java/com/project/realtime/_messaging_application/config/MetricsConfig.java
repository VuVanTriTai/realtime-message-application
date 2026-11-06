package com.project.realtime._messaging_application.config;

import io.micrometer.core.instrument.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MetricsConfig — Dang ky cac custom metrics cho load test.
 *
 * Metrics duoc expose qua /actuator/prometheus va scrape boi Prometheus.
 *
 * Danh sach metrics:
 *   chat_messages_sent_total         — So tin da gui (counter)
 *   chat_messages_latency_seconds    — Do tre end-to-end (timer, tu payload timestamp)
 *   chat_fanout_duration_seconds     — Thoi gian fanout 1 tin den N member (timer)
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


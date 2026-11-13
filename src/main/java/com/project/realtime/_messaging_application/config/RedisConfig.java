package com.project.realtime._messaging_application.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessageSubscriber;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.util.concurrent.Executor;

@Configuration
public class RedisConfig {

    /** Prefix pattern để subscribe tất cả channel chat (bao gồm cả conv và user) */
    private static final String CHAT_CHANNEL_PATTERN  = "chat:*";
    /** Pattern riêng cho distributed cache invalidation – nhận CACHE_EVICT_CONV_MEMBERS */
    private static final String CACHE_EVICT_PATTERN   = "cache:*";

    @Bean
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }

    // ──────────────────────────────────────────────────────────────────────
    // RedisTemplate beans
    // ──────────────────────────────────────────────────────────────────────

    /**
     * RedisTemplate<String, String> – dùng cho cache chung và các thao tác key-value.
     */
    @Bean
    public RedisTemplate<String, String> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, String> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        StringRedisSerializer serializer = new StringRedisSerializer();
        template.setKeySerializer(serializer);
        template.setValueSerializer(serializer);
        template.setHashKeySerializer(serializer);
        template.setHashValueSerializer(serializer);

        template.afterPropertiesSet();
        return template;
    }

    /**
     * StringRedisTemplate – dùng cho Rate Limiter (INCR), Refresh Token,
     * Presence (SET với TTL), và Pub/Sub publish.
     */
    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Pub/Sub beans
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Dedicated Executor cho RedisMessageListenerContainer.
     * Tách hoàn toàn việc lắng nghe Redis Pub/Sub khỏi taskExecutor (vốn dùng cho DB write).
     * Tránh việc hàng đợi nhận tin bị nghẽn sau các tác vụ ghi DB.
     */
    @Bean(name = "redisSubscriberExecutor")
    public Executor redisSubscriberExecutor() {
        org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor executor =
                new org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor();
        // Tối ưu cho CPU 4-core / 8-threads: công việc trong onMessage là Non-blocking In-Memory (< 1ms).
        // Giữ thread pool nhỏ gọn (4-8) để tránh context switching, tăng queue lên 1000 để đệm micro-burst.
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(1000);
        executor.setThreadNamePrefix("redis-sub-");
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.initialize();
        return executor;
    }

    /**
     * RedisMessageListenerContainer – container chứa và quản lý tất cả Redis subscriptions.
     *
     * Thiết kế:
     *   - Dùng dedicated redisSubscriberExecutor riêng, không tranh chấp thread với taskExecutor (DB write).
     *   - Đăng ký trực tiếp RedisMessageSubscriber (implements MessageListener), loại bỏ reflection overhead.
     *   - Subscribe pattern "chat:conv:*" → nhận TẤT CẢ channel chat của mọi conversation.
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory connectionFactory,
            RedisMessageSubscriber subscriber,
            @Qualifier("redisSubscriberExecutor") Executor redisSubscriberExecutor) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.setTaskExecutor(redisSubscriberExecutor);

        // Đăng ký trực tiếp RedisMessageSubscriber (implements MessageListener), không qua MessageListenerAdapter reflection
        container.addMessageListener(subscriber, new PatternTopic(CHAT_CHANNEL_PATTERN));

        // Subscribe pattern riêng cho distributed cache invalidation
        // "cache:evict:convMembers:{convId}" → RedisMessageSubscriber.onMessage() xử lý CACHE_EVICT_CONV_MEMBERS
        container.addMessageListener(subscriber, new PatternTopic(CACHE_EVICT_PATTERN));

        return container;
    }
}

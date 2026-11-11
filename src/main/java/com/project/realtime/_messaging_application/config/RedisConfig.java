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
     * MessageListenerAdapter – wrap RedisMessageSubscriber để Redis có thể gọi.
     * Delegate method mặc định là "onMessage" (match với interface MessageListener).
     */
    @Bean
    public MessageListenerAdapter messageListenerAdapter(RedisMessageSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber);
    }

    /**
     * RedisMessageListenerContainer – container chứa và quản lý tất cả Redis subscriptions.
     *
     * Thiết kế:
     *   - Subscribe pattern "chat:conv:*" → nhận TẤT CẢ channel chat của mọi conversation.
     *   - Phù hợp cho giai đoạn phát triển và hệ thống vừa (~1000 conversation active).
     *   - Khi cần tối ưu: dùng PubSubChannelManager để dynamic subscribe/unsubscribe
     *     theo từng conversationId (chỉ subscribe khi có client trên instance này).
     *
     * Tại sao PatternTopic thay vì ChannelTopic?
     *   - ChannelTopic match exact: "chat:conv:5" chỉ nhận conv 5.
     *   - PatternTopic match wildcard: "chat:conv:*" nhận tất cả conv.
     *   - Dùng pattern vì số conversation không cố định, không thể đăng ký trước.
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory connectionFactory,
            MessageListenerAdapter listenerAdapter,
            @Qualifier("taskExecutor") Executor taskExecutor) {

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.setTaskExecutor(taskExecutor);

        // Subscribe pattern – nhận tất cả event của mọi conversation và user
        container.addMessageListener(listenerAdapter, new PatternTopic(CHAT_CHANNEL_PATTERN));

        // Subscribe pattern riêng cho distributed cache invalidation
        // "cache:evict:convMembers:{convId}" → RedisMessageSubscriber.onMessage() xử lý CACHE_EVICT_CONV_MEMBERS
        container.addMessageListener(listenerAdapter, new PatternTopic(CACHE_EVICT_PATTERN));

        return container;
    }
}

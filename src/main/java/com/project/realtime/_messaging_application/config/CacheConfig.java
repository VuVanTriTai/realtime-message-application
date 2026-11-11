package com.project.realtime._messaging_application.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Caffeine In-Memory Cache Configuration.
 *
 * Cache được sử dụng trong hot path (xử lý WebSocket / Redis Pub/Sub):
 *
 *   "convMembers" – Cache danh sách userId của từng conversation.
 *     - Mục đích: Tránh query DB mỗi tin nhắn khi fanout vào /topic/user.{id}.
 *     - TTL: 5 phút (đủ lâu cho hot conversations).
 *     - Kích thước tối đa: 10.000 conversation (khoảng 80MB RAM ước tính).
 *     - Invalidation: Gọi @CacheEvict khi thành viên Join/Leave nhóm.
 *     - Với DIRECT conversation: Thành viên bất biến → Cache rất hiệu quả.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /** Tên cache cho danh sách thành viên theo conversationId. */
    public static final String CACHE_CONV_MEMBERS = "convMembers";

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCacheNames(List.of(CACHE_CONV_MEMBERS));
        manager.setCaffeine(
                Caffeine.newBuilder()
                        .maximumSize(10_000)             // Tối đa 10k conversation entries
                        .expireAfterWrite(5, TimeUnit.MINUTES) // TTL 5 phút
                        .recordStats()                   // Bật stats để xem hit/miss ratio
        );
        return manager;
    }
}


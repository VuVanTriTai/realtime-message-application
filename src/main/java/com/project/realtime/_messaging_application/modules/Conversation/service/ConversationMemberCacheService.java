package com.project.realtime._messaging_application.modules.Conversation.service;

import com.project.realtime._messaging_application.config.CacheConfig;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Cache wrapper cho danh sách userId của conversation members.
 *
 * Mục đích: Giải phóng HikariCP Connection Pool khỏi hot path WebSocket.
 *
 * Problem trước đây:
 *   - Mỗi tin nhắn gửi đến → RedisMessageSubscriber.fanoutToUserChannels()
 *     gọi DB query để lấy danh sách thành viên.
 *   - Với 500 msg/s → 500 queries/giây → HikariCP (25 connections) bị nghẽn.
 *   - Pending queue: 26-64 luồng chờ → E2E latency 32s-64s.
 *
 * Giải pháp:
 *   - Cache danh sách userId vào Caffeine (RAM, nanosecond access).
 *   - TTL 5 phút: Safety net cuối cùng nếu invalidation thất bại.
 *   - Invalidation: 2 lớp bảo vệ:
 *       1. Local @CacheEvict ngay trên instance nhận request (tức thì)
 *       2. Redis Pub/Sub broadcast tới tất cả instance còn lại trong cluster
 *   - Với DIRECT conversation (2 người cố định): Cache cực kỳ hiệu quả.
 *
 * Multi-instance safety:
 *   Instance A (addMember) → @CacheEvict local A + publishCacheEvict → Redis channel
 *   Instance B (đang fanout) nhận message → evict local B → cache đồng bộ toàn cluster
 */
@Service
public class ConversationMemberCacheService {

    private static final Logger log = LoggerFactory.getLogger(ConversationMemberCacheService.class);

    private final ConversationMemberRepository memberRepo;
    private final RedisMessagePublisher        redisPublisher;

    public ConversationMemberCacheService(ConversationMemberRepository memberRepo,
                                          RedisMessagePublisher redisPublisher) {
        this.memberRepo     = memberRepo;
        this.redisPublisher = redisPublisher;
    }

    /**
     * Lấy danh sách userId của tất cả thành viên trong conversation.
     * Kết quả được cache vào Caffeine với TTL 5 phút.
     *
     * @param conversationId ID của conversation
     * @return List userId của tất cả thành viên
     */
    @Cacheable(cacheNames = CacheConfig.CACHE_CONV_MEMBERS, key = "#conversationId")
    public List<Long> getMemberIds(Long conversationId) {
        log.debug("[Cache MISS] Loading member IDs for conv={} from DB", conversationId);
        return memberRepo.findUserIdsByConversationId(conversationId);
    }

    /**
     * Xóa cache local VÀ broadcast lệnh xóa cache tới tất cả instance trong cluster.
     *
     * Luồng:
     *   1. @CacheEvict xóa local cache của instance đang chạy (AOP proxy, tức thì)
     *   2. publishCacheEvict() publish lên Redis channel "cache:evict:convMembers:{id}"
     *   3. Tất cả instance đang subscribe (kể cả instance này) nhận event và evict local cache
     *      → Instance này evict 2 lần (một lần từ AOP, một lần từ Redis), không có hại gì.
     *
     * Phải gọi sau khi đã lưu DB thành công để tránh race condition.
     *
     * @param conversationId ID của conversation bị thay đổi thành viên
     */
    @CacheEvict(cacheNames = CacheConfig.CACHE_CONV_MEMBERS, key = "#conversationId")
    public void evict(Long conversationId) {
        log.debug("[Cache EVICT] Invalidated local member cache for conv={}", conversationId);
        // Broadcast tới tất cả instance còn lại trong cluster
        redisPublisher.publishCacheEvict(conversationId);
    }

    /**
     * Chỉ xóa local cache – KHÔNG publish lại lên Redis.
     *
     * Dùng bởi RedisMessageSubscriber khi nhận CACHE_EVICT_CONV_MEMBERS từ Redis.
     * Nếu dùng evict() ở đây sẽ tạo vòng lặp vô tận:
     *   subscribe nhận event → gọi evict() → publishCacheEvict() → Redis → subscribe nhận event → ...
     *
     * @param conversationId ID của conversation cần xóa cache local
     */
    @CacheEvict(cacheNames = CacheConfig.CACHE_CONV_MEMBERS, key = "#conversationId")
    public void evictLocal(Long conversationId) {
        log.debug("[Cache EVICT LOCAL] Invalidated local cache for conv={} (via Redis Pub/Sub)", conversationId);
    }
}

package com.project.realtime._messaging_application.modules.Conversation.service;

import com.project.realtime._messaging_application.config.CacheConfig;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
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
 *   - Với 500 msg/s → 500 queries/giây → HikariCP (25 connections) bị nghẽn
 *   - Pending queue: 26-64 luồng chờ → E2E latency 32s-64s.
 *
 * Giải pháp:
 *   - Cache danh sách userId vào Caffeine (RAM, nanosecond access).
 *   - TTL 5 phút: Đủ lâu cho hot conversations.
 *   - Invalidation: Gọi evict() khi thành viên Join/Leave/Kick.
 *   - Với DIRECT conversation (2 người): Danh sách bất biến → Cache cực kỳ hiệu quả.
 */
@Service
public class ConversationMemberCacheService {

    private static final Logger log = LoggerFactory.getLogger(ConversationMemberCacheService.class);

    private final ConversationMemberRepository memberRepo;

    public ConversationMemberCacheService(ConversationMemberRepository memberRepo) {
        this.memberRepo = memberRepo;
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
     * Xóa cache khi có thành viên join vào nhóm.
     * Phải gọi sau khi đã lưu DB thành công.
     *
     * @param conversationId ID của conversation bị thay đổi thành viên
     */
    @CacheEvict(cacheNames = CacheConfig.CACHE_CONV_MEMBERS, key = "#conversationId")
    public void evict(Long conversationId) {
        log.debug("[Cache EVICT] Invalidated member cache for conv={}", conversationId);
    }
}

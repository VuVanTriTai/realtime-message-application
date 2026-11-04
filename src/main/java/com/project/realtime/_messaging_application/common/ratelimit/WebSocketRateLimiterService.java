package com.project.realtime._messaging_application.common.ratelimit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Rate limiter dành riêng cho WebSocket messages.
 *
 * Tại sao không dùng RateLimitAspect?
 *  - RateLimitAspect dùng RequestContextHolder.getRequestAttributes() để lấy HttpServletRequest.
 *  - Trong ngữ cảnh WebSocket/STOMP, RequestContextHolder KHÔNG có request → trả về null → NPE.
 *  - Giải pháp: inject service này trực tiếp vào ChatWebSocketHandler, key = userId.
 *
 * Chiến lược giới hạn:
 *  - sendMessage  : tối đa 30 tin / 10 giây / userId
 *  - typing event : tối đa 10 lần / 3 giây / userId (tránh spam indicator)
 *
 * Cơ chế: Redis atomic INCR + TTL (sliding window đơn giản).
 *  - INCR trả về count mới sau khi tăng.
 *  - Nếu count == 1 (lần đầu): set TTL cho window.
 *  - Nếu count > limit: từ chối.
 *
 * Fail-open: nếu Redis tạm thời không khả dụng → cho phép (không chặn user).
 */
@Service
public class WebSocketRateLimiterService {

    private static final Logger log = LoggerFactory.getLogger(WebSocketRateLimiterService.class);

    /** Giới hạn gửi tin nhắn */
    public static final int  MSG_LIMIT    = 30;
    public static final int  MSG_WINDOW_S = 10;

    /** Giới hạn typing event */
    public static final int  TYPING_LIMIT    = 10;
    public static final int  TYPING_WINDOW_S = 3;

    private static final String KEY_PREFIX_MSG    = "ws_rl:msg:";
    private static final String KEY_PREFIX_TYPING = "ws_rl:typing:";

    private final StringRedisTemplate redisTemplate;

    public WebSocketRateLimiterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    // ================================================================
    // Public API
    // ================================================================

    /**
     * Kiểm tra xem userId có được phép gửi thêm 1 tin nhắn không.
     *
     * @param userId id người dùng (key rate-limit per user)
     * @return true nếu còn trong ngưỡng; false nếu vượt ngưỡng
     */
    public boolean allowMessage(Long userId) {
        return check(KEY_PREFIX_MSG + userId, MSG_LIMIT, MSG_WINDOW_S, userId, "MSG");
    }

    /**
     * Kiểm tra xem userId có được phép gửi thêm 1 typing event không.
     *
     * @param userId id người dùng
     * @return true nếu còn trong ngưỡng; false nếu vượt ngưỡng
     */
    public boolean allowTyping(Long userId) {
        return check(KEY_PREFIX_TYPING + userId, TYPING_LIMIT, TYPING_WINDOW_S, userId, "TYPING");
    }

    // ================================================================
    // Internal
    // ================================================================

    /**
     * Atomic INCR + TTL sliding-window check.
     *
     * Không dùng Lua script để giữ đơn giản; chấp nhận edge-case race hiếm gặp
     * (count==1 nhưng expire chưa set kịp khi Redis bị reset đột ngột).
     * Đã có backup: check TTL == -1 để reset.
     */
    private boolean check(String key, int limit, int windowSeconds,
                          Long userId, String type) {
        try {
            Long count = redisTemplate.opsForValue().increment(key);
            if (count == null) return true; // fail-open

            if (count == 1L) {
                // Lần đầu trong window → set TTL
                redisTemplate.expire(key, Duration.ofSeconds(windowSeconds));
            } else {
                // Đảm bảo key luôn có TTL (phòng Redis restart mất TTL)
                Long ttl = redisTemplate.getExpire(key);
                if (ttl != null && ttl == -1) {
                    redisTemplate.expire(key, Duration.ofSeconds(windowSeconds));
                }
            }

            if (count > limit) {
                log.warn("[WS-RateLimit] userId={} type={} blocked count={}/{}",
                        userId, type, count, limit);
                return false;
            }
            return true;

        } catch (Exception e) {
            // Redis tạm thời không khả dụng → fail-open (không chặn user)
            log.debug("[WS-RateLimit] Redis unavailable, fail-open for userId={}: {}", userId, e.getMessage());
            return true;
        }
    }
}


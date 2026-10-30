package com.project.realtime._messaging_application.common.ratelimit;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class RateLimiterService {

    private final StringRedisTemplate stringRedisTemplate;

    public RateLimiterService(StringRedisTemplate stringRedisTemplate) {
        this.stringRedisTemplate = stringRedisTemplate;
    }

    /**
     * Kiểm tra xem request có được phép thực thi hay không.
     * Sử dụng Redis atomic INCR:
     * - Khi request đầu tiên đến (count == 1): gán TTL = durationInSeconds.
     * - Đảm bảo key luôn có TTL ngay cả khi gặp sự cố mạng tạm thời.
     *
     * @param key               khóa định danh (ví dụ: rate_limit:login:127.0.0.1)
     * @param limit             số lượt request tối đa
     * @param durationInSeconds thời gian cửa sổ tính bằng giây
     * @return true nếu hợp lệ; false nếu vượt ngưỡng
     */
    public boolean isAllowed(String key, int limit, int durationInSeconds) {
        try {
            Long count = stringRedisTemplate.opsForValue().increment(key);
            if (count != null && count == 1) {
                stringRedisTemplate.expire(key, Duration.ofSeconds(durationInSeconds));
            } else {
                Long ttl = stringRedisTemplate.getExpire(key);
                if (ttl != null && ttl == -1) {
                    stringRedisTemplate.expire(key, Duration.ofSeconds(durationInSeconds));
                }
            }
            return count != null && count <= limit;
        } catch (Exception e) {
            // Nếu Redis tạm thời không khả dụng, không chặn người dùng
            return true;
        }
    }

    /**
     * Lấy số giây còn lại trước khi hết thời gian khóa/reset của key.
     */
    public long getRemainingSeconds(String key) {
        try {
            Long ttl = stringRedisTemplate.getExpire(key);
            return (ttl != null && ttl > 0) ? ttl : 1L;
        } catch (Exception e) {
            return 1L;
        }
    }
}

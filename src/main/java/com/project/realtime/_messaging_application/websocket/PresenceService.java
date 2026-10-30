package com.project.realtime._messaging_application.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

/**
 * PresenceService – quản lý trạng thái online/offline và typing indicator.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Thiết kế (theo thietke.txt):
 *
 * 1. Online Presence:
 *    Key Redis: "presence:{userId}"
 *    Value: timestamp (Instant.now().toEpochMilli())
 *    TTL: 65 giây
 *    Cập nhật: mỗi khi client gửi heartbeat STOMP tới /app/heartbeat (~30s/lần)
 *    Kiểm tra: key còn tồn tại → online; hết TTL → offline.
 *
 * 2. Typing Indicator:
 *    Key Redis: "typing:{conversationId}:{userId}"
 *    Value: "1"
 *    TTL: 3 giây (nếu user dừng nhập, key tự hết hạn → frontend tự ẩn indicator)
 *
 * Khi chạy multi-instance: mọi instance dùng chung Redis → tự động nhất quán.
 * ──────────────────────────────────────────────────────────────────────────
 */
@Service
public class PresenceService {

    private static final Logger log = LoggerFactory.getLogger(PresenceService.class);

    private static final Duration PRESENCE_TTL = Duration.ofSeconds(65);
    private static final Duration TYPING_TTL   = Duration.ofSeconds(3);

    private static final String PRESENCE_KEY_PREFIX = "presence:";
    private static final String TYPING_KEY_PREFIX   = "typing:";

    private final StringRedisTemplate    redisTemplate;
    private final SimpMessagingTemplate  messagingTemplate;

    public PresenceService(StringRedisTemplate redisTemplate,
                           SimpMessagingTemplate messagingTemplate) {
        this.redisTemplate    = redisTemplate;
        this.messagingTemplate = messagingTemplate;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Heartbeat / Online presence
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Ghi nhận user đang online. Gọi khi:
     *  - Client gửi heartbeat STOMP (/app/heartbeat)
     *  - Client gửi bất kỳ STOMP frame nào (SEND, SUBSCRIBE...)
     *
     * @param userId id của user
     */
    public void markOnline(Long userId) {
        String key = PRESENCE_KEY_PREFIX + userId;
        redisTemplate.opsForValue().set(
                key,
                String.valueOf(Instant.now().toEpochMilli()),
                PRESENCE_TTL
        );
        log.trace("User {} marked online", userId);
    }

    /**
     * Đặt user là offline (gọi khi WebSocket disconnect).
     * Xoá key ngay thay vì đợi TTL → trạng thái phản ánh nhanh hơn.
     */
    public void markOffline(Long userId) {
        redisTemplate.delete(PRESENCE_KEY_PREFIX + userId);
        log.debug("User {} marked offline", userId);
    }

    /**
     * Kiểm tra user có đang online không.
     * Online = key tồn tại trong Redis (chưa hết TTL).
     */
    public boolean isOnline(Long userId) {
        return Boolean.TRUE.equals(
                redisTemplate.hasKey(PRESENCE_KEY_PREFIX + userId));
    }

    /**
     * Lấy thời điểm online lần cuối từ Redis (epoch millis → Instant).
     * Trả về null nếu user offline (key không tồn tại).
     */
    public Instant getLastSeenFromRedis(Long userId) {
        String value = redisTemplate.opsForValue().get(PRESENCE_KEY_PREFIX + userId);
        if (value == null) return null;
        try {
            return Instant.ofEpochMilli(Long.parseLong(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Typing indicator
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Ghi nhận user đang nhập trong một conversation.
     * TTL 3 giây: nếu user dừng nhập, key tự xoá → không cần gửi "stop typing".
     */
    public void setTyping(Long conversationId, Long userId) {
        String key = TYPING_KEY_PREFIX + conversationId + ":" + userId;
        redisTemplate.opsForValue().set(key, "1", TYPING_TTL);
    }

    /**
     * Kiểm tra user có đang nhập trong conversation không.
     */
    public boolean isTyping(Long conversationId, Long userId) {
        return Boolean.TRUE.equals(
                redisTemplate.hasKey(TYPING_KEY_PREFIX + conversationId + ":" + userId));
    }
}

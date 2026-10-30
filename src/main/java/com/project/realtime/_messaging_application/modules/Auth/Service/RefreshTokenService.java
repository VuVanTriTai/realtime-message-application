package com.project.realtime._messaging_application.modules.Auth.Service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;

/**
 * Quản lý Refresh Token trong Redis với hai loại key:
 * refresh_token:{token}    → username      (TTL = refreshTokenExpirationSeconds)
 * user_sessions:{username} → Set<token>   (TTL = refreshTokenExpirationSeconds)
 */
@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final String REFRESH_TOKEN_PREFIX = "refresh_token:";
    private static final String USER_SESSIONS_PREFIX = "user_sessions:";

    private final StringRedisTemplate stringRedisTemplate;

    @Value("${jwt.refresh-expiration:604800}")
    private long refreshTokenExpirationSeconds;

    public RefreshTokenService(StringRedisTemplate stringRedisTemplate) {
        this.stringRedisTemplate = stringRedisTemplate;
    }

    /**
     * Tạo một refresh token mới cho username và lưu vào Redis.
     */
    public String createRefreshToken(String username) {
        String token = UUID.randomUUID().toString();
        Duration ttl = Duration.ofSeconds(refreshTokenExpirationSeconds);

        try {
            // 1) refresh_token:{token} → username
            stringRedisTemplate.opsForValue().set(REFRESH_TOKEN_PREFIX + token, username, ttl);

            // 2) user_sessions:{username} → SADD token + gia hạn TTL của set
            String sessionKey = USER_SESSIONS_PREFIX + username;
            stringRedisTemplate.opsForSet().add(sessionKey, token);
            stringRedisTemplate.expire(sessionKey, ttl);

            log.debug("Created RefreshToken for user={}", username);
        } catch (Exception ex) {
            log.warn("Redis is not available when creating refresh token: {}", ex.getMessage());
        }
        return token;
    }

    /**
     * Kiểm tra token hợp lệ và trả về username (không xóa token).
     */
    public String validateAndGetUsername(String token) {
        if (token == null || token.isBlank()) return null;
        try {
            return stringRedisTemplate.opsForValue().get(REFRESH_TOKEN_PREFIX + token);
        } catch (Exception ex) {
            log.warn("Redis is not available when validating refresh token: {}", ex.getMessage());
            return null;
        }
    }

    /**
     * Lấy username và xóa token trong một thao tác atomic (GETDEL).
     */
    public String consumeRefreshToken(String token) {
        if (token == null || token.isBlank()) return null;
        try {
            String username = stringRedisTemplate.opsForValue().getAndDelete(REFRESH_TOKEN_PREFIX + token);
            if (username != null) {
                stringRedisTemplate.opsForSet().remove(USER_SESSIONS_PREFIX + username, token);
                log.debug("Consumed RefreshToken for user={}", username);
            }
            return username;
        } catch (Exception ex) {
            log.warn("Redis is not available when consuming refresh token: {}", ex.getMessage());
            return null;
        }
    }

    /**
     * Xóa một refresh token cụ thể (logout thiết bị hiện tại).
     */
    public void deleteRefreshToken(String token) {
        if (token == null || token.isBlank()) return;
        try {
            String username = stringRedisTemplate.opsForValue().getAndDelete(REFRESH_TOKEN_PREFIX + token);
            if (username != null) {
                stringRedisTemplate.opsForSet().remove(USER_SESSIONS_PREFIX + username, token);
                log.debug("Deleted RefreshToken for user={}", username);
            }
        } catch (Exception ex) {
            log.warn("Redis is not available when deleting refresh token: {}", ex.getMessage());
        }
    }

    /**
     * Thu hồi tất cả refresh token của username (logout all devices / change password).
     */
    public void revokeAllSessions(String username) {
        if (username == null || username.isBlank()) return;
        try {
            String sessionKey = USER_SESSIONS_PREFIX + username;
            Set<String> tokens = stringRedisTemplate.opsForSet().members(sessionKey);

            if (tokens != null && !tokens.isEmpty()) {
                String[] tokenKeys = tokens.stream()
                        .map(t -> REFRESH_TOKEN_PREFIX + t)
                        .toArray(String[]::new);
                stringRedisTemplate.delete(Arrays.asList(tokenKeys));
            }
            stringRedisTemplate.delete(sessionKey);
            log.info("Revoked all sessions for user={}", username);
        } catch (Exception ex) {
            log.warn("Redis is not available when revoking sessions: {}", ex.getMessage());
        }
    }

    public long getRefreshTokenExpirationSeconds() {
        return refreshTokenExpirationSeconds;
    }
}

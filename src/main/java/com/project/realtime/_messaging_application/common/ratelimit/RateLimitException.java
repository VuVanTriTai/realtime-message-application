package com.project.realtime._messaging_application.common.ratelimit;

/**
 * Exception ném ra khi client gọi vượt quá giới hạn request cho phép.
 */
public class RateLimitException extends RuntimeException {

    private final long retryAfterSeconds;

    public RateLimitException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}

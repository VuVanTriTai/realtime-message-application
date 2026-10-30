package com.project.realtime._messaging_application.common.ratelimit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation dùng để áp dụng Rate Limiting lên Controller endpoint.
 *
 * <pre>
 *   @RateLimit(key = "login", limit = 5, durationInSeconds = 60)
 *   @PostMapping("/login")
 *   public ResponseEntity<?> login(...) { ... }
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {

    /**
     * Tiền tố định danh nghiệp vụ (ví dụ: "login", "register", "refresh").
     */
    String key() default "default";

    /**
     * Số lượng request tối đa được phép trong khoảng thời gian.
     */
    int limit() default 5;

    /**
     * Khoảng thời gian cửa sổ tính bằng giây (mặc định 60s = 1 phút).
     */
    int durationInSeconds() default 60;
}

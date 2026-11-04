package com.project.realtime._messaging_application.config;

import com.cloudinary.Cloudinary;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

/**
 * CloudinaryConfig — Khoi tao Cloudinary SDK bean.
 *
 * Cloudinary duoc dung de:
 *   1. Tao upload signature (server-side) → client dung signature upload truc tiep
 *   2. Xoa file khi can (xoa tin nhan co media)
 *
 * QUAN TRONG:
 *   api_secret TUYET DOI khong duoc expose ra client.
 *   Chi server moi co api_secret de tao signature.
 *   Client chi nhan duoc signature co thoi han → khong co quyen toan bo.
 */
@Configuration
public class CloudinaryConfig {

    @Value("${cloudinary.cloud-name}")
    private String cloudName;

    @Value("${cloudinary.api-key}")
    private String apiKey;

    @Value("${cloudinary.api-secret}")
    private String apiSecret;

    @Bean
    public Cloudinary cloudinary() {
        return new Cloudinary(Map.of(
                "cloud_name", cloudName,
                "api_key",    apiKey,
                "api_secret", apiSecret,
                "secure",     true    // luon dung HTTPS URL
        ));
    }
}


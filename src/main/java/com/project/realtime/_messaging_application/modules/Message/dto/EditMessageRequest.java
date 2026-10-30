package com.project.realtime._messaging_application.modules.Message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request sửa nội dung tin nhắn (chỉ cho tin TEXT, chỉ chủ sở hữu) */
public record EditMessageRequest(
        @NotBlank(message = "Nội dung mới không được để trống")
        @Size(max = 4000, message = "Tin nhắn tối đa 4000 ký tự")
        String content
) {}

package com.project.realtime._messaging_application.modules.Message.controller;

import com.project.realtime._messaging_application.modules.Message.dto.EditMessageRequest;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.modules.Message.dto.SendMessageRequest;
import com.project.realtime._messaging_application.modules.Message.service.MessageService;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST API cho module Message.
 *
 * Base path: /api/messages
 *
 * Endpoints:
 *   GET    /api/messages?conversationId=&cursor=   – lịch sử tin nhắn (cursor pagination)
 *   GET    /api/messages/sync?conversationId=&lastId= – đồng bộ sau khi mất kết nối
 *   POST   /api/messages                           – gửi tin nhắn (REST fallback / không WebSocket)
 *   PATCH  /api/messages/{id}                      – sửa nội dung tin nhắn
 *   DELETE /api/messages/{id}                      – xoá mềm tin nhắn
 *
 * Luồng realtime chính đi qua WebSocket/STOMP (MessageWebSocketHandler) – TODO tuần 2.
 * Endpoint POST /api/messages này dùng làm fallback khi WebSocket không khả dụng.
 */
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Lịch sử tin nhắn
    // ──────────────────────────────────────────────────────────────────────

    /**
     * GET /api/messages?conversationId=1&cursor=500
     * - cursor null  → trang đầu tiên (50 tin mới nhất)
     * - cursor = id  → 50 tin cũ hơn cursor (cuộn lên)
     */
    @GetMapping
    public ResponseEntity<List<MessageResponse>> getHistory(
            @RequestParam Long conversationId,
            @RequestParam(required = false) Long cursor,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                messageService.getHistory(conversationId, currentUser.getId(), cursor));
    }

    /**
     * GET /api/messages/sync?conversationId=1&lastId=850
     * Trả về tất cả tin có id > lastId.
     * Client gọi sau khi reconnect để nhận lại tin bị bỏ lỡ.
     */
    @GetMapping("/sync")
    public ResponseEntity<List<MessageResponse>> syncMissedMessages(
            @RequestParam Long conversationId,
            @RequestParam Long lastId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                messageService.getMissedMessages(conversationId, currentUser.getId(), lastId));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Gửi tin nhắn (REST fallback)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * POST /api/messages
     * Idempotent: gửi lại cùng clientMessageId → trả về tin đã lưu, không tạo mới.
     */
    @PostMapping
    public ResponseEntity<MessageResponse> sendMessage(
            @Valid @RequestBody SendMessageRequest req,
            @AuthenticationPrincipal User currentUser) {
        MessageResponse response = messageService.sendMessage(currentUser.getId(), req);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Sửa / Xoá
    // ──────────────────────────────────────────────────────────────────────

    /** PATCH /api/messages/{id} – sửa nội dung (chỉ chủ sở hữu, chỉ tin TEXT) */
    @PatchMapping("/{id}")
    public ResponseEntity<MessageResponse> editMessage(
            @PathVariable Long id,
            @Valid @RequestBody EditMessageRequest req,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                messageService.editMessage(id, currentUser.getId(), req));
    }

    /** DELETE /api/messages/{id} – soft-delete (chỉ chủ sở hữu) */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMessage(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        messageService.deleteMessage(id, currentUser.getId());
        return ResponseEntity.noContent().build();
    }
}

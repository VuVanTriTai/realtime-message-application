package com.project.realtime._messaging_application.modules.Conversation.controller;

import com.project.realtime._messaging_application.modules.Conversation.dto.*;
import com.project.realtime._messaging_application.modules.Conversation.service.ConversationService;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST API cho module Conversation.
 *
 * Base path: /api/conversations
 *
 * Endpoints:
 *   GET    /api/conversations              – danh sách chat của tôi
 *   POST   /api/conversations/direct       – tạo / lấy conversation DIRECT
 *   POST   /api/conversations/group        – tạo conversation GROUP
 *   GET    /api/conversations/{id}/members – danh sách thành viên
 *   POST   /api/conversations/{id}/members – thêm thành viên (admin/owner)
 *   DELETE /api/conversations/{id}/members/{userId} – kick thành viên (admin/owner)
 *   PATCH  /api/conversations/{id}/read   – đánh dấu đã đọc
 */
@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private final ConversationService conversationService;

    public ConversationController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Danh sách chat
    // ──────────────────────────────────────────────────────────────────────

    /** GET /api/conversations – lấy danh sách cuộc trò chuyện của user hiện tại */
    @GetMapping
    public ResponseEntity<List<ConversationSummaryResponse>> getMyConversations(
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                conversationService.getMyConversations(currentUser.getId()));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Tạo conversation
    // ──────────────────────────────────────────────────────────────────────

    /** POST /api/conversations/direct – tạo hoặc lấy lại conversation 1-1 */
    @PostMapping("/direct")
    public ResponseEntity<ConversationSummaryResponse> createOrGetDirect(
            @AuthenticationPrincipal User currentUser,
            @Valid @RequestBody CreateDirectConversationRequest req) {
        return ResponseEntity.status(HttpStatus.OK)
                .body(conversationService.getOrCreateDirect(currentUser.getId(), req));
    }

    /** POST /api/conversations/group – tạo nhóm chat */
    @PostMapping("/group")
    public ResponseEntity<ConversationSummaryResponse> createGroup(
            @AuthenticationPrincipal User currentUser,
            @Valid @RequestBody CreateGroupConversationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(conversationService.createGroup(currentUser.getId(), req));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Thành viên
    // ──────────────────────────────────────────────────────────────────────

    /** GET /api/conversations/{id}/members */
    @GetMapping("/{id}/members")
    public ResponseEntity<List<ConversationMemberResponse>> getMembers(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                conversationService.getMembers(id, currentUser.getId()));
    }

    /** POST /api/conversations/{id}/members – thêm thành viên */
    @PostMapping("/{id}/members")
    public ResponseEntity<Void> addMember(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser,
            @RequestParam Long userId) {
        conversationService.addMember(id, currentUser.getId(), userId);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    /** DELETE /api/conversations/{id}/members/{userId} – kick thành viên */
    @DeleteMapping("/{id}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable Long id,
            @PathVariable Long userId,
            @AuthenticationPrincipal User currentUser) {
        conversationService.removeMember(id, currentUser.getId(), userId);
        return ResponseEntity.noContent().build();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Đánh dấu đã đọc
    // ──────────────────────────────────────────────────────────────────────

    /**
     * PATCH /api/conversations/{id}/read?messageId=xxx
     * Đánh dấu đã đọc đến tin nhắn có id = messageId.
     */
    @PatchMapping("/{id}/read")
    public ResponseEntity<Void> markRead(
            @PathVariable Long id,
            @RequestParam Long messageId,
            @AuthenticationPrincipal User currentUser) {
        conversationService.markRead(id, currentUser.getId(), messageId);
        return ResponseEntity.noContent().build();
    }
}

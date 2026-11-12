package com.project.realtime._messaging_application.modules.Conversation.controller;

import com.project.realtime._messaging_application.modules.Conversation.dto.*;
import com.project.realtime._messaging_application.modules.Conversation.service.ConversationService;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.modules.Message.service.MessageService;
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
 *   GET    /api/conversations                        – danh sách chat của tôi
 *   POST   /api/conversations/direct                 – tạo / lấy conversation DIRECT
 *   POST   /api/conversations/group                  – tạo conversation GROUP
 *   GET    /api/conversations/{id}/members           – danh sách thành viên
 *   POST   /api/conversations/{id}/members           – thêm thành viên (admin/owner)
 *   DELETE /api/conversations/{id}/members/{userId}  – kick thành viên (admin/owner)
 *   PATCH  /api/conversations/{id}/read             – đánh dấu đã đọc
 *   POST   /api/conversations/{id}/invite-link       – tạo/lấy invite link (admin/owner)
 *   POST   /api/conversations/{id}/invite-link/reset – làm mới invite link (owner)
 *   GET    /api/conversations/invite/{token}/preview – xem preview nhóm (PUBLIC)
 *   POST   /api/conversations/invite/{token}/join    – tham gia nhóm qua token (auth)
 */
@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private final ConversationService conversationService;
    private final MessageService messageService;

    public ConversationController(ConversationService conversationService,
                                  MessageService messageService) {
        this.conversationService = conversationService;
        this.messageService = messageService;
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

    /**
     * GET /api/conversations/{id}/messages
     * - afterSeq có giá trị: Gap Detection Sync (lấy các tin có seq > afterSeq)
     * - cursor có giá trị: lấy 50 tin cũ hơn cursor (cuộn lên)
     * - không param: lấy 50 tin mới nhất
     */
    @GetMapping("/{id}/messages")
    public ResponseEntity<List<MessageResponse>> getConversationMessages(
            @PathVariable Long id,
            @RequestParam(required = false) Long afterSeq,
            @RequestParam(required = false) Long cursor,
            @AuthenticationPrincipal User currentUser) {
        if (afterSeq != null) {
            return ResponseEntity.ok(
                    messageService.getMissedMessagesBySeq(id, currentUser.getId(), afterSeq));
        }
        return ResponseEntity.ok(
                messageService.getHistory(id, currentUser.getId(), cursor));
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

    /**
     * POST /api/conversations/{id}/leave – tự rời nhóm
     * Body (optional): { "newOwnerId": 123 } – bắt buộc nếu người rời là OWNER
     */
    @PostMapping("/{id}/leave")
    public ResponseEntity<Void> leaveGroup(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser,
            @RequestBody(required = false) LeaveGroupRequest req) {
        Long newOwnerId = (req != null) ? req.newOwnerId() : null;
        conversationService.leaveGroup(id, currentUser.getId(), newOwnerId);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/conversations/{id}/transfer-owner – chuyển quyền Owner
     * Body: { "newOwnerId": 123 }
     */
    @PostMapping("/{id}/transfer-owner")
    public ResponseEntity<Void> transferOwnership(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser,
            @RequestBody TransferOwnerRequest req) {
        conversationService.transferOwnership(id, currentUser.getId(), req.newOwnerId());
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

    // ──────────────────────────────────────────────────────────────────────
    // Group Invite Link
    // ──────────────────────────────────────────────────────────────────────

    /**
     * POST /api/conversations/{id}/invite-link
     * Tạo hoặc lấy lại invite link. Chỉ Admin/Owner mới được gọi.
     */
    @PostMapping("/{id}/invite-link")
    public ResponseEntity<InviteLinkResponse> generateInviteLink(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(conversationService.generateInviteLink(id, currentUser.getId()));
    }

    /**
     * POST /api/conversations/{id}/invite-link/reset
     * Làm mới (thu hồi) invite link cũ và tạo link mới. Chỉ Owner mới được gọi.
     */
    @PostMapping("/{id}/invite-link/reset")
    public ResponseEntity<InviteLinkResponse> resetInviteLink(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(conversationService.resetInviteLink(id, currentUser.getId()));
    }

    /**
     * GET /api/conversations/invite/{token}/preview
     * Xem thông tin preview nhóm theo token. PUBLIC — không cần xác thực.
     * Cần được permit trong SecurityConfig.
     */
    @GetMapping("/invite/{token}/preview")
    public ResponseEntity<GroupPreviewResponse> getGroupPreview(
            @PathVariable String token) {
        return ResponseEntity.ok(conversationService.getGroupPreview(token));
    }

    /**
     * POST /api/conversations/invite/{token}/join
     * Tham gia nhóm theo token. Cần xác thực.
     */
    @PostMapping("/invite/{token}/join")
    public ResponseEntity<ConversationSummaryResponse> joinByToken(
            @PathVariable String token,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(conversationService.joinByToken(token, currentUser.getId()));
    }
}

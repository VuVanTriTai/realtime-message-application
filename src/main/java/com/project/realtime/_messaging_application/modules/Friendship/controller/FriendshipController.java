package com.project.realtime._messaging_application.modules.Friendship.controller;

import com.project.realtime._messaging_application.modules.Friendship.dto.FriendshipResponse;
import com.project.realtime._messaging_application.modules.Friendship.dto.SendFriendRequestDto;
import com.project.realtime._messaging_application.modules.Friendship.service.FriendshipService;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST API cho module Friendship.
 *
 * Base path: /api/friends
 *
 * Endpoints:
 *   GET    /api/friends                     – danh sách bạn bè (ACCEPTED)
 *   GET    /api/friends/requests/received   – lời mời tôi nhận được (PENDING)
 *   GET    /api/friends/requests/sent       – lời mời tôi đã gửi (PENDING)
 *   GET    /api/friends/blocked             – danh sách đã chặn
 *
 *   POST   /api/friends/requests            – gửi lời mời kết bạn
 *   PATCH  /api/friends/requests/{id}/accept   – chấp nhận lời mời
 *   PATCH  /api/friends/requests/{id}/decline  – từ chối lời mời
 *   DELETE /api/friends/requests/{id}          – huỷ lời mời đã gửi
 *
 *   DELETE /api/friends/{friendId}          – huỷ kết bạn (unfriend)
 *
 *   POST   /api/friends/block/{targetId}    – chặn user
 *   DELETE /api/friends/block/{targetId}    – bỏ chặn user
 */
@RestController
@RequestMapping("/api/friends")
public class FriendshipController {

    private final FriendshipService friendshipService;

    public FriendshipController(FriendshipService friendshipService) {
        this.friendshipService = friendshipService;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Danh sách
    // ──────────────────────────────────────────────────────────────────────

    /** GET /api/friends – danh sách bạn bè đã ACCEPTED */
    @GetMapping
    public ResponseEntity<List<FriendshipResponse>> getFriends(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.ok(friendshipService.getFriends(user.getId()));
    }

    /** GET /api/friends/requests/received – lời mời tôi nhận được */
    @GetMapping("/requests/received")
    public ResponseEntity<List<FriendshipResponse>> getPendingReceived(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.ok(friendshipService.getPendingReceived(user.getId()));
    }

    /** GET /api/friends/requests/sent – lời mời tôi đã gửi */
    @GetMapping("/requests/sent")
    public ResponseEntity<List<FriendshipResponse>> getPendingSent(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.ok(friendshipService.getPendingSent(user.getId()));
    }

    /** GET /api/friends/blocked – danh sách user tôi đã chặn */
    @GetMapping("/blocked")
    public ResponseEntity<List<FriendshipResponse>> getBlockedList(
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.ok(friendshipService.getBlockedList(user.getId()));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Gửi lời mời
    // ──────────────────────────────────────────────────────────────────────

    /** POST /api/friends/requests – gửi lời mời kết bạn */
    @PostMapping("/requests")
    public ResponseEntity<FriendshipResponse> sendRequest(
            @Valid @RequestBody SendFriendRequestDto req,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(friendshipService.sendRequest(user.getId(), req));
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phản hồi lời mời
    // ──────────────────────────────────────────────────────────────────────

    /** PATCH /api/friends/requests/{id}/accept – chấp nhận */
    @PatchMapping("/requests/{id}/accept")
    public ResponseEntity<FriendshipResponse> acceptRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.ok(friendshipService.acceptRequest(id, user.getId()));
    }

    /** PATCH /api/friends/requests/{id}/decline – từ chối */
    @PatchMapping("/requests/{id}/decline")
    public ResponseEntity<FriendshipResponse> declineRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.ok(friendshipService.declineRequest(id, user.getId()));
    }

    /** DELETE /api/friends/requests/{id} – huỷ lời mời đã gửi */
    @DeleteMapping("/requests/{id}")
    public ResponseEntity<Void> cancelRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        friendshipService.cancelRequest(id, user.getId());
        return ResponseEntity.noContent().build();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Unfriend
    // ──────────────────────────────────────────────────────────────────────

    /** DELETE /api/friends/{friendId} – huỷ kết bạn */
    @DeleteMapping("/{friendId}")
    public ResponseEntity<Void> unfriend(
            @PathVariable Long friendId,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        friendshipService.unfriend(user.getId(), friendId);
        return ResponseEntity.noContent().build();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Block / Unblock
    // ──────────────────────────────────────────────────────────────────────

    /** POST /api/friends/block/{targetId} – chặn user */
    @PostMapping("/block/{targetId}")
    public ResponseEntity<FriendshipResponse> blockUser(
            @PathVariable Long targetId,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        return ResponseEntity.ok(friendshipService.blockUser(user.getId(), targetId));
    }

    /** DELETE /api/friends/block/{targetId} – bỏ chặn */
    @DeleteMapping("/block/{targetId}")
    public ResponseEntity<Void> unblockUser(
            @PathVariable Long targetId,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = (User) userDetails;
        friendshipService.unblockUser(user.getId(), targetId);
        return ResponseEntity.noContent().build();
    }
}

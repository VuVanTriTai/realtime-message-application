package com.project.realtime._messaging_application.modules.User.controller;

import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.dto.UpdateProfileRequest;
import com.project.realtime._messaging_application.modules.User.dto.UserProfileResponse;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/profile")
    public ResponseEntity<UserProfileResponse> getProfile(@AuthenticationPrincipal User currentUser) {
        User user = userRepository.findById(currentUser.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        return ResponseEntity.ok(UserProfileResponse.fromEntity(user));
    }

    @PutMapping("/profile")
    public ResponseEntity<UserProfileResponse> updateProfile(
            @AuthenticationPrincipal User currentUser,
            @Valid @RequestBody UpdateProfileRequest request) {
        User user = userRepository.findById(currentUser.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (request.displayName() != null && !request.displayName().isBlank()) {
            user.setDisplayName(request.displayName().trim());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl().trim().isEmpty() ? null : request.avatarUrl().trim());
        }
        User saved = userRepository.save(user);
        return ResponseEntity.ok(UserProfileResponse.fromEntity(saved));
    }

    @GetMapping("/search")
    public ResponseEntity<List<UserProfileResponse>> searchUsers(
            @RequestParam("keyword") String keyword,
            @AuthenticationPrincipal User currentUser) {
        List<User> users = userRepository.searchActiveUsers(keyword);
        Long currentUserId = currentUser != null ? currentUser.getId() : null;
        List<UserProfileResponse> result = users.stream()
                .filter(u -> currentUserId == null || !u.getId().equals(currentUserId))
                .map(UserProfileResponse::fromEntityPublic)
                .toList();
        return ResponseEntity.ok(result);
    }
}

package com.project.realtime._messaging_application.modules.Admin.service;

import com.project.realtime._messaging_application.modules.Admin.dto.*;
import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationType;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationRepository;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.Role;
import com.project.realtime._messaging_application.modules.User.Entity.Status;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Set;

@Service
public class AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminService.class);

    private final UserRepository               userRepository;
    private final ConversationRepository       conversationRepository;
    private final ConversationMemberRepository conversationMemberRepository;
    private final MessageRepository            messageRepository;
    private final StringRedisTemplate          redisTemplate;

    public AdminService(UserRepository userRepository,
                        ConversationRepository conversationRepository,
                        ConversationMemberRepository conversationMemberRepository,
                        MessageRepository messageRepository,
                        StringRedisTemplate redisTemplate) {
        this.userRepository               = userRepository;
        this.conversationRepository       = conversationRepository;
        this.conversationMemberRepository = conversationMemberRepository;
        this.messageRepository            = messageRepository;
        this.redisTemplate                = redisTemplate;
    }

    /**
     * Lấy thống kê tổng quan hệ thống (KPIs)
     */
    @Transactional(readOnly = true)
    public AdminStatsResponse getStats() {
        long totalUsers         = userRepository.count();
        long activeUsers        = userRepository.countByStatus(Status.ACTIVE);
        long bannedUsers        = userRepository.countByStatus(Status.BANNED);
        long totalConversations = conversationRepository.count();
        long totalGroups        = conversationRepository.countByType(ConversationType.GROUP);
        long totalDirect        = conversationRepository.countByType(ConversationType.DIRECT);
        long totalMessages      = messageRepository.count();

        long onlineUsers = 0;
        try {
            Set<String> keys = redisTemplate.keys("presence:*");
            onlineUsers = keys != null ? keys.size() : 0;
        } catch (Exception e) {
            log.warn("Không thể đếm số user online từ Redis: {}", e.getMessage());
        }

        return new AdminStatsResponse(
                totalUsers,
                activeUsers,
                bannedUsers,
                totalConversations,
                totalGroups,
                totalDirect,
                totalMessages,
                onlineUsers
        );
    }

    /**
     * Tìm kiếm và phân trang danh sách người dùng cho Admin
     */
    @Transactional(readOnly = true)
    public Page<AdminUserResponse> getUsers(String search, Status status, Role role, Pageable pageable) {
        return userRepository.searchUsersForAdmin(search, status, role, pageable)
                .map(AdminUserResponse::fromEntity);
    }

    /**
     * Cập nhật trạng thái tài khoản (Khóa / Mở khóa)
     */
    @Transactional
    public AdminUserResponse updateUserStatus(Long userId, UpdateUserStatusRequest req, String currentAdminUsername) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy người dùng với ID: " + userId));

        if (user.getUsername().equalsIgnoreCase(currentAdminUsername)) {
            throw new IllegalArgumentException("Bạn không thể tự khóa tài khoản của chính mình!");
        }

        Status newStatus = Status.valueOf(req.status().toUpperCase());
        user.setStatus(newStatus);

        if (newStatus == Status.BANNED) {
            user.setBannedAt(Instant.now());
            user.setBanReason(req.reason() != null && !req.reason().isBlank() ? req.reason() : "Vi phạm tiêu chuẩn cộng đồng");
            log.info("Admin {} đã khóa tài khoản {} (ID: {}) với lý do: {}",
                    currentAdminUsername, user.getUsername(), user.getId(), user.getBanReason());
        } else {
            user.setBannedAt(null);
            user.setBanReason(null);
            log.info("Admin {} đã mở khóa tài khoản {} (ID: {})",
                    currentAdminUsername, user.getUsername(), user.getId());
        }

        User saved = userRepository.save(user);
        return AdminUserResponse.fromEntity(saved);
    }

    /**
     * Cập nhật vai trò tài khoản (USER <-> ADMIN)
     */
    @Transactional
    public AdminUserResponse updateUserRole(Long userId, UpdateUserRoleRequest req, String currentAdminUsername) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy người dùng với ID: " + userId));

        if (user.getUsername().equalsIgnoreCase(currentAdminUsername) && "USER".equalsIgnoreCase(req.role())) {
            throw new IllegalArgumentException("Bạn không thể tự hạ quyền Admin của chính mình!");
        }

        Role newRole = Role.valueOf(req.role().toUpperCase());
        user.setRole(newRole);

        log.info("Admin {} đã đổi vai trò của user {} (ID: {}) thành {}",
                currentAdminUsername, user.getUsername(), user.getId(), newRole);

        User saved = userRepository.save(user);
        return AdminUserResponse.fromEntity(saved);
    }

    /**
     * Tìm kiếm và phân trang danh sách cuộc trò chuyện cho Admin
     */
    @Transactional(readOnly = true)
    public Page<AdminConversationResponse> getConversations(String search, ConversationType type, Pageable pageable) {
        return conversationRepository.searchConversationsForAdmin(search, type, pageable)
                .map(conv -> {
                    long memberCount = conversationMemberRepository.countByConversationId(conv.getId());
                    return AdminConversationResponse.fromEntity(conv, memberCount);
                });
    }

    /**
     * Xóa / Giải tán một cuộc trò chuyện bởi Admin
     */
    @Transactional
    public void deleteConversation(Long conversationId, String currentAdminUsername) {
        Conversation conv = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy cuộc trò chuyện với ID: " + conversationId));

        log.warn("Admin {} đang xóa cuộc trò chuyện ID: {} (Tên: {}, Loại: {})",
                currentAdminUsername, conv.getId(), conv.getName(), conv.getType());

        // 1. Gỡ lastMessageId để tránh foreign key circular constraint
        conv.setLastMessageId(null);
        conversationRepository.saveAndFlush(conv);

        // 2. Xóa toàn bộ tin nhắn
        messageRepository.deleteByConversationId(conversationId);

        // 3. Xóa thành viên
        conversationMemberRepository.deleteByConversationId(conversationId);

        // 4. Xóa conversation
        conversationRepository.delete(conv);
    }
}

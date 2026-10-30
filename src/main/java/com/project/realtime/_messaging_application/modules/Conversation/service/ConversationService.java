package com.project.realtime._messaging_application.modules.Conversation.service;

import com.project.realtime._messaging_application.modules.Conversation.dto.*;
import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Conversation.entity.MemberRole;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationRepository;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import com.project.realtime._messaging_application.websocket.PresenceService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ConversationService {

    private final ConversationRepository       conversationRepo;
    private final ConversationMemberRepository memberRepo;
    private final UserRepository               userRepo;
    private final MessageRepository            messageRepo;
    private final PresenceService              presenceService;

    public ConversationService(ConversationRepository conversationRepo,
                               ConversationMemberRepository memberRepo,
                               UserRepository userRepo,
                               MessageRepository messageRepo,
                               PresenceService presenceService) {
        this.conversationRepo = conversationRepo;
        this.memberRepo       = memberRepo;
        this.userRepo         = userRepo;
        this.messageRepo      = messageRepo;
        this.presenceService  = presenceService;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Lấy danh sách chat của user hiện tại
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Trả về danh sách cuộc trò chuyện của user, sắp xếp theo tin nhắn mới nhất.
     * Kèm unread count cho từng conversation.
     */
    public List<ConversationSummaryResponse> getMyConversations(Long userId) {
        List<Conversation> conversations = conversationRepo.findAllByMemberUserId(userId);

        List<ConversationSummaryResponse> result = new ArrayList<>();
        for (Conversation conv : conversations) {
            ConversationMember membership = memberRepo
                    .findByConversationIdAndUserId(conv.getId(), userId)
                    .orElse(null);

            long lastReadId  = (membership != null && membership.getLastReadMessageId() != null)
                    ? membership.getLastReadMessageId() : 0L;
            long unreadCount = messageRepo.countUnread(conv.getId(), userId, lastReadId);

            if (conv.isDirect()) {
                // [ADDED] Voi DIRECT: lay thong tin nguoi kia va trang thai online
                User otherUser = memberRepo.findAllByConversationIdWithUser(conv.getId())
                        .stream()
                        .map(cm -> cm.getUser())
                        .filter(u -> !u.getId().equals(userId))
                        .findFirst()
                        .orElse(null);

                if (otherUser != null) {
                    boolean isOnline = presenceService.isOnline(otherUser.getId());
                    Message lastMsg = conv.getLastMessageId() != null
                            ? messageRepo.findById(conv.getLastMessageId()).orElse(null)
                            : null;
                    result.add(ConversationSummaryResponse.fromEntityWithOtherUser(
                            conv, membership, unreadCount, otherUser, isOnline, lastMsg));
                } else {
                    Message lastMsg = conv.getLastMessageId() != null
                            ? messageRepo.findById(conv.getLastMessageId()).orElse(null)
                            : null;
                    result.add(ConversationSummaryResponse.fromEntity(conv, membership, unreadCount, lastMsg));
                }
            } else {
                // GROUP: dung fromEntity binh thuong
                Message lastMsg = conv.getLastMessageId() != null
                        ? messageRepo.findById(conv.getLastMessageId()).orElse(null)
                        : null;
                result.add(ConversationSummaryResponse.fromEntity(conv, membership, unreadCount, lastMsg));
            }
        }
        return result;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Tạo cuộc trò chuyện DIRECT
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tạo (hoặc lấy lại nếu đã tồn tại) conversation DIRECT giữa 2 user.
     * Dùng direct_key để đảm bảo idempotent – không tạo duplicate.
     */
    @Transactional
    public ConversationSummaryResponse getOrCreateDirect(Long currentUserId,
                                                          CreateDirectConversationRequest req) {
        if (currentUserId.equals(req.targetUserId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Không thể tạo cuộc trò chuyện với chính mình");
        }

        String directKey = Conversation.buildDirectKey(currentUserId, req.targetUserId());

        // Nếu đã tồn tại → trả về luôn
        return conversationRepo.findByDirectKey(directKey)
                .map(conv -> {
                    ConversationMember myMembership = memberRepo
                            .findByConversationIdAndUserId(conv.getId(), currentUserId)
                            .orElse(null);
                    Message existingLastMsg = conv.getLastMessageId() != null
                            ? messageRepo.findById(conv.getLastMessageId()).orElse(null)
                            : null;
                    User otherUser2 = memberRepo.findAllByConversationIdWithUser(conv.getId())
                            .stream()
                            .map(cm -> cm.getUser())
                            .filter(u -> !u.getId().equals(currentUserId))
                            .findFirst()
                            .orElse(null);
                    if (otherUser2 != null) {
                        boolean isOnline2 = presenceService.isOnline(otherUser2.getId());
                        return ConversationSummaryResponse.fromEntityWithOtherUser(
                                conv, myMembership, 0L, otherUser2, isOnline2, existingLastMsg);
                    }
                    return ConversationSummaryResponse.fromEntity(conv, myMembership, 0L, existingLastMsg);
                })
                .orElseGet(() -> {
                    // Chưa tồn tại → tạo mới
                    User me     = getUserOrThrow(currentUserId);
                    User target = getUserOrThrow(req.targetUserId());

                    Conversation conv = Conversation.createDirect(me, target.getId());
                    conversationRepo.save(conv);

                    // Thêm cả 2 người dùng vào conversation
                    memberRepo.save(ConversationMember.create(conv, me,     MemberRole.MEMBER));
                    memberRepo.save(ConversationMember.create(conv, target, MemberRole.MEMBER));

                    ConversationMember myMembership = memberRepo
                            .findByConversationIdAndUserId(conv.getId(), currentUserId)
                            .orElseThrow();
                    // [ADDED] Tra ve thong tin nguoi kia
                    boolean isOnline = presenceService.isOnline(target.getId());
                    return ConversationSummaryResponse.fromEntityWithOtherUser(
                            conv, myMembership, 0L, target, isOnline, null);
                });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Tạo nhóm chat
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ConversationSummaryResponse createGroup(Long currentUserId,
                                                    CreateGroupConversationRequest req) {
        User creator = getUserOrThrow(currentUserId);

        Conversation conv = Conversation.createGroup(creator, req.name());
        conversationRepo.save(conv);

        // Người tạo → OWNER
        memberRepo.save(ConversationMember.create(conv, creator, MemberRole.OWNER));

        // Thêm các thành viên khác → MEMBER
        List<User> members = userRepo.findAllByIdInAndNotDeleted(req.memberIds());
        for (User member : members) {
            if (!member.getId().equals(currentUserId)) {
                memberRepo.save(ConversationMember.create(conv, member, MemberRole.MEMBER));
            }
        }

        ConversationMember myMembership = memberRepo
                .findByConversationIdAndUserId(conv.getId(), currentUserId)
                .orElseThrow();
        return ConversationSummaryResponse.fromEntity(conv, myMembership, 0L, null);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Thành viên
    // ──────────────────────────────────────────────────────────────────────

    /** Lấy danh sách thành viên của một conversation */
    public List<ConversationMemberResponse> getMembers(Long conversationId, Long currentUserId) {
        assertMember(conversationId, currentUserId);
        return memberRepo.findAllByConversationIdWithUser(conversationId)
                .stream()
                .map(ConversationMemberResponse::fromEntity)
                .toList();
    }

    /**
     * Thêm thành viên vào nhóm (chỉ ADMIN/OWNER mới được phép).
     */
    @Transactional
    public void addMember(Long conversationId, Long requesterId, Long newUserId) {
        assertAdminOrOwner(conversationId, requesterId);

        Conversation conv    = getConversationOrThrow(conversationId);
        User         newUser = getUserOrThrow(newUserId);

        boolean alreadyMember = memberRepo
                .findByConversationIdAndUserId(conversationId, newUserId)
                .isPresent();
        if (alreadyMember) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User đã là thành viên");
        }

        memberRepo.save(ConversationMember.create(conv, newUser, MemberRole.MEMBER));
    }

    /**
     * Xoá thành viên (kick). OWNER có thể kick ADMIN/MEMBER; ADMIN chỉ kick MEMBER.
     */
    @Transactional
    public void removeMember(Long conversationId, Long requesterId, Long targetUserId) {
        assertAdminOrOwner(conversationId, requesterId);
        // Không thể tự kick chính mình qua endpoint này
        if (requesterId.equals(targetUserId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Dùng API rời nhóm để tự thoát");
        }
        memberRepo.deleteByConversationIdAndUserId(conversationId, targetUserId);
    }

    /** Đánh dấu đã đọc đến messageId */
    @Transactional
    public void markRead(Long conversationId, Long userId, Long messageId) {
        assertMember(conversationId, userId);
        memberRepo.markRead(conversationId, userId, messageId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────

    private Conversation getConversationOrThrow(Long id) {
        return conversationRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Không tìm thấy cuộc trò chuyện"));
    }

    private User getUserOrThrow(Long id) {
        return userRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Không tìm thấy người dùng"));
    }

    private void assertMember(Long conversationId, Long userId) {
        if (!conversationRepo.isMember(conversationId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Bạn không phải thành viên của cuộc trò chuyện này");
        }
    }

    private void assertAdminOrOwner(Long conversationId, Long userId) {
        ConversationMember cm = memberRepo
                .findByConversationIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN, "Bạn không phải thành viên"));
        if (!cm.isAdmin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Chỉ Admin hoặc Owner mới có quyền thực hiện thao tác này");
        }
    }
}

package com.project.realtime._messaging_application.modules.Conversation.service;

import com.project.realtime._messaging_application.modules.Conversation.dto.*;
import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Conversation.entity.MemberRole;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationRepository;
import com.project.realtime._messaging_application.modules.Friendship.entity.FriendshipStatus;
import com.project.realtime._messaging_application.modules.Friendship.repository.FriendshipRepository;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import com.project.realtime._messaging_application.websocket.PresenceService;
import com.project.realtime._messaging_application.websocket.pubsub.RedisEventType;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ConversationService {

    private static final String FRONTEND_BASE_URL   = "http://localhost:5173";
    private static final int    MAX_GROUP_MEMBERS    = 500;

    private final ConversationRepository       conversationRepo;
    private final ConversationMemberRepository memberRepo;
    private final UserRepository               userRepo;
    private final MessageRepository            messageRepo;
    private final PresenceService              presenceService;
    private final FriendshipRepository         friendshipRepo;
    private final RedisMessagePublisher        redisPublisher;

    public ConversationService(ConversationRepository conversationRepo,
                               ConversationMemberRepository memberRepo,
                               UserRepository userRepo,
                               MessageRepository messageRepo,
                               PresenceService presenceService,
                               FriendshipRepository friendshipRepo,
                               RedisMessagePublisher redisPublisher) {
        this.conversationRepo = conversationRepo;
        this.memberRepo       = memberRepo;
        this.userRepo         = userRepo;
        this.messageRepo      = messageRepo;
        this.presenceService  = presenceService;
        this.friendshipRepo   = friendshipRepo;
        this.redisPublisher   = redisPublisher;
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

            long lastReadId = 0L;
            if (membership != null) {
                if (membership.getLastReadMessageId() != null) {
                    lastReadId = membership.getLastReadMessageId();
                } else if (conv.isGroup() && conv.getLastMessageId() != null) {
                    // Thành viên nhóm chưa có lastReadMessageId (ví dụ mới vào nhóm)
                    // -> Coi như đã đọc các tin trước khi vào nhóm để tránh tính unread quá khứ
                    lastReadId = conv.getLastMessageId();
                }
            }
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
                    boolean areFriends = friendshipRepo
                            .findBetweenWithStatus(userId, otherUser.getId(), FriendshipStatus.ACCEPTED)
                            .isPresent();
                    boolean isStranger = !areFriends;
                    Message lastMsg = conv.getLastMessageId() != null
                            ? messageRepo.findById(conv.getLastMessageId()).orElse(null)
                            : null;
                    result.add(ConversationSummaryResponse.fromEntityWithOtherUser(
                            conv, membership, unreadCount, otherUser, isOnline, isStranger, lastMsg));
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
                        boolean areFriends2 = friendshipRepo
                                .findBetweenWithStatus(currentUserId, otherUser2.getId(), FriendshipStatus.ACCEPTED)
                                .isPresent();
                        return ConversationSummaryResponse.fromEntityWithOtherUser(
                                conv, myMembership, 0L, otherUser2, isOnline2, !areFriends2, existingLastMsg);
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
                    boolean areFriends = friendshipRepo
                            .findBetweenWithStatus(currentUserId, target.getId(), FriendshipStatus.ACCEPTED)
                            .isPresent();

                    // Bắn realtime cho target user qua WebSocket cá nhân
                    try {
                        ConversationMember targetMembership = memberRepo
                                .findByConversationIdAndUserId(conv.getId(), target.getId())
                                .orElse(null);
                        boolean meOnline = presenceService.isOnline(me.getId());
                        ConversationSummaryResponse targetSummary = ConversationSummaryResponse.fromEntityWithOtherUser(
                                conv, targetMembership, 0L, me, meOnline, !areFriends, null);
                        redisPublisher.publishToUser(target.getId(), RedisEventType.CONVERSATION_JOINED,
                                UserConversationEvent.joined(targetSummary));
                    } catch (Exception ignored) {}

                    return ConversationSummaryResponse.fromEntityWithOtherUser(
                            conv, myMembership, 0L, target, isOnline, !areFriends, null);
                });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Tạo nhóm chat
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ConversationSummaryResponse createGroup(Long currentUserId,
                                                    CreateGroupConversationRequest req) {
        User creator = getUserOrThrow(currentUserId);

        // Kiểm tra số lượng thành viên ban đầu (creator + members) không vượt giới hạn
        int initialSize = 1 + (req.memberIds() == null ? 0 : (int) req.memberIds().stream()
                .filter(id -> !id.equals(currentUserId)).count());
        if (initialSize > MAX_GROUP_MEMBERS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nhóm không được vượt quá " + MAX_GROUP_MEMBERS + " thành viên");
        }

        Conversation conv = Conversation.createGroup(creator, req.name());
        conversationRepo.save(conv);

        // Người tạo → OWNER
        memberRepo.save(ConversationMember.create(conv, creator, MemberRole.OWNER));

        // Thêm các thành viên khác → MEMBER
        List<User> members = userRepo.findAllByIdInAndNotDeleted(req.memberIds());
        for (User member : members) {
            if (!member.getId().equals(currentUserId)) {
                ConversationMember cm = ConversationMember.create(conv, member, MemberRole.MEMBER);
                memberRepo.save(cm);

                try {
                    ConversationSummaryResponse memberSummary = ConversationSummaryResponse.fromEntity(conv, cm, 0L, null);
                    redisPublisher.publishToUser(member.getId(), RedisEventType.CONVERSATION_JOINED,
                            UserConversationEvent.joined(memberSummary));
                } catch (Exception ignored) {}
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

        // Kiểm tra giới hạn thành viên nhóm
        int currentCount = memberRepo.countByConversationId(conversationId);
        if (currentCount >= MAX_GROUP_MEMBERS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nhóm đã đạt giới hạn " + MAX_GROUP_MEMBERS + " thành viên");
        }

        ConversationMember newMember = ConversationMember.create(conv, newUser, MemberRole.MEMBER);
        memberRepo.save(newMember);

        // Bắn WebSocket realtime tới user vừa được thêm vào nhóm
        try {
            Message lastMsg = conv.getLastMessageId() != null
                    ? messageRepo.findById(conv.getLastMessageId()).orElse(null)
                    : null;
            ConversationSummaryResponse summary = ConversationSummaryResponse.fromEntity(conv, newMember, 0L, lastMsg);
            redisPublisher.publishToUser(newUserId, RedisEventType.CONVERSATION_JOINED,
                    UserConversationEvent.joined(summary));
        } catch (Exception ignored) {}
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

        // Bắn WebSocket thông báo cho user bị kick
        try {
            redisPublisher.publishToUser(targetUserId, RedisEventType.CONVERSATION_LEFT,
                    UserConversationEvent.left(conversationId));
        } catch (Exception ignored) {}
    }

    /**
     * Thành viên tự rời nhóm (leave group).
     * Nếu người rời là OWNER và còn thành viên khác → phải chỉ định newOwnerId.
     * Nếu người rời là thành viên cuối cùng → xoá luôn conversation.
     */
    @Transactional
    public void leaveGroup(Long conversationId, Long userId, Long newOwnerId) {
        Conversation conv = getConversationOrThrow(conversationId);
        if (conv.isDirect()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Không thể rời cuộc trò chuyện 1-1");
        }

        ConversationMember myMember = memberRepo.findByConversationIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Bạn không phải thành viên của nhóm này"));

        int memberCount = memberRepo.countByConversationId(conversationId);

        if (memberCount == 1) {
            // Người cuối cùng rời → xoá conversation
            memberRepo.deleteByConversationIdAndUserId(conversationId, userId);
            conversationRepo.delete(conv);
            return;
        }

        // Nếu là OWNER phải chỉ định người kế tiếp
        if (myMember.isOwner()) {
            if (newOwnerId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Owner phải chỉ định thành viên kế tiếp trước khi rời nhóm");
            }
            if (newOwnerId.equals(userId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Không thể chuyển quyền Owner cho chính mình");
            }
            // Đảm bảo người được chỉ định là thành viên
            memberRepo.findByConversationIdAndUserId(conversationId, newOwnerId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Người được chỉ định không phải thành viên của nhóm"));
            memberRepo.updateRole(conversationId, newOwnerId, MemberRole.OWNER);
        }

        // Xoá membership của người rời
        memberRepo.deleteByConversationIdAndUserId(conversationId, userId);
    }

    /**
     * Chuyển quyền Owner cho thành viên khác (chỉ OWNER hiện tại có quyền).
     */
    @Transactional
    public void transferOwnership(Long conversationId, Long requesterId, Long newOwnerId) {
        ConversationMember requesterMember = memberRepo
                .findByConversationIdAndUserId(conversationId, requesterId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Bạn không phải thành viên"));

        if (!requesterMember.isOwner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Chỉ Owner mới có thể chuyển quyền Owner");
        }

        if (requesterId.equals(newOwnerId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bạn đã là Owner");
        }

        memberRepo.findByConversationIdAndUserId(conversationId, newOwnerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Người được chỉ định không phải thành viên"));

        // Hạ requester xuống MEMBER, thăng newOwner lên OWNER
        memberRepo.updateRole(conversationId, requesterId, MemberRole.MEMBER);
        memberRepo.updateRole(conversationId, newOwnerId, MemberRole.OWNER);
    }

    /** Đánh dấu đã đọc đến messageId */
    @Transactional
    public void markRead(Long conversationId, Long userId, Long messageId) {
        assertMember(conversationId, userId);
        memberRepo.markRead(conversationId, userId, messageId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Group Invite Link
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Tạo hoặc lấy lại invite link cho nhóm.
     * Chỉ Admin/Owner của nhóm mới được tạo link.
     */
    @Transactional
    public InviteLinkResponse generateInviteLink(Long conversationId, Long requesterId) {
        Conversation conv = getConversationOrThrow(conversationId);
        if (!conv.isGroup()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Chỉ nhóm mới có thể tạo link mời");
        }
        assertAdminOrOwner(conversationId, requesterId);

        // Nếu chưa có token thì tạo mới, đã có thì trả về luôn
        if (conv.getInviteToken() == null) {
            conv.generateAndSetInviteToken();
            conversationRepo.save(conv);
        }

        String inviteUrl = FRONTEND_BASE_URL + "/join/" + conv.getInviteToken();
        return new InviteLinkResponse(conv.getInviteToken(), inviteUrl);
    }

    /**
     * Làm mới (reset) invite token — thu hồi link cũ, tạo link mới.
     * Chỉ Owner mới được phép reset.
     */
    @Transactional
    public InviteLinkResponse resetInviteLink(Long conversationId, Long requesterId) {
        Conversation conv = getConversationOrThrow(conversationId);
        if (!conv.isGroup()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Chỉ nhóm mới có thể tạo link mời");
        }
        ConversationMember cm = memberRepo.findByConversationIdAndUserId(conversationId, requesterId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không phải thành viên"));
        if (!cm.isOwner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Chỉ Owner mới có thể làm mới link mời");
        }
        conv.generateAndSetInviteToken();
        conversationRepo.save(conv);
        String inviteUrl = FRONTEND_BASE_URL + "/join/" + conv.getInviteToken();
        return new InviteLinkResponse(conv.getInviteToken(), inviteUrl);
    }

    /**
     * Xem trước thông tin nhóm theo invite token (PUBLIC, không cần xác thực).
     */
    public GroupPreviewResponse getGroupPreview(String token) {
        Conversation conv = conversationRepo.findByInviteToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Link mời không hợp lệ hoặc đã hết hạn"));
        if (!conv.isGroup()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Link mời không hợp lệ");
        }
        int memberCount = memberRepo.countByConversationId(conv.getId());
        String createdByName = conv.getCreatedBy() != null
                ? (conv.getCreatedBy().getDisplayName() != null
                   ? conv.getCreatedBy().getDisplayName()
                   : conv.getCreatedBy().getUsername())
                : "Ẩn danh";
        return new GroupPreviewResponse(conv.getId(), conv.getName(), memberCount, createdByName);
    }

    /**
     * Tham gia nhóm bằng invite token.
     * Nếu đã là thành viên → trả về thông tin conversation như thường.
     */
    @Transactional
    public ConversationSummaryResponse joinByToken(String token, Long userId) {
        Conversation conv = conversationRepo.findByInviteToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Link mời không hợp lệ hoặc đã hết hạn"));
        if (!conv.isGroup()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Link mời không hợp lệ");
        }

        User user = getUserOrThrow(userId);

        // Nếu đã là member → trả về conversation luôn (idempotent)
        boolean alreadyMember = memberRepo.findByConversationIdAndUserId(conv.getId(), userId).isPresent();
        if (!alreadyMember) {
            // Kiểm tra giới hạn thành viên nhóm trước khi tham gia
            int currentCount = memberRepo.countByConversationId(conv.getId());
            if (currentCount >= MAX_GROUP_MEMBERS) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Nhóm đã đạt giới hạn " + MAX_GROUP_MEMBERS + " thành viên");
            }
            memberRepo.save(ConversationMember.create(conv, user, MemberRole.MEMBER));
        }

        ConversationMember myMembership = memberRepo
                .findByConversationIdAndUserId(conv.getId(), userId)
                .orElseThrow();
        Message lastMsg = conv.getLastMessageId() != null
                ? messageRepo.findById(conv.getLastMessageId()).orElse(null)
                : null;
        long unreadCount = messageRepo.countUnread(conv.getId(), userId,
                myMembership.getLastReadMessageId() != null ? myMembership.getLastReadMessageId() : 0L);

        return ConversationSummaryResponse.fromEntity(conv, myMembership, unreadCount, lastMsg);
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

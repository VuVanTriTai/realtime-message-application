package com.project.realtime._messaging_application.modules.Friendship.service;

import com.project.realtime._messaging_application.modules.Friendship.dto.FriendshipResponse;
import com.project.realtime._messaging_application.modules.Friendship.dto.SendFriendRequestDto;
import com.project.realtime._messaging_application.modules.Friendship.entity.Friendship;
import com.project.realtime._messaging_application.modules.Friendship.entity.FriendshipStatus;
import com.project.realtime._messaging_application.modules.Friendship.repository.FriendshipRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class FriendshipService {

    private final FriendshipRepository friendshipRepo;
    private final UserRepository       userRepo;

    public FriendshipService(FriendshipRepository friendshipRepo, UserRepository userRepo) {
        this.friendshipRepo = friendshipRepo;
        this.userRepo       = userRepo;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Danh sách
    // ──────────────────────────────────────────────────────────────────────

    /** Danh sách bạn bè đã ACCEPTED */
    public List<FriendshipResponse> getFriends(Long userId) {
        return friendshipRepo.findAcceptedFriends(userId).stream()
                .map(f -> FriendshipResponse.fromEntity(f, userId))
                .toList();
    }

    /** Lời mời kết bạn tôi nhận được (PENDING) */
    public List<FriendshipResponse> getPendingReceived(Long userId) {
        return friendshipRepo.findPendingReceived(userId).stream()
                .map(f -> FriendshipResponse.fromEntity(f, userId))
                .toList();
    }

    /** Lời mời kết bạn tôi đã gửi (PENDING) */
    public List<FriendshipResponse> getPendingSent(Long userId) {
        return friendshipRepo.findPendingSent(userId).stream()
                .map(f -> FriendshipResponse.fromEntity(f, userId))
                .toList();
    }

    /** Danh sách user tôi đã chặn */
    public List<FriendshipResponse> getBlockedList(Long userId) {
        return friendshipRepo.findBlockedByUser(userId).stream()
                .map(f -> FriendshipResponse.fromEntity(f, userId))
                .toList();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Gửi lời mời kết bạn
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Gửi lời mời kết bạn.
     * Idempotent: nếu đã tồn tại record PENDING thì trả về luôn, không tạo mới.
     * Nếu đã là bạn, đã bị chặn, hoặc tự kết bạn với chính mình → throw lỗi.
     */
    @Transactional
    public FriendshipResponse sendRequest(Long requesterId, SendFriendRequestDto req) {
        if (requesterId.equals(req.addresseeId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Không thể gửi lời mời kết bạn cho chính mình");
        }

        User requester = getUserOrThrow(requesterId);
        User addressee = getUserOrThrow(req.addresseeId());

        // Kiểm tra quan hệ hiện tại
        Optional<Friendship> existing = friendshipRepo.findBetween(requesterId, req.addresseeId());

        if (existing.isPresent()) {
            Friendship f = existing.get();
            return switch (f.getStatus()) {
                case PENDING  -> FriendshipResponse.fromEntity(f, requesterId); // idempotent
                case ACCEPTED -> throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Hai người đã là bạn bè");
                case BLOCKED  -> throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Không thể gửi lời mời kết bạn");
                case DECLINED -> {
                    // Cho phép gửi lại sau khi bị từ chối
                    f.setStatus(FriendshipStatus.PENDING);
                    // Đổi lại requester nếu cần (người gửi lần này là requesterId)
                    yield FriendshipResponse.fromEntity(friendshipRepo.save(f), requesterId);
                }
            };
        }

        // Tạo mới
        Friendship friendship = Friendship.createRequest(requester, addressee);
        return FriendshipResponse.fromEntity(friendshipRepo.save(friendship), requesterId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phản hồi lời mời
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Chấp nhận lời mời kết bạn.
     * Chỉ addressee (người nhận lời mời) mới được chấp nhận.
     */
    @Transactional
    public FriendshipResponse acceptRequest(Long friendshipId, Long currentUserId) {
        Friendship f = getAndValidatePending(friendshipId, currentUserId, "chấp nhận");
        assertIsAddressee(f, currentUserId);
        f.accept();
        return FriendshipResponse.fromEntity(friendshipRepo.save(f), currentUserId);
    }

    /**
     * Từ chối lời mời kết bạn.
     * Chỉ addressee mới được từ chối.
     */
    @Transactional
    public FriendshipResponse declineRequest(Long friendshipId, Long currentUserId) {
        Friendship f = getAndValidatePending(friendshipId, currentUserId, "từ chối");
        assertIsAddressee(f, currentUserId);
        f.decline();
        return FriendshipResponse.fromEntity(friendshipRepo.save(f), currentUserId);
    }

    /**
     * Huỷ lời mời kết bạn đã gửi.
     * Chỉ requester (người GỬI) mới được huỷ.
     */
    @Transactional
    public void cancelRequest(Long friendshipId, Long currentUserId) {
        Friendship f = getAndValidatePending(friendshipId, currentUserId, "huỷ");
        if (!f.getRequester().getId().equals(currentUserId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Chỉ người gửi lời mời mới có thể huỷ");
        }
        friendshipRepo.delete(f);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Chặn / Bỏ chặn
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Chặn một user.
     * - Nếu đang là bạn / PENDING → chuyển sang BLOCKED.
     * - Nếu chưa có record → tạo record mới với status BLOCKED.
     */
    @Transactional
    public FriendshipResponse blockUser(Long blockerId, Long targetId) {
        if (blockerId.equals(targetId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Không thể chặn chính mình");
        }

        User blocker = getUserOrThrow(blockerId);
        User target  = getUserOrThrow(targetId);

        Optional<Friendship> existing = friendshipRepo.findBetween(blockerId, targetId);

        Friendship f;
        if (existing.isPresent()) {
            f = existing.get();
            if (f.isBlocked() && blockerId.equals(f.getBlockedBy())) {
                // Đã chặn rồi → idempotent
                return FriendshipResponse.fromEntity(f, blockerId);
            }
            f.block(blockerId);
        } else {
            // Chưa có quan hệ → tạo record BLOCKED mới
            f = Friendship.createRequest(blocker, target);
            f.block(blockerId);
        }

        return FriendshipResponse.fromEntity(friendshipRepo.save(f), blockerId);
    }

    /**
     * Bỏ chặn một user.
     * Chỉ người đã chặn mới được bỏ chặn.
     * Sau khi bỏ chặn → xoá record (không còn quan hệ gì).
     */
    @Transactional
    public void unblockUser(Long unblockerId, Long targetId) {
        Friendship f = friendshipRepo.findBetween(unblockerId, targetId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Không tìm thấy quan hệ"));

        if (!f.isBlocked() || !unblockerId.equals(f.getBlockedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Bạn không phải người đã chặn");
        }

        friendshipRepo.delete(f);
    }

    /**
     * Huỷ kết bạn (unfriend).
     * Cả hai đều có thể huỷ.
     */
    @Transactional
    public void unfriend(Long userId, Long friendId) {
        Friendship f = friendshipRepo
                .findBetweenWithStatus(userId, friendId, FriendshipStatus.ACCEPTED)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Hai người không phải bạn bè"));

        friendshipRepo.delete(f);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────

    private User getUserOrThrow(Long id) {
        return userRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Không tìm thấy người dùng id=" + id));
    }

    private Friendship getAndValidatePending(Long friendshipId, Long currentUserId, String action) {
        Friendship f = friendshipRepo.findById(friendshipId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Không tìm thấy lời mời"));

        boolean involved = f.getRequester().getId().equals(currentUserId)
                        || f.getAddressee().getId().equals(currentUserId);
        if (!involved) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Bạn không liên quan đến lời mời này");
        }
        if (!f.isPending()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Không thể " + action + " lời mời đã xử lý (trạng thái: " + f.getStatus() + ")");
        }
        return f;
    }

    private void assertIsAddressee(Friendship f, Long userId) {
        if (!f.getAddressee().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Chỉ người nhận lời mời mới có thể thực hiện thao tác này");
        }
    }
}

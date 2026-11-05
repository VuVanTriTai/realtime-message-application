package com.project.realtime._messaging_application.modules.Conversation.service;

import com.project.realtime._messaging_application.modules.Conversation.dto.ConversationSummaryResponse;
import com.project.realtime._messaging_application.modules.Conversation.dto.CreateDirectConversationRequest;
import com.project.realtime._messaging_application.modules.Conversation.dto.CreateGroupConversationRequest;
import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationType;
import com.project.realtime._messaging_application.modules.Conversation.entity.MemberRole;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationRepository;
import com.project.realtime._messaging_application.modules.Friendship.entity.Friendship;
import com.project.realtime._messaging_application.modules.Friendship.entity.FriendshipStatus;
import com.project.realtime._messaging_application.modules.Friendship.repository.FriendshipRepository;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import com.project.realtime._messaging_application.websocket.PresenceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test cho ConversationService - Tạo cuộc trò chuyện 1-1 (DIRECT)")
class ConversationServiceTest {

    @Mock
    private ConversationRepository conversationRepo;

    @Mock
    private ConversationMemberRepository memberRepo;

    @Mock
    private UserRepository userRepo;

    @Mock
    private MessageRepository messageRepo;

    @Mock
    private PresenceService presenceService;

    @Mock
    private FriendshipRepository friendshipRepo;

    @InjectMocks
    private ConversationService conversationService;

    private User userA;
    private User userB;

    @BeforeEach
    void setUp() {
        userA = new User();
        userA.setId(1L);
        userA.setUsername("userA");
        userA.setDisplayName("User A");

        userB = new User();
        userB.setId(2L);
        userB.setUsername("userB");
        userB.setDisplayName("User B");
    }

    @Nested
    @DisplayName("Kiểm tra tính nhất quán của direct_key (buildDirectKey)")
    class DirectKeyTests {

        @Test
        @DisplayName("buildDirectKey luôn sinh key giống nhau bất kể thứ tự user (A-B hay B-A)")
        void buildDirectKey_shouldBeConsistentRegardlessOfOrder() {
            // Given
            Long id1 = 1L;
            Long id2 = 2L;

            // When
            String keyAB = Conversation.buildDirectKey(id1, id2);
            String keyBA = Conversation.buildDirectKey(id2, id1);

            // Then
            assertThat(keyAB).isEqualTo("1_2");
            assertThat(keyBA).isEqualTo("1_2");
            assertThat(keyAB).isEqualTo(keyBA);
        }

        @Test
        @DisplayName("buildDirectKey luôn đặt ID nhỏ hơn ở trước")
        void buildDirectKey_shouldAlwaysPutSmallerIdFirst() {
            assertThat(Conversation.buildDirectKey(999L, 100L)).isEqualTo("100_999");
            assertThat(Conversation.buildDirectKey(100L, 999L)).isEqualTo("100_999");
        }
    }

    @Nested
    @DisplayName("Tạo mới cuộc trò chuyện DIRECT khi chưa tồn tại")
    class CreateNewDirectConversationTests {

        @Test
        @DisplayName("Chưa tồn tại cuộc trò chuyện giữa A và B -> Tạo mới, lưu DB và trả về kết quả")
        void getOrCreateDirect_whenNotExists_shouldCreateNewConversation() {
            // Given: Chưa có cuộc trò chuyện với directKey "1_2"
            String expectedDirectKey = "1_2";
            when(conversationRepo.findByDirectKey(expectedDirectKey)).thenReturn(Optional.empty());

            when(userRepo.findById(1L)).thenReturn(Optional.of(userA));
            when(userRepo.findById(2L)).thenReturn(Optional.of(userB));

            // Giả lập lưu conversation thành công và sinh id = 100L
            when(conversationRepo.save(any(Conversation.class))).thenAnswer(invocation -> {
                Conversation c = invocation.getArgument(0);
                c.setId(100L);
                return c;
            });

            ConversationMember membershipA = ConversationMember.create(new Conversation(), userA, MemberRole.MEMBER);
            when(memberRepo.findByConversationIdAndUserId(100L, 1L)).thenReturn(Optional.of(membershipA));
            when(presenceService.isOnline(2L)).thenReturn(true);
            when(friendshipRepo.findBetweenWithStatus(1L, 2L, FriendshipStatus.ACCEPTED)).thenReturn(Optional.empty());

            CreateDirectConversationRequest request = new CreateDirectConversationRequest(2L);

            // When: User A gọi getOrCreateDirect với target là User B
            ConversationSummaryResponse response = conversationService.getOrCreateDirect(1L, request);

            // Then:
            assertThat(response).isNotNull();
            assertThat(response.id()).isEqualTo(100L);
            assertThat(response.type()).isEqualTo("DIRECT");
            assertThat(response.otherUserId()).isEqualTo(2L);
            assertThat(response.otherUserName()).isEqualTo("User B");
            assertThat(response.isOnline()).isTrue();
            assertThat(response.isStranger()).isTrue(); // Chưa kết bạn

            // Verify: conversation được lưu đúng direct_key "1_2"
            ArgumentCaptor<Conversation> convCaptor = ArgumentCaptor.forClass(Conversation.class);
            verify(conversationRepo, times(1)).save(convCaptor.capture());
            Conversation savedConv = convCaptor.getValue();
            assertThat(savedConv.getDirectKey()).isEqualTo(expectedDirectKey);
            assertThat(savedConv.getType()).isEqualTo(ConversationType.DIRECT);
            assertThat(savedConv.getCreatedBy()).isEqualTo(userA);

            // Verify: 2 thành viên được lưu vào memberRepo
            verify(memberRepo, times(2)).save(any(ConversationMember.class));
        }
    }

    @Nested
    @DisplayName("Lấy lại cuộc trò chuyện cũ khi đã tồn tại (Không tạo trùng)")
    class ExistingDirectConversationTests {

        private Conversation existingConv;
        private ConversationMember membershipA;
        private ConversationMember membershipB;

        @BeforeEach
        void initExistingConversation() {
            existingConv = new Conversation();
            existingConv.setId(100L);
            existingConv.setType(ConversationType.DIRECT);
            existingConv.setDirectKey("1_2");
            existingConv.setCreatedAt(LocalDateTime.now().minusDays(1));

            membershipA = ConversationMember.create(existingConv, userA, MemberRole.MEMBER);
            membershipB = ConversationMember.create(existingConv, userB, MemberRole.MEMBER);
        }

        @Test
        @DisplayName("Hội thoại đã tồn tại giữa A và B (A gọi B) -> Trả về hội thoại cũ, KHÔNG tạo mới")
        void getOrCreateDirect_whenExists_shouldReturnExistingWithoutSaving() {
            // Given: Đã tồn tại conversation với directKey "1_2"
            when(conversationRepo.findByDirectKey("1_2")).thenReturn(Optional.of(existingConv));
            when(memberRepo.findByConversationIdAndUserId(100L, 1L)).thenReturn(Optional.of(membershipA));
            when(memberRepo.findAllByConversationIdWithUser(100L)).thenReturn(List.of(membershipA, membershipB));
            when(presenceService.isOnline(2L)).thenReturn(false);
            when(friendshipRepo.findBetweenWithStatus(1L, 2L, FriendshipStatus.ACCEPTED))
                    .thenReturn(Optional.of(new Friendship()));

            CreateDirectConversationRequest request = new CreateDirectConversationRequest(2L);

            // When: User A gọi getOrCreateDirect tới User B
            ConversationSummaryResponse response = conversationService.getOrCreateDirect(1L, request);

            // Then: Trả về hội thoại đã có
            assertThat(response).isNotNull();
            assertThat(response.id()).isEqualTo(100L);
            assertThat(response.type()).isEqualTo("DIRECT");
            assertThat(response.otherUserId()).isEqualTo(2L);
            assertThat(response.otherUserName()).isEqualTo("User B");
            assertThat(response.isStranger()).isFalse(); // Đã là bạn bè

            // Đảm bảo không có lệnh INSERT / SAVE nào được gọi
            verify(conversationRepo, never()).save(any());
            verify(memberRepo, never()).save(any());
        }

        @Test
        @DisplayName("Đảo thứ tự người gọi: B gọi A (thay vì A gọi B) -> Vẫn tìm đúng key '1_2', trả về cùng hội thoại, KHÔNG tạo duplicate")
        void getOrCreateDirect_whenReversedOrder_shouldFindSameDirectKeyAndReturnExisting() {
            // Given: User B (id=2L) muốn chat với User A (id=1L)
            // Logic buildDirectKey(2L, 1L) vẫn ra "1_2"
            when(conversationRepo.findByDirectKey("1_2")).thenReturn(Optional.of(existingConv));
            when(memberRepo.findByConversationIdAndUserId(100L, 2L)).thenReturn(Optional.of(membershipB));
            when(memberRepo.findAllByConversationIdWithUser(100L)).thenReturn(List.of(membershipA, membershipB));
            when(presenceService.isOnline(1L)).thenReturn(true);
            when(friendshipRepo.findBetweenWithStatus(2L, 1L, FriendshipStatus.ACCEPTED)).thenReturn(Optional.empty());

            CreateDirectConversationRequest request = new CreateDirectConversationRequest(1L);

            // When: User B (2L) gọi getOrCreateDirect với target là User A (1L)
            ConversationSummaryResponse response = conversationService.getOrCreateDirect(2L, request);

            // Then:
            assertThat(response).isNotNull();
            assertThat(response.id()).isEqualTo(100L); // Cùng id hội thoại
            assertThat(response.otherUserId()).isEqualTo(1L); // Đối phương là User A
            assertThat(response.otherUserName()).isEqualTo("User A");

            // Verify: conversationRepo được tìm bằng đúng key "1_2"
            verify(conversationRepo).findByDirectKey("1_2");

            // Verify: Tuyệt đối không tạo mới
            verify(conversationRepo, never()).save(any());
            verify(memberRepo, never()).save(any());
        }
    }

    @Nested
    @DisplayName("Các trường hợp ngoại lệ (Validation & Not Found)")
    class ExceptionTests {

        @Test
        @DisplayName("Không được phép tạo cuộc trò chuyện với chính mình (currentUserId == targetUserId) -> Ném BAD_REQUEST")
        void getOrCreateDirect_whenTargetIsSelf_shouldThrowBadRequest() {
            // Given: User 1 tự chat với chính mình
            CreateDirectConversationRequest request = new CreateDirectConversationRequest(1L);

            // When & Then:
            assertThatThrownBy(() -> conversationService.getOrCreateDirect(1L, request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(rse.getReason()).contains("Không thể tạo cuộc trò chuyện với chính mình");
                    });

            verifyNoInteractions(conversationRepo);
            verifyNoInteractions(memberRepo);
        }

        @Test
        @DisplayName("Khi target user không tồn tại trong hệ thống -> Ném NOT_FOUND")
        void getOrCreateDirect_whenTargetUserNotFound_shouldThrowNotFound() {
            // Given:
            when(conversationRepo.findByDirectKey("1_99")).thenReturn(Optional.empty());
            when(userRepo.findById(1L)).thenReturn(Optional.of(userA));
            when(userRepo.findById(99L)).thenReturn(Optional.empty());

            CreateDirectConversationRequest request = new CreateDirectConversationRequest(99L);

            // When & Then:
            assertThatThrownBy(() -> conversationService.getOrCreateDirect(1L, request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
                    });

            verify(conversationRepo, never()).save(any());
            verify(memberRepo, never()).save(any());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // addMember — Giới hạn 500 thành viên
    // ══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("addMember() — giới hạn 500 thành viên")
    class AddMemberGroupLimitTests {

        private static final long CONV_ID      = 10L;
        private static final long REQUESTER_ID = 1L;
        private static final long NEW_USER_ID  = 99L;

        @Test
        @DisplayName("Thêm thành viên khi nhóm đã đủ 500 người → ném BAD_REQUEST")
        void addMember_whenGroupIsFull_shouldThrowBadRequest() {
            // ── Arrange ──────────────────────────────────────────────────────
            // Requester là ADMIN/OWNER
            ConversationMember adminMember = new ConversationMember();
            adminMember.setRole(MemberRole.ADMIN);
            when(memberRepo.findByConversationIdAndUserId(CONV_ID, REQUESTER_ID))
                    .thenReturn(Optional.of(adminMember));

            // newUser chưa phải thành viên
            when(memberRepo.findByConversationIdAndUserId(CONV_ID, NEW_USER_ID))
                    .thenReturn(Optional.empty());

            // Nhóm hiện có 500 người
            when(memberRepo.countByConversationId(CONV_ID)).thenReturn(500);

            // Conversation tồn tại
            Conversation conv = new Conversation();
            conv.setType(ConversationType.GROUP);
            when(conversationRepo.findById(CONV_ID)).thenReturn(Optional.of(conv));

            // newUser tồn tại
            User newUser = new User();
            newUser.setId(NEW_USER_ID);
            when(userRepo.findById(NEW_USER_ID)).thenReturn(Optional.of(newUser));

            // ── Act & Assert ─────────────────────────────────────────────────
            assertThatThrownBy(() -> conversationService.addMember(CONV_ID, REQUESTER_ID, NEW_USER_ID))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(rse.getReason()).contains("500");
                    });

            // memberRepo.save() KHÔNG được gọi khi nhóm đầy
            verify(memberRepo, never()).save(any());
        }

        @Test
        @DisplayName("Thêm thành viên khi nhóm còn 499 người → thành công")
        void addMember_whenGroupHasRoom_shouldSucceed() {
            // ── Arrange ──────────────────────────────────────────────────────
            ConversationMember adminMember = new ConversationMember();
            adminMember.setRole(MemberRole.ADMIN);
            when(memberRepo.findByConversationIdAndUserId(CONV_ID, REQUESTER_ID))
                    .thenReturn(Optional.of(adminMember));

            when(memberRepo.findByConversationIdAndUserId(CONV_ID, NEW_USER_ID))
                    .thenReturn(Optional.empty());

            // Nhóm hiện có 499 người → còn chỗ
            when(memberRepo.countByConversationId(CONV_ID)).thenReturn(499);

            Conversation conv = new Conversation();
            conv.setType(ConversationType.GROUP);
            when(conversationRepo.findById(CONV_ID)).thenReturn(Optional.of(conv));

            User newUser = new User();
            newUser.setId(NEW_USER_ID);
            when(userRepo.findById(NEW_USER_ID)).thenReturn(Optional.of(newUser));

            // ── Act ──────────────────────────────────────────────────────────
            conversationService.addMember(CONV_ID, REQUESTER_ID, NEW_USER_ID);

            // ── Assert ───────────────────────────────────────────────────────
            verify(memberRepo, times(1)).save(any(ConversationMember.class));
        }
    }
}


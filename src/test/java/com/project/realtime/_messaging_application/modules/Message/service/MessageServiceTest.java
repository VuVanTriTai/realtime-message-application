package com.project.realtime._messaging_application.modules.Message.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationType;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationRepository;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.modules.Message.dto.SendMessageRequest;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox;
import com.project.realtime._messaging_application.modules.Message.entity.MessageType;
import com.project.realtime._messaging_application.modules.Message.repository.MessageOutboxRepository;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.Role;
import com.project.realtime._messaging_application.modules.User.Entity.Status;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Timer;
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

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test cho MessageService - Gửi tin nhắn (sendMessage)")
class MessageServiceTest {

    @Mock
    private MessageRepository messageRepo;

    @Mock
    private ConversationRepository conversationRepo;

    @Mock
    private ConversationMemberRepository memberRepo;

    @Mock
    private UserRepository userRepo;

    @Mock
    private MessageOutboxRepository outboxRepo;

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private org.springframework.context.ApplicationEventPublisher eventPublisher;

    @Mock
    private com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher redisPublisher;

    @Mock
    private org.springframework.transaction.support.TransactionTemplate transactionTemplate;

    @Mock
    private Counter messagesSentCounter;   // Micrometer counter mock

    @Mock
    private Timer messageLatencyTimer;     // Micrometer timer mock

    @InjectMocks
    private MessageService messageService;

    private static final Long CONVERSATION_ID = 1L;
    private static final Long SENDER_ID       = 10L;

    private User senderUser;
    private Conversation conversation;

    @BeforeEach
    void setUp() {
        senderUser = new User();
        senderUser.setId(SENDER_ID);
        senderUser.setUsername("alice");
        senderUser.setDisplayName("Alice");
        senderUser.setRole(Role.USER);
        senderUser.setStatus(Status.ACTIVE);

        conversation = new Conversation();
        conversation.setId(CONVERSATION_ID);
        conversation.setType(ConversationType.DIRECT);
    }

    private SendMessageRequest buildRequest(String content) {
        return new SendMessageRequest(
                CONVERSATION_ID,
                "client-uuid-12345",
                content,
                "TEXT",
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Kiểm tra quyền thành viên trong hội thoại
    // ══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Kiểm tra quyền thành viên (assertMember)")
    class AuthorizationTests {

        @Test
        @DisplayName("Người gửi KHÔNG thuộc hội thoại → Ném lỗi 403 FORBIDDEN")
        void sendMessage_whenUserNotMember_shouldThrowForbidden() {
            // Given: sender không phải là thành viên của cuộc trò chuyện
            when(conversationRepo.isMember(CONVERSATION_ID, SENDER_ID)).thenReturn(false);

            SendMessageRequest request = buildRequest("Xin chào mọi người");

            // When & Then: Phải ném ResponseStatusException với HttpStatus.FORBIDDEN
            assertThatThrownBy(() -> messageService.sendMessage(SENDER_ID, request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                        assertThat(rse.getReason()).contains("Bạn không phải thành viên của cuộc trò chuyện này");
                    });

            // Đảm bảo tuyệt đối không lưu Message hay Outbox vào Database
            verify(messageRepo, never()).save(any());
            verify(outboxRepo, never()).save(any());
            verify(conversationRepo, never()).updateLastMessage(any(), any(), any());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Kiểm tra tính hợp lệ của nội dung (rỗng, khoảng trắng, vượt kích thước)
    // ══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Kiểm tra nội dung tin nhắn (Validation: rỗng, khoảng trắng, kích thước)")
    class ContentValidationTests {

        @BeforeEach
        void mockMembership() {
            // Đảm bảo user đã là thành viên hợp lệ để tập trung test logic nội dung
            when(conversationRepo.isMember(CONVERSATION_ID, SENDER_ID)).thenReturn(true);
        }

        @Test
        @DisplayName("Nội dung là null → Từ chối với lỗi 400 BAD_REQUEST")
        void sendMessage_whenContentIsNull_shouldThrowBadRequest() {
            SendMessageRequest request = buildRequest(null);

            assertThatThrownBy(() -> messageService.sendMessage(SENDER_ID, request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(rse.getReason()).contains("Nội dung tin nhắn không được để trống");
                    });

            verify(messageRepo, never()).save(any());
            verify(outboxRepo, never()).save(any());
        }

        @Test
        @DisplayName("Nội dung là chuỗi rỗng \"\" → Từ chối với lỗi 400 BAD_REQUEST")
        void sendMessage_whenContentIsEmpty_shouldThrowBadRequest() {
            SendMessageRequest request = buildRequest("");

            assertThatThrownBy(() -> messageService.sendMessage(SENDER_ID, request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(rse.getReason()).contains("Nội dung tin nhắn không được để trống");
                    });

            verify(messageRepo, never()).save(any());
            verify(outboxRepo, never()).save(any());
        }

        @Test
        @DisplayName("Nội dung toàn khoảng trắng, tab, xuống dòng \"   \\t\\n \" → Từ chối với lỗi 400 BAD_REQUEST")
        void sendMessage_whenContentIsAllWhitespace_shouldThrowBadRequest() {
            SendMessageRequest request = buildRequest("   \t  \n  ");

            assertThatThrownBy(() -> messageService.sendMessage(SENDER_ID, request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(rse.getReason()).contains("Nội dung tin nhắn không được để trống");
                    });

            verify(messageRepo, never()).save(any());
            verify(outboxRepo, never()).save(any());
        }

        @Test
        @DisplayName("Nội dung vượt quá 4000 ký tự (4001 ký tự) → Từ chối với lỗi 400 BAD_REQUEST")
        void sendMessage_whenContentExceedsMaxLength_shouldThrowBadRequest() {
            String overlyLongContent = "a".repeat(4001);
            SendMessageRequest request = buildRequest(overlyLongContent);

            assertThatThrownBy(() -> messageService.sendMessage(SENDER_ID, request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(rse.getReason()).contains("Tin nhắn tối đa 4000 ký tự");
                    });

            verify(messageRepo, never()).save(any());
            verify(outboxRepo, never()).save(any());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Trường hợp gửi tin thành công (Happy Path & Boundary 4000 ký tự)
    // ══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Gửi tin nhắn hợp lệ (Happy Path)")
    class SuccessfulSendTests {

        @Test
        @DisplayName("Nội dung đúng 4000 ký tự (giá trị biên tối đa) → Gửi tin thành công")
        void sendMessage_whenContentIsExactly4000Chars_shouldSucceed() throws JsonProcessingException {
            // Given:
            String exactly4000 = "x".repeat(4000);
            SendMessageRequest request = buildRequest(exactly4000);

            when(conversationRepo.isMember(CONVERSATION_ID, SENDER_ID)).thenReturn(true);
            when(messageRepo.findByClientMessageId(CONVERSATION_ID, SENDER_ID, request.clientMessageId()))
                    .thenReturn(Optional.empty());
            when(conversationRepo.findById(CONVERSATION_ID)).thenReturn(Optional.of(conversation));
            when(userRepo.findById(SENDER_ID)).thenReturn(Optional.of(senderUser));
            when(messageRepo.save(any(Message.class))).thenAnswer(invocation -> {
                Message m = invocation.getArgument(0);
                m.setId(101L);
                return m;
            });
            when(objectMapper.writeValueAsString(any())).thenReturn("{\"id\":101}");

            // When:
            MessageResponse response = messageService.sendMessage(SENDER_ID, request);

            // Then:
            assertThat(response).isNotNull();
            assertThat(response.id()).isEqualTo(101L);
            assertThat(response.content()).isEqualTo(exactly4000);

            verify(messageRepo, times(1)).save(any(Message.class));
            verify(conversationRepo, times(1)).updateLastMessage(eq(CONVERSATION_ID), eq(101L), any());
            verify(outboxRepo, times(1)).save(any(MessageOutbox.class));
        }

        @Test
        @DisplayName("Gửi tin nhắn thông thường thành công → Lưu DB và ghi nhận Outbox đúng quy trình")
        void sendMessage_whenValidMessage_shouldSaveAndWriteOutbox() throws JsonProcessingException {
            // Given:
            String validContent = "Xin chào, đây là tin nhắn kiểm thử!";
            SendMessageRequest request = buildRequest(validContent);

            when(conversationRepo.isMember(CONVERSATION_ID, SENDER_ID)).thenReturn(true);
            when(messageRepo.findByClientMessageId(CONVERSATION_ID, SENDER_ID, request.clientMessageId()))
                    .thenReturn(Optional.empty());
            when(conversationRepo.findById(CONVERSATION_ID)).thenReturn(Optional.of(conversation));
            when(userRepo.findById(SENDER_ID)).thenReturn(Optional.of(senderUser));

            when(messageRepo.save(any(Message.class))).thenAnswer(invocation -> {
                Message m = invocation.getArgument(0);
                m.setId(200L);
                return m;
            });
            when(objectMapper.writeValueAsString(any())).thenReturn("{\"id\":200}");

            // When:
            MessageResponse response = messageService.sendMessage(SENDER_ID, request);

            // Then:
            assertThat(response).isNotNull();
            assertThat(response.id()).isEqualTo(200L);
            assertThat(response.content()).isEqualTo(validContent);
            assertThat(response.type()).isEqualTo("TEXT");

            // Kiểm tra Message entity được truyền vào save()
            ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
            verify(messageRepo).save(messageCaptor.capture());
            Message savedMessage = messageCaptor.getValue();
            assertThat(savedMessage.getContent()).isEqualTo(validContent);
            assertThat(savedMessage.getType()).isEqualTo(MessageType.TEXT);
            assertThat(savedMessage.getClientMessageId()).isEqualTo("client-uuid-12345");
            assertThat(savedMessage.getSender()).isEqualTo(senderUser);
            assertThat(savedMessage.getConversation()).isEqualTo(conversation);

            // Kiểm tra cập nhật denormalized last message cho Conversation
            verify(conversationRepo).updateLastMessage(eq(CONVERSATION_ID), eq(200L), any());

            // Kiểm tra ghi nhận MessageOutbox
            ArgumentCaptor<MessageOutbox> outboxCaptor = ArgumentCaptor.forClass(MessageOutbox.class);
            verify(outboxRepo).save(outboxCaptor.capture());
            MessageOutbox savedOutbox = outboxCaptor.getValue();
            assertThat(savedOutbox.getMessageId()).isEqualTo(200L);
            assertThat(savedOutbox.getConversationId()).isEqualTo(CONVERSATION_ID);
        }
    }
}


package com.project.realtime._messaging_application.modules.Message.service;

import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationRepository;
import com.project.realtime._messaging_application.modules.Message.dto.EditMessageRequest;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.modules.Message.dto.SendMessageRequest;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.Message.entity.MessageType;
import com.project.realtime._messaging_application.modules.Message.entity.MessageOutbox;
import com.project.realtime._messaging_application.modules.Message.repository.MessageOutboxRepository;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import com.project.realtime._messaging_application.websocket.pubsub.OutboxTriggerEvent;
import com.project.realtime._messaging_application.websocket.pubsub.RedisEventType;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class MessageService {

    private static final Logger log = LoggerFactory.getLogger(MessageService.class);

    private final MessageRepository messageRepo;
    private final ConversationRepository conversationRepo;
    private final ConversationMemberRepository memberRepo;
    private final UserRepository userRepo;
    private final MessageOutboxRepository outboxRepo;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final RedisMessagePublisher redisPublisher;
    // Metrics
    private final Counter messagesSentCounter;
    private final Timer   messageLatencyTimer;

    public MessageService(MessageRepository messageRepo,
            ConversationRepository conversationRepo,
            ConversationMemberRepository memberRepo,
            UserRepository userRepo,
            MessageOutboxRepository outboxRepo,
            ObjectMapper objectMapper,
            ApplicationEventPublisher eventPublisher,
            RedisMessagePublisher redisPublisher,
            Counter messagesSentCounter,
            Timer messageLatencyTimer) {
        this.messageRepo          = messageRepo;
        this.conversationRepo     = conversationRepo;
        this.memberRepo           = memberRepo;
        this.userRepo             = userRepo;
        this.outboxRepo           = outboxRepo;
        this.objectMapper         = objectMapper;
        this.eventPublisher       = eventPublisher;
        this.redisPublisher       = redisPublisher;
        this.messagesSentCounter  = messagesSentCounter;
        this.messageLatencyTimer  = messageLatencyTimer;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Lấy lịch sử tin nhắn (cursor pagination)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Lấy trang đầu tiên (50 tin mới nhất) của conversation.
     * 
     * @param cursor null = lấy trang đầu; có giá trị = lấy tin cũ hơn cursor
     */
    public List<MessageResponse> getHistory(Long conversationId, Long userId, Long cursor) {
        assertMember(conversationId, userId);

        List<Message> messages = (cursor == null)
                ? messageRepo.findLatest(conversationId)
                : messageRepo.findBeforeCursor(conversationId, cursor);

        // Đảo ngược để trả về theo thứ tự tăng dần (cũ → mới)
        List<Message> reversedList = new ArrayList<>(messages);
        Collections.reverse(reversedList);
        return reversedList.stream()
                .map(MessageResponse::fromEntity)
                .toList();
    }

    /**
     * Đồng bộ tin bị bỏ lỡ sau khi mất kết nối.
     * Client gửi lastReceivedMessageId → server trả các tin có id lớn hơn.
     */
    public List<MessageResponse> getMissedMessages(Long conversationId,
            Long userId,
            Long lastReceivedMessageId) {
        assertMember(conversationId, userId);
        return messageRepo.findMissedMessages(conversationId, lastReceivedMessageId)
                .stream()
                .map(MessageResponse::fromEntity)
                .toList();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Gửi tin nhắn
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Gửi tin nhắn với idempotency: nếu client_message_id đã tồn tại thì trả về
     * tin đã lưu thay vì lưu lại (retry-safe).
     *
     * Trong cùng một @Transactional:
     * 1. Lưu Message vào DB
     * 2. Cập nhật last_message_id / last_message_at của Conversation
     * → Đảm bảo 2 bảng luôn nhất quán (denormalized data).
     *
     * TODO: sau bước lưu, phát tin tới WebSocket / Redis Pub/Sub ở
     * MessageWebSocketHandler.
     */
    @Transactional
    public MessageResponse sendMessage(Long senderId, SendMessageRequest req) {
        // 1. Kiểm tra quyền thành viên trong hội thoại
        assertMember(req.conversationId(), senderId);

        // 2. Kiểm tra tính hợp lệ của nội dung tin nhắn (không rỗng, không toàn khoảng trắng, không vượt quá 4000 ký tự)
        if (req.content() == null || req.content().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nội dung tin nhắn không được để trống");
        }
        if (req.content().length() > 4000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tin nhắn tối đa 4000 ký tự");
        }

        // 3. Idempotency check
        var existing = messageRepo.findByClientMessageId(
                req.conversationId(), senderId, req.clientMessageId());
        if (existing.isPresent()) {
            return MessageResponse.fromEntity(existing.get());
        }

        // 3. Load entities
        Conversation conversation = getConversationOrThrow(req.conversationId());
        User sender = getUserOrThrow(senderId);

        // 4. Xây dựng Message entity
        MessageType messageType = parseType(req.type());
        Message message;

        if (req.replyToId() != null) {
            Message replyTo = messageRepo.findById(req.replyToId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "Không tìm thấy tin nhắn được trả lời"));
            message = Message.createReply(conversation, sender,
                    req.content(), req.clientMessageId(), replyTo);
        } else {
            message = Message.createText(conversation, sender,
                    req.content(), req.clientMessageId());
        }
        message.setType(messageType);

        // 5a. Neu la tin media (IMAGE/FILE): luu them cac truong media
        if (messageType == MessageType.IMAGE || messageType == MessageType.FILE) {
            if (req.mediaUrl()  != null) message.setMediaUrl(req.mediaUrl());
            if (req.mediaType() != null) message.setMediaType(req.mediaType());
            if (req.fileName()  != null) message.setFileName(req.fileName());
            if (req.fileSize()  != null) message.setFileSize(req.fileSize());
            if (req.thumbUrl()  != null) message.setThumbUrl(req.thumbUrl());
        }

        // 5. Lưu message
        final long saveStart = System.nanoTime();
        messageRepo.save(message);

        // 6. Cập nhật denormalized last_message trong cùng transaction
        conversationRepo.updateLastMessage(
                conversation.getId(), message.getId(), message.getCreatedAt());

        MessageResponse response = MessageResponse.fromEntity(message);

        // 7. [OUTBOX + FAST PATH]
        // Ghi outbox record TRONG CÙNG transaction với message để đảm bảo không mất tin.
        // Ngay sau khi transaction commit thành công: bắn Fast Path trực tiếp sang Redis (< 2ms).
        // Nếu Fast Path thành công -> đánh dấu Outbox DONE ngay lập tức.
        // Nếu mạng Redis lỗi -> Outbox giữ PENDING và OutboxPoller sẽ bốc cứu hộ sau 3s (Zero Loss).
        try {
            String payloadJson = objectMapper.writeValueAsString(response);
            outboxRepo.save(new MessageOutbox(message.getId(), conversation.getId(), payloadJson));
            dispatchFastPath(conversation.getId(), message.getId(), RedisEventType.NEW_MESSAGE, payloadJson);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể serialize message cho outbox: " + e.getMessage());
        }

        // Metrics: ghi nhan so tin da gui va thoi gian xu ly
        messagesSentCounter.increment();
        messageLatencyTimer.record(System.nanoTime() - saveStart, java.util.concurrent.TimeUnit.NANOSECONDS);

        return response;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Sửa / Xoá
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Sửa nội dung tin nhắn TEXT.
     * Chỉ người gửi mới được sửa, chỉ tin chưa xoá, tối đa 4000 ký tự.
     */
    @Transactional
    public MessageResponse editMessage(Long messageId, Long senderId, EditMessageRequest req) {
        int updated = messageRepo.editContent(messageId, senderId, req.content());
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Không thể sửa tin này (không phải chủ sở hữu, đã xoá hoặc không phải tin TEXT)");
        }
        Message m = messageRepo.findById(messageId).orElseThrow();
        MessageResponse response = MessageResponse.fromEntity(m);

        try {
            String payloadJson = objectMapper.writeValueAsString(response);
            outboxRepo.save(new MessageOutbox(m.getId(), m.getConversation().getId(), payloadJson));
            dispatchFastPath(m.getConversation().getId(), m.getId(), RedisEventType.NEW_MESSAGE, payloadJson);
        } catch (JsonProcessingException e) {
            log.warn("Không thể serialize edited message cho outbox: {}", e.getMessage());
        }

        return response;
    }

    /**
     * Soft-delete tin nhắn.
     * Chỉ người gửi mới được xoá tin của chính mình.
     * TODO: Admin nhóm được phép xoá tin bất kỳ – thêm kiểm tra role ở đây.
     */
    @Transactional
    public void deleteMessage(Long messageId, Long senderId) {
        int updated = messageRepo.softDelete(messageId, senderId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Không thể xoá tin này (không phải chủ sở hữu hoặc đã bị xoá)");
        }

        Message m = messageRepo.findById(messageId).orElseThrow();
        MessageResponse response = MessageResponse.fromEntity(m);

        try {
            String payloadJson = objectMapper.writeValueAsString(response);
            outboxRepo.save(new MessageOutbox(m.getId(), m.getConversation().getId(), payloadJson));
            dispatchFastPath(m.getConversation().getId(), m.getId(), RedisEventType.NEW_MESSAGE, payloadJson);
        } catch (JsonProcessingException e) {
            log.warn("Không thể serialize deleted message cho outbox: {}", e.getMessage());
        }
    }

    /**
     * Fast Path: Bắn trực tiếp qua Redis Pub/Sub ngay sau khi Transaction commit thành công.
     * Giảm độ trễ E2E xuống < 20ms mà vẫn giữ trọn vẹn độ tin cậy của Outbox Pattern.
     */
    private void dispatchFastPath(Long conversationId, Long messageId, RedisEventType eventType, String payloadJson) {
        Runnable action = () -> {
            try {
                redisPublisher.publishRaw(conversationId, eventType, payloadJson);
                outboxRepo.markDoneByMessageId(messageId);
                log.debug("[FastPath] Dispatched {} msgId={} to convId={}", eventType, messageId, conversationId);
            } catch (Exception e) {
                log.warn("[FastPath] Failed for msgId={}, OutboxPoller will rescue: {}", messageId, e.getMessage());
            }
        };

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Tìm kiếm tin nhắn & Lấy file phương tiện
    // ──────────────────────────────────────────────────────────────────────

    public List<MessageResponse> searchMessages(Long conversationId, Long userId, String query) {
        assertMember(conversationId, userId);
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return messageRepo.searchMessages(conversationId, query.trim())
                .stream()
                .map(MessageResponse::fromEntity)
                .toList();
    }

    public List<MessageResponse> getMediaMessages(Long conversationId, Long userId) {
        assertMember(conversationId, userId);
        return messageRepo.findMediaMessages(conversationId)
                .stream()
                .map(MessageResponse::fromEntity)
                .toList();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Unread count (dùng bởi ConversationService)
    // ──────────────────────────────────────────────────────────────────────

    public long countUnread(Long conversationId, Long userId, Long lastReadMessageId) {
        return messageRepo.countUnread(conversationId, userId, lastReadMessageId);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────

    private void assertMember(Long conversationId, Long userId) {
        if (!conversationRepo.isMember(conversationId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Bạn không phải thành viên của cuộc trò chuyện này");
        }
    }

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

    private MessageType parseType(String typeStr) {
        if (typeStr == null || typeStr.isBlank()) return MessageType.TEXT;
        try {
            return MessageType.valueOf(typeStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            return MessageType.TEXT;
        }
    }
}

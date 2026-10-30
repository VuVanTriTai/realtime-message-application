package com.project.realtime._messaging_application.modules.Message.service;

import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationRepository;
import com.project.realtime._messaging_application.modules.Message.dto.EditMessageRequest;
import com.project.realtime._messaging_application.modules.Message.dto.MessageResponse;
import com.project.realtime._messaging_application.modules.Message.dto.SendMessageRequest;
import com.project.realtime._messaging_application.modules.Message.entity.Message;
import com.project.realtime._messaging_application.modules.Message.entity.MessageType;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.modules.User.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class MessageService {

    private final MessageRepository          messageRepo;
    private final ConversationRepository     conversationRepo;
    private final ConversationMemberRepository memberRepo;
    private final UserRepository             userRepo;

    public MessageService(MessageRepository messageRepo,
                          ConversationRepository conversationRepo,
                          ConversationMemberRepository memberRepo,
                          UserRepository userRepo) {
        this.messageRepo      = messageRepo;
        this.conversationRepo = conversationRepo;
        this.memberRepo       = memberRepo;
        this.userRepo         = userRepo;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Lấy lịch sử tin nhắn (cursor pagination)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Lấy trang đầu tiên (50 tin mới nhất) của conversation.
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
     *  1. Lưu Message vào DB
     *  2. Cập nhật last_message_id / last_message_at của Conversation
     * → Đảm bảo 2 bảng luôn nhất quán (denormalized data).
     *
     * TODO: sau bước lưu, phát tin tới WebSocket / Redis Pub/Sub ở MessageWebSocketHandler.
     */
    @Transactional
    public MessageResponse sendMessage(Long senderId, SendMessageRequest req) {
        // 1. Kiểm tra quyền
        assertMember(req.conversationId(), senderId);

        // 2. Idempotency check
        var existing = messageRepo.findByClientMessageId(
                req.conversationId(), senderId, req.clientMessageId());
        if (existing.isPresent()) {
            return MessageResponse.fromEntity(existing.get());
        }

        // 3. Load entities
        Conversation conversation = getConversationOrThrow(req.conversationId());
        User         sender       = getUserOrThrow(senderId);

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

        // 5. Lưu message
        messageRepo.save(message);

        // 6. Cập nhật denormalized last_message trong cùng transaction
        conversationRepo.updateLastMessage(
                conversation.getId(), message.getId(), message.getCreatedAt());

        return MessageResponse.fromEntity(message);
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
        return MessageResponse.fromEntity(m);
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

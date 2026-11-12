package com.project.realtime._messaging_application.modules.Conversation.repository;

/**
 * Custom repository interface để xử lý các câu lệnh SQL atomic đặc thù.
 */
public interface ConversationRepositoryCustom {

    /**
     * Tăng atomic last_seq của conversation lên 1 và trả về giá trị mới.
     * Sử dụng câu lệnh PostgreSQL: UPDATE conversations SET last_seq = last_seq + 1 ... RETURNING last_seq.
     * Khóa dòng conversation (row-level lock) trong suốt transaction, đảm bảo seq không bao giờ bị race condition.
     *
     * @param conversationId ID của cuộc trò chuyện
     * @return Sequence number mới (1, 2, 3...)
     */
    Long nextSeq(Long conversationId);
}

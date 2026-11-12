package com.project.realtime._messaging_application.modules.Conversation.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Implementation cho ConversationRepositoryCustom sử dụng JdbcTemplate.
 * Cho phép thực thi câu lệnh UPDATE ... RETURNING last_seq mà không bị giới hạn bởi JPA.
 */
@Repository
public class ConversationRepositoryCustomImpl implements ConversationRepositoryCustom {

    private final JdbcTemplate jdbcTemplate;

    public ConversationRepositoryCustomImpl(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Long nextSeq(Long conversationId) {
        return jdbcTemplate.queryForObject(
                "UPDATE conversations SET last_seq = last_seq + 1 WHERE id = ? RETURNING last_seq",
                Long.class,
                conversationId
        );
    }
}


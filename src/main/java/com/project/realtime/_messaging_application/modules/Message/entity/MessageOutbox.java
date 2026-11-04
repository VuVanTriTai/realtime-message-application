package com.project.realtime._messaging_application.modules.Message.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Outbox record duoc ghi cung transaction voi Message.
 * OutboxPoller doc PENDING records va publish len Redis.
 * Dam bao: neu DB commit thanh cong thi eventually Redis se nhan duoc tin.
 */
@Entity
@Table(name = "message_outbox",
       indexes = @Index(name = "idx_outbox_status_created",
                        columnList = "status, created_at ASC"))
public class MessageOutbox {

    public enum Status { PENDING, DONE, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    /** MessageResponse da serialize thanh JSON String */
    @Column(name = "payload", nullable = false, columnDefinition = "TEXT")
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private Status status = Status.PENDING;

    @Column(name = "retry_count", nullable = false)
    private int retryCount = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "processed_at")
    private Instant processedAt;

    // -------------------------------------------------------
    // Constructors
    // -------------------------------------------------------

    protected MessageOutbox() {}

    public MessageOutbox(Long messageId, Long conversationId, String payload) {
        this.messageId      = messageId;
        this.conversationId = conversationId;
        this.payload        = payload;
    }

    // -------------------------------------------------------
    // Business methods
    // -------------------------------------------------------

    public void markDone() {
        this.status      = Status.DONE;
        this.processedAt = Instant.now();
    }

    public void markFailed() {
        this.status      = Status.FAILED;
        this.processedAt = Instant.now();
    }

    public void incrementRetry() {
        this.retryCount++;
    }

    // -------------------------------------------------------
    // Getters
    // -------------------------------------------------------

    public Long getId()                { return id; }
    public Long getMessageId()         { return messageId; }
    public Long getConversationId()    { return conversationId; }
    public String getPayload()         { return payload; }
    public Status getStatus()          { return status; }
    public int getRetryCount()         { return retryCount; }
    public Instant getCreatedAt()      { return createdAt; }
    public Instant getProcessedAt()    { return processedAt; }
}
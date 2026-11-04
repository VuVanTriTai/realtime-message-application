package com.project.realtime._messaging_application.modules.Conversation.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Request body cho API chuyển quyền Owner.
 */
public record TransferOwnerRequest(@NotNull Long newOwnerId) {}


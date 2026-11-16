package com.project.realtime._messaging_application.modules.Admin.dto;

public record AdminStatsResponse(
        long totalUsers,
        long activeUsers,
        long bannedUsers,
        long totalConversations,
        long totalGroups,
        long totalDirect,
        long totalMessages,
        long onlineUsers
) {}

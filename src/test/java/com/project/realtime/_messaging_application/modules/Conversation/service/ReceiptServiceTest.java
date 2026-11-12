package com.project.realtime._messaging_application.modules.Conversation.service;

import com.project.realtime._messaging_application.modules.Conversation.dto.MemberReceiptResponse;
import com.project.realtime._messaging_application.modules.Conversation.entity.Conversation;
import com.project.realtime._messaging_application.modules.Conversation.entity.ConversationMember;
import com.project.realtime._messaging_application.modules.Conversation.entity.MemberRole;
import com.project.realtime._messaging_application.modules.Conversation.repository.ConversationMemberRepository;
import com.project.realtime._messaging_application.modules.Message.repository.MessageRepository;
import com.project.realtime._messaging_application.modules.User.Entity.User;
import com.project.realtime._messaging_application.websocket.pubsub.RedisEventType;
import com.project.realtime._messaging_application.websocket.pubsub.RedisMessagePublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test cho ReceiptService (Dual ACK Cursor)")
class ReceiptServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private RedisMessagePublisher redisPublisher;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private ConversationMemberRepository memberRepo;

    @Mock
    private MessageRepository messageRepo;

    @Mock
    private SetOperations<String, String> setOps;

    @Mock
    private HashOperations<String, Object, Object> hashOps;

    @InjectMocks
    private ReceiptService receiptService;

    private static final Long CONV_ID = 1L;
    private static final Long USER_ID = 10L;

    @Test
    @DisplayName("recordDelivered: Khi seq mới > seq cũ → Execute Lua script trả về 1 và publish Redis")
    void recordDelivered_whenNewSeq_shouldPublish() {
        when(redisTemplate.execute(any(DefaultRedisScript.class), anyList(), eq(USER_ID.toString()), eq("15"), anyString()))
                .thenReturn(1L);

        receiptService.recordDelivered(CONV_ID, USER_ID, 15L);

        verify(redisTemplate).execute(any(DefaultRedisScript.class), anyList(), eq(USER_ID.toString()), eq("15"), anyString());
        verify(redisPublisher).publish(eq(CONV_ID), eq(RedisEventType.DELIVERY_RECEIPT), any());
    }

    @Test
    @DisplayName("recordDelivered: Khi seq cũ (out-of-order) → Lua script trả về 0 và KHÔNG publish")
    void recordDelivered_whenOlderSeq_shouldNotPublish() {
        when(redisTemplate.execute(any(DefaultRedisScript.class), anyList(), eq(USER_ID.toString()), eq("5"), anyString()))
                .thenReturn(0L);

        receiptService.recordDelivered(CONV_ID, USER_ID, 5L);

        verify(redisPublisher, never()).publish(anyLong(), any(), any());
    }

    @Test
    @DisplayName("recordRead: Khi seq mới → Execute Lua script trả về 1 và publish READ_RECEIPT")
    void recordRead_whenNewSeq_shouldPublish() {
        when(redisTemplate.execute(any(DefaultRedisScript.class), anyList(), eq(USER_ID.toString()), eq("20"), anyString()))
                .thenReturn(1L);

        receiptService.recordRead(CONV_ID, USER_ID, 20L, 100L);

        verify(redisPublisher).publish(eq(CONV_ID), eq(RedisEventType.READ_RECEIPT), any());
    }

    @Test
    @DisplayName("getReceipts: Trả về trạng thái kết hợp giữa DB và Redis")
    void getReceipts_shouldMergeDbAndRedis() {
        User user = new User();
        user.setId(USER_ID);

        Conversation conv = new Conversation();
        conv.setId(CONV_ID);

        ConversationMember cm = ConversationMember.create(conv, user, MemberRole.MEMBER);
        cm.setLastDeliveredSeq(10L);
        cm.setLastReadSeq(8L);

        when(memberRepo.findAllByConversationIdWithUser(CONV_ID)).thenReturn(List.of(cm));
        when(redisTemplate.opsForHash()).thenReturn(hashOps);
        when(hashOps.entries(ReceiptService.KEY_DELIVERED_PREFIX + CONV_ID)).thenReturn(Map.of(USER_ID.toString(), "15"));
        when(hashOps.entries(ReceiptService.KEY_READ_PREFIX + CONV_ID)).thenReturn(Map.of(USER_ID.toString(), "12"));

        List<MemberReceiptResponse> receipts = receiptService.getReceipts(CONV_ID);

        assertThat(receipts).hasSize(1);
        assertThat(receipts.get(0).userId()).isEqualTo(USER_ID);
        assertThat(receipts.get(0).lastDeliveredSeq()).isEqualTo(15L);
        assertThat(receipts.get(0).lastReadSeq()).isEqualTo(12L);
    }

    @Test
    @DisplayName("flushDirtyReceiptsToDb: Gom lô dirty keys và ghi xuống PostgreSQL")
    void flushDirtyReceiptsToDb_shouldBatchUpdateDb() {
        when(redisTemplate.opsForSet()).thenReturn(setOps);
        when(setOps.members(ReceiptService.KEY_DIRTY_MEMBERS)).thenReturn(Set.of("1:10"));

        when(redisTemplate.opsForHash()).thenReturn(hashOps);
        when(hashOps.get(ReceiptService.KEY_DELIVERED_PREFIX + 1L, "10")).thenReturn("15");
        when(hashOps.get(ReceiptService.KEY_READ_PREFIX + 1L, "10")).thenReturn("12");

        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        receiptService.flushDirtyReceiptsToDb();

        verify(jdbcTemplate).update(contains("UPDATE conversation_members AS cm"), any(Object[].class));
        verify(setOps).remove(eq(ReceiptService.KEY_DIRTY_MEMBERS), any(Object[].class));
    }
}


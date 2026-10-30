package com.project.realtime._messaging_application.websocket.pubsub;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

/**
 * PubSubChannelManager – quản lý lifecycle của Redis channel subscriptions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Tại sao cần class này?
 *
 * Giải pháp đơn giản nhất: subscribe pattern "chat:conv:*" → nhận TẤT CẢ
 * conversation. Nhưng khi có hàng nghìn conversation, mỗi message Redis đều
 * tốn bandwidth ngay cả khi instance không có client nào của conversation đó.
 *
 * Giải pháp tốt hơn (đang dùng): Dynamic subscribe:
 *   - Khi client đầu tiên của conv X kết nối tới instance này → subscribe "chat:conv:X"
 *   - Khi client cuối cùng rời → unsubscribe → instance không nhận tin của conv X nữa
 *
 * Trade-off: cần đếm số client của mỗi conversation để biết lúc nào unsubscribe.
 *
 * Hiện tại dùng PatternTopic "chat:conv:*" (subscribe tất cả) để đơn giản hóa.
 * Khi cần tối ưu, chuyển sang addSubscription/removeSubscription theo convId.
 * ─────────────────────────────────────────────────────────────────────────
 */
@Component
public class PubSubChannelManager {

    private static final Logger log = LoggerFactory.getLogger(PubSubChannelManager.class);

    private final RedisMessageListenerContainer listenerContainer;

    /**
     * Đếm số WebSocket sessions đang subscribe một conversation trên instance này.
     * Key: conversationId, Value: số client đang subscribe
     * Dùng để biết khi nào cần unsubscribe khỏi Redis.
     */
    private final ConcurrentHashMap<Long, Integer> subscriberCount = new ConcurrentHashMap<>();

    public PubSubChannelManager(RedisMessageListenerContainer listenerContainer) {
        this.listenerContainer = listenerContainer;
    }

    /**
     * Ghi nhận một client STOMP mới subscribe vào conversation.
     * Nếu là client đầu tiên → thêm Redis subscription cho channel này.
     *
     * @param conversationId id của conversation
     * @param adapter        MessageListenerAdapter đã wrap RedisMessageSubscriber
     */
    public synchronized void addSubscription(Long conversationId, MessageListenerAdapter adapter) {
        int count = subscriberCount.merge(conversationId, 1, Integer::sum);
        if (count == 1) {
            // Client đầu tiên của conversation này trên instance → subscribe Redis
            String channel = RedisMessagePublisher.CHANNEL_PREFIX + conversationId;
            listenerContainer.addMessageListener(adapter, new PatternTopic(channel));
            log.info("Subscribed to Redis channel: {}", channel);
        } else {
            log.debug("Conversation {} already subscribed (count={})", conversationId, count);
        }
    }

    /**
     * Ghi nhận một client STOMP đã unsubscribe hoặc disconnect.
     * Nếu là client cuối cùng → xoá Redis subscription để không nhận tin không cần thiết.
     */
    public synchronized void removeSubscription(Long conversationId, MessageListenerAdapter adapter) {
        subscriberCount.compute(conversationId, (key, count) -> {
            if (count == null || count <= 1) {
                // Client cuối cùng rời → unsubscribe Redis
                String channel = RedisMessagePublisher.CHANNEL_PREFIX + conversationId;
                listenerContainer.removeMessageListener(adapter, new PatternTopic(channel));
                log.info("Unsubscribed from Redis channel: {}", channel);
                return null; // xoá key
            }
            return count - 1;
        });
    }

    /** Số client đang subscribe conversation này trên instance này */
    public int getSubscriberCount(Long conversationId) {
        return subscriberCount.getOrDefault(conversationId, 0);
    }
}

package com.project.realtime._messaging_application.modules.Friendship.entity;

/**
 * Trạng thái của một mối quan hệ bạn bè.
 *
 *  PENDING  : A gửi lời mời → B chưa phản hồi
 *  ACCEPTED : B chấp nhận → hai người là bạn
 *  BLOCKED  : A chặn B (hoặc B chặn A)
 *             Record này ẩn về phía người bị chặn,
 *             người chặn vẫn thấy nhưng không thể tương tác.
 *  DECLINED : B từ chối lời mời (tuỳ chọn – có thể bỏ nếu muốn đơn giản hơn)
 */
public enum FriendshipStatus {
    PENDING,
    ACCEPTED,
    BLOCKED,
    DECLINED
}

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook quản lý Browser Notification API.
 *
 * Cách dùng:
 *   const { showNotification } = useNotification();
 *   showNotification(msg, conv, onClickCallback);
 *
 * - Tự động xin permission khi mount.
 * - Chỉ hiện notification khi document.hidden === true (tab không active).
 * - Click notification → focus tab + gọi onClickCallback.
 * - Auto đóng sau 5 giây.
 */
export function useNotification() {
  const permissionRef = useRef(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  // Xin permission một lần khi hook mount
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        permissionRef.current = perm;
      });
    } else {
      permissionRef.current = Notification.permission;
    }
  }, []);

  /**
   * Hiện một browser notification.
   *
   * @param {object} msg  - Message object từ WS { sender, content, type, ... }
   * @param {object} conv - Conversation object { id, title, name, type, avatarUrl, ... }
   * @param {function} onClickCb - Callback khi user click notification
   */
  const showNotification = useCallback((msg, conv, onClickCb) => {
    // Không hiện nếu: tab đang active, permission bị từ chối, API không hỗ trợ
    if (!document.hidden) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    // Tên người gửi
    const senderName = msg.sender?.displayName || msg.sender?.username || 'Ai đó';

    // Nội dung thông báo theo loại tin nhắn
    let body;
    switch (msg.type) {
      case 'IMAGE':
        body = '📷 Đã gửi một hình ảnh';
        break;
      case 'FILE':
        body = `📎 Đã gửi tệp tin: ${msg.fileName || ''}`;
        break;
      default:
        body = msg.content || '';
        if (body.length > 80) body = body.substring(0, 80) + '…';
    }

    // Tiêu đề: nhóm thì hiện "Nhóm · Người gửi", direct thì chỉ hiện tên
    const isGroup = conv?.type === 'GROUP';
    const groupName = conv?.name || conv?.title || 'Nhóm';
    const title = isGroup ? `${groupName} · ${senderName}` : senderName;

    // Icon: ưu tiên avatarUrl của conversation, fallback về app favicon
    const icon = conv?.avatarUrl || '/favicon.ico';

    try {
      const notif = new Notification(title, {
        body,
        icon,
        badge: '/favicon.ico',
        tag: `conv-${conv?.id}`,   // cùng tag → tin sau ghi đè tin trước (tránh spam)
        renotify: true,            // vẫn rung/bật âm dù cùng tag
        silent: false,
      });

      // Click → focus tab và navigate đến conversation
      notif.onclick = () => {
        window.focus();
        notif.close();
        if (onClickCb) onClickCb();
      };

      // Tự đóng sau 5 giây
      setTimeout(() => notif.close(), 5000);
    } catch (err) {
      console.warn('[Notification] Không thể hiện thông báo:', err);
    }
  }, []);

  return { showNotification };
}


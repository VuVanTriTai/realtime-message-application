/**
 * 02_direct_message.js — Kịch bản 2: Gửi tin 1-1 thuần WebSocket (E2E WS-to-WS)
 * ==============================================================================
 * Mục đích: Đo độ trễ End-to-End thực tế giữa 2 người dùng qua WebSocket:
 *   - User A (Sender) kết nối WebSocket STOMP, định kỳ gửi tin tới /app/chat.send
 *   - User B (Receiver) kết nối WebSocket STOMP, lắng nghe /topic/conversation.{convId}
 *   - Cơ chế Vào trước - Ra sau: Receivers mở trước 10s và đóng sau 15s để hứng trọn tin
 *   - Đo tính toàn vẹn dữ liệu (Data Integrity): Xác nhận không thất thoát tin
 *   - 100% dùng WebSocket STOMP hai chiều, KHÔNG dùng HTTP REST API
 *
 * Chạy:
 *   .\load-test\k6.exe run load-test/scripts/02_direct_message.js
 *
 * Ngưỡng thành công:
 *   - P50 latency < 100ms
 *   - P95 latency < 300ms
 *   - P99 latency < 1000ms
 *   - Error rate < 1%
 */

import { sleep, check } from "k6";
import exec from "k6/execution";
import { Trend, Counter, Rate } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const e2eLatency  = new Trend("e2e_message_latency_ms", true);
const msgSent     = new Counter("messages_sent_total");
const msgReceived = new Counter("messages_received_total");
const errorRate   = new Rate("message_error_rate");

// ============================================================
// Thời gian vòng đời: Vào trước 20s - Ra sau 20s (Tránh mất tin giả)
// ============================================================
// SENDER_START_DELAY: Phải đủ lớn để 100% receiver hoàn thành SUBSCRIBE trước khi gửi tin.
//   - Warm JVM: 5-8s là đủ. Cold JVM: có thể cần 15-20s.
//   - Giá trị 20s đủ an toàn cho Cold JVM trên LAN.
const SENDER_START_DELAY  = 20;  // Tăng từ 10s → 20s, an toàn cho Cold JVM
const SEND_DURATION_SEC   = 300; // 5 phút gửi tin liên tục (1 tin / 2.5s)
const RECEIVER_DRAIN_TIME = 20;  // Tăng từ 15s → 20s, đủ cho Outbox Poller (1s/poll) flush tin cuối
const RECEIVER_TOTAL_SEC  = SENDER_START_DELAY + SEND_DURATION_SEC + RECEIVER_DRAIN_TIME; // 340s (5m40s)

export const options = {
  setupTimeout: "120s", // 50 cặp = 150 HTTP requests; với Cold JVM ~16-20s, buffer an toàn
  scenarios: {
    // 1. Nhóm Người nhận (User B): Mở WebSocket từ giây 0s, sống bao trùm toàn bộ bài test
    receivers: {
      executor:     "per-vu-iterations",
      exec:         "receiverScenario",
      vus:          50,
      iterations:   1,
      maxDuration:  `${RECEIVER_TOTAL_SEC + 30}s`,
    },
    // 2. Nhóm Người gửi (User A): Bắt đầu sau khi receivers đã sẵn sàng (giây thứ 20), chạy đúng 5 phút rồi dừng
    senders: {
      executor:     "per-vu-iterations",
      exec:         "senderScenario",
      vus:          50,
      iterations:   1,
      startTime:    `${SENDER_START_DELAY}s`,
      maxDuration:  `${SEND_DURATION_SEC + 30}s`,
    },
  },
  thresholds: {
    "e2e_message_latency_ms": ["p(50)<100", "p(95)<300", "p(99)<1000"],
    "message_error_rate":     ["rate<0.01"],
  },
};

// ============================================================
// Setup: Chuẩn bị 50 cặp User và Conversation từ DB seed
// ============================================================
export function setup() {
  console.log("==> [Setup] Đang khởi tạo 50 cặp chat 1-1 từ seed data...");
  const pairs = [];
  const TOTAL_PAIRS = 50;

  for (let i = 1; i <= TOTAL_PAIRS; i++) {
    const senderName   = `testuser${String(2 * i - 1).padStart(3, "0")}`;
    const receiverName = `testuser${String(2 * i).padStart(3, "0")}`;

    const tokenA = login(senderName, "LoadTest@123");
    const tokenB = login(receiverName, "LoadTest@123");

    if (!tokenA || !tokenB) {
      console.warn(`[Setup] Không thể đăng nhập cặp ${senderName} <-> ${receiverName}`);
      continue;
    }

    const convs = getMyConversations(tokenA);
    const directConv = convs.find(
      (c) => c.type === "DIRECT" &&
             (c.otherUserName === receiverName ||
              c.otherUserName === `LoadTest User #${2 * i}` ||
              !c.otherUserName)
    ) || convs.find((c) => c.type === "DIRECT");

    if (directConv) {
      pairs.push({
        pairIndex:     i,
        convId:        directConv.id,
        senderName:    senderName,
        receiverName:  receiverName,
        senderToken:   tokenA,
        receiverToken: tokenB,
      });
    }

    sleep(0.02);
  }

  console.log(`==> [Setup] Đã sẵn sàng ${pairs.length} cặp chat 1-1. Senders gửi trong ${SEND_DURATION_SEC}s, Receivers mở ${RECEIVER_TOTAL_SEC}s.`);
  if (pairs.length === 0) {
    throw new Error("Không tìm thấy conversation 1-1 nào! Vui lòng kiểm tra seed V6/V8.");
  }

  return { pairs };
}

// ============================================================
// Scenario 1: Người nhận (User B) qua WebSocket STOMP
// ============================================================
export function receiverScenario(data) {
  const pairIndex = exec.scenario.iterationInTest % data.pairs.length;
  const pair = data.pairs[pairIndex];

  stompSession({
    token:           pair.receiverToken,
    conversationIds: [pair.convId],
    durationSeconds: RECEIVER_TOTAL_SEC,
    onMessage: (msg) => {
      let content = null;
      if (msg && typeof msg.content === "string") {
        content = msg.content;
      } else if (msg && msg.lastMessage && typeof msg.lastMessage.content === "string") {
        content = msg.lastMessage.content;
      } else if (msg && msg.message && typeof msg.message.content === "string") {
        content = msg.message.content;
      }

      if (content && content.startsWith("k6|")) {
        const parts  = content.split("|");
        const sentAt = parseInt(parts[1], 10);

        if (!isNaN(sentAt)) {
          const latency = Date.now() - sentAt;
          e2eLatency.add(latency);
          msgReceived.add(1);
        }
      }
    },
  });
}

// ============================================================
// Scenario 2: Người gửi (User A) qua WebSocket STOMP
// ============================================================
export function senderScenario(data) {
  const pairIndex = exec.scenario.iterationInTest % data.pairs.length;
  const pair = data.pairs[pairIndex];

  stompSession({
    token:           pair.senderToken,
    conversationIds: [],
    durationSeconds: SEND_DURATION_SEC,
    onConnected: (socket, sendFrame) => {
      socket.setInterval(() => {
        const sentAt      = Date.now();
        const clientMsgId = `ws-k6-${__VU}-${sentAt}`;
        const content     = `k6|${sentAt}|Ping from ${pair.senderName}`;

        try {
          sendFrame("/app/chat.send", {
            conversationId:  pair.convId,
            content:         content,
            type:            "TEXT",
            clientMessageId: clientMsgId,
          });
          msgSent.add(1);
          errorRate.add(false); // Ghi nhận thành công -> mẫu số tăng, lỗi = 0
        } catch (err) {
          errorRate.add(true);  // Ghi nhận lỗi socket
        }
      }, 2500); // 2.5 giây / tin
    },
  });
}

// ============================================================
// Báo cáo tổng kết toàn vẹn dữ liệu (Data Integrity Summary)
// ============================================================
export function handleSummary(data) {
  const sent = data.metrics.messages_sent_total ? data.metrics.messages_sent_total.values.count : 0;
  const received = data.metrics.messages_received_total ? data.metrics.messages_received_total.values.count : 0;
  const lost = Math.max(0, sent - received);
  const lossRate = sent > 0 ? ((lost / sent) * 100).toFixed(2) : "0.00";
  const deliveryRate = sent > 0 ? ((received / sent) * 100).toFixed(2) : "100.00";

  const isPerfect = (lost === 0 && sent > 0);
  const statusIcon = isPerfect ? "✅ [PASSED]" : (lost <= sent * 0.005 ? "⚠️ [ACCEPTABLE]" : "❌ [FAILED]");

  const integrityBanner = `
================================================================================
  BÁO CÁO TOÀN VẸN DỮ LIỆU & THẤT THOÁT TIN NHẮN (DATA INTEGRITY REPORT)
================================================================================
  ${statusIcon} Kết quả kiểm thử:
    - Tổng tin nhắn gửi đi (Sent)      : ${sent} tin
    - Tổng tin nhắn nhận được (Received): ${received} tin
    - Số tin nhắn thất thoát (Lost)    : ${lost} tin (${lossRate}%)
    - Tỷ lệ phát thành công (Delivery) : ${deliveryRate}%
================================================================================
`;

  return {
    stdout: integrityBanner + "\n" + textSummary(data, { indent: " ", enableColors: true }),
  };
}

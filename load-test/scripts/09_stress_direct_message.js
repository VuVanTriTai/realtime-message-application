/**
 * 09_stress_direct_message.js — Kịch bản Stress Test Tải Cao & Dò Ngưỡng
 * ==============================================================================
 * Mục đích:
 *   - Đo độ trễ E2E và khả năng chịu tải của hệ thống ở cường độ cao (150 - 500 msg/s).
 *   - Hỗ trợ linh hoạt số cặp (PAIRS), tần suất gửi (INTERVAL_MS), và thời lượng (DURATION).
 *   - Đo tính toàn vẹn dữ liệu (Data Integrity): Xác nhận tỷ lệ phát thành công 100%, không mất tin.
 *   - 100% sử dụng WebSocket STOMP hai chiều (Client A -> Server -> Redis -> Server -> Client B).
 *
 * Cách chạy:
 *   # Mặc định: 150 cặp (300 VUs), 1000ms / tin (~150 tin/s, thời lượng 1m30s):
 *   .\load-test\k6.exe run load-test/scripts/09_stress_direct_message.js
 *
 *   # Tùy chỉnh tải cực hạn (250 cặp, 500ms / tin -> 500 tin/s):
 *   .\load-test\k6.exe run load-test/scripts/09_stress_direct_message.js -e PAIRS=250 -e INTERVAL_MS=500 -e DURATION=2m
 *
 *   # Dò ngưỡng gãy với Step Ramp (tự động tăng tốc độ gửi theo các giai đoạn):
 *   .\load-test\k6.exe run load-test/scripts/09_stress_direct_message.js -e PAIRS=150 -e STEP_RAMP=true
 */

import { sleep, check } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Cấu hình tham số kiểm thử qua Environment Variables
// ============================================================
const TOTAL_PAIRS      = parseInt(__ENV.PAIRS || "150", 10);
const BASE_INTERVAL_MS = parseInt(__ENV.INTERVAL_MS || "1000", 10);
const DURATION_STR     = __ENV.DURATION || "1m30s";
const IS_STEP_RAMP     = __ENV.STEP_RAMP === "true";

// Phân giải chuỗi thời gian thành giây
function parseDurationSec(dStr) {
  let totalSec = 0;
  const m = dStr.match(/(\d+)m/);
  const s = dStr.match(/(\d+)s/);
  if (m) totalSec += parseInt(m[1], 10) * 60;
  if (s) totalSec += parseInt(s[1], 10);
  return totalSec > 0 ? totalSec : 90;
}

// ============================================================
// Tính toán vòng đời: Vào trước - Ra sau (Tránh mất tin giả)
// ============================================================
const SEND_DURATION_SEC   = parseDurationSec(DURATION_STR);
const SENDER_START_DELAY  = 10; // Chờ 10s để 100% receiver kết nối & subscribe xong
const RECEIVER_DRAIN_TIME = 10; // Receiver sống thêm 10s sau khi sender dừng để hứng trọn tin cuối
const RECEIVER_TOTAL_SEC  = SENDER_START_DELAY + SEND_DURATION_SEC + RECEIVER_DRAIN_TIME;

// Custom Metrics
const e2eLatency  = new Trend("e2e_message_latency_ms", true);
const msgSent     = new Counter("messages_sent_total");
const msgReceived = new Counter("messages_received_total");
const errorRate   = new Rate("message_error_rate");

export const options = {
  scenarios: {
    // 1. Receivers: Vào trước ở giây 0, sống bao trùm toàn bộ bài test
    receivers: {
      executor:     "constant-vus",
      exec:         "receiverScenario",
      vus:          TOTAL_PAIRS,
      startTime:    "0s",
      duration:     `${RECEIVER_TOTAL_SEC}s`,
      gracefulStop: "5s",
    },
    // 2. Senders: Bắt đầu sau 10s (khi receivers đã sẵn sàng), dừng trước receivers
    senders: {
      executor:     "constant-vus",
      exec:         "senderScenario",
      vus:          TOTAL_PAIRS,
      startTime:    `${SENDER_START_DELAY}s`,
      duration:     `${SEND_DURATION_SEC}s`,
      gracefulStop: "5s",
    },
  },
  thresholds: {
    "e2e_message_latency_ms": ["p(50)<100", "p(95)<300", "p(99)<1000"],
    "message_error_rate":     ["rate<0.01"],
  },
};

function formatUsername(num) {
  return "testuser" + (num < 1000 ? String(num).padStart(3, "0") : String(num));
}

// ============================================================
// Setup: Khởi tạo danh sách các cặp chat 1-1 từ DB
// ============================================================
export function setup() {
  console.log(`==> [Setup] Bắt đầu khởi tạo ${TOTAL_PAIRS} cặp chat 1-1 (${TOTAL_PAIRS * 2} VUs)...`);
  console.log(`==> [Setup] Thời lượng gửi: ${SEND_DURATION_SEC}s (Receivers chạy ${RECEIVER_TOTAL_SEC}s để drain sạch tin)`);
  console.log(`==> [Setup] Tần suất gửi tin: ${BASE_INTERVAL_MS}ms / tin (Dự kiến: ${Math.round(1000 / BASE_INTERVAL_MS * TOTAL_PAIRS)} msg/s)`);
  if (IS_STEP_RAMP) {
    console.log(`==> [Setup] Chế độ Step Ramp: BẬT (sẽ tăng dần tốc độ gửi theo các giai đoạn)`);
  }

  const pairs = [];

  for (let i = 1; i <= TOTAL_PAIRS; i++) {
    const senderName   = formatUsername(2 * i - 1);
    const receiverName = formatUsername(2 * i);

    const tokenA = login(senderName, "LoadTest@123");
    const tokenB = login(receiverName, "LoadTest@123");

    if (!tokenA || !tokenB) {
      console.warn(`[Setup] Không thể đăng nhập cặp ${senderName} <-> ${receiverName}`);
      continue;
    }

    const convs = getMyConversations(tokenA);
    const directConv = convs.find((c) => c.type === "DIRECT");

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

    if (i % 25 === 0 || i === TOTAL_PAIRS) {
      console.log(`==> [Setup] Đã kết nối sẵn sàng ${pairs.length}/${TOTAL_PAIRS} cặp chat 1-1...`);
    }

    sleep(0.01); // Nghỉ siêu nhẹ tránh flood port lúc đăng nhập
  }

  if (pairs.length === 0) {
    throw new Error(`Không tìm thấy cuộc trò chuyện 1-1 nào! Vui lòng kiểm tra seed V6/V8.`);
  }

  console.log(`==> [Setup] Hoàn tất chuẩn bị ${pairs.length} cặp chat 1-1. Sẵn sàng bắt đầu Stress Test!`);
  return { pairs };
}

// ============================================================
// Scenario 1: Người nhận (User B) qua WebSocket STOMP
// ============================================================
export function receiverScenario(data) {
  const pair = data.pairs[(__VU - 1) % data.pairs.length];

  stompSession({
    token:           pair.receiverToken,
    conversationIds: [pair.convId],
    durationSeconds: RECEIVER_TOTAL_SEC + 5,
    onMessage: (msg) => {
      if (msg && typeof msg.content === "string" && msg.content.startsWith("k6|")) {
        const parts  = msg.content.split("|");
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
  const pair = data.pairs[(__VU - 1) % data.pairs.length];
  const startTime = Date.now();

  stompSession({
    token:           pair.senderToken,
    conversationIds: [],
    durationSeconds: SEND_DURATION_SEC + 5,
    onConnected: (socket, sendFrame) => {
      const scheduleNextSend = () => {
        let currentInterval = BASE_INTERVAL_MS;

        // Nếu bật Step Ramp: tự động tăng tần suất gửi theo thời gian
        if (IS_STEP_RAMP) {
          const elapsedSec = (Date.now() - startTime) / 1000;
          if (elapsedSec < 30) {
            currentInterval = BASE_INTERVAL_MS * 1.5; // Khởi động êm
          } else if (elapsedSec < 75) {
            currentInterval = BASE_INTERVAL_MS;       // Tải cao chuẩn
          } else if (elapsedSec < 120) {
            currentInterval = Math.max(400, Math.floor(BASE_INTERVAL_MS / 2)); // Tải rất nặng
          } else {
            currentInterval = Math.max(300, Math.floor(BASE_INTERVAL_MS / 3)); // Cực hạn
          }
        }

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
          errorRate.add(false); // Thành công -> mẫu số tăng, lỗi = 0
        } catch (err) {
          errorRate.add(true);  // Thất bại -> lỗi = 1
        }

        socket.setTimeout(scheduleNextSend, Math.max(10, currentInterval));
      };

      // Bắt đầu vòng gửi tin (tối thiểu 10ms để tránh lỗi k6 yêu cầu timeout > 0)
      socket.setTimeout(scheduleNextSend, Math.floor(Math.random() * 500) + 10);
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
  ${statusIcon} Trạng thái toàn vẹn dữ liệu:
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

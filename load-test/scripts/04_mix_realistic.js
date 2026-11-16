/**
 * 04_mix_realistic.js — Kịch bản 4: Mix thực tế giờ cao điểm (100% WebSocket STOMP)
 * ==============================================================================
 * Mô phỏng lưu lượng giờ cao điểm theo tỉ lệ người dùng thật:
 *   - 70% Idle Users:     Kết nối WebSocket, subscribe các cuộc hội thoại, chỉ đọc tin
 *   - 20% Active Senders: Kết nối WebSocket, gửi tin nhắn ngẫu nhiên mỗi 4-8s qua /app/chat.send
 *   - 10% Typers:         Phát sự kiện đang gõ phím ngẫu nhiên qua /app/chat.typing (isTyping: true/false)
 *
 * Tham số cấu hình (Environment Variables):
 *   - USERS: Tổng số VU tham gia test (Mặc định: 500)
 *            -> 350 Idle (70%) + 100 Senders (20%) + 50 Typers (10%)
 *
 * Cách chạy:
 *   # Mặc định (500 VUs):
 *   .\load-test\k6.exe run load-test/scripts/04_mix_realistic.js
 *   # Hoặc trên WSL2 Ubuntu:
 *   ./run-k6-wsl.sh scripts/04_mix_realistic.js
 *
 *   # Tùy chỉnh số VU (ví dụ 200 hoặc 1000 VUs):
 *   ./run-k6-wsl.sh scripts/04_mix_realistic.js -e USERS=200
 *
 * Ngưỡng thành công:
 *   - P95 message latency < 300ms
 *   - P99 message latency < 1000ms
 *   - Error rate < 2%
 */

import { sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Tham số cấu hình động
// ============================================================
const TOTAL_USERS = parseInt(__ENV.USERS || "500", 10);

const IDLE_VUS    = Math.floor(TOTAL_USERS * 0.70); // 70% Idle
const ACTIVE_VUS  = Math.floor(TOTAL_USERS * 0.20); // 20% Senders
const TYPER_VUS   = TOTAL_USERS - IDLE_VUS - ACTIVE_VUS; // 10% Typers

// ============================================================
// Custom metrics
// ============================================================
const e2eLatency  = new Trend("mix_e2e_latency_ms", true); // Độ trễ tin nhắn E2E
const msgSent     = new Counter("mix_messages_sent");      // Số tin nhắn đã phát
const msgReceived = new Counter("mix_messages_received");  // Số tin nhắn các user đã nhận
const typingSent  = new Counter("mix_typing_events_sent"); // Số sự kiện typing đã gửi
const errorRate   = new Rate("mix_error_rate");

// ============================================================
// Scenarios: 3 nhóm hành vi chạy đồng thời
// ============================================================
export const options = {
  setupTimeout: "180s", // Setup 500 users cần ~50-80s, buffer an toàn 180s
  scenarios: {
    // Nhóm 1: 70% user chỉ kết nối và đọc tin (Idle)
    idle_users: {
      executor:     "ramping-vus",
      exec:         "idleUserScenario",
      startVUs:     0,
      stages: [
        { duration: "1m",  target: IDLE_VUS }, // Ramp up vào phòng
        { duration: "5m",  target: IDLE_VUS }, // Giữ kết nối lắng nghe
        { duration: "30s", target: 0        }, // Rời phòng
      ],
      gracefulStop: "15s",
    },
    // Nhóm 2: 20% user tích cực chat (Gửi ngẫu nhiên 4 - 8s / tin)
    active_senders: {
      executor:     "ramping-vus",
      exec:         "activeSenderScenario",
      startVUs:     0,
      startTime:    "20s", // Bắt đầu sau khi các idle user đã bắt đầu subscribe
      stages: [
        { duration: "40s", target: ACTIVE_VUS },
        { duration: "4m30s", target: ACTIVE_VUS },
        { duration: "20s", target: 0          },
      ],
      gracefulStop: "15s",
    },
    // Nhóm 3: 10% user đang gõ phím (Bật/tắt typing ngẫu nhiên)
    typers: {
      executor:     "ramping-vus",
      exec:         "typerScenario",
      startVUs:     0,
      startTime:    "20s",
      stages: [
        { duration: "40s", target: TYPER_VUS },
        { duration: "4m30s", target: TYPER_VUS },
        { duration: "20s", target: 0         },
      ],
      gracefulStop: "15s",
    },
  },
  thresholds: {
    "mix_e2e_latency_ms": ["p(95)<300", "p(99)<1000"],
    "mix_error_rate":     ["rate<0.02"],
  },
};

function formatUsername(num) {
  return "testuser" + (num < 1000 ? String(num).padStart(3, "0") : String(num));
}

// ============================================================
// Setup: Pre-login và chuẩn bị conversation IDs cho các users
// ============================================================
export function setup() {
  console.log(`==> [Setup] Đang chuẩn bị tokens và danh sách conversation cho ${TOTAL_USERS} users...`);
  console.log(`==> [Setup] Phân bổ tải: ${IDLE_VUS} Idle (70%) | ${ACTIVE_VUS} Senders (20%) | ${TYPER_VUS} Typers (10%)`);

  const users = [];

  // Lấy sẵn thông tin nhóm LargeGroup từ tài khoản Admin
  let commonGroupId = null;
  const adminToken = login("admin", "Admin@123") || login("admin", "LoadTest@123") || login(formatUsername(1), "LoadTest@123");
  if (adminToken) {
    const adminConvs = getMyConversations(adminToken);
    const lg = adminConvs.find((c) => c.name === "LargeGroup" || c.name === "Dev Team") || adminConvs.find((c) => c.type === "GROUP");
    if (lg) {
      commonGroupId = lg.id;
      console.log(`==> [Setup] Tìm thấy nhóm chung: ID=${commonGroupId} (${lg.name || "Group"})`);
    }
  }

  for (let i = 1; i <= TOTAL_USERS; i++) {
    const uname = formatUsername(i);
    const token = login(uname, "LoadTest@123");

    if (token) {
      let convIds = [];
      const userConvs = getMyConversations(token);
      if (userConvs && userConvs.length > 0) {
        convIds = userConvs.map((c) => c.id);
      } else if (commonGroupId) {
        convIds = [commonGroupId];
      }

      users.push({
        username: uname,
        token:    token,
        convIds:  convIds,
      });
    }

    if (i % 50 === 0 || i === TOTAL_USERS) {
      console.log(`==> [Setup] Đã kết nối sẵn sàng ${users.length}/${TOTAL_USERS} users...`);
    }

    sleep(0.01);
  }

  if (users.length === 0) {
    throw new Error("Không thể đăng nhập bất kỳ user nào! Vui lòng kiểm tra seed V6/V8.");
  }

  console.log(`==> [Setup] Hoàn tất chuẩn bị cho ${users.length} users. Bắt đầu mô phỏng giờ cao điểm!`);
  return { users, commonGroupId };
}

// ============================================================
// Scenario A: Idle user (70%) — chỉ nghe tin, không gửi tin
// ============================================================
export function idleUserScenario(data) {
  const user = data.users[(__VU - 1) % data.users.length];

  stompSession({
    token:           user.token,
    conversationIds: user.convIds,
    durationSeconds: 480, // Giữ kết nối bao trùm giai đoạn test
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
          e2eLatency.add(Date.now() - sentAt);
          msgReceived.add(1);
        }
      }
    },
  });
}

// ============================================================
// Scenario B: Active sender (20%) — gửi tin ngẫu nhiên mỗi 4-8 giây
// ============================================================
export function activeSenderScenario(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const targetConvId = user.convIds.length > 0 ? user.convIds[0] : data.commonGroupId;

  if (!targetConvId) return;

  stompSession({
    token:           user.token,
    conversationIds: [targetConvId],
    durationSeconds: 420,
    onConnected: (socket, sendFrame) => {
      let msgCount = 0;

      const scheduleNextSend = () => {
        msgCount++;
        const sentAt      = Date.now();
        const clientMsgId = `ws-mix-${user.username}-${msgCount}-${sentAt}`;
        const content     = `k6|${sentAt}|Hello from active sender ${user.username} (#${msgCount})`;

        try {
          sendFrame("/app/chat.send", {
            conversationId:  targetConvId,
            content:         content,
            type:            "TEXT",
            clientMessageId: clientMsgId,
          });
          msgSent.add(1);
          errorRate.add(false); // Ghi nhận thành công -> mẫu số tăng, lỗi = 0
        } catch (err) {
          errorRate.add(true);  // Ghi nhận lỗi socket
        }

        // Lập lịch lần gửi tiếp theo ngẫu nhiên từ 4 đến 8 giây
        const nextDelay = Math.floor(Math.random() * 4000) + 4000;
        socket.setTimeout(scheduleNextSend, nextDelay);
      };

      // Bắt đầu gửi sau 1 - 3 giây ngẫu nhiên
      socket.setTimeout(scheduleNextSend, Math.floor(Math.random() * 2000) + 1000);
    },
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
          e2eLatency.add(Date.now() - sentAt);
          msgReceived.add(1);
        }
      }
    },
  });
}

// ============================================================
// Scenario C: Typer (10%) — gửi typing indicators qua WebSocket
// ============================================================
export function typerScenario(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const targetConvId = user.convIds.length > 0 ? user.convIds[0] : data.commonGroupId;

  if (!targetConvId) return;

  stompSession({
    token:           user.token,
    conversationIds: [],
    durationSeconds: 420,
    onConnected: (socket, sendFrame) => {
      const scheduleNextTyping = () => {
        try {
          // 1. Bật typing: isTyping = true
          sendFrame("/app/chat.typing", {
            conversationId: targetConvId,
            isTyping:       true,
          });
          typingSent.add(1);
          errorRate.add(false);

          // 2. Sau 2.5 - 3.5 giây tắt typing: isTyping = false
          socket.setTimeout(() => {
            try {
              sendFrame("/app/chat.typing", {
                conversationId: targetConvId,
                isTyping:       false,
              });
              typingSent.add(1);
              errorRate.add(false);
            } catch (_) {
              errorRate.add(true);
            }
          }, Math.floor(Math.random() * 1000) + 2500);

        } catch (err) {
          errorRate.add(true);
        }

        // Lập lịch đợt gõ phím tiếp theo ngẫu nhiên từ 6 đến 12 giây
        const nextDelay = Math.floor(Math.random() * 6000) + 6000;
        socket.setTimeout(scheduleNextTyping, nextDelay);
      };

      // Bắt đầu typing sau 1 - 4 giây ngẫu nhiên
      socket.setTimeout(scheduleNextTyping, Math.floor(Math.random() * 3000) + 1000);
    },
  });
}

// ============================================================
// Báo cáo tổng kết hỗn hợp giờ cao điểm (Peak Hour Realistic Report)
// ============================================================
export function handleSummary(data) {
  const getCount = (m) => (m && m.values && typeof m.values.count === "number" ? m.values.count : 0);
  const sent      = getCount(data.metrics.mix_messages_sent);
  const received  = getCount(data.metrics.mix_messages_received);
  const typing    = getCount(data.metrics.mix_typing_events_sent);

  let errRate = "0.00";
  if (data.metrics.mix_error_rate && data.metrics.mix_error_rate.values && typeof data.metrics.mix_error_rate.values.rate === "number") {
    errRate = (data.metrics.mix_error_rate.values.rate * 100).toFixed(2);
  }

  const getStat = (obj, key) => (obj && obj[key] !== undefined && obj[key] !== null ? Number(obj[key]).toFixed(1) : "N/A");
  const latVals = (data.metrics.mix_e2e_latency_ms && data.metrics.mix_e2e_latency_ms.values) ? data.metrics.mix_e2e_latency_ms.values : null;

  const latAvg  = getStat(latVals, "avg");
  const latP50  = getStat(latVals, "med"); // k6 lưu median là 'med'
  const latP95  = getStat(latVals, "p(95)");
  const latMax  = getStat(latVals, "max");

  const isErrOk   = parseFloat(errRate) < 2.0;
  const isLatOk   = parseFloat(latP95) < 300;
  const statusIcon = (isErrOk && isLatOk) ? "✅ [PASSED]" : "❌ [FAILED]";

  const reportBanner = `
================================================================================
  BÁO CÁO MÔ PHỎNG GIỜ CAO ĐIỂM (MIX REALISTIC LOAD TEST REPORT)
================================================================================
  ${statusIcon} Kết quả kiểm định:
    - Tổng số người dùng mô phỏng   : ${TOTAL_USERS} VUs (350 Idle, 100 Chat, 50 Typing)
    - Tổng tin nhắn đã gửi (Sent)    : ${sent} tin
    - Tổng tin nhắn nhận được        : ${received} lượt nhận
    - Sự kiện gõ phím (Typing)       : ${typing} events
    - Tỷ lệ lỗi (Error Rate)         : ${errRate}% (Ngưỡng cho phép: < 2%)

  ⚡ ĐỘ TRỄ TIN NHẮN E2E (LATENCY):
    - Trung bình (avg)               : ${latAvg} ms
    - Trung vị (p50)                 : ${latP50} ms
    - Phân vị 95 (p95)               : ${latP95} ms (Ngưỡng cho phép: < 300 ms)
    - Lớn nhất (max)                 : ${latMax} ms
================================================================================
`;

  return {
    stdout: reportBanner + "\n" + textSummary(data, { indent: " ", enableColors: true }),
  };
}

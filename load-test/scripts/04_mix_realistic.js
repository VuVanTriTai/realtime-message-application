/**
 * 04_mix_realistic.js — Kich ban 4: Mix thuc te gio cao diem (100% WebSocket)
 * ==============================================================================
 * Mo phong luu luong gio cao diem theo ti le nguoi dung that:
 *   - 70% Idle Users:    Ket noi WebSocket, subscribe cac cuoc hoi thoai, chi doc tin
 *   - 20% Active Senders: Ket noi WebSocket, gui tin nhan dinh ky moi 4-8s qua /app/chat.send
 *   - 10% Typers:        Phat su kien dang go phim qua /app/chat.typing (isTyping: true/false)
 *
 * Chay:
 *   k6 run load-test/scripts/04_mix_realistic.js
 *
 * Nguong thanh cong:
 *   - P95 message latency < 300ms
 *   - Error rate < 2%
 */

import { sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const e2eLatency  = new Trend("mix_e2e_latency_ms", true); // Do tre tin nhan E2E
const msgSent     = new Counter("mix_messages_sent");      // So tin nhan da phat
const msgReceived = new Counter("mix_messages_received");  // So tin nhan cac user da nhan
const typingSent  = new Counter("mix_typing_events_sent"); // So su kien typing da gui
const errorRate   = new Rate("mix_error_rate");

// ============================================================
// Scenarios: 3 nhom hanh vi chay dong thoi
// ============================================================
export const options = {
  scenarios: {
    // Nhom 1: 70% user chi ket noi va doc tin (Idle)
    idle_users: {
      executor: "ramping-vus",
      exec:     "idleUserScenario",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 140 }, // 140 VU (70% cua 200)
        { duration: "6m", target: 140 },
        { duration: "1m", target: 0   },
      ],
    },
    // Nhom 2: 20% user tich cuc chat
    active_senders: {
      executor:  "ramping-vus",
      exec:      "activeSenderScenario",
      startVUs:  0,
      startTime: "30s", // Khoi dong sau khi idle user da vao phong
      stages: [
        { duration: "1m", target: 40 },  // 40 VU (20% cua 200)
        { duration: "5m", target: 40 },
        { duration: "1m", target: 0  },
      ],
    },
    // Nhom 3: 10% user dang go phim
    typers: {
      executor:  "ramping-vus",
      exec:      "typerScenario",
      startVUs:  0,
      startTime: "30s",
      stages: [
        { duration: "1m", target: 20 },  // 20 VU (10% cua 200)
        { duration: "5m", target: 20 },
        { duration: "1m", target: 0  },
      ],
    },
  },
  thresholds: {
    "mix_e2e_latency_ms": ["p(95)<300"],
    "mix_error_rate":     ["rate<0.02"],
  },
};

// ============================================================
// Setup: Pre-login va chuan bi conversation IDs cho 200 users
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang chuan bi tokens va danh sach conversation cho 200 users...");
  const users = [];
  const TOTAL_USERS = 200;

  // Lay san thong tin nhom LargeGroup (neu co)
  const adminToken = login("admin", "Admin@123");
  let commonGroupId = null;
  if (adminToken) {
    const adminConvs = getMyConversations(adminToken);
    const lg = adminConvs.find((c) => c.type === "GROUP");
    if (lg) commonGroupId = lg.id;
  }

  for (let i = 1; i <= TOTAL_USERS; i++) {
    const uname = `testuser${String(i).padStart(3, "0")}`;
    const token = login(uname, "LoadTest@123");

    if (token) {
      let convIds = [];
      // Lay cac conversation ma user nay tham gia
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

    sleep(0.01);
  }

  console.log(`==> [Setup] Hoan tat setup cho ${users.length} users.`);
  return { users, commonGroupId };
}

// ============================================================
// Scenario A: Idle user (70%) — chi nghe tin, khong gui tin
// ============================================================
export function idleUserScenario(data) {
  const user = data.users[(__VU - 1) % data.users.length];

  stompSession({
    token:           user.token,
    conversationIds: user.convIds,
    durationSeconds: 460, // Giu ket noi suot test
    onMessage: (msg) => {
      // Khi co tin nhan den
      if (msg && typeof msg.content === "string" && msg.content.startsWith("k6|")) {
        const parts  = msg.content.split("|");
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
// Scenario B: Active sender (20%) — gui tin moi 4-8 giay qua WebSocket
// ============================================================
export function activeSenderScenario(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const targetConvId = user.convIds.length > 0 ? user.convIds[0] : data.commonGroupId;

  if (!targetConvId) return;

  stompSession({
    token:           user.token,
    conversationIds: [targetConvId],
    durationSeconds: 380,
    onConnected: (socket, sendFrame) => {
      let msgCount = 0;

      // Gui tin ngau nhien moi 4 - 8 giay
      socket.setInterval(() => {
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
        } catch (err) {
          errorRate.add(1);
        }
      }, 4000 + Math.random() * 4000);
    },
    onMessage: (msg) => {
      if (msg && typeof msg.content === "string" && msg.content.startsWith("k6|")) {
        const parts  = msg.content.split("|");
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
// Scenario C: Typer (10%) — gui typing indicators qua WebSocket
// ============================================================
export function typerScenario(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const targetConvId = user.convIds.length > 0 ? user.convIds[0] : data.commonGroupId;

  if (!targetConvId) return;

  stompSession({
    token:           user.token,
    conversationIds: [],
    durationSeconds: 380,
    onConnected: (socket, sendFrame) => {
      // Dinh ky bat/tat trang thai dang go phim
      socket.setInterval(() => {
        try {
          // 1. Bat typing: isTyping = true
          sendFrame("/app/chat.typing", {
            conversationId: targetConvId,
            isTyping:       true,
          });
          typingSent.add(1);

          // 2. Sau 3 giay tat typing: isTyping = false
          socket.setTimeout(() => {
            try {
              sendFrame("/app/chat.typing", {
                conversationId: targetConvId,
                isTyping:       false,
              });
              typingSent.add(1);
            } catch (_) {}
          }, 3000);

        } catch (err) {
          errorRate.add(1);
        }
      }, 8000 + Math.random() * 4000);
    },
  });
}

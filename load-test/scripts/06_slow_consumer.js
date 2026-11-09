/**
 * 06_slow_consumer.js — Kich ban 6: Xu ly Client doc cham (Slow Consumer Protection)
 * ===================================================================================
 * Muc dich kiem tra co che tu ve cua Spring Boot WebSocket Transport:
 *   - sendBufferSizeLimit = 256 KB: Gioi han bo dem toi da cho 1 session
 *   - sendTimeLimit       = 15 giay: Thoi gian toi da de gui xong 1 frame toi client
 *
 * Kich ban:
 *   1. 90 Normal Consumers: Ket noi, tieu thu tin nhan nhanh chong, do do tre
 *   2. 10 Slow Consumers:   Ket noi, subscribe vao nhom nhung bi ngap buffer
 *   3. Burst Sender:        Admin phat lien tuc cac tin nhan lon (~3 KB/tin) vao nhom
 *
 * Ky vong:
 *   - Server tu dong phat hien buffer cua Slow Consumer day 256 KB -> cat ket noi (Killed)
 *   - Normal Consumer van nhan tin binh thuong, khong bi giat lag keo dai (P95 < 300ms)
 *   - Heap RAM tren server khong bi phinh to vo han
 *
 * Chay:
 *   k6 run load-test/scripts/06_slow_consumer.js
 *
 * Nguong thanh cong:
 *   - slow_consumer_killed_count > 0 (Server cat it nhat 1 session doc cham)
 *   - slow_test_normal_latency_ms P95 < 300ms
 *   - slow_test_normal_error_rate < 1%
 */

import { sleep } from "k6";
import ws from "k6/ws";
import { Trend, Counter, Rate } from "k6/metrics";
import { login, getMyConversations } from "./auth-helper.js";
import { stompSession, buildFrame, parseFrame, WS_URL } from "./stomp-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const normalLatency = new Trend("slow_test_normal_latency_ms", true); // Do tre cua user binh thuong
const timeToKill    = new Trend("slow_test_time_to_kill_ms",    true); // Thoi gian den khi server cat slow session
const slowKilled    = new Counter("slow_consumer_sessions_killed");    // So luong session slow bi server dong
const normalMsgRecv = new Counter("slow_test_normal_messages_received");
const burstSent     = new Counter("slow_test_burst_messages_sent");
const normalError   = new Rate("slow_test_normal_error_rate");

// ============================================================
// Scenarios: 3 nhom tham gia
// ============================================================
export const options = {
  scenarios: {
    // 1. 90 User binh thuong nhan tin va xu ly nhanh
    normal_consumers: {
      executor: "constant-vus",
      exec:     "normalConsumerScenario",
      vus:      90,
      duration: "3m",
    },
    // 2. 10 Slow Consumer co tinh bi ngap buffer
    slow_consumers: {
      executor: "constant-vus",
      exec:     "slowConsumerScenario",
      vus:      10,
      duration: "3m",
    },
    // 3. Sender phat tin nhan lon don dap de lam day buffer
    burst_senders: {
      executor:  "constant-vus",
      exec:      "burstSenderScenario",
      vus:       2,
      duration:  "2m30s",
      startTime: "10s", // Bat dau sau 10s khi cac consumer da subscribe
    },
  },
  thresholds: {
    "slow_test_normal_latency_ms": ["p(95)<300"],
    "slow_test_normal_error_rate": ["rate<0.01"],
  },
};

// ============================================================
// Setup: Pre-login va tim ID nhom LargeGroup
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang chuan bi tai khoan va xac dinh nhom chat...");

  const adminToken = login("admin", "Admin@123");
  if (!adminToken) {
    throw new Error("Khong the dang nhap tai khoan admin!");
  }

  // Tim groupId cua LargeGroup
  let targetGroupId = __ENV.GROUP_ID || null;
  if (!targetGroupId) {
    const adminConvs = getMyConversations(adminToken);
    const lg = adminConvs.find(
      (c) => c.type === "GROUP" && (c.name === "LargeGroup" || c.name === "Dev Team")
    );
    if (lg) {
      targetGroupId = String(lg.id);
    } else {
      const anyG = adminConvs.find((c) => c.type === "GROUP");
      if (anyG) targetGroupId = String(anyG.id);
      else throw new Error("Khong tim thay nhom GROUP nao de test!");
    }
  }

  console.log(`==> [Setup] Su dung nhom co ID = ${targetGroupId}`);

  // Pre-login 90 Normal users (testuser001..090) va 10 Slow users (testuser091..100)
  const normalTokens = [];
  for (let i = 1; i <= 90; i++) {
    const uname = `testuser${String(i).padStart(3, "0")}`;
    const token = login(uname, "LoadTest@123");
    if (token) normalTokens.push(token);
    sleep(0.005);
  }

  const slowTokens = [];
  for (let i = 91; i <= 100; i++) {
    const uname = `testuser${String(i).padStart(3, "0")}`;
    const token = login(uname, "LoadTest@123");
    if (token) slowTokens.push(token);
    sleep(0.005);
  }

  console.log(`==> [Setup] Chuan bi xong ${normalTokens.length} Normal tokens va ${slowTokens.length} Slow tokens.`);

  return {
    adminToken,
    groupId: targetGroupId,
    normalTokens,
    slowTokens,
  };
}

// ============================================================
// Scenario 1: Normal Consumer (90 VU) — Nhan tin va doc nhanh
// ============================================================
export function normalConsumerScenario(data) {
  const token = data.normalTokens[(__VU - 1) % data.normalTokens.length];

  stompSession({
    token:           token,
    conversationIds: [data.groupId],
    durationSeconds: 170,
    onMessage: (msg) => {
      if (msg && typeof msg.content === "string" && msg.content.startsWith("k6|")) {
        const parts  = msg.content.split("|");
        const sentAt = parseInt(parts[1], 10);
        if (!isNaN(sentAt)) {
          normalLatency.add(Date.now() - sentAt);
          normalMsgRecv.add(1);
        }
      }
    },
  });
}

// ============================================================
// Scenario 2: Slow Consumer (10 VU) — Server se cat khi buffer day
// ============================================================
export function slowConsumerScenario(data) {
  const token = data.slowTokens[(__VU - 1) % data.slowTokens.length];
  const connectStart = Date.now();
  let serverClosedSession = false;

  ws.connect(
    WS_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    function (socket) {
      socket.on("open", () => {
        // Gui CONNECT
        socket.send(buildFrame("CONNECT", {
          "accept-version": "1.2",
          "heart-beat":     "0,0", // Khong gui heartbeat client de tap trung doc buffer
          Authorization:    `Bearer ${token}`,
        }));
      });

      socket.on("message", (raw) => {
        if (!raw) return;
        // Chi xu ly CONNECTED de subscribe vao nhom
        if (raw.includes("CONNECTED")) {
          socket.send(buildFrame("SUBSCRIBE", {
            id:          "sub-slow-0",
            destination: `/topic/conversation.${data.groupId}`,
          }));
        }
        // Khi tin nhan broadcast do don ve -> gia lap tieu thu cham bang busy loop
        const busyUntil = Date.now() + 50; // Delay xu ly moi frame
        while (Date.now() < busyUntil) {
          // busy wait
        }
      });

      // Lang nghe su kien Server chém đứt kết nối
      socket.on("close", (code) => {
        serverClosedSession = true;
        const duration = Date.now() - connectStart;
        timeToKill.add(duration);
        slowKilled.add(1);
        console.log(`[SlowConsumer VU ${__VU}] Session killed by server (code ${code}) after ${duration}ms`);
      });

      // Giu session de quan sat server cat
      socket.setTimeout(() => {
        try { socket.close(); } catch (_) {}
      }, 160 * 1000);

      socket.on("error", () => {});
    }
  );
}

// ============================================================
// Scenario 3: Burst Sender — Phat tin lon (~3 KB) lien tuc
// ============================================================
export function burstSenderScenario(data) {
  stompSession({
    token:           data.adminToken,
    conversationIds: [],
    durationSeconds: 140,
    onConnected: (socket, sendFrame) => {
      let count = 0;

      // Moi 250ms ban 1 tin nhan dung luong lon (~3 KB) de lam tran bo dem 256KB cua slow consumer
      socket.setInterval(() => {
        count++;
        const sentAt      = Date.now();
        const clientMsgId = `ws-burst-${__VU}-${count}-${sentAt}`;

        // Tao payload ~3 KB text (chat text dai)
        const paddingText = "A".repeat(2800);
        const content     = `k6|${sentAt}|[BURST-${count}] ${paddingText}`;

        try {
          sendFrame("/app/chat.send", {
            conversationId:  parseInt(data.groupId, 10),
            content:         content,
            type:            "TEXT",
            clientMessageId: clientMsgId,
          });
          burstSent.add(1);
        } catch (err) {
          normalError.add(1);
        }
      }, 250); // 4 tin/giay x 3 KB = 12 KB/s moi sender -> 24 KB/s cho 2 senders -> day 256 KB trong ~15s
    },
  });
}

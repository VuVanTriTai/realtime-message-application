/**
 * 03_large_group.js — Kich ban 3: Nhom lon & Do do tre Fan-out (100% WebSocket)
 * ==============================================================================
 * Muc dich: Do toc do phat tin (fan-out) khi mot nhom co nhieu thanh vien online:
 *   - 200 thanh vien trong nhom "LargeGroup" dong thoi online qua WebSocket STOMP
 *   - Admin gui tin nhan vao nhom qua WebSocket /app/chat.send
 *   - Server luu DB -> Outbox -> Redis -> Fan-out broadcast toi 200 thanh vien
 *   - Tung thanh vien ghi nhan do tre: latency = Date.now() - sentAt
 *   - Do luong: ty le nhan du tin, thoi gian broadcast toi toan bo thanh vien
 *
 * Chay:
 *   k6 run load-test/scripts/03_large_group.js
 *   (Hoac truyen tuy chon ID: k6 run -e GROUP_ID=<id> load-test/scripts/03_large_group.js)
 *
 * Nguong thanh cong:
 *   - P50 fanout latency < 150ms
 *   - P95 fanout latency < 400ms
 *   - P99 fanout latency < 1000ms
 *   - Error rate < 1%
 */

import { sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const groupLatency  = new Trend("group_e2e_latency_ms",   true); // Do tre Fanout den moi member
const msgSent       = new Counter("group_messages_sent");        // So tin Admin da phat vao nhom
const msgReceived   = new Counter("group_messages_received");    // Tong so luot member nhan tin
const errorRate     = new Rate("group_error_rate");

// ============================================================
// Options: 2 Scenarios chay song song
// ============================================================
export const options = {
  scenarios: {
    // 1. 200 thanh vien online ket noi WebSocket, subscribe /topic/conversation.{groupId}
    subscribers: {
      executor: "ramping-vus",
      exec:     "subscriberScenario",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 200 },  // Tang dan 200 thanh vien online
        { duration: "5m", target: 200 },  // Duy tri 200 thanh vien online
        { duration: "1m", target: 0   },  // Ha tai
      ],
    },
    // 2. Admin gui tin dinh ky qua WebSocket /app/chat.send
    senders: {
      executor:  "constant-vus",
      exec:      "senderScenario",
      vus:       1,
      duration:  "6m",
      startTime: "1m", // Bat dau sau 1 phut khi cac thanh vien da online on dinh
    },
  },
  thresholds: {
    "group_e2e_latency_ms": ["p(50)<150", "p(95)<400", "p(99)<1000"],
    "group_error_rate":     ["rate<0.01"],
  },
};

// ============================================================
// Setup: Chay 1 lan duy nhat truoc khi test
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang chuan bi tai khoan va xac dinh ID nhom LargeGroup...");

  // 1. Dang nhap Admin (nguoi tao nhom va sender)
  const adminToken = login("admin", "Admin@123");
  if (!adminToken) {
    throw new Error("Khong the dang nhap tai khoan admin! Kiem tra seed data.");
  }

  // 2. Tim ID cua nhom "LargeGroup" tu danh sach hoi thoai cua admin
  let targetGroupId = __ENV.GROUP_ID || null;

  if (!targetGroupId) {
    const adminConvs = getMyConversations(adminToken);
    const largeGroup = adminConvs.find(
      (c) => c.type === "GROUP" && (c.name === "LargeGroup" || c.name === "Dev Team")
    );
    if (largeGroup) {
      targetGroupId = String(largeGroup.id);
      console.log(`==> [Setup] Tim thay nhom '${largeGroup.name}' co ID = ${targetGroupId}`);
    } else {
      // Fallback: lay group bat ky
      const anyGroup = adminConvs.find((c) => c.type === "GROUP");
      if (anyGroup) {
        targetGroupId = String(anyGroup.id);
        console.log(`==> [Setup] Dung nhom mac dinh ID = ${targetGroupId}`);
      } else {
        throw new Error("Khong tim thay nhom nao! Vui long kiem tra migration V6.");
      }
    }
  }

  // 3. Pre-login 200 load-test user (testuser001..testuser200)
  console.log("==> [Setup] Pre-login 200 thanh vien cho nhom...");
  const subscriberTokens = [];
  const TOTAL_MEMBERS = 200;

  for (let i = 1; i <= TOTAL_MEMBERS; i++) {
    const uname = `testuser${String(i).padStart(3, "0")}`;
    const token = login(uname, "LoadTest@123");
    if (token) {
      subscriberTokens.push(token);
    }
    sleep(0.01); // Tranh gay shock luc khoi tao
  }

  console.log(`==> [Setup] Da chuan bi thanh cong ${subscriberTokens.length} token thanh vien.`);

  return {
    adminToken,
    groupId: targetGroupId,
    subscriberTokens,
  };
}

// ============================================================
// Scenario 1: Thanh vien nhom online (Subscribers)
// ============================================================
export function subscriberScenario(data) {
  const tokens = data.subscriberTokens;
  const tokenIndex = (__VU - 1) % tokens.length;
  const token = tokens[tokenIndex];

  stompSession({
    token:           token,
    conversationIds: [data.groupId],
    durationSeconds: 380, // Giu ket noi suot thoi gian stage
    onMessage: (msg) => {
      // Khi nhan duoc tin nhan fan-out tu /topic/conversation.{groupId}
      if (msg && typeof msg.content === "string" && msg.content.startsWith("k6|")) {
        const parts  = msg.content.split("|");
        const sentAt = parseInt(parts[1], 10);

        if (!isNaN(sentAt)) {
          const latency = Date.now() - sentAt;
          groupLatency.add(latency);
          msgReceived.add(1);
        }
      }
    },
  });
}

// ============================================================
// Scenario 2: Admin gui tin nhan vao nhom (Sender qua WebSocket)
// ============================================================
export function senderScenario(data) {
  stompSession({
    token:           data.adminToken,
    conversationIds: [], // Sender khong can nghe lai
    durationSeconds: 300,
    onConnected: (socket, sendFrame) => {
      let count = 0;

      // Moi 3 giay phat 1 tin nhan qua WebSocket /app/chat.send
      socket.setInterval(() => {
        count++;
        const sentAt      = Date.now();
        const clientMsgId = `ws-grp-${count}-${sentAt}`;
        const content     = `k6|${sentAt}|[FANOUT TEST] Message #${count} to LargeGroup`;

        try {
          sendFrame("/app/chat.send", {
            conversationId:  parseInt(data.groupId, 10),
            content:         content,
            type:            "TEXT",
            clientMessageId: clientMsgId,
          });
          msgSent.add(1);
        } catch (err) {
          errorRate.add(1);
        }
      }, 3000); // 3s / tin nhan
    },
  });
}

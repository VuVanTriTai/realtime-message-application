/**
 * 07_soak_test.js — Kich ban 7: Soak test (100% WebSocket STOMP)
 * ==============================================================================
 * Muc dich: Phat hien ro ri bo nho (memory leaks) va ket noi ma (zombie connections)
 *   - Tai 200 VU chay on dinh trong 90 phut (hoac thoi gian cau hinh).
 *   - 100% full-duplex WebSocket STOMP:
 *       + Lang nghe qua /topic/conversation.{id}
 *       + Dinh ky gui tin qua /app/chat.send (k6|<sentAt>|<content>)
 *       + Do do tre E2E tu luc gui den luc nhan lai qua WebSocket.
 *   - Khong su dung REST API de gui tin, khong login trong qua trinh test (setup() truoc).
 *
 * Theo doi he thong:
 *   - Heap memory sau 90 phut khong duoc tang dot bien (< 1.5x so voi sau 10 phut)
 *   - Do tre E2E P95 on dinh xuyen suot qua trinh test
 *   - Outbox queue delay (chat.outbox.delay) khong bi don u
 *   - STOMP session khong bi treo / zombie
 *
 * Chay:
 *   k6 run load-test/scripts/07_soak_test.js
 *   (De test nhanh 10 phut: k6 run -e SOAK_MINUTES=10 load-test/scripts/07_soak_test.js)
 *
 * Nguong thanh cong:
 *   - P95 latency < 500ms
 *   - Error rate < 1%
 */

import { sleep, check } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const e2eLatency  = new Trend("soak_e2e_latency_ms", true); // Do tre End-to-End WebSocket
const msgSent     = new Counter("soak_messages_sent");      // Tong tin nhan phat di qua WS
const msgReceived = new Counter("soak_messages_received");  // Tong tin nhan nhan duoc qua WS
const errorRate   = new Rate("soak_error_rate");            // Ty le loi (ket noi / frame loi)

// Thoi gian soak (mac dinh 80 phut, tong 90 phut ca warm up va cool down)
const soakDuration = __ENV.SOAK_MINUTES ? `${__ENV.SOAK_MINUTES}m` : "80m";

export const options = {
  stages: [
    { duration: "5m",          target: 200 }, // Warm up len 200 VU
    { duration: soakDuration,  target: 200 }, // Soak: giu deu 200 VU lien tuc
    { duration: "5m",          target: 0   }, // Cool down
  ],
  thresholds: {
    "soak_e2e_latency_ms": ["p(95)<500"],
    "soak_error_rate":     ["rate<0.01"],
  },
};

// ============================================================
// Setup: Pre-login 200 users va lay truoc danh sach conversation
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang chuan bi credentials va conversation cho 200 users...");
  const users = [];
  const TOTAL_USERS = 200;

  // Tim san group chat dung chung neu co
  const adminToken = login("admin", "Admin@123");
  let commonGroupId = null;
  if (adminToken) {
    const adminConvs = getMyConversations(adminToken);
    const grp = adminConvs.find((c) => c.type === "GROUP");
    if (grp) commonGroupId = grp.id;
  }

  for (let i = 1; i <= TOTAL_USERS; i++) {
    const uname = `testuser${String(i).padStart(3, "0")}`;
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

    sleep(0.01);
  }

  console.log(`==> [Setup] Hoan tat setup cho ${users.length} users. Bat dau Soak Test...`);
  return { users, commonGroupId };
}

// ============================================================
// Default VU logic: 100% Full-duplex WebSocket STOMP
// ============================================================
export default function (data) {
  if (!data || !data.users || data.users.length === 0) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  const user = data.users[(__VU - 1) % data.users.length];
  const targetConvId = user.convIds.length > 0 ? user.convIds[0] : data.commonGroupId;

  // Moi phien ket noi giu 5 phut (300s) roi luan phien tai lap ket noi
  // Giup kiem tra ca kha nang don dep session (zombie connection) va tai ket noi on dinh
  const sessionDuration = 300;

  const res = stompSession({
    token:           user.token,
    conversationIds: user.convIds.length > 0 ? user.convIds : (targetConvId ? [targetConvId] : []),
    durationSeconds: sessionDuration,
    onConnected: (socket, sendFrame) => {
      if (!targetConvId) return;

      let msgCount = 0;

      // Moi VU gui tin nhan qua WebSocket moi 20 - 40 giay (tai deu dan, ben bi)
      socket.setInterval(() => {
        msgCount++;
        const sentAt      = Date.now();
        const clientMsgId = `ws-soak-${user.username}-${__VU}-${msgCount}-${sentAt}`;
        const content     = `k6|${sentAt}|[SOAK] msg #${msgCount} from ${user.username}`;

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
      }, 20000 + Math.random() * 20000);
    },
    onMessage: (msg) => {
      // Tinh toan E2E latency tu payload format k6|<sentAt>|<content>
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

  const ok = check(res, {
    "soak: ws connected 101": (r) => r && r.status === 101,
  });

  if (!ok) {
    errorRate.add(1);
  }
}

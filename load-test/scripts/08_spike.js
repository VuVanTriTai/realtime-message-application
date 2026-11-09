/**
 * 08_spike.js — Kich ban 8: Spike test (100% WebSocket STOMP)
 * ==============================================================================
 * Muc dich: Kiem tra kha nang chiu dung va tu phuc hoi cua he thong khi bi dot bien luu luong (5x)
 *
 * Kich ban:
 *   - Baseline: 200 VU (luu luong on dinh binh thuong trong 2 phut)
 *   - Spike:    Tang vot len 1000 VU trong 30 giay!
 *   - Hold:     Duy tri dinh 1000 VU trong 2 phut
 *   - Rampdown: Giam dot ngot ve 200 VU trong 30 giay
 *   - Recovery: Giu 200 VU trong 3 phut de danh gia he thong co tu on dinh lai khong
 *   - Cooldown: Ha ve 0 VU trong 1 phut
 *
 * Thu nghiem:
 *   - WebSocket / STOMP inbound thread pool (max 64) co bi bao hoa?
 *   - HikariCP pool (max 30 conn) co bi queue timeout khong?
 *   - Redis Lettuce connection pool (max 16) co bi nghen khong?
 *   - Do tre E2E sau spike co nhanh chong ha xuong nguong binh thuong (< 300ms) khong?
 *
 * Chay:
 *   k6 run load-test/scripts/08_spike.js
 *
 * Nguong thanh cong:
 *   - Trong spike: P99 latency < 2000ms
 *   - O baseline / recovery: P95 latency < 500ms
 *   - Error rate trong suot test < 5%
 */

import { sleep, check } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const spikeLatency = new Trend("spike_latency_ms", true); // Do tre tin nhan E2E
const msgSent      = new Counter("spike_messages_sent");  // Tong tin nhan da gui qua WS
const msgReceived  = new Counter("spike_messages_received"); // Tong tin nhan nhan qua WS
const errorRate    = new Rate("spike_error_rate");        // Ty le loi (ket noi, gui tin)

// ============================================================
// Stages: Dot bien tai 5x
// ============================================================
export const options = {
  stages: [
    { duration: "2m",  target: 200  }, // 1. Baseline on dinh tai 200 VU
    { duration: "30s", target: 1000 }, // 2. Spike: Tang vot len 1000 VU trong 30 giay!
    { duration: "2m",  target: 1000 }, // 3. Giu dinh 1000 VU trong 2 phut
    { duration: "30s", target: 200  }, // 4. Giam nhanh ve 200 VU
    { duration: "3m",  target: 200  }, // 5. Recovery: Theo doi do tre tro ve binh thuong
    { duration: "1m",  target: 0    }, // 6. Cool down
  ],
  thresholds: {
    "spike_latency_ms": [
      { threshold: "p(99)<2000", abortOnFail: false }, // Trong dot spike: P99 < 2000ms
      { threshold: "p(95)<500",  abortOnFail: false }, // Sau recovery / baseline: P95 < 500ms
    ],
    "spike_error_rate": ["rate<0.05"], // Toi da 5% loi khi chiu dot bien lon
  },
};

// ============================================================
// Setup: Pre-login 200 users va chuan bi truoc conversation
// (Tranh viec 1000 VU cung luc goi API login gay Auth/BCrypt storm)
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang chuan bi credentials va conversation cho 200 users...");
  const users = [];
  const TOTAL_USERS = 200;

  // Tim san common group neu co
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

  console.log(`==> [Setup] Hoan tat setup cho ${users.length} users. Bat dau Spike Test...`);
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

  // 1000 VUs chia deu cho 200 user accounts (mo phong multi-device / multi-tab sessions)
  const user = data.users[(__VU - 1) % data.users.length];
  const targetConvId = user.convIds.length > 0 ? user.convIds[0] : data.commonGroupId;

  // Moi VU giu ket noi 2 phut (120s) de phu hop voi chu ky cua tung stage
  const sessionDuration = 120;

  const res = stompSession({
    token:           user.token,
    conversationIds: user.convIds.length > 0 ? user.convIds : (targetConvId ? [targetConvId] : []),
    durationSeconds: sessionDuration,
    onConnected: (socket, sendFrame) => {
      if (!targetConvId) return;

      let msgCount = 0;

      // Trong dot spike, cac client hoat dong tich cuc, gui tin nhan don dap moi 1.5 - 2.5s
      socket.setInterval(() => {
        msgCount++;
        const sentAt      = Date.now();
        const clientMsgId = `ws-spike-${user.username}-${__VU}-${msgCount}-${sentAt}`;
        const content     = `k6|${sentAt}|[SPIKE] ${user.username} (VU #${__VU}) msg #${msgCount}`;

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
      }, 1500 + Math.random() * 1000);
    },
    onMessage: (msg) => {
      // Tinh toan E2E latency tu format payload k6|<sentAt>|<content>
      if (msg && typeof msg.content === "string" && msg.content.startsWith("k6|")) {
        const parts  = msg.content.split("|");
        const sentAt = parseInt(parts[1], 10);
        if (!isNaN(sentAt)) {
          spikeLatency.add(Date.now() - sentAt);
          msgReceived.add(1);
        }
      }
    },
  });

  const ok = check(res, {
    "spike: ws connected 101": (r) => r && r.status === 101,
  });

  if (!ok) {
    errorRate.add(1);
  }
}

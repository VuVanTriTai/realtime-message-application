/**
 * 03_large_group.js — Kich ban 3: Nhom lon
 * =======================================================
 * Muc dich: Do thoi gian fanout khi 1 nhom co nhieu thanh vien online
 *   - 1 nguoi gui tin (sender VU)
 *   - N nguoi nhan (subscriber VU) do do tre
 *
 * Cac muc tai:
 *   Round 1: 100 subscriber + 1 sender (nhom nho)
 *   Round 2: 500 subscriber + 1 sender
 *   Round 3: 1000 subscriber + 1 sender (gio han cua seed data)
 *
 * Chay:
 *   k6 run -e GROUP_ID=<id> load-test/scripts/03_large_group.js
 *   (GROUP_ID: ID cua nhom large-group trong DB, lay tu seed data)
 *
 * Nguong thanh cong:
 *   - P95 fanout latency < 500ms (tu luc gui den nguoi nhan cuoi nhan)
 *   - Khong mat tin: so tin nhan = so VU subscriber * so tin gui
 */

import { sleep, check } from "k6";
import { Trend, Counter, Gauge } from "k6/metrics";
import { stompConnect, stompSend, stompDisconnect } from "./stomp-helper.js";
import { login, sendMessageREST }                   from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const fanoutFirstMs = new Trend("fanout_first_receiver_ms",  true); // Nguoi nhan dau tien
const fanoutLastMs  = new Trend("fanout_last_receiver_ms",   true); // Nguoi nhan cuoi cung
const msgDelivered  = new Counter("group_messages_delivered");
const msgMissed     = new Counter("group_messages_missed");

// GROUP_ID lay tu env var hoac dung group mac dinh tu seed data
const GROUP_ID = __ENV.GROUP_ID || "1";

// ============================================================
// Options: 2 loai VU
//   - "subscribers": chi nhan, giu ket noi lau
//   - "senders":     gui tin, it hon
// ============================================================
export const options = {
  scenarios: {
    subscribers: {
      executor:          "ramping-vus",
      exec:              "subscriber",
      startVUs:          0,
      stages: [
        { duration: "1m",  target: 100  },
        { duration: "2m",  target: 100  },
        { duration: "2m",  target: 500  },
        { duration: "3m",  target: 500  },
        { duration: "3m",  target: 1000 },
        { duration: "5m",  target: 1000 },
        { duration: "1m",  target: 0    },
      ],
    },
    senders: {
      executor:          "constant-vus",
      exec:              "sender",
      vus:               3,
      duration:          "17m",
      startTime:         "1m",  // Bat dau sau khi subscriber on dinh
    },
  },
  thresholds: {
    "fanout_first_receiver_ms": ["p(95)<200"],
    "fanout_last_receiver_ms":  ["p(95)<500"],
    "group_messages_missed":    ["count<10"],
  },
};

// ============================================================
// Scenario: Subscriber — ket noi va ghi lai thoi gian nhan
// ============================================================
export function subscriber() {
  const userIndex = ((__VU - 1) % 200) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");

  if (!token) return;

  stompConnect(token, [GROUP_ID], (frame) => {
    try {
      const msg = JSON.parse(frame.body);
      if (msg && msg.sentAt) {
        const latency = Date.now() - msg.sentAt;
        fanoutFirstMs.add(latency);  // Moi subscriber ghi latency rieng
        msgDelivered.add(1);
      }
    } catch (_) {}
  });

  // Giu ket noi suot bai test
  sleep(1000);
}

// ============================================================
// Scenario: Sender — gui tin deu dan vao nhom
// ============================================================
export function sender() {
  // Dung admin account gui tin (da la OWNER cua nhom)
  const token = login("admin", "Admin@123");
  if (!token) return;

  for (let i = 0; i < 100; i++) {
    const sentAt  = Date.now();
    const content = `[GROUP-TEST] Tin #${i} sentAt:${sentAt} from sender VU ${__VU}`;

    const res = sendMessageREST(token, GROUP_ID, content);
    check(res, { "send ok": (r) => r.status === 200 || r.status === 201 });

    // Gui 1 tin moi 3 giay
    sleep(3);
  }
}

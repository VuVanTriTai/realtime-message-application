/**
 * 05_reconnect_storm.js — Kich ban 5: Reconnect storm
 * =======================================================
 * Mo phong: Server restart hoac mat mang -> 10K client noi lai cung luc
 *
 * Kich ban:
 *   Phase 1 (3 phut): 10K client ket noi binh thuong (baseline)
 *   Phase 2 (1 phut): Nhat hieu lenh "ngat ket noi" -> tat ca client disconnect
 *   Phase 3 (5 phut): 10K client noi lai cung luc (storm) voi Jitter
 *
 * Muc dich:
 *   - Xem Backoff + Jitter co hoat dong khong (khong co bao reconnect ngay)
 *   - Server khong crash, khong OOM
 *   - Sau 5 phut, 95%+ client noi lai thanh cong
 *
 * Chay:
 *   k6 run load-test/scripts/05_reconnect_storm.js
 *
 * Nguong:
 *   - reconnect_success_rate > 95%
 *   - reconnect_time P95 < 10s (nho co jitter)
 */

import { sleep, check } from "k6";
import ws                from "k6/ws";
import { Trend, Counter, Rate } from "k6/metrics";
import { login }         from "./auth-helper.js";

const reconnectTime    = new Trend("reconnect_time_ms",     true);
const reconnectSuccess = new Rate("reconnect_success_rate");
const reconnectFails   = new Counter("reconnect_fail_count");

// ============================================================
// Options: 1 scenario, 10K VU
// ============================================================
export const options = {
  scenarios: {
    reconnect_storm: {
      executor:  "ramping-vus",
      startVUs:  0,
      stages: [
        { duration: "3m", target: 2000 },   // Phase 1: Tat ca ket noi
        { duration: "30s", target: 2000 },  // Dung o 2K (han che may test)
        { duration: "10s", target: 0    },  // Phase 2: Ngat tat ca
        { duration: "5m",  target: 2000 },  // Phase 3: Storm reconnect
        { duration: "2m",  target: 0    },
      ],
    },
  },
  thresholds: {
    "reconnect_success_rate": ["rate>0.95"],
    "reconnect_time_ms":      ["p(95)<10000"],
  },
};

// Equal Jitter: delay trong khoang [ceiling/2, ceiling]
function equalJitter(attempt, baseMs, maxMs, factor) {
  const ceiling = Math.min(baseMs * Math.pow(factor, attempt), maxMs);
  return Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
}

// ============================================================
// Default: Ket noi -> sleep -> ngat -> reconnect voi jitter
// ============================================================
export default function () {
  const userIndex = ((__VU - 1) % 200) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");
  if (!token) { reconnectFails.add(1); return; }

  const WS_URL = __ENV.WS_URL || "ws://localhost:8080/ws/websocket";

  // Phase 1: Ket noi binh thuong, giu 3 phut
  let connected = false;
  const sock1 = ws.connect(WS_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    (s) => {
      s.on("open", () => {
        connected = true;
        s.send(`CONNECT\nAccept-Version:1.2\nAuthorization:Bearer ${token}\n\n\0`);
      });
      s.on("message", () => {});
    }
  );
  check(sock1, { "initial connect": (r) => r && r.status === 101 });

  // Giu ket noi ~3 phut
  sleep(180 + Math.random() * 30);

  // Phase 2: Ngat ket noi (simulate server restart / network cut)
  if (sock1 && sock1.close) sock1.close();
  connected = false;

  // Phase 3: Jitter reconnect
  // Khong phai tat ca reconnect cung luc — moi VU delay khac nhau
  // Jitter: 0-30 giay random truoc lan thu 1
  const initialJitter = Math.random() * 30;
  sleep(initialJitter);

  let attempt     = 0;
  let reconnected = false;
  const startReconnect = Date.now();

  while (attempt < 6 && !reconnected) {
    const start  = Date.now();
    const sock2 = ws.connect(WS_URL,
      { headers: { Authorization: `Bearer ${token}` } },
      (s) => {
        s.on("open", () => {
          reconnected = true;
          s.send(`CONNECT\nAccept-Version:1.2\nAuthorization:Bearer ${token}\n\n\0`);
          sleep(10);
          s.close();
        });
        s.on("error", () => { reconnected = false; });
      }
    );

    if (sock2 && sock2.status === 101) {
      reconnected = true;
      reconnectTime.add(Date.now() - startReconnect);
      reconnectSuccess.add(1);
      break;
    }

    attempt++;
    reconnectSuccess.add(0);  // That bai lan nay

    if (attempt < 6) {
      // Backoff + Jitter truoc khi thu lai
      const delay = equalJitter(attempt, 1000, 30000, 1.8) / 1000;
      sleep(delay);
    }
  }

  if (!reconnected) {
    reconnectFails.add(1);
    reconnectSuccess.add(0);
  }
}

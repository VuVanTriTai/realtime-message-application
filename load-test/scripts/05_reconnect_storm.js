/**
 * 05_reconnect_storm.js — Kich ban 5: Bao Reconnect (Reconnect Storm with Equal Jitter)
 * =====================================================================================
 * Mo phong: Su co dut mang / Server restart dot ngot -> Hang nghin client noi lai cung luc.
 *
 * Muc dich kiem tra:
 *   1. Kiem tra thuat toan Exponential Backoff + Equal Jitter (giong frontend WebSocketContext.jsx)
 *      co giup lam min (smooth) luu luong ket noi lai, tranh hien tuong Thundering Herd khong.
 *   2. Server co bi OOM, crash, hay tu choi ket noi (handshake error) khi chiu bao ket noi khong.
 *   3. Do thoi gian phuc hoi (reconnect_time_ms P50, P95, P99) va ti le noi lai thanh cong.
 *
 * Thuat toan Equal Jitter:
 *   ceiling = min(BASE * (FACTOR ^ attempt), MAX)
 *   delay   = floor(ceiling / 2 + random(0, ceiling / 2))
 *   (BASE = 1000ms, MAX = 30000ms, FACTOR = 1.8)
 *
 * Chay:
 *   k6 run load-test/scripts/05_reconnect_storm.js
 *
 * Nguong thanh cong:
 *   - reconnect_success_rate > 95%
 *   - reconnect_time_ms P95 < 10000ms (10 giay nho co Backoff + Jitter)
 */

import { sleep, check } from "k6";
import ws from "k6/ws";
import { Trend, Counter, Rate } from "k6/metrics";
import { login } from "./auth-helper.js";
import { buildFrame, parseFrame, WS_URL } from "./stomp-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const reconnectTime      = new Trend("reconnect_time_ms", true); // Thoi gian tu luc mat ket noi toi khi CONNECTED lai
const reconnectSuccess   = new Rate("reconnect_success_rate");   // Ti le noi lai thanh cong
const reconnectFails     = new Counter("reconnect_fail_count");  // So VU that bai hoan toan sau moi lan thu
const reconnectRetries   = new Counter("reconnect_retry_count"); // Tong so lan thu ket noi lai

// ============================================================
// Options: 1000 VU chay kịch bản bão Reconnect
// ============================================================
export const options = {
  stages: [
    { duration: "1m",  target: 1000 },  // Giai doan 1: 1000 client vao ket noi on dinh (Baseline)
    { duration: "1m",  target: 1000 },  // Duy tri 1000 ket noi
    { duration: "3m",  target: 1000 },  // Giai doan 2 & 3: Dut ket noi dong loat & Reconnect storm
    { duration: "30s", target: 0    },  // Ha tai
  ],
  thresholds: {
    "reconnect_success_rate": ["rate>0.95"],  // 95%+ client noi lai thanh cong
    "reconnect_time_ms":      ["p(95)<10000"], // 95% client noi lai trong vong 10 giay
  },
};

// ============================================================
// Cong thuc Equal Jitter (Khop 100% voi WebSocketContext.jsx)
// ============================================================
function calculateEqualJitter(attempt) {
  const BASE_MS   = 1000;
  const MAX_MS    = 30000;
  const FACTOR    = 1.8;

  const ceiling = Math.min(BASE_MS * Math.pow(FACTOR, attempt), MAX_MS);
  const halfCeil = Math.floor(ceiling / 2);
  return halfCeil + Math.floor(Math.random() * halfCeil);
}

// ============================================================
// Setup: Pre-login 200 test users de lay san JWT Tokens
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang pre-login de chuan bi token cho bai test Reconnect Storm...");
  const tokens = [];
  const TOTAL_USERS = 200;

  for (let i = 1; i <= TOTAL_USERS; i++) {
    const uname = `testuser${String(i).padStart(3, "0")}`;
    const token = login(uname, "LoadTest@123");
    if (token) {
      tokens.push(token);
    }
    sleep(0.01);
  }

  console.log(`==> [Setup] Da chuan bi xong ${tokens.length} tokens.`);
  return { tokens };
}

// ============================================================
// Default function: Moi VU trai qua 3 giai doan
// ============================================================
export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];

  // ----------------------------------------------------------
  // GIAI DOAN 1: Ket noi ban dau (Hold ~45 giay)
  // ----------------------------------------------------------
  let initialConnected = false;

  const res1 = ws.connect(
    WS_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    function (socket) {
      socket.on("open", () => {
        socket.send(buildFrame("CONNECT", {
          "accept-version": "1.2",
          "heart-beat":     "10000,10000",
          Authorization:    `Bearer ${token}`,
        }));
      });

      socket.on("message", (data) => {
        if (!data || data === "\n" || data.trim() === "") return;
        const frame = parseFrame(data);
        if (frame.command === "CONNECTED") {
          initialConnected = true;
        }
      });

      // Sau 45 giay: Dot ngot ngat ket noi de tao con bao Reconnect!
      socket.setTimeout(() => {
        socket.close(); // Gia lap server restart hoac dut mang
      }, 45 * 1000);

      socket.on("error", () => {});
    }
  );

  check(res1, { "Phase 1 handshake 101": (r) => r && r.status === 101 });

  // ----------------------------------------------------------
  // GIAI DOAN 2 & 3: Bao Reconnect voi Exponential Backoff + Jitter
  // ----------------------------------------------------------
  const reconnectStart = Date.now();
  let attempt     = 0;
  let reconnected = false;
  const MAX_ATTEMPTS = 6;

  while (attempt < MAX_ATTEMPTS && !reconnected) {
    // 1. Ap dung Equal Jitter truoc moi lan thu
    const jitterDelayMs = calculateEqualJitter(attempt);
    sleep(jitterDelayMs / 1000);

    attempt++;
    reconnectRetries.add(1);

    // 2. Thu ket noi lai
    const res2 = ws.connect(
      WS_URL,
      { headers: { Authorization: `Bearer ${token}` } },
      function (socket) {
        socket.on("open", () => {
          socket.send(buildFrame("CONNECT", {
            "accept-version": "1.2",
            "heart-beat":     "10000,10000",
            Authorization:    `Bearer ${token}`,
          }));
        });

        socket.on("message", (msgData) => {
          if (!msgData || msgData === "\n" || msgData.trim() === "") return;
          const frame = parseFrame(msgData);

          if (frame.command === "CONNECTED") {
            reconnected = true;
            const duration = Date.now() - reconnectStart;
            reconnectTime.add(duration);
            reconnectSuccess.add(1);

            // Duy tri heartbeat de giu ket noi sau khi da phuc hoi thanh cong
            socket.setInterval(() => {
              try { socket.send("\n"); } catch (_) {}
            }, 10000);
          }
        });

        // Giu ket noi phuc hoi cho den het phien test
        socket.setTimeout(() => {
          try {
            socket.send(buildFrame("DISCONNECT", {}));
            socket.close();
          } catch (_) {}
        }, 150 * 1000);

        socket.on("error", () => {});
      }
    );

    if (reconnected) {
      break;
    }
  }

  // 3. Neu sau MAX_ATTEMPTS ma van khong ket noi duoc -> ghi nhan loi
  if (!reconnected) {
    reconnectFails.add(1);
    reconnectSuccess.add(0);
  }
}

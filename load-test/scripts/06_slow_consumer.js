/**
 * 06_slow_consumer.js — Kich ban 6: Slow consumer
 * =======================================================
 * Muc dich: Kiem tra server CAN client doc cham, khong bi phình RAM
 *
 * Kich ban:
 *   - 90% VU: ket noi binh thuong, nhan tin nhanh
 *   - 10% VU: ket noi nhung khong bao gio doc message (simulate lag/freeze)
 *     -> Server phai dong session sau sendTimeLimit (15s theo config)
 *     -> Buffer 256KB day -> server dong, khong OOM
 *
 * Nguong thanh cong:
 *   - Heap khong tang vo han (theo doi Grafana)
 *   - Slow consumer session bi dong trong vong 60s
 *   - Normal user khong bi anh huong: P95 latency < 300ms
 */

import { sleep, check } from "k6";
import ws                from "k6/ws";
import { Trend, Counter, Rate } from "k6/metrics";
import { login, sendMessageREST } from "./auth-helper.js";
import { stompConnect, stompDisconnect } from "./stomp-helper.js";

const normalLatency  = new Trend("slow_test_normal_latency_ms", true);
const slowKilled     = new Counter("slow_consumer_sessions_killed");
const normalError    = new Rate("slow_test_normal_error_rate");

const WS_URL = __ENV.WS_URL || "ws://localhost:8080/ws/websocket";

export const options = {
  scenarios: {
    normal_consumers: {
      executor:  "constant-vus",
      exec:      "normalConsumer",
      vus:       90,
      duration:  "10m",
    },
    slow_consumers: {
      executor:  "constant-vus",
      exec:      "slowConsumer",
      vus:       10,
      duration:  "10m",
    },
    message_senders: {
      executor:  "constant-vus",
      exec:      "sender",
      vus:       5,
      duration:  "10m",
    },
  },
  thresholds: {
    "slow_test_normal_latency_ms":  ["p(95)<300"],
    "slow_test_normal_error_rate":  ["rate<0.01"],
  },
};

// ============================================================
// Normal consumer: ket noi va xu ly tin binh thuong
// ============================================================
export function normalConsumer() {
  const userIndex = ((__VU - 1) % 100) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");
  if (!token) { normalError.add(1); return; }

  stompConnect(token, ["1"], (frame) => {
    try {
      const msg = JSON.parse(frame.body);
      if (msg && msg.sentAt) normalLatency.add(Date.now() - msg.sentAt);
    } catch (_) {}
  });

  sleep(600);
}

// ============================================================
// Slow consumer: ket noi WebSocket nhung KHONG bao gio xu ly message
// Server phai phat hien buffer day va dong connection
// ============================================================
export function slowConsumer() {
  const userIndex = ((__VU - 1) % 50) + 101;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");
  if (!token) return;

  let sessionClosed = false;
  const connectTime = Date.now();

  // Mo ket noi WS thuan — KHONG xu ly message de buffer day
  const sock = ws.connect(WS_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    (s) => {
      s.on("open", () => {
        // Chi gui CONNECT, subscribe, roi bo qua moi message
        s.send(`CONNECT\nAccept-Version:1.2\nAuthorization:Bearer ${token}\n\n\0`);
      });
      s.on("message", (data) => {
        if (data && data.includes("CONNECTED")) {
          s.send(`SUBSCRIBE\nid:sub-0\ndestination:/topic/conversation.1\n\n\0`);
        }
        // KHONG xu ly MESSAGE frames -> buffer day -> server se dong
      });
      s.on("close", () => {
        sessionClosed = true;
        const timeToKill = Date.now() - connectTime;
        slowKilled.add(1);
        console.log(`Slow consumer killed after ${timeToKill}ms`);
      });
    }
  );

  // Giu session mo de server phat hien va dong
  // sendTimeLimit = 15s, sendBufferSizeLimit = 256KB (config hien tai)
  sleep(120);

  if (!sessionClosed && sock && sock.close) sock.close();
}

// ============================================================
// Sender: lien tuc gui tin vao group de lam buffer day
// ============================================================
export function sender() {
  const token = login("admin", "Admin@123");
  if (!token) return;

  for (let i = 0; i < 300; i++) {
    // Gui tin lon (gan 4000 chars) de lam day buffer nhanh hon
    const content = `[SLOW-CONSUMER-TEST] `.padEnd(500, "X") + ` #${i} at ${Date.now()}`;
    sendMessageREST(token, "1", content);
    sleep(1);
  }
}

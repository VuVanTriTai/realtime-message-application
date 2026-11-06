/**
 * 02_direct_message.js — Kich ban 2: Gui tin 1-1
 * =======================================================
 * Muc dich: Do do tre end-to-end cua tin nhan 1-1
 *   - Moi cap VU (A, B) ket noi WebSocket
 *   - A gui tin cho B, embed timestamp trong payload
 *   - B nhan tin, tinh hieu timestamp -> do_tre = now - sentAt
 *   - Ghi vao custom metric e2e_latency_ms
 *
 * Chay:
 *   k6 run load-test/scripts/02_direct_message.js
 *
 * Nguong thanh cong:
 *   - P50 latency < 100ms
 *   - P95 latency < 300ms
 *   - P99 latency < 1000ms
 *   - Error rate < 1%
 */

import { sleep, check } from "k6";
import http             from "k6/http";
import { Trend, Counter, Rate } from "k6/metrics";
import { stompConnect, stompSend, stompDisconnect, API_URL } from "./stomp-helper.js";
import { login, getMyConversations, sendMessageREST }        from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const e2eLatency  = new Trend("e2e_message_latency_ms", true);  // End-to-end
const msgSent     = new Counter("messages_sent_total");
const msgReceived = new Counter("messages_received_total");
const msgLost     = new Counter("messages_lost_total");
const errorRate   = new Rate("message_error_rate");

// ============================================================
// Options
// ============================================================
export const options = {
  stages: [
    { duration: "1m", target: 50  },   // Warm up: 50 cap user
    { duration: "3m", target: 200 },   // Ramp to 200 cap (400 VU tong)
    { duration: "5m", target: 200 },   // Giu tai
    { duration: "1m", target: 0   },   // Cool down
  ],
  thresholds: {
    "e2e_message_latency_ms": ["p(50)<100", "p(95)<300", "p(99)<1000"],
    "message_error_rate":     ["rate<0.01"],
  },
};

// ============================================================
// Default: Moi VU dong vai nguoi gui (A) gui tin 1-1
// Dung REST API de gui (don gian hon WS trong k6)
// Latency do tu luc REST tra ve 200 den luc WS subscriber nhan duoc
// ============================================================
export default function () {
  // Moi VU: dang nhap va lay conversation 1-1 dau tien
  const userIndex = ((__VU - 1) % 100) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");

  if (!token) { errorRate.add(1); return; }

  // Lay danh sach conversation
  const conversations = getMyConversations(token);
  if (!conversations || conversations.length === 0) {
    errorRate.add(1);
    return;
  }

  // Lay DIRECT conversation dau tien
  const directConv = conversations.find(c => c.type === "DIRECT");
  if (!directConv) { errorRate.add(1); return; }

  const convId = directConv.id;

  // Ket noi WS de nhan phan hoi (nhu nguoi nhan)
  let receivedLatency = null;
  const handle = stompConnect(token, [convId], (frame) => {
    try {
      const msg = JSON.parse(frame.body);
      if (msg && msg.sentAt) {
        const latency = Date.now() - msg.sentAt;
        e2eLatency.add(latency);
        msgReceived.add(1);
        receivedLatency = latency;
      }
    } catch (_) {}
  });

  sleep(0.5); // Cho subscribe on dinh

  // Gui 5 tin, moi tin cach 2-5 giay
  for (let i = 0; i < 5; i++) {
    const sentAt  = Date.now();
    const content = `k6 test msg #${i} sentAt:${sentAt}`;

    const res = sendMessageREST(token, convId, content);
    const ok  = check(res, { "send 200/201": (r) => r.status === 200 || r.status === 201 });

    if (ok) {
      msgSent.add(1);
    } else {
      errorRate.add(1);
      msgLost.add(1);
    }

    // Cho 2-4 giay giua cac tin
    sleep(2 + Math.random() * 2);
  }

  // Cho tin cuoi cung den truoc khi dong
  sleep(2);
  stompDisconnect(handle);
}

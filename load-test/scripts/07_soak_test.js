/**
 * 07_soak_test.js — Kich ban 7: Soak test (1-2 gio)
 * =======================================================
 * Muc dich: Lo ro bo nho va ket noi ma (zombie connections)
 *   - Tai vua phai (500 VU) chay lien tuc 90 phut
 *   - Theo doi: heap tang khong ngung = co leak
 *   - Theo doi: so ket noi tang du khong them VU = zombie
 *
 * Nguong thanh cong:
 *   - Heap sau 90 phut < Heap sau 10 phut * 1.5
 *   - P95 latency on dinh (khong tang theo thoi gian)
 *   - Error rate < 1%
 *
 * Chay:
 *   k6 run load-test/scripts/07_soak_test.js
 *   (Mat ~90 phut - nen chay qua dem)
 */

import { sleep, check } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { stompConnect, stompDisconnect } from "./stomp-helper.js";
import { login, getMyConversations, sendMessageREST } from "./auth-helper.js";

const e2eLatency = new Trend("soak_e2e_latency_ms", true);
const errorRate  = new Rate("soak_error_rate");
const msgSent    = new Counter("soak_messages_sent");

export const options = {
  stages: [
    { duration: "5m",  target: 200 },   // Warm up
    { duration: "80m", target: 200 },   // Soak: giu 200 VU trong 80 phut
    { duration: "5m",  target: 0   },   // Cool down
  ],
  thresholds: {
    "soak_e2e_latency_ms": ["p(95)<500"],
    "soak_error_rate":     ["rate<0.01"],
  },
};

export default function () {
  const userIndex = ((__VU - 1) % 200) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");
  if (!token) { errorRate.add(1); return; }

  const conversations = getMyConversations(token);
  if (!conversations || conversations.length === 0) { errorRate.add(1); return; }

  const convIds = conversations.map(c => String(c.id)).slice(0, 2);
  const conv    = conversations[0];

  stompConnect(token, convIds, (frame) => {
    try {
      const msg = JSON.parse(frame.body);
      if (msg && msg.sentAt) e2eLatency.add(Date.now() - msg.sentAt);
    } catch (_) {}
  });

  sleep(1);

  // Moi VU gui tin moi 20-40 giay trong suot bai soak
  const endTime = Date.now() + 85 * 60 * 1000;
  let msgCount  = 0;

  while (Date.now() < endTime) {
    const sentAt  = Date.now();
    const content = `[SOAK] msg-${msgCount++} from ${username} at ${sentAt}`;
    const res     = sendMessageREST(token, conv.id, content);

    if (check(res, { "send 200": (r) => r.status === 200 || r.status === 201 })) {
      msgSent.add(1);
    } else {
      errorRate.add(1);
    }

    // Gui moi 20-40 giay (tai vua phai)
    sleep(20 + Math.random() * 20);
  }
}

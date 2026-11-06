/**
 * 08_spike.js — Kich ban 8: Spike test
 * =======================================================
 * Muc dich: Tang vot dot ngot 3-5x, xem hang doi va pool phan ung
 *
 * Kich ban:
 *   Baseline: 200 VU (binh thuong)
 *   Spike:    1000 VU (gấp 5x, trong 2 phut)
 *   Recovery: Giam ve 200 VU, do thoi gian phuc hoi
 *
 * Thu nghiem:
 *   - Thread pool STOMP inbound (max 64) co bi bao hoa?
 *   - HikariCP (max 30 conn) co bi cho?
 *   - Redis Lettuce pool (max 16) co bi timeout?
 *   - Latency sau spike co ve nguong binh thuong?
 *
 * Nguong thanh cong:
 *   - Trong spike: P99 latency < 2000ms (toi da chap nhan)
 *   - Sau spike (recovery): P95 ve < 300ms trong 2 phut
 *   - Error rate trong spike < 5%
 */

import { sleep, check } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { sendMessageREST } from "./auth-helper.js";
import { login, getMyConversations } from "./auth-helper.js";
import { stompConnect } from "./stomp-helper.js";

const spikeLatency = new Trend("spike_latency_ms",  true);
const errorRate    = new Rate("spike_error_rate");
const msgSent      = new Counter("spike_messages_sent");

export const options = {
  stages: [
    { duration: "2m",  target: 200  },   // Baseline on dinh
    { duration: "30s", target: 1000 },   // Spike: tang vot len 1000 trong 30 giay!
    { duration: "2m",  target: 1000 },   // Giu spike 2 phut
    { duration: "30s", target: 200  },   // Giam ve baseline
    { duration: "3m",  target: 200  },   // Recovery: theo doi P95 ve binh thuong
    { duration: "1m",  target: 0    },   // Cool down
  ],
  thresholds: {
    "spike_latency_ms": [
      { threshold: "p(99)<2000", abortOnFail: false },   // Trong spike: P99 < 2s
      { threshold: "p(95)<500",  abortOnFail: false },   // O baseline: P95 < 500ms
    ],
    "spike_error_rate": ["rate<0.05"],   // Toi da 5% loi trong spike
  },
};

export default function () {
  const userIndex = ((__VU - 1) % 200) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");
  if (!token) { errorRate.add(1); return; }

  const conversations = getMyConversations(token);
  if (!conversations || conversations.length === 0) { errorRate.add(1); return; }
  const conv = conversations[0];

  stompConnect(token, [String(conv.id)], (frame) => {
    try {
      const msg = JSON.parse(frame.body);
      if (msg && msg.sentAt) spikeLatency.add(Date.now() - msg.sentAt);
    } catch (_) {}
  });

  sleep(0.5);

  // Moi VU gui tin moi 2 giay (tai cao hon mix_realistic)
  const endTime = Date.now() + 9 * 60 * 1000;
  while (Date.now() < endTime) {
    const sentAt  = Date.now();
    const content = `[SPIKE] ${username} at ${sentAt}`;
    const res     = sendMessageREST(token, conv.id, content);

    if (check(res, { "send ok": (r) => r.status === 200 || r.status === 201 })) {
      msgSent.add(1);
    } else {
      errorRate.add(1);
    }

    sleep(2 + Math.random() * 1);
  }
}

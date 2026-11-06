/**
 * 04_mix_realistic.js — Kich ban 4: Mix thuc te
 * =======================================================
 * Phan bo VU giong thuc te:
 *   70% Idle    — ket noi, subscribe, khong gui tin (chi doc)
 *   20% Active  — gui tin dinh ky vao cac conversation
 *   10% Typers  — gui typing indicator lien tuc (nhe tai hon)
 *
 * Muc dich: Mo phong he thong trong gio cao diem.
 * Nguong thanh cong:
 *   - P95 message latency < 300ms
 *   - Loi < 2%
 */

import { sleep, check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import { stompConnect, stompSend, stompDisconnect } from "./stomp-helper.js";
import { login, getMyConversations, sendMessageREST } from "./auth-helper.js";

const e2eLatency = new Trend("mix_e2e_latency_ms", true);
const errorRate  = new Rate("mix_error_rate");
const msgSent    = new Counter("mix_messages_sent");

export const options = {
  scenarios: {
    idle_users: {
      executor:  "ramping-vus",
      exec:      "idleUser",
      startVUs:  0,
      stages: [
        { duration: "2m", target: 700 },
        { duration: "8m", target: 700 },
        { duration: "2m", target: 0   },
      ],
    },
    active_senders: {
      executor:  "ramping-vus",
      exec:      "activeSender",
      startVUs:  0,
      stages: [
        { duration: "2m", target: 200 },
        { duration: "8m", target: 200 },
        { duration: "2m", target: 0   },
      ],
    },
    typers: {
      executor:  "ramping-vus",
      exec:      "typer",
      startVUs:  0,
      stages: [
        { duration: "2m", target: 100 },
        { duration: "8m", target: 100 },
        { duration: "2m", target: 0   },
      ],
    },
  },
  thresholds: {
    "mix_e2e_latency_ms": ["p(95)<300"],
    "mix_error_rate":     ["rate<0.02"],
  },
};

// ============================================================
// Scenario A: Idle user (70%) — chi ket noi, khong gui tin
// ============================================================
export function idleUser() {
  const userIndex = ((__VU - 1) % 200) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");
  if (!token) { errorRate.add(1); return; }

  const conversations  = getMyConversations(token);
  const convIds = (conversations || []).map(c => String(c.id)).slice(0, 3);

  stompConnect(token, convIds, (frame) => {
    // Idle user nhan tin nhung khong phan hoi
    try {
      const msg = JSON.parse(frame.body);
      if (msg && msg.sentAt) {
        e2eLatency.add(Date.now() - msg.sentAt);
      }
    } catch (_) {}
  });

  // Giu ket noi 10 phut
  sleep(600);
}

// ============================================================
// Scenario B: Active sender (20%) — gui tin moi 5-10 giay
// ============================================================
export function activeSender() {
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
      if (msg && msg.sentAt) e2eLatency.add(Date.now() - msg.sentAt);
    } catch (_) {}
  });

  sleep(1); // Cho subscribe on dinh

  // Gui tin suot 10 phut
  const endTime = Date.now() + 600_000;
  while (Date.now() < endTime) {
    const sentAt  = Date.now();
    const content = `Hello from active user ${username} at ${sentAt}`;
    const res     = sendMessageREST(token, conv.id, content);
    const ok      = check(res, { "send ok": (r) => r.status === 200 || r.status === 201 });
    if (ok) msgSent.add(1); else errorRate.add(1);

    // Gui moi 5-10 giay (random)
    sleep(5 + Math.random() * 5);
  }
}

// ============================================================
// Scenario C: Typer (10%) — chi gui typing indicator
// ============================================================
export function typer() {
  const userIndex = ((__VU - 1) % 200) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const token     = login(username, "LoadTest@123");
  if (!token) { errorRate.add(1); return; }

  const conversations = getMyConversations(token);
  if (!conversations || conversations.length === 0) return;
  const conv = conversations[0];

  const handle = stompConnect(token, [String(conv.id)], null);
  sleep(0.5);

  const endTime = Date.now() + 600_000;
  while (Date.now() < endTime) {
    // Gui typing indicator qua STOMP /app/chat.typing
    stompSend(handle, "/app/chat.typing", {
      conversationId: conv.id,
      typing:         true,
    });
    sleep(3 + Math.random() * 2);

    stompSend(handle, "/app/chat.typing", {
      conversationId: conv.id,
      typing:         false,
    });
    sleep(5 + Math.random() * 5);
  }

  stompDisconnect(handle);
}

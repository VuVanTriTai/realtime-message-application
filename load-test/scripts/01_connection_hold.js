/**
 * 01_connection_hold.js — Kich ban 1: Giu ket noi (Connection Hold Test)
 * ======================================================================
 * Muc dich: Do RAM, file descriptor, GC khi tang dan ket noi:
 *   1K -> 5K -> 10K -> 15K connections ranh (chi heartbeat dinh ky, khong chat)
 *
 * Chay:
 *   k6 run load-test/scripts/01_connection_hold.js
 *
 * Co che hoat dong:
 *   1. Ham setup() chay 1 lan dau tien: dang nhap 200 users mau tu seed data
 *      lay san danh sach JWT token (tranh gay BCrypt/Auth storm len server).
 *   2. Ham default(data): Moi VU lay 1 token tu mảng data.tokens,
 *      mo WebSocket, gui STOMP CONNECT, sau do giu ket noi va phat
 *      heartbeat '\n' moi 10 giay.
 */

import { check, sleep } from "k6";
import { stompConnectAndHold } from "./stomp-helper.js";
import { login } from "./auth-helper.js";
import { Trend, Counter } from "k6/metrics";

// ============================================================
// Custom metrics
// ============================================================
const connectTime  = new Trend("ws_connect_time_ms", true);
const connectFails = new Counter("ws_connect_fails");

// ============================================================
// Options: 4 stage tang dan -> giu -> giam
// ============================================================
export const options = {
  stages: [
    { duration: "2m",  target: 1000  },   // Tang len 1K trong 2 phut
    { duration: "3m",  target: 1000  },   // Giu 1K trong 3 phut
    { duration: "3m",  target: 5000  },   // Tang len 5K
    { duration: "3m",  target: 5000  },   // Giu 5K
    { duration: "3m",  target: 10000 },   // Tang len 10K
    { duration: "5m",  target: 10000 },   // Giu 10K (do GC o day)
    { duration: "2m",  target: 15000 },   // Tang len 15K
    { duration: "5m",  target: 15000 },   // Giu 15K — dinh tong the
    { duration: "2m",  target: 0     },   // Giam ve 0
  ],
  thresholds: {
    "ws_connect_time_ms": ["p(95)<500"], // 95% ket noi < 500ms
    "ws_connect_fails":   ["count<100"], // Toi da 100 loi ket noi
  },
};

// ============================================================
// Setup: Chay DUY NHAT 1 LAN truoc khi test
// Dang nhap san cac user co trong V6__load_test_seed.sql
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang tien hanh pre-login de lay san token cho test users...");
  const tokens = [];
  const TOTAL_TEST_USERS = 200; // So user tao tu V6__load_test_seed.sql

  for (let i = 1; i <= TOTAL_TEST_USERS; i++) {
    const username = `testuser${String(i).padStart(3, "0")}`;
    const token = login(username, "LoadTest@123");
    if (token) {
      tokens.push(token);
    }
    // Nghi nhe 10ms giua cac lan login o setup de khong gay shock luc khoi tao
    sleep(0.01);
  }

  console.log(`==> [Setup] Da chuan bi thanh cong ${tokens.length} token.`);
  if (tokens.length === 0) {
    throw new Error("Khong lay duoc token nao! Hay chac chan rang migration V6 da chay.");
  }

  // Du lieu return o day se duoc truyen vao default function qua tham so data
  return { tokens };
}

// ============================================================
// Default function: Moi VU thuc thi
// ============================================================
export default function (data) {
  // 1. Phan chia token deu cho cac VU (round-robin qua 200 token)
  const tokens = data.tokens;
  const tokenIndex = (__VU - 1) % tokens.length;
  const token = tokens[tokenIndex];

  const startTime = Date.now();

  // 2. Ket noi WebSocket, gui STOMP CONNECT va giu ket noi 300 giay (5 phut)
  // Trong 300s nay, client tu dong ban STOMP Heartbeat '\n' moi 10 giay
  const holdSeconds = 300;
  const res = stompConnectAndHold(token, [], holdSeconds, null);

  const duration = Date.now() - startTime;

  // 3. Danh gia ket qua ket noi
  const success = check(res, {
    "WebSocket handshake 101": (r) => r && r.status === 101,
  });

  if (success) {
    connectTime.add(duration);
  } else {
    connectFails.add(1);
  }
}

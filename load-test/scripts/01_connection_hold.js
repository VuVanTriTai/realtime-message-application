/**
 * 01_connection_hold.js — Kich ban 1: Giu ket noi
 * =======================================================
 * Muc dich: Do RAM, file descriptor, GC khi tang dan ket noi:
 *   1K -> 5K -> 10K -> 15K connections rang (chi heartbeat, khong gui tin)
 *
 * Chay:
 *   k6 run load-test/scripts/01_connection_hold.js
 *
 * Nguong thanh cong:
 *   - P95 connection time < 500ms
 *   - Loi < 1%
 *   - Server khong OOM suot bai test
 *
 * Quan sat tren Grafana:
 *   - chat_ws_sessions_active tang deu
 *   - jvm_memory_used_bytes (heap) tang tuyen tinh, khong co leak
 *   - jvm_gc_pause_seconds_sum on dinh
 */

import { sleep } from "k6";
import { stompConnect, stompDisconnect, WS_URL } from "./stomp-helper.js";
import { login } from "./auth-helper.js";
import { Trend, Counter } from "k6/metrics";

// ============================================================
// Custom metrics
// ============================================================
const connectTime  = new Trend("ws_connect_time_ms",  true);
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
    "ws_connect_time_ms":  ["p(95)<500"],  // 95% ket noi < 500ms
    "ws_connect_fails":    ["count<100"],  // Toi da 100 loi ket noi
  },
};

// ============================================================
// Setup: Lay 1 token mau (testuser001 la load-test user)
// Trong thuc te, moi VU nen dung user rieng (xem phan data seeder)
// ============================================================
export function setup() {
  // Dang nhap bang user load test - xem V6__load_test_seed.sql
  // User testuser001..testuser200 voi password LoadTest@123
  return {};
}

// ============================================================
// Default function: Moi VU ket noi, giu 10 phut, roi ngat
// ============================================================
export default function () {
  // Moi VU dung user rieng: VU 1 -> testuser001, VU 2 -> testuser002, ...
  // __VU: bien built-in cua k6 (1-based)
  const userIndex = ((__VU - 1) % 200) + 1;
  const username  = `testuser${String(userIndex).padStart(3, "0")}`;
  const password  = "LoadTest@123";

  const token = login(username, password);
  if (!token) {
    connectFails.add(1);
    return;
  }

  const start  = Date.now();
  const handle = stompConnect(token, [], null, null);

  if (!handle || !handle.socket) {
    connectFails.add(1);
    return;
  }

  connectTime.add(Date.now() - start);

  // Giu ket noi, heartbeat tu dong xu ly trong stomp-helper
  // Sleep 8 phut (toan bo thoi gian 1 VU giu ket noi)
  sleep(480);

  stompDisconnect(handle);
}

/**
 * 02_direct_message.js — Kich ban 2: Gui tin 1-1 thuan WebSocket (E2E WS-to-WS)
 * ==============================================================================
 * Muc dich: Do do tre End-to-End thuc te giua 2 nguoi dung qua WebSocket:
 *   - User A (Sender) ket noi WebSocket STOMP, dinh ky gui tin toi /app/chat.send
 *   - User B (Receiver) ket noi WebSocket STOMP, lang nghe /topic/conversation.{convId}
 *   - Tin nhan mang payload: k6|<timestamp>|<text>
 *   - User B nhan tin -> latency = Date.now() - timestamp
 *   - 100% dung WebSocket STOMP hai chieu, KHONG dung HTTP REST API
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
import { Trend, Counter, Rate } from "k6/metrics";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations } from "./auth-helper.js";

// ============================================================
// Custom metrics
// ============================================================
const e2eLatency = new Trend("e2e_message_latency_ms", true); // Do tre End-to-End (ms)
const msgSent = new Counter("messages_sent_total");        // Tong so tin User A da gui
const msgReceived = new Counter("messages_received_total");    // Tong so tin User B da nhan
const errorRate = new Rate("message_error_rate");

// ============================================================
// Scenarios: 2 nhom VU chay song song
// ============================================================
export const options = {
  scenarios: {
    // 1. Nhom Nguoi nhan (User B): Mo WebSocket truoc, ngoi nghe tin
    receivers: {
      executor: "constant-vus",
      exec: "receiverScenario",
      vus: 50,          // 50 nguoi nhan cho 50 cap 1-1
      duration: "5m",
    },
    // 2. Nhom Nguoi gui (User A): Mo WebSocket, gui tin dinh ky qua /app/chat.send
    senders: {
      executor: "constant-vus",
      exec: "senderScenario",
      vus: 50,          // 50 nguoi gui tuong ung
      duration: "5m",
      startTime: "5s",        // Khoi dong sau 5s de nguoi nhan da subscribe on dinh
    },
  },
  thresholds: {
    "e2e_message_latency_ms": ["p(50)<100", "p(95)<300", "p(99)<1000"],
    "message_error_rate": ["rate<0.01"],
  },
};

// ============================================================
// Setup: Chay 1 lan duy nhat de chuan bi 50 cap User va Conversation
// ============================================================
export function setup() {
  console.log("==> [Setup] Dang khoi tao 50 cap chat 1-1 tu seed data...");
  const pairs = [];
  const TOTAL_PAIRS = 50; // testuser001..100 (50 cap 1-1 co san trong V6 seed)

  for (let i = 1; i <= TOTAL_PAIRS; i++) {
    const senderName = `testuser${String(2 * i - 1).padStart(3, "0")}`;
    const receiverName = `testuser${String(2 * i).padStart(3, "0")}`;

    const tokenA = login(senderName, "LoadTest@123");
    const tokenB = login(receiverName, "LoadTest@123");

    if (!tokenA || !tokenB) {
      console.warn(`[Setup] Khong the dang nhap cap ${senderName} <-> ${receiverName}`);
      continue;
    }

    // Lay danh sach cuoc tro chuyen cua sender de tim ID conversation 1-1
    const convs = getMyConversations(tokenA);
    const directConv = convs.find((c) => c.type === "DIRECT");

    if (directConv) {
      pairs.push({
        pairIndex: i,
        convId: directConv.id,
        senderName: senderName,
        receiverName: receiverName,
        senderToken: tokenA,
        receiverToken: tokenB,
      });
    }

    sleep(0.02); // Nghi nhe tranh flood HTTP Auth luc setup
  }

  console.log(`==> [Setup] Da san sang ${pairs.length} cap chat 1-1.`);
  if (pairs.length === 0) {
    throw new Error("Khong tim thay conversation 1-1 nao! Vui long kiem tra seed V6.");
  }

  return { pairs };
}

// ============================================================
// Scenario 1: Nguoi nhan (User B) qua WebSocket STOMP
// ============================================================
export function receiverScenario(data) {
  const pair = data.pairs[(__VU - 1) % data.pairs.length];

  stompSession({
    token: pair.receiverToken,
    conversationIds: [pair.convId],
    durationSeconds: 295,
    onMessage: (msg) => {
      // Tin nhan broadcast ve tu /topic/conversation.{convId}
      if (msg && typeof msg.content === "string" && msg.content.startsWith("k6|")) {
        const parts = msg.content.split("|");
        const sentAt = parseInt(parts[1], 10);

        if (!isNaN(sentAt)) {
          const latency = Date.now() - sentAt;
          e2eLatency.add(latency);
          msgReceived.add(1);
        }
      }
    },
  });
}

// ============================================================
// Scenario 2: Nguoi gui (User A) qua WebSocket STOMP
// ============================================================
export function senderScenario(data) {
  const pair = data.pairs[(__VU - 1) % data.pairs.length];

  stompSession({
    token: pair.senderToken,
    conversationIds: [], // Sender chi gui, khong can lang nghe
    durationSeconds: 290,
    onConnected: (socket, sendFrame) => {
      // Dinh ky moi 2.5 giay ban 1 tin nhan qua WebSocket destination: /app/chat.send
      socket.setInterval(() => {
        const sentAt = Date.now();
        const clientMsgId = `ws-k6-${__VU}-${sentAt}`;
        const content = `k6|${sentAt}|Ping from ${pair.senderName}`;

        try {
          sendFrame("/app/chat.send", {
            conversationId: pair.convId,
            content: content,
            type: "TEXT",
            clientMessageId: clientMsgId,
          });
          msgSent.add(1);
        } catch (err) {
          errorRate.add(1);
        }
      }, 2500); // 2.5 giay / tin nhan
    },
  });
}

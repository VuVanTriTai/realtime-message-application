/**
 * stomp-helper.js — Thu vien STOMP over raw WebSocket cho k6
 *
 * SockJS dung iframe + XHR, k6 khong co browser nen phai dung
 * endpoint WebSocket thuan (/ws/websocket) ma Spring Boot tu dong tao
 * ben canh /ws (SockJS endpoint chinh).
 *
 * Giao thuc STOMP (don gian):
 *   Client gui:   CONNECT, SUBSCRIBE, SEND, DISCONNECT
 *   Server gui:   CONNECTED, MESSAGE, ERROR, RECEIPT
 *
 * Cach dung:
 *   import { stompConnect, stompSend, stompDisconnect } from "./stomp-helper.js";
 *   const stomp = stompConnect(token, conversationIds, onMessage);
 *   stompSend(stomp, "/app/chat.send", { ... });
 *   stompDisconnect(stomp);
 */

import ws from "k6/ws";
import { check } from "k6";

/** URL WebSocket thuan (bo qua SockJS transport) */
export const WS_URL = __ENV.WS_URL || "ws://localhost:8080/ws/websocket";

/** URL REST API */
export const API_URL = __ENV.API_URL || "http://localhost:8080";

// ============================================================
// STOMP frame builder
// ============================================================

function buildFrame(command, headers, body) {
  let frame = command + "\n";
  for (const [k, v] of Object.entries(headers || {})) {
    frame += `${k}:${v}\n`;
  }
  frame += "\n";
  if (body) frame += typeof body === "string" ? body : JSON.stringify(body);
  frame += "\0";
  return frame;
}

function parseFrame(raw) {
  const nullIdx = raw.indexOf("\0");
  const content = nullIdx >= 0 ? raw.substring(0, nullIdx) : raw;
  const lines   = content.split("\n");
  const command = lines[0].trim();
  const headers = {};
  let   bodyIdx = 1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") { bodyIdx = i + 1; break; }
    const colon = line.indexOf(":");
    if (colon > 0) {
      headers[line.substring(0, colon).trim()] = line.substring(colon + 1).trim();
    }
  }
  const body = lines.slice(bodyIdx).join("\n").trim();
  return { command, headers, body };
}

// ============================================================
// Connect + subscribe (Standard k6 blocking pattern)
// ============================================================

/**
 * Mo ket noi STOMP WebSocket da nang cho k6.
 * Tu dong gui heartbeat '\n' dinh ky moi 10s de server khong ngat session.
 *
 * @param {Object} config
 * @param {string} config.token                - JWT token
 * @param {string[]} [config.conversationIds]  - Danh sach ID hoi thoai can subscribe
 * @param {number} [config.durationSeconds]    - Thoi luong giu ket noi (giay)
 * @param {function} [config.onMessage]        - Callback khi nhan MESSAGE frame: (parsedMsg) => void
 * @param {function} [config.onConnected]      - Callback khi STOMP CONNECTED: (socket, sendFrameFn) => void
 * @returns {object} res tu ws.connect
 */
export function stompSession({
  token,
  conversationIds = [],
  durationSeconds = 60,
  onMessage,
  onConnected,
}) {
  let subscriptionId = 0;

  const res = ws.connect(
    WS_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    function (socket) {
      // Helper gui STOMP SEND frame truc tiep qua socket
      const sendFrame = (destination, body) => {
        const payload = typeof body === "string" ? body : JSON.stringify(body);
        socket.send(buildFrame("SEND", {
          destination,
          "content-type": "application/json",
          "content-length": String(payload.length),
        }, payload));
      };

      // 1. Khi socket TCP mo -> gui STOMP CONNECT frame
      socket.on("open", () => {
        socket.send(buildFrame("CONNECT", {
          "accept-version": "1.2",
          "heart-beat":     "10000,10000",
          Authorization:    `Bearer ${token}`,
        }));
      });

      // 2. Nhan frame tu server
      socket.on("message", (data) => {
        if (!data || data === "\n" || data.trim() === "") return; // heartbeat

        const frame = parseFrame(data);

        if (frame.command === "CONNECTED") {
          // Subscribe vao cac conversation
          if (conversationIds && conversationIds.length > 0) {
            conversationIds.forEach((convId) => {
              socket.send(buildFrame("SUBSCRIBE", {
                id:          `sub-${subscriptionId++}`,
                destination: `/topic/conversation.${convId}`,
              }));
            });
          }

          // Bat dau gui STOMP client heartbeat dinh ky (10 giay/lan)
          socket.setInterval(() => {
            try {
              socket.send("\n");
            } catch (_) {}
          }, 10000);

          // Goi callback sau khi STOMP CONNECTED thanh cong
          if (onConnected) {
            onConnected(socket, sendFrame);
          }
        } else if (frame.command === "MESSAGE") {
          if (onMessage) {
            try {
              onMessage(frame.body ? JSON.parse(frame.body) : null);
            } catch (_) {
              onMessage(frame.body);
            }
          }
        }
      });

      // 3. Giu ket noi dung thoi luong yeu cau, sau do dong an toan
      socket.setTimeout(() => {
        try {
          socket.send(buildFrame("DISCONNECT", {}));
          socket.close();
        } catch (_) {}
      }, durationSeconds * 1000);

      socket.on("error", (e) => {
        console.error(`Socket error: ${e.error()}`);
      });
    }
  );

  return res;
}

/**
 * Mo ket noi STOMP va giu ket noi (wrapper tuong thich cho cac script idle hold)
 */
export function stompConnectAndHold(token, conversationIds, holdDurationSeconds, onMessageCallback) {
  return stompSession({
    token,
    conversationIds,
    durationSeconds: holdDurationSeconds,
    onMessage: onMessageCallback,
  });
}

/**
 * Gui STOMP SEND frame.
 *
 * @param {object} handle      - stomp handle tu stompConnect
 * @param {string} destination - Vi du: "/app/chat.send"
 * @param {object} body        - Object se duoc JSON.stringify
 */
export function stompSend(handle, destination, body) {
  if (!handle || !handle.socket) return;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  handle.socket.send(buildFrame("SEND", {
    destination:   destination,
    "content-type": "application/json",
    "content-length": payload.length,
  }, payload));
}

/**
 * Gui STOMP DISCONNECT frame va dong WS.
 */
export function stompDisconnect(handle) {
  if (!handle || !handle.socket) return;
  try {
    handle.socket.send(buildFrame("DISCONNECT", {}));
    handle.socket.close();
  } catch (_) { /* ignore */ }
}


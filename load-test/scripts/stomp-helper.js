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
// Connect + subscribe
// ============================================================

/**
 * Mo ket noi STOMP va subscribe vao cac topic cua conversationIds.
 *
 * @param {string}   token          - JWT token
 * @param {string[]} conversationIds - Danh sach ID hoi thoai can subscribe
 * @param {function} onMessage      - Callback khi nhan MESSAGE frame: (frame) => void
 * @param {function} onClose        - Callback khi WS dong: () => void (optional)
 * @returns {object} stomp handle { socket, subscriptionId }
 */
export function stompConnect(token, conversationIds, onMessage, onClose) {
  let subscriptionId = 0;
  const handle = { socket: null };

  const socket = ws.connect(
    WS_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    function (sock) {
      handle.socket = sock;

      // Gui CONNECT frame khi WS mo
      sock.on("open", () => {
        sock.send(buildFrame("CONNECT", {
          "accept-version": "1.2",
          "heart-beat":     "10000,10000",
          Authorization:    `Bearer ${token}`,
        }));
      });

      sock.on("message", (data) => {
        // Bo qua heartbeat (frame la newline hoac rong)
        if (!data || data.trim() === "" || data === "\n") return;

        const frame = parseFrame(data);

        if (frame.command === "CONNECTED") {
          // Subscribe vao tung conversation topic
          conversationIds.forEach((convId) => {
            sock.send(buildFrame("SUBSCRIBE", {
              id:          `sub-${subscriptionId++}`,
              destination: `/topic/conversation.${convId}`,
            }));
          });
        } else if (frame.command === "MESSAGE") {
          if (onMessage) onMessage(frame);
        } else if (frame.command === "ERROR") {
          console.error(`STOMP ERROR: ${frame.body}`);
        }
      });

      sock.on("close", () => {
        if (onClose) onClose();
      });

      sock.on("error", (e) => {
        console.error(`WS error: ${e}`);
      });
    }
  );

  check(socket, { "WebSocket connected (101)": (r) => r && r.status === 101 });
  return handle;
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

/**
 * auth-helper.js — Dang nhap lay JWT token cho k6
 *
 * Moi VU (virtual user) goi POST /api/auth/login mot lan dau.
 * Token duoc cache trong bien cuc bo cua VU suot phien test.
 */

import http from "k6/http";
import { check } from "k6";

export const API_URL = __ENV.API_URL || "http://localhost:8080";

/**
 * Dang nhap va tra ve JWT token.
 * Nem loi neu dang nhap that bai.
 *
 * @param {string} username
 * @param {string} password
 * @returns {string} JWT token
 */
export function login(username, password) {
  // Trich xuat so user de tao dia chi IP gia lap rieng biet cho moi user (X-Forwarded-For)
  // Mo phong 200 client/thiet bi that khac nhau, tranh bi chan boi RateLimiter (5 req/phut/IP)
  const userNumMatch = username.match(/\d+/);
  const userNum = userNumMatch ? parseInt(userNumMatch[0], 10) : 1;
  const simulatedIp = `10.200.${Math.floor(userNum / 250)}.${(userNum % 250) + 1}`;

  const res = http.post(
    `${API_URL}/api/auth/login`,
    JSON.stringify({ username, password }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": simulatedIp,
      },
    }
  );

  check(res, {
    "login 200": (r) => r.status === 200,
    "has token":  (r) => !!r.json("accessToken"),
  });

  if (res.status !== 200) {
    console.error(`Login failed for ${username}: ${res.status} ${res.body}`);
    return null;
  }

  return res.json("accessToken");
}

/**
 * Lay danh sach conversation cua user hien tai.
 * @param {string} token
 * @returns {object[]} mang conversation
 */
export function getMyConversations(token) {
  const res = http.get(`${API_URL}/api/conversations/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return [];
  try {
    return res.json() || [];
  } catch (_) {
    return [];
  }
}

/**
 * Gui tin nhan qua REST API (thay the WebSocket neu can test REST rieng).
 */
export function sendMessageREST(token, conversationId, content) {
  const payload = JSON.stringify({
    conversationId,
    content,
    type:            "TEXT",
    clientMessageId: `k6-${__VU}-${Date.now()}`,
  });
  return http.post(`${API_URL}/api/messages`, payload, {
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}


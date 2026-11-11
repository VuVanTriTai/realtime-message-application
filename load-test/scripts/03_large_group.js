/**
 * 03_large_group.js — Kịch bản 3: Nhóm lớn & Đo độ trễ Fan-out (100% WebSocket)
 * ==============================================================================
 * Mục đích: Đo tốc độ phát tin (fan-out) khi một nhóm có nhiều thành viên online:
 *   - 200 thành viên trong nhóm "LargeGroup" đồng thời online qua WebSocket STOMP
 *   - Admin gửi tin nhắn vào nhóm qua WebSocket /app/chat.send
 *   - Server lưu DB -> Outbox -> Redis -> Fan-out broadcast tới 200 thành viên
 *   - Từng thành viên ghi nhận độ trễ: latency = Date.now() - sentAt
 *   - Hỗ trợ cả 2 mô hình:
 *       1. Conversation Topic (/topic/conversation.{id}) — Khi 200 người mở xem nhóm
 *       2. Single User Channel (/topic/user.{id}) — Khi 200 người nhận qua kênh cá nhân (Caffeine Cache test)
 *
 * Chạy mặc định (Conversation Channel, 200 members, 120s, 1s/tin):
 *   k6 run 03_large_group.js
 *
 * Chạy với Single User Channel (Kiểm tra Caffeine Cache Fanout):
 *   k6 run 03_large_group.js -e USE_USER_CHANNEL=true -e INTERVAL_MS=500
 */

import exec from "k6/execution";
import http from "k6/http";
import { sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { stompSession } from "./stomp-helper.js";
import { login, getMyConversations, API_URL } from "./auth-helper.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

// ============================================================
// Tham số cấu hình có thể override qua biến môi trường (-e KEY=VAL)
// ============================================================
function parseDurationSec(val) {
  if (!val) return 120;
  const str = String(val).trim();
  if (str.endsWith("m")) return parseInt(str, 10) * 60;
  if (str.endsWith("s")) return parseInt(str, 10);
  return parseInt(str, 10);
}

const TOTAL_MEMBERS       = parseInt(__ENV.MEMBERS || "200", 10);
const SEND_DURATION_SEC   = parseDurationSec(__ENV.DURATION || "120");
const BASE_INTERVAL_MS    = parseInt(__ENV.INTERVAL_MS || "1000", 10); // 1s / tin
const SENDER_START_DELAY  = parseInt(__ENV.SENDER_DELAY || "20", 10);  // 20s chờ 200 receiver subscribe xong
const RECEIVER_DRAIN_TIME = parseInt(__ENV.DRAIN_TIME || "25", 10);   // 25s vét sạch tin sau khi sender dừng
const RECEIVER_TOTAL_SEC  = SENDER_START_DELAY + SEND_DURATION_SEC + RECEIVER_DRAIN_TIME;

// ============================================================
// Custom metrics
// ============================================================
const groupLatency  = new Trend("group_e2e_latency_ms",   true); // Độ trễ Fanout đến từng member
const msgSent       = new Counter("group_messages_sent");        // Số tin Admin đã phát vào nhóm
const msgReceived   = new Counter("group_messages_received");    // Tổng số lượt member nhận tin
const errorRate     = new Rate("group_error_rate");

// ============================================================
// Options: 2 Scenarios chạy đồng bộ (per-vu-iterations)
// ============================================================
export const options = {
  setupTimeout: "180s", // 200 HTTP logins cần ~30-50s
  scenarios: {
    // 1. 200 thành viên online kết nối WebSocket STOMP
    subscribers: {
      executor:    "per-vu-iterations",
      exec:        "subscriberScenario",
      vus:         TOTAL_MEMBERS,
      iterations:  1,
      maxDuration: `${RECEIVER_TOTAL_SEC + 30}s`,
    },
    // 2. Admin phát tin vào nhóm định kỳ
    senders: {
      executor:    "per-vu-iterations",
      exec:        "senderScenario",
      vus:         1,
      iterations:  1,
      startTime:   `${SENDER_START_DELAY}s`,
      maxDuration: `${SEND_DURATION_SEC + 30}s`,
    },
  },
  thresholds: {
    "group_e2e_latency_ms": ["p(50)<150", "p(95)<400", "p(99)<1000"],
    "group_error_rate":     ["rate<0.01"],
  },
};

// ============================================================
// Setup: Chuẩn bị tài khoản Admin và lấy danh sách 200 thành viên
// ============================================================
export function setup() {
  console.log(`==> [Setup] Bắt đầu khởi tạo kịch bản Nhóm lớn (${TOTAL_MEMBERS} thành viên)...`);
  console.log(`==> [Setup] Thời lượng gửi: ${SEND_DURATION_SEC}s (Subscribers sống ${RECEIVER_TOTAL_SEC}s để drain sạch tin)`);
  console.log(`==> [Setup] Tần suất gửi tin: ${BASE_INTERVAL_MS}ms / tin (~${Math.round(1000 / BASE_INTERVAL_MS)} tin/s)`);
  if (__ENV.USE_USER_CHANNEL === "true") {
    console.log(`==> [Setup] Mô hình: SINGLE USER CHANNEL (/topic/user.{userId}) [Caffeine Cache Fanout]`);
  } else {
    console.log(`==> [Setup] Mô hình: CONVERSATION CHANNEL (/topic/conversation.{groupId}) [Active Room Broadcast]`);
  }

  // 1. Đăng nhập Admin (người tạo nhóm và sender)
  let adminToken = login("admin", "LoadTest@123");
  if (!adminToken) {
    adminToken = login("admin", "Admin@123");
  }
  if (!adminToken) {
    throw new Error("Không thể đăng nhập tài khoản admin! Vui lòng kiểm tra seed data.");
  }

  // 2. Xác định nhóm "LargeGroup"
  let targetGroupId   = __ENV.GROUP_ID || null;
  let targetGroupName = "LargeGroup";

  if (!targetGroupId) {
    const adminConvs = getMyConversations(adminToken);
    const largeGroup = adminConvs.find(
      (c) => c.type === "GROUP" && (c.name === "LargeGroup" || c.name === "Dev Team")
    );
    if (largeGroup) {
      targetGroupId   = String(largeGroup.id);
      targetGroupName = largeGroup.name;
      console.log(`==> [Setup] Tìm thấy nhóm '${targetGroupName}' có ID = ${targetGroupId}`);
    } else {
      const anyGroup = adminConvs.find((c) => c.type === "GROUP");
      if (anyGroup) {
        targetGroupId   = String(anyGroup.id);
        targetGroupName = anyGroup.name || "GroupChat";
        console.log(`==> [Setup] Dùng nhóm mặc định '${targetGroupName}' ID = ${targetGroupId}`);
      } else {
        throw new Error("Không tìm thấy nhóm nào! Vui lòng kiểm tra migration V6.");
      }
    }
  }

  // 3. Lấy danh sách thành viên thực tế của nhóm qua API
  const membersRes = http.get(`${API_URL}/api/conversations/${targetGroupId}/members`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (membersRes.status !== 200) {
    throw new Error(`Không thể lấy danh sách thành viên nhóm ID=${targetGroupId}: ${membersRes.status}`);
  }

  const allMembers = membersRes.json();
  // Lọc bỏ admin, lấy danh sách loadtest users
  const candidateMembers = allMembers.filter((m) => m.user && m.user.username !== "admin");

  if (candidateMembers.length === 0) {
    throw new Error(`Nhóm ID=${targetGroupId} không có thành viên nào ngoài admin!`);
  }

  const memberCountToUse = Math.min(TOTAL_MEMBERS, candidateMembers.length);
  console.log(`==> [Setup] Pre-login ${memberCountToUse} thành viên của nhóm...`);

  const members = [];
  for (let i = 0; i < memberCountToUse; i++) {
    const m = candidateMembers[i];
    const username = m.user.username;
    const userId   = m.user.id;

    const token = login(username, "LoadTest@123");
    if (token) {
      members.push({
        userId:   userId,
        username: username,
        token:    token,
      });
    }

    if ((i + 1) % 25 === 0 || i + 1 === memberCountToUse) {
      console.log(`==> [Setup] Đã kết nối sẵn sàng ${members.length}/${memberCountToUse} thành viên...`);
    }
    sleep(0.01);
  }

  console.log(`==> [Setup] Hoàn tất chuẩn bị ${members.length} thành viên. Sẵn sàng bắt đầu Fanout Test!`);

  return {
    adminToken,
    groupId:   targetGroupId,
    groupName: targetGroupName,
    members,
  };
}

// ============================================================
// Scenario 1: Thành viên nhóm online (Subscribers)
// ============================================================
export function subscriberScenario(data) {
  const memberIndex = exec.scenario.iterationInTest % data.members.length;
  const member = data.members[memberIndex];
  const isUserChannel = __ENV.USE_USER_CHANNEL === "true";

  stompSession({
    token:           member.token,
    conversationIds: isUserChannel ? [] : [data.groupId],
    userTopics:      isUserChannel && member.userId ? [member.userId] : [],
    durationSeconds: RECEIVER_TOTAL_SEC + 5,
    onMessage: (msg) => {
      // Hỗ trợ cả 2 định dạng: MessageResponse (room topic) và UserInboxEvent (user topic)
      let content = null;
      if (msg && typeof msg.content === "string") {
        content = msg.content;
      } else if (msg && msg.lastMessage && typeof msg.lastMessage.content === "string") {
        content = msg.lastMessage.content;
      } else if (msg && msg.message && typeof msg.message.content === "string") {
        content = msg.message.content;
      }

      if (content && content.startsWith("k6|")) {
        const parts  = content.split("|");
        const sentAt = parseInt(parts[1], 10);

        if (!isNaN(sentAt)) {
          const latency = Date.now() - sentAt;
          groupLatency.add(latency);
          msgReceived.add(1);
        }
      }
    },
  });
}

// ============================================================
// Scenario 2: Admin gửi tin nhắn vào nhóm (Sender qua WebSocket)
// ============================================================
export function senderScenario(data) {
  stompSession({
    token:           data.adminToken,
    conversationIds: [], // Sender không cần nghe lại
    durationSeconds: SEND_DURATION_SEC + 5,
    onConnected: (socket, sendFrame) => {
      let count = 0;

      const scheduleNextSend = () => {
        count++;
        const sentAt      = Date.now();
        const clientMsgId = `ws-grp-${count}-${sentAt}`;
        const content     = `k6|${sentAt}|[FANOUT TEST] Message #${count} to ${data.groupName}`;

        try {
          sendFrame("/app/chat.send", {
            conversationId:  parseInt(data.groupId, 10),
            content:         content,
            type:            "TEXT",
            clientMessageId: clientMsgId,
          });
          msgSent.add(1);
          errorRate.add(false); // Thành công -> lỗi = 0
        } catch (err) {
          errorRate.add(true);  // Thất bại -> lỗi = 1
        }

        socket.setTimeout(scheduleNextSend, BASE_INTERVAL_MS);
      };

      // Bắt đầu gửi sau 500ms khi kết nối đã ổn định
      socket.setTimeout(scheduleNextSend, 500);
    },
  });
}

// ============================================================
// Báo cáo tổng kết toàn vẹn dữ liệu & hiệu năng Fan-out
// ============================================================
export function handleSummary(data) {
  const sent          = data.metrics.group_messages_sent     ? data.metrics.group_messages_sent.values.count     : 0;
  const received      = data.metrics.group_messages_received ? data.metrics.group_messages_received.values.count : 0;
  const expectedTotal = sent * TOTAL_MEMBERS;
  const lost          = Math.max(0, expectedTotal - received);
  const deliveryRate  = expectedTotal > 0 ? ((received / expectedTotal) * 100).toFixed(2) : "100.00";

  const latencyAvg = data.metrics.group_e2e_latency_ms ? data.metrics.group_e2e_latency_ms.values.avg.toFixed(1) : "N/A";
  const latencyP90 = data.metrics.group_e2e_latency_ms ? data.metrics.group_e2e_latency_ms.values["p(90)"].toFixed(1) : "N/A";
  const latencyP95 = data.metrics.group_e2e_latency_ms ? data.metrics.group_e2e_latency_ms.values["p(95)"].toFixed(1) : "N/A";
  const latencyMax = data.metrics.group_e2e_latency_ms ? data.metrics.group_e2e_latency_ms.values.max.toFixed(1) : "N/A";
  const errRate    = data.metrics.group_error_rate     ? (data.metrics.group_error_rate.values.rate * 100).toFixed(2) : "0.00";

  const wsIcon  = (lost === 0 && sent > 0) ? "✅" : (lost <= expectedTotal * 0.01 ? "⚠️" : "❌");
  const latIcon = parseFloat(latencyP95) < 150 ? "✅" : (parseFloat(latencyP95) < 400 ? "⚠️" : "❌");
  const errIcon = parseFloat(errRate) < 0.01 ? "✅" : "❌";

  const banner = `
================================================================================
  BÁO CÁO KẾT QUẢ TEST FAN-OUT NHÓM LỚN (LARGE GROUP - ${TOTAL_MEMBERS} MEMBERS)
================================================================================

  📦 TOÀN VẸN DỮ LIỆU & PHÂN PHỐI TIN NHẮN (FAN-OUT DELIVERY):
    ${wsIcon} Tin Admin phát vào nhóm : ${sent} tin
    ${wsIcon} Dự kiến phân phối       : ${expectedTotal} lượt nhận (${sent} tin × ${TOTAL_MEMBERS} members)
    ${wsIcon} Thực tế nhận được (k6)  : ${received} lượt nhận qua WebSocket
    ${wsIcon} Rớt / Chưa kịp nhận    : ${lost} lượt (${expectedTotal > 0 ? ((lost / expectedTotal) * 100).toFixed(2) : 0}%)
    ${wsIcon} Delivery Rate           : ${deliveryRate}%

  ⚡ HIỆU NĂNG PHÁT TÁN (FAN-OUT E2E LATENCY):
    ${latIcon} avg                     : ${latencyAvg} ms
    ${latIcon} p(90)                   : ${latencyP90} ms
    ${latIcon} p(95)                   : ${latencyP95} ms
    ${latIcon} max                     : ${latencyMax} ms

  🔧 ĐỘ ỔN ĐỊNH GỬI (SENDER STABILITY):
    ${errIcon} Send Error Rate         : ${errRate}%

================================================================================
`;

  return {
    stdout: banner + "\n" + textSummary(data, { indent: " ", enableColors: true }),
  };
}

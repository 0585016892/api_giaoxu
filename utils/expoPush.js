const { Expo } = require("expo-server-sdk");

const expo = new Expo();

// ============================================================
// SEND EXPO PUSH NOTIFICATIONS
// ============================================================

const sendExpoPushNotifications = async ({
  tokens = [],
  title,
  body,
  data = {},
  priority = "normal",
}) => {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    console.log("[ExpoPush] Không có token để gửi");

    return [];
  }

  // ============================================================
  // FILTER VALID EXPO TOKENS
  // ============================================================

  const validTokens = tokens.filter((token) => {
    if (!token) {
      return false;
    }

    if (!Expo.isExpoPushToken(token)) {
      console.warn("[ExpoPush] Token không hợp lệ:", token);

      return false;
    }

    return true;
  });

  if (validTokens.length === 0) {
    console.log("[ExpoPush] Không có Expo Push Token hợp lệ");

    return [];
  }

  // ============================================================
  // BUILD MESSAGES
  // ============================================================

  const messages = validTokens.map((token) => ({
    to: token,

    sound: "default",

    title: title && String(title).trim() ? String(title).trim() : "FaithEdu",

    body:
      body && String(body).trim()
        ? String(body).trim()
        : "Bạn có một thông báo mới từ FaithEdu",

    data,

    priority: priority === "urgent" || priority === "high" ? "high" : "default",

    channelId: "default",
  }));

  console.log(`[ExpoPush] Chuẩn bị gửi ${messages.length} notification`);

  // ============================================================
  // CHUNK
  // ============================================================

  const chunks = expo.chunkPushNotifications(messages);

  const tickets = [];

  // ============================================================
  // SEND
  // ============================================================

  for (const chunk of chunks) {
    try {
      console.log("[ExpoPush] Sending chunk:", chunk.length);

      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

      console.log("[ExpoPush] Ticket:", ticketChunk);

      tickets.push(...ticketChunk);
    } catch (error) {
      console.error("[ExpoPush] SEND ERROR:", error);
    }
  }

  return tickets;
};

module.exports = {
  sendExpoPushNotifications,
};

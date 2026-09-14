const { Expo } = require("expo-server-sdk");

const expo = new Expo();

const sendExpoPushNotifications = async ({
  tokens = [],
  title = "FaithEdu",
  body = "Bạn có một thông báo mới từ FaithEdu",
  data = {},
  priority = "normal",
}) => {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    console.log("[ExpoPush] Không có token");
    return [];
  }

  // ========================================================
  // 1. VALIDATE TOKEN
  // ========================================================

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

  console.log("[ExpoPush] Valid tokens:", validTokens);

  if (validTokens.length === 0) {
    console.log("[ExpoPush] Không có token hợp lệ");
    return [];
  }

  // ========================================================
  // 2. BUILD MESSAGES
  // ========================================================

  const messages = validTokens.map((token) => ({
    to: token,

    sound: "default",

    title: String(title || "FaithEdu").trim(),

    body: String(body || "Bạn có một thông báo mới từ FaithEdu").trim(),

    data,

    priority: priority === "urgent" || priority === "high" ? "high" : "default",

    channelId: "default",
  }));

  console.log("[ExpoPush] Messages:", messages);

  // ========================================================
  // 3. CHUNK
  // ========================================================

  const chunks = expo.chunkPushNotifications(messages);

  const tickets = [];

  // ========================================================
  // 4. SEND
  // ========================================================

  for (const chunk of chunks) {
    try {
      console.log("[ExpoPush] Sending chunk:", chunk.length);

      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

      console.log("[ExpoPush] Ticket chunk:", ticketChunk);

      tickets.push(...ticketChunk);
    } catch (error) {
      console.error("[ExpoPush] SEND ERROR:", error);
    }
  }

  console.log("[ExpoPush] Total tickets:", tickets.length);

  return tickets;
};

module.exports = {
  sendExpoPushNotifications,
};

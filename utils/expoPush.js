// ============================================================
// FAITHEDU - EXPO PUSH SERVICE
// CommonJS backend + ESM expo-server-sdk
// ============================================================

let Expo = null;
let expoClient = null;

// ============================================================
// LOAD EXPO SERVER SDK
// ============================================================

const getExpoClient = async () => {
  if (expoClient) {
    return expoClient;
  }

  const expoModule = await import("expo-server-sdk");

  // Hỗ trợ cả:
  // import { Expo } from "expo-server-sdk"
  // và default export nếu package thay đổi
  Expo = expoModule.Expo || expoModule.default;

  if (!Expo) {
    throw new Error("Không thể load Expo từ expo-server-sdk");
  }

  expoClient = new Expo();

  console.log("✅ [ExpoPush] expo-server-sdk loaded");

  return expoClient;
};

// ============================================================
// SEND EXPO PUSH NOTIFICATIONS
// ============================================================

const sendExpoPushNotifications = async ({
  tokens = [],
  title = "FaithEdu",
  body = "Bạn có một thông báo mới từ FaithEdu",
  data = {},
  priority = "normal",
}) => {
  try {
    console.log("");
    console.log("==============================================");
    console.log("📱 [ExpoPush] START SEND");
    console.log("==============================================");

    // ========================================================
    // 1. CHECK TOKENS
    // ========================================================

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log("⚠️ [ExpoPush] Không có token");

      return [];
    }

    console.log("📱 [ExpoPush] Input tokens:", tokens);

    // ========================================================
    // 2. LOAD EXPO
    // ========================================================

    const expo = await getExpoClient();

    // ========================================================
    // 3. VALIDATE TOKEN
    // ========================================================

    const validTokens = tokens.filter((token) => {
      if (!token) {
        return false;
      }

      const cleanToken = String(token).trim();

      if (!cleanToken) {
        return false;
      }

      if (!Expo.isExpoPushToken(cleanToken)) {
        console.warn("⚠️ [ExpoPush] Token không hợp lệ:", cleanToken);

        return false;
      }

      return true;
    });

    console.log("📱 [ExpoPush] Valid tokens:", validTokens);

    if (validTokens.length === 0) {
      console.log("⚠️ [ExpoPush] Không có token Expo hợp lệ");

      return [];
    }

    // ========================================================
    // 4. BUILD MESSAGES
    // ========================================================

    const messages = validTokens.map((token) => ({
      to: token,

      sound: "default",

      title: String(title || "FaithEdu").trim(),

      body: String(body || "Bạn có một thông báo mới từ FaithEdu").trim(),

      data: {
        ...data,
      },

      priority:
        priority === "urgent" || priority === "high" ? "high" : "default",

      channelId: "default",
    }));

    console.log("📱 [ExpoPush] Messages:", messages);

    // ========================================================
    // 5. CHUNK MESSAGES
    // ========================================================

    const chunks = expo.chunkPushNotifications(messages);

    console.log("📦 [ExpoPush] Chunks:", chunks.length);

    // ========================================================
    // 6. SEND
    // ========================================================

    const tickets = [];

    for (const chunk of chunks) {
      try {
        console.log(`🚀 [ExpoPush] Sending chunk: ${chunk.length}`);

        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

        console.log("🎫 [ExpoPush] Ticket chunk:", ticketChunk);

        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("❌ [ExpoPush] SEND CHUNK ERROR:", error);
      }
    }

    // ========================================================
    // 7. RESULT
    // ========================================================

    console.log(`📱 [ExpoPush] Total tickets: ${tickets.length}`);

    console.log("==============================================");

    console.log("📱 [ExpoPush] END SEND");

    console.log("==============================================");

    return tickets;
  } catch (error) {
    console.error("❌ [ExpoPush] ERROR:", error);

    return [];
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  sendExpoPushNotifications,
};

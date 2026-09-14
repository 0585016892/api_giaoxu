// ============================================================
// FAITHEDU - EXPO PUSH SERVICE
// Direct Expo Push API
// Node.js 20+
// Không sử dụng expo-server-sdk
// ============================================================

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Gửi Push Notification qua Expo HTTP API
 *
 * @param {Object} params
 * @param {string[]} params.tokens
 * @param {string} params.title
 * @param {string} params.body
 * @param {Object} params.data
 * @param {string} params.priority
 */
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
    console.log("📱 [ExpoPush HTTP] START SEND");
    console.log("==============================================");

    // --------------------------------------------------------
    // 1. Kiểm tra token
    // --------------------------------------------------------

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log("⚠️ [ExpoPush HTTP] Không có token");
      return [];
    }

    console.log("📱 Input tokens:", tokens);

    // --------------------------------------------------------
    // 2. Lọc token hợp lệ
    // --------------------------------------------------------

    const validTokens = tokens
      .map((token) => String(token || "").trim())
      .filter((token) => {
        if (!token) {
          return false;
        }

        const isExpoToken =
          token.startsWith("ExponentPushToken[") ||
          token.startsWith("ExpoPushToken[");

        if (!isExpoToken) {
          console.warn("⚠️ [ExpoPush HTTP] Token không hợp lệ:", token);

          return false;
        }

        return true;
      });

    console.log("📱 Valid tokens:", validTokens);

    if (validTokens.length === 0) {
      console.log("⚠️ [ExpoPush HTTP] Không có Expo Push Token hợp lệ");

      return [];
    }

    // --------------------------------------------------------
    // 3. Tạo messages
    // --------------------------------------------------------

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

    console.log(
      "📦 [ExpoPush HTTP] Messages:",
      JSON.stringify(messages, null, 2),
    );

    // --------------------------------------------------------
    // 4. Gọi Expo Push API
    // --------------------------------------------------------

    console.log("🚀 [ExpoPush HTTP] Đang gửi tới Expo...");

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",

      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },

      body: JSON.stringify(messages),
    });

    console.log("📡 [ExpoPush HTTP] HTTP Status:", response.status);

    // --------------------------------------------------------
    // 5. Đọc response
    // --------------------------------------------------------

    const result = await response.json();

    console.log(
      "📨 [ExpoPush HTTP] Response:",
      JSON.stringify(result, null, 2),
    );

    // --------------------------------------------------------
    // 6. HTTP lỗi
    // --------------------------------------------------------

    if (!response.ok) {
      console.error("❌ [ExpoPush HTTP] HTTP ERROR:", response.status, result);

      return [];
    }

    // --------------------------------------------------------
    // 7. Lấy tickets
    // --------------------------------------------------------

    const tickets = Array.isArray(result?.data) ? result.data : [];

    console.log(
      "🎫 [ExpoPush HTTP] Tickets:",
      JSON.stringify(tickets, null, 2),
    );

    console.log(`📱 [ExpoPush HTTP] Total tickets: ${tickets.length}`);

    console.log("==============================================");
    console.log("📱 [ExpoPush HTTP] END SEND");
    console.log("==============================================");

    return tickets;
  } catch (error) {
    console.error("❌ [ExpoPush HTTP] ERROR:", error);

    return [];
  }
};

module.exports = {
  sendExpoPushNotifications,
};

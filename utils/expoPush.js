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
 * Hiển thị notification theo format:
 *
 * FaithEdu
 * Tiêu đề thông báo
 * Nội dung thông báo
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
  title = "",
  body = "",
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
    // 3. Chuẩn hóa nội dung
    // --------------------------------------------------------

    const notificationTitle = String(title || "").trim();

    const notificationBody = String(body || "").trim();

    // --------------------------------------------------------
    // 4. Tạo nội dung notification
    //
    // Expo/iOS sẽ hiển thị:
    //
    // FaithEdu
    // [title]
    // [body]
    //
    // Trong đó:
    // title của Expo = FaithEdu
    // body của Expo = title + body
    // --------------------------------------------------------

    let displayBody = "";

    if (notificationTitle && notificationBody) {
      displayBody = `${notificationTitle}\n${notificationBody}`;
    } else if (notificationTitle) {
      displayBody = notificationTitle;
    } else if (notificationBody) {
      displayBody = notificationBody;
    } else {
      displayBody = "Bạn có một thông báo mới từ FaithEdu";
    }

    console.log("📌 Notification app name:", "FaithEdu");

    console.log("📌 Notification title:", notificationTitle);

    console.log("📌 Notification body:", notificationBody);

    console.log("📌 Notification display body:", displayBody);

    // --------------------------------------------------------
    // 5. Tạo messages
    // --------------------------------------------------------

    const messages = validTokens.map((token) => ({
      to: token,

      sound: "default",

      // ------------------------------------------------------
      // Luôn hiển thị FaithEdu ở phần tên ứng dụng
      // ------------------------------------------------------

      title: "FaithEdu",

      // ------------------------------------------------------
      // Nội dung:
      //
      // Tiêu đề
      // Nội dung
      // ------------------------------------------------------

      body: displayBody,

      // ------------------------------------------------------
      // Data dùng khi người dùng bấm notification
      // ------------------------------------------------------

      data: {
        ...data,
      },

      // ------------------------------------------------------
      // Priority
      // ------------------------------------------------------

      priority:
        priority === "urgent" || priority === "high" ? "high" : "default",

      // ------------------------------------------------------
      // Android notification channel
      // ------------------------------------------------------

      channelId: "default",
    }));

    console.log(
      "📦 [ExpoPush HTTP] Messages:",
      JSON.stringify(messages, null, 2),
    );

    // --------------------------------------------------------
    // 6. Gọi Expo Push API
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
    // 7. Đọc response
    // --------------------------------------------------------

    const result = await response.json();

    console.log(
      "📨 [ExpoPush HTTP] Response:",
      JSON.stringify(result, null, 2),
    );

    // --------------------------------------------------------
    // 8. HTTP lỗi
    // --------------------------------------------------------

    if (!response.ok) {
      console.error("❌ [ExpoPush HTTP] HTTP ERROR:", response.status, result);

      return [];
    }

    // --------------------------------------------------------
    // 9. Lấy tickets
    // --------------------------------------------------------

    const tickets = Array.isArray(result?.data) ? result.data : [];

    console.log(
      "🎫 [ExpoPush HTTP] Tickets:",
      JSON.stringify(tickets, null, 2),
    );

    console.log(`📱 [ExpoPush HTTP] Total tickets: ${tickets.length}`);

    // --------------------------------------------------------
    // 10. Kết thúc
    // --------------------------------------------------------

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

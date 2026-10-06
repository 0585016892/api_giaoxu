// ============================================================
// FAITHEDU - ASSISTANT CONTROLLER
// PHASE 5.1 → 5.7
// ============================================================

const assistantService = require("../services/assistantService");

// ============================================================
// CONSTANTS
// ============================================================

const MAX_MESSAGE_LENGTH = 500;

// ============================================================
// LOG HELPER
// ============================================================

function logAssistantHeader() {
  console.log("");
  console.log("============================================================");
  console.log("                  FAITHEDU ASSISTANT API");
  console.log("============================================================");
}

// ============================================================
// CHAT
// ============================================================

exports.chat = async (req, res) => {
  logAssistantHeader();

  try {
    // ========================================================
    // USER
    // ========================================================

    const user = req.user;

    if (!user) {
      console.error("[ASSISTANT CONTROLLER] USER NOT FOUND");

      return res.status(401).json({
        success: false,
        code: "ASSISTANT_UNAUTHORIZED",
        message: "Phiên đăng nhập không hợp lệ.",
      });
    }

    // ========================================================
    // BASIC USER INFO
    // KHÔNG LOG TOKEN
    // ========================================================

    console.log("[ASSISTANT CONTROLLER] USER ID:", user.id);

    console.log("[ASSISTANT CONTROLLER] ROLE:", user.role);

    console.log(
      "[ASSISTANT CONTROLLER] CHURCH ID:",
      user.church_id || user.parish_id || null,
    );

    console.log("[ASSISTANT CONTROLLER] TEACHER ID:", user.teacher_id || null);

    console.log(
      "[ASSISTANT CONTROLLER] CATECHIST ID:",
      user.catechist_id || null,
    );

    // ========================================================
    // MESSAGE
    // ========================================================

    const rawMessage = req.body?.message;

    if (rawMessage === undefined || rawMessage === null) {
      console.warn("[ASSISTANT CONTROLLER] MESSAGE MISSING");

      return res.status(400).json({
        success: false,
        code: "ASSISTANT_MESSAGE_REQUIRED",
        message: "Bạn hãy nhập câu hỏi.",
      });
    }

    if (typeof rawMessage !== "string") {
      console.warn("[ASSISTANT CONTROLLER] MESSAGE INVALID TYPE");

      return res.status(400).json({
        success: false,
        code: "ASSISTANT_MESSAGE_INVALID",
        message: "Nội dung câu hỏi không hợp lệ.",
      });
    }

    const message = rawMessage.trim();

    console.log("[ASSISTANT CONTROLLER] MESSAGE LENGTH:", message.length);

    // ========================================================
    // EMPTY
    // ========================================================

    if (!message) {
      return res.status(400).json({
        success: false,
        code: "ASSISTANT_MESSAGE_REQUIRED",
        message: "Bạn hãy nhập câu hỏi.",
      });
    }

    // ========================================================
    // MAX LENGTH
    // ========================================================

    if (message.length > MAX_MESSAGE_LENGTH) {
      console.warn("[ASSISTANT CONTROLLER] MESSAGE TOO LONG:", message.length);

      return res.status(400).json({
        success: false,
        code: "ASSISTANT_MESSAGE_TOO_LONG",
        message: `Câu hỏi tối đa ${MAX_MESSAGE_LENGTH} ký tự.`,
      });
    }

    // ========================================================
    // SERVICE
    // ========================================================

    console.log("[ASSISTANT CONTROLLER] CALL SERVICE");

    const result = await assistantService.chat({
      user,
      message,
    });

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("[ASSISTANT CONTROLLER] SERVICE SUCCESS");

    console.log("[ASSISTANT CONTROLLER] INTENT:", result?.intent || "unknown");

    console.log("[ASSISTANT CONTROLLER] HAS DATA:", Boolean(result?.data));

    console.log(
      "[ASSISTANT CONTROLLER] BLOCK COUNT:",
      Array.isArray(result?.blocks) ? result.blocks.length : 0,
    );

    console.log(
      "[ASSISTANT CONTROLLER] SUGGESTION COUNT:",
      Array.isArray(result?.suggestions) ? result.suggestions.length : 0,
    );

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      intent: result?.intent || "unknown",

      reply: result?.reply || result?.answer || "Mình chưa có câu trả lời.",

      // Giữ backward compatibility
      answer: result?.answer || result?.reply || "Mình chưa có câu trả lời.",

      data: result?.data ?? null,

      blocks: Array.isArray(result?.blocks) ? result.blocks : [],

      suggestions: Array.isArray(result?.suggestions) ? result.suggestions : [],

      meta: {
        readOnly: true,

        ...(result?.meta || {}),
      },

      // Giữ article nếu frontend cũ đang đọc
      article: result?.article ?? null,
    });
  } catch (error) {
    // ========================================================
    // ERROR LOG
    // ========================================================

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("              FAITHEDU ASSISTANT ERROR");
    console.error(
      "============================================================",
    );

    console.error("[ASSISTANT CONTROLLER] ERROR:", error?.message);

    console.error("[ASSISTANT CONTROLLER] CODE:", error?.code || "UNKNOWN");

    console.error("[ASSISTANT CONTROLLER] STATUS:", error?.status || 500);

    // Không log stack cho các lỗi business bình thường.
    // Chỉ log stack cho lỗi server thực sự.

    if (!error?.status || Number(error.status) >= 500) {
      console.error("[ASSISTANT CONTROLLER] STACK:", error?.stack);
    }

    // ========================================================
    // STATUS
    // ========================================================

    const status =
      Number(error?.status) >= 400 && Number(error?.status) < 600
        ? Number(error.status)
        : 500;

    // ========================================================
    // CLIENT MESSAGE
    // ========================================================

    let message = error?.message || "Trợ lý đang gặp lỗi. Vui lòng thử lại.";

    // Không expose lỗi DB quá chi tiết
    if (status >= 500) {
      message = "Trợ lý đang gặp lỗi hệ thống. Vui lòng thử lại sau.";
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(status).json({
      success: false,

      code: error?.code || "ASSISTANT_INTERNAL_ERROR",

      message,

      // Frontend có thể dùng thống nhất
      reply: message,

      answer: message,

      data: null,

      blocks: [],

      suggestions: [],

      meta: {
        readOnly: true,
      },

      article: null,
    });
  }
};

// controllers/assistantController.js

const { chatWithAssistant } = require("../services/assistant/assistantService");

/**
 * ============================================================
 * POST /assistant/chat
 * ============================================================
 */

exports.chat = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("              POST /assistant/chat");
  console.log("============================================================");

  try {
    /**
     * ========================================================
     * USER
     * ========================================================
     */

    console.log("👤 USER:", req.user);

    if (!req.user) {
      console.error("❌ USER NOT FOUND");

      return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Phiên đăng nhập không hợp lệ.",
      });
    }

    /**
     * ========================================================
     * MESSAGE
     * ========================================================
     */

    const { message } = req.body || {};

    console.log("💬 MESSAGE:", message);

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        code: "EMPTY_MESSAGE",
        message: "Vui lòng nhập câu hỏi.",
      });
    }

    /**
     * ========================================================
     * LENGTH
     * ========================================================
     */

    if (message.trim().length > 500) {
      return res.status(400).json({
        success: false,
        code: "MESSAGE_TOO_LONG",
        message: "Câu hỏi quá dài. Vui lòng nhập ngắn gọn hơn.",
      });
    }

    /**
     * ========================================================
     * ASSISTANT
     * ========================================================
     */

    const result = await chatWithAssistant({
      message: message.trim(),
      user: req.user,
    });

    /**
     * ========================================================
     * RESPONSE
     * ========================================================
     */

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("❌ ASSISTANT ERROR");
    console.error(
      "============================================================",
    );

    console.error("CODE:", error.code);
    console.error("MESSAGE:", error.message);
    console.error("STACK:", error.stack);

    if (error.code === "INVALID_MESSAGE") {
      return res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    if (error.code === "EMPTY_MESSAGE") {
      return res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    if (error.code === "MESSAGE_TOO_LONG") {
      return res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      code: "ASSISTANT_ERROR",
      message: "Trợ lý FaithEdu đang gặp sự cố. Vui lòng thử lại sau.",
    });
  }
};

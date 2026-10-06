const assistantService = require("../services/assistant/assistantService");

// ============================================================
// POST /api/assistant/chat
// ============================================================

exports.chat = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("              POST /assistant/chat");
  console.log("============================================================");

  try {
    // ========================================================
    // USER
    // ========================================================

    const user = req.user;

    console.log("👤 USER ID:", user?.id);

    console.log("🎭 ROLE:", user?.role);

    console.log("⛪ CHURCH ID:", user?.church_id);

    // ========================================================
    // MESSAGE
    // ========================================================

    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";

    console.log("💬 MESSAGE:", message);

    // ========================================================
    // VALIDATE
    // ========================================================

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập câu hỏi.",
        code: "ASSISTANT_MESSAGE_REQUIRED",
      });
    }

    if (message.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Câu hỏi không được vượt quá 500 ký tự.",
        code: "ASSISTANT_MESSAGE_TOO_LONG",
      });
    }

    // ========================================================
    // CHAT
    // ========================================================
    //
    // Phase 3 dùng:
    //
    // assistantService.chat()
    //
    // KHÔNG phải:
    //
    // chatWithAssistant()
    //
    // ========================================================

    const result = await assistantService.chat({
      user,
      message,
    });

    console.log("");
    console.log("============================================================");
    console.log("              ASSISTANT SUCCESS");
    console.log("============================================================");

    console.log("🎯 INTENT:", result?.intent);

    console.log("✅ SUCCESS:", result?.success);

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      intent: result?.intent || "unknown",

      reply: result?.reply || "",

      data: result?.data || null,
    });
  } catch (error) {
    console.log("");
    console.log("============================================================");
    console.log("❌ ASSISTANT ERROR");
    console.log("============================================================");

    console.log("CODE:", error?.code);

    console.log("MESSAGE:", error?.message);

    console.log("STACK:", error?.stack);

    const status =
      Number(error?.status) >= 400 && Number(error?.status) < 600
        ? Number(error.status)
        : 500;

    return res.status(status).json({
      success: false,

      message: error?.message || "Trợ lý FaithEdu đang gặp lỗi.",

      code: error?.code || "ASSISTANT_ERROR",
    });
  }
};

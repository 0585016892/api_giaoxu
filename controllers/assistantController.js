// ============================================================
// FAITHEDU - ASSISTANT CONTROLLER - PHASE 5
// ============================================================

const assistantService = require("../services/assistant/assistantService");

exports.chat = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("          POST /assistant/chat - PHASE 5");
  console.log("============================================================");

  try {
    const user = req.user;

    console.log("USER ID:", user?.id);

    console.log("ROLE:", user?.role);

    console.log("CHURCH ID:", user?.church_id);

    console.log("TEACHER ID:", user?.teacher_id || null);

    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";

    console.log("MESSAGE:", message);

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

    const result = await assistantService.chat({
      user,
      message,
    });

    console.log("");
    console.log("============================================================");
    console.log("           ASSISTANT SUCCESS - PHASE 5");
    console.log("============================================================");

    console.log("INTENT:", result?.intent);

    console.log("SUCCESS:", result?.success);

    console.log(
      "DATA:",
      Array.isArray(result?.data)
        ? `ARRAY(${result.data.length})`
        : result?.data
          ? "OBJECT"
          : "NULL",
    );

    return res.status(200).json({
      success: true,

      intent: result?.intent || "unknown",

      reply: result?.reply || "",

      answer: result?.answer || result?.reply || "",

      data: result?.data ?? null,

      suggestions: result?.suggestions || [],

      article: result?.article || null,
    });
  } catch (error) {
    console.log("");
    console.log("============================================================");
    console.log("             ASSISTANT ERROR");
    console.log("============================================================");

    console.log("CODE:", error?.code);

    console.log("STATUS:", error?.status);

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

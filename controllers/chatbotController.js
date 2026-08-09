const chatbotService = require("../services/chatbotService");

exports.chat = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Thiếu câu hỏi",
      });
    }

    const answer = await chatbotService.chat(question);

    return res.json({
      success: true,

      answer,
    });
  } catch (error) {
    console.error("CHATBOT ERROR:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

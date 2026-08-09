const { getHistory } = require("../services/chatHistoryService");

exports.history = async (req, res) => {
  try {
    const data = await getHistory(req.params.sessionId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

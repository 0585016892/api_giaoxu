const express = require("express");
const router = express.Router();

const {
  sendNotificationEmail,
  verifyEmailConnection,
} = require("../utils/emailService");

// =========================================================
// TEST SMTP CONNECTION
// GET /api/email/test-connection
// =========================================================
router.get("/test-connection", async (req, res) => {
  try {
    await verifyEmailConnection();

    return res.json({
      success: true,
      message: "SMTP đã kết nối thành công",
    });
  } catch (error) {
    console.error("SMTP TEST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Không thể kết nối SMTP",
    });
  }
});

// =========================================================
// TEST SEND EMAIL
// POST /api/email/test
// =========================================================
router.post("/test", async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email nhận",
      });
    }

    const result = await sendNotificationEmail({
      to,
      recipientName: "Bạn",
      title: "Email kiểm tra FaithEdu",
      content:
        "Xin chào,\n\nĐây là email kiểm tra hệ thống gửi email của FaithEdu.\n\nNếu bạn nhận được email này thì cấu hình SMTP đang hoạt động bình thường.",
      priority: "normal",
    });

    return res.json({
      success: true,
      message: "Gửi email thành công",
      data: result,
    });
  } catch (error) {
    console.error("SEND TEST EMAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Gửi email thất bại",
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
});

module.exports = router;

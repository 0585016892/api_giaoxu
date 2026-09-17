const db = require("../config/db");
const { sendNotificationEmail } = require("../utils/emailService");

const ADMIN_EMAIL = process.env.CONTACT_RECEIVER_EMAIL || process.env.SMTP_USER;

// =========================================================
// CREATE CONTACT MESSAGE
// =========================================================

exports.createContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message, rating } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập họ tên",
      });
    }

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email",
      });
    }

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập nội dung góp ý",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Email không hợp lệ",
      });
    }

    // =====================================================
    // 1. LƯU DATABASE
    // =====================================================

    const [result] = await db.query(
      `
      INSERT INTO contact_messages
      (
        name,
        email,
        subject,
        message,
        status,
        email_status
      )
      VALUES (?, ?, ?, ?, 'new', 'pending')
      `,
      [
        name.trim(),
        email.trim(),
        subject?.trim() || "Góp ý FaithEdu",
        message.trim(),
      ],
    );

    const contactId = result.insertId;

    // =====================================================
    // 2. GỬI EMAIL CHO ADMIN
    // =====================================================

    try {
      await sendNotificationEmail({
        to: ADMIN_EMAIL,

        recipientName: "FaithEdu Admin",

        title: `Góp ý mới từ ${name.trim()}`,

        content: `
Có một góp ý mới được gửi từ hệ thống FaithEdu.

Họ tên: ${name.trim()}

Email: ${email.trim()}

Chủ đề:
${subject?.trim() || "Góp ý FaithEdu"}

Đánh giá:
${rating || "Không đánh giá"}/5 sao

Nội dung:
${message.trim()}

ID góp ý: ${contactId}
        `.trim(),

        priority: "normal",
      });

      // Email gửi thành công
      await db.query(
        `
        UPDATE contact_messages
        SET email_status = 'sent'
        WHERE id = ?
        `,
        [contactId],
      );

      console.log(`✅ Feedback email sent #${contactId}`);
    } catch (emailError) {
      console.error(
        `⚠️ Feedback email failed #${contactId}:`,
        emailError?.message || emailError,
      );

      // DB vẫn giữ góp ý
      await db.query(
        `
        UPDATE contact_messages
        SET email_status = 'failed'
        WHERE id = ?
        `,
        [contactId],
      );
    }

    return res.status(201).json({
      success: true,
      message: "Cảm ơn bạn! Góp ý đã được gửi.",
      id: contactId,
    });
  } catch (error) {
    console.error("❌ CREATE CONTACT MESSAGE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể gửi góp ý",
    });
  }
};
exports.checkFeedback = async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Thiếu email",
      });
    }

    const [rows] = await db.query(
      `
      SELECT id
      FROM contact_messages
      WHERE LOWER(email) = ?
      LIMIT 1
      `,
      [email],
    );

    return res.json({
      success: true,
      hasFeedback: rows.length > 0,
    });
  } catch (error) {
    console.error("❌ CHECK FEEDBACK ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể kiểm tra trạng thái góp ý",
    });
  }
};

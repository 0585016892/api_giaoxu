const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();
const pool = require("../config/db");

// =====================================================
// GET /api/contact
// Lấy danh sách liên hệ
// =====================================================
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit) || 10, 1), 100);

    const offset = (pageNumber - 1) * limitNumber;

    let where = [];
    let params = [];

    // =========================
    // LỌC TRẠNG THÁI
    // =========================
    if (status) {
      where.push("status = ?");
      params.push(status);
    }

    // =========================
    // TÌM KIẾM
    // =========================
    if (search && search.trim()) {
      where.push(`
        (
          name LIKE ?
          OR email LIKE ?
          OR subject LIKE ?
          OR message LIKE ?
        )
      `);

      const keyword = `%${search.trim()}%`;

      params.push(keyword, keyword, keyword, keyword);
    }

    const whereSQL = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // =========================
    // ĐẾM TỔNG
    // =========================
    const [countRows] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM contact_messages
      ${whereSQL}
      `,
      params,
    );

    const total = countRows[0].total;

    // =========================
    // LẤY DANH SÁCH
    // =========================
    const [rows] = await pool.execute(
      `
      SELECT
        id,
        name,
        email,
        subject,
        message,
        status,
        email_status,
        email_error,
        created_at,
        updated_at
      FROM contact_messages
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ${limitNumber}
      OFFSET ${offset}
      `,
      params,
    );

    return res.json({
      success: true,
      data: rows,

      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("GET CONTACT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách liên hệ",
      error: error.message,
    });
  }
});

// =====================================================
// GET /api/contact/:id
// Xem chi tiết
//
// Nếu status = new
// => tự động chuyển thành read
// =====================================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `
      SELECT
        id,
        name,
        email,
        subject,
        message,
        status,
        email_status,
        email_error,
        created_at,
        updated_at
      FROM contact_messages
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy liên hệ",
      });
    }

    const contact = rows[0];

    // =========================
    // NEW -> READ
    // =========================
    if (contact.status === "new") {
      await pool.execute(
        `
        UPDATE contact_messages
        SET status = 'read'
        WHERE id = ?
        `,
        [id],
      );

      contact.status = "read";
    }

    return res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    console.error("GET CONTACT DETAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin liên hệ",
      error: error.message,
    });
  }
});

// =====================================================
// POST /api/contact
// Gửi liên hệ
//
// 1. Validate
// 2. Lưu DB
// 3. Gửi email
// 4. Update email_status
// =====================================================
router.post("/", async (req, res) => {
  console.log("CALL API EMAIL");

  // QUAN TRỌNG:
  // Khai báo bên ngoài try để catch có thể dùng
  let contactId = null;

  try {
    const { name, email, subject, message } = req.body;

    // =========================
    // 1. VALIDATE
    // =========================
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ họ tên, email và nội dung",
      });
    }

    // =========================
    // 2. LƯU DATABASE
    // =========================
    const [result] = await pool.execute(
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
      [name.trim(), email.trim(), subject?.trim() || null, message.trim()],
    );

    contactId = result.insertId;

    console.log("✅ Đã lưu liên hệ:", contactId);

    // =========================
    // 3. TẠO SMTP
    // =========================
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,

      auth: {
        user: process.env.EMAIL_USER,

        pass: process.env.EMAIL_PASS,
      },

      tls: {
        rejectUnauthorized: false,
      },

      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
    });

    console.log("EMAIL_USER =", process.env.EMAIL_USER);

    console.log("EMAIL_PASS =", process.env.EMAIL_PASS ? "CO" : "KHONG");

    // =========================
    // 4. TEST SMTP
    // =========================
    await transporter.verify();

    console.log("✅ SMTP Gmail kết nối thành công");

    // =========================
    // 5. GỬI EMAIL
    // =========================
    await transporter.sendMail({
      from: `"${name}" <${process.env.EMAIL_USER}>`,

      to: "giaoxudongquan@gmail.com",

      replyTo: email,

      subject: `[Website Giáo Xứ] ${subject || "Thư liên hệ mới"} - từ ${name}`,

      html: `
<!DOCTYPE html>

<html>

<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
</head>

<body
  style="
    margin:0;
    padding:0;
    background-color:#f4f6f8;
    font-family:
      'Segoe UI',
      Tahoma,
      Geneva,
      Verdana,
      sans-serif;
    color:#333333;
  "
>

<table
  border="0"
  cellpadding="0"
  cellspacing="0"
  width="100%"
>

<tr>

<td
  align="center"
  style="padding:30px 15px;"
>

<table
  border="0"
  cellpadding="0"
  cellspacing="0"
  width="100%"
  style="
    max-width:600px;
    background:#ffffff;
    border-radius:8px;
    overflow:hidden;
    border:1px solid #e2e8f0;
  "
>

<!-- HEADER -->

<tr>

<td
  align="center"
  style="
    background-color:#1a365d;
    padding:35px 20px;
    color:#ffffff;
  "
>

<div
  style="
    font-size:28px;
    color:#d69e2e;
    margin-bottom:8px;
    font-weight:bold;
  "
>
  ┼
</div>

<h1
  style="
    margin:0;
    font-size:22px;
    font-weight:600;
    color:#f7fafc;
  "
>
  GIÁO XỨ ĐỒNG QUAN
</h1>

<p
  style="
    margin:5px 0 0;
    font-size:13px;
    color:#cbd5e0;
    font-style:italic;
  "
>
  Thông tin liên hệ từ Website
</p>

</td>

</tr>

<!-- GOLD LINE -->

<tr>

<td
  style="
    height:4px;
    background-color:#d69e2e;
  "
></td>

</tr>

<!-- CONTENT -->

<tr>

<td style="padding:30px 25px;">

<p>
  Kính gửi Ban Hành Giáo /
  Ban Quản Trị,
</p>

<p>
  Hệ thống vừa nhận được một
  thông điệp liên hệ mới từ website.
</p>


<!-- INFO -->

<table
  border="0"
  cellpadding="0"
  cellspacing="0"
  width="100%"
  style="
    background-color:#f8fafc;
    border:1px solid #edf2f7;
  "
>

<tr>

<td
  style="
    padding:12px 15px;
    font-weight:bold;
    width:30%;
  "
>
  👤 Họ và tên:
</td>

<td style="padding:12px 15px;">
  ${name}
</td>

</tr>


<tr>

<td
  style="
    padding:12px 15px;
    font-weight:bold;
  "
>
  ✉️ Email:
</td>

<td style="padding:12px 15px;">

<a
  href="mailto:${email}"
>
  ${email}
</a>

</td>

</tr>


<tr>

<td
  style="
    padding:12px 15px;
    font-weight:bold;
  "
>
  📌 Chủ đề:
</td>

<td style="padding:12px 15px;">

${subject || "Không có chủ đề"}

</td>

</tr>

</table>


<!-- MESSAGE -->

<div
  style="
    margin-top:25px;
    font-weight:bold;
  "
>
  📝 Nội dung lời nhắn:
</div>

<div
  style="
    margin-top:10px;
    padding:18px;
    background:#ffffff;
    border-left:4px solid #d69e2e;
    border-top:1px solid #edf2f7;
    border-right:1px solid #edf2f7;
    border-bottom:1px solid #edf2f7;
    line-height:1.6;
    white-space:pre-line;
  "
>
  ${message}
</div>


<!-- REPLY -->

<div
  style="
    margin-top:30px;
    text-align:center;
  "
>

<a
  href="mailto:${email}?subject=Re:%20${encodeURIComponent(
    subject || "Liên hệ từ Giáo Xứ Đồng Quan",
  )}"
  style="
    background:#1a365d;
    color:#ffffff;
    padding:10px 20px;
    text-decoration:none;
    border-radius:5px;
    font-weight:bold;
  "
>
  Reply - Trả lời ngay
</a>

</div>

</td>

</tr>


<!-- FOOTER -->

<tr>

<td
  align="center"
  style="
    background:#f8fafc;
    padding:20px;
    border-top:1px solid #edf2f7;
    color:#718096;
    font-size:12px;
  "
>

<p>
  <i>
    "Đâu có hai hoặc ba người
    họp lại nhân danh Thầy,
    thì có Thầy ở đấy giữa họ."
    (Mt 18,20)
  </i>
</p>

<p>
  Email tự động từ Website
  Giáo Xứ Đồng Quan
</p>

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
      `,
    });

    // =========================
    // 6. EMAIL GỬI THÀNH CÔNG
    // =========================
    await pool.execute(
      `
      UPDATE contact_messages
      SET
        email_status = 'sent',
        email_error = NULL
      WHERE id = ?
      `,
      [contactId],
    );

    console.log("✅ Email đã gửi thành công");

    return res.status(200).json({
      success: true,
      message: "Đã gửi email thành công",
      id: contactId,
    });
  } catch (error) {
    console.error("❌ CONTACT ERROR:", error);

    // =========================
    // EMAIL LỖI
    // =========================
    if (contactId) {
      try {
        await pool.execute(
          `
          UPDATE contact_messages
          SET
            email_status = 'failed',
            email_error = ?
          WHERE id = ?
          `,
          [error.message, contactId],
        );
      } catch (dbError) {
        console.error("❌ UPDATE CONTACT ERROR:", dbError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Không thể gửi email",
      error: error.message,
    });
  }
});

// =====================================================
// PATCH /api/contact/:id/status
// Đổi trạng thái
// =====================================================
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    const { status } = req.body;

    const allowedStatus = ["new", "read", "replied", "archived"];

    // =========================
    // VALIDATE STATUS
    // =========================
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
        allowedStatus,
      });
    }

    // =========================
    // CHECK EXISTS
    // =========================
    const [existing] = await pool.execute(
      `
          SELECT id
          FROM contact_messages
          WHERE id = ?
          `,
      [id],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy liên hệ",
      });
    }

    // =========================
    // UPDATE
    // =========================
    await pool.execute(
      `
        UPDATE contact_messages
        SET status = ?
        WHERE id = ?
        `,
      [status, id],
    );

    return res.json({
      success: true,
      message: "Đã cập nhật trạng thái",
    });
  } catch (error) {
    console.error("UPDATE CONTACT STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái",
      error: error.message,
    });
  }
});

// =====================================================
// DELETE /api/contact/:id
// Xóa liên hệ
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `
          DELETE FROM contact_messages
          WHERE id = ?
          `,
      [id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy liên hệ",
      });
    }

    return res.json({
      success: true,
      message: "Đã xóa liên hệ",
    });
  } catch (error) {
    console.error("DELETE CONTACT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa liên hệ",
      error: error.message,
    });
  }
});
// =====================================================
// POST /api/contact/:id/reply
// Phản hồi email trực tiếp cho người liên hệ
// =====================================================
router.post("/:id/reply", async (req, res) => {
  const { id } = req.params;
  const { to, subject, message } = req.body;

  try {
    // =========================
    // 1. VALIDATE INPUT
    // =========================
    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng nhập đầy đủ email người nhận, tiêu đề và nội dung trả lời",
      });
    }

    // =========================
    // 2. CHECK LIÊN HỆ CÓ TỒN TẠI KHÔNG
    // =========================
    const [rows] = await pool.execute(
      `SELECT id, name FROM contact_messages WHERE id = ? LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy liên hệ cần trả lời",
      });
    }

    const contact = rows[0];

    // =========================
    // 3. KHỞI TẠO NODEMAILER TRANSPORTER
    // =========================
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
    });

    // =========================
    // 4. TEST KẾT NỐI SMTP
    // =========================
    await transporter.verify();

    // =========================
    // 5. GỬI EMAIL PHẢN HỒI
    // =========================
    await transporter.sendMail({
      from: `"Giáo Xứ Đồng Quan" <${process.env.EMAIL_USER}>`,
      to: to.trim(),
      subject: subject.trim(),
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#333333;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding:30px 15px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e2e8f0;">
          
          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#1a365d; padding:35px 20px; color:#ffffff;">
              <div style="font-size:28px; color:#d69e2e; margin-bottom:8px; font-weight:bold;">┼</div>
              <h1 style="margin:0; font-size:22px; font-weight:600; color:#f7fafc;">GIÁO XỨ ĐỒNG QUAN</h1>
              <p style="margin:5px 0 0; font-size:13px; color:#cbd5e0; font-style:italic;">Thư Phản Hồi Từ Ban Hành Giáo</p>
            </td>
          </tr>

          <!-- GOLD LINE -->
          <tr>
            <td style="height:4px; background-color:#d69e2e;"></td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding:30px 25px;">
              <p style="font-size:15px; font-weight:bold;">Thân gửi ${contact.name || "quý giáo dân / độc giả"},</p>
              
              <p style="font-size:14px; line-height:1.6; color:#4a5568;">
                Ban Hành Giáo - Giáo Xứ Đồng Quan đã nhận được thông điệp liên hệ của ông/bà. Dưới đây là nội dung phản hồi chính thức:
              </p>

              <!-- MESSAGE BOX -->
              <div style="margin-top:20px; padding:20px; background:#f8fafc; border-left:4px solid #1a365d; border-radius:4px; line-height:1.7; font-size:14px; white-space:pre-line; color:#1a202c;">
                ${message}
              </div>

              <div style="margin-top:30px; font-size:13px; color:#718096; line-height:1.5;">
                <p style="margin:0;">Nếu cần thêm thông tin hỗ trợ, quý vị vui lòng phản hồi trực tiếp qua email này.</p>
                <p style="margin:5px 0 0 0; font-weight:600;">Trân trọng,<br/>Ban Hành Giáo Giáo Xứ Đồng Quan</p>
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="background:#f8fafc; padding:20px; border-top:1px solid #edf2f7; color:#718096; font-size:12px;">
              <p style="margin:0; font-style:italic;">
                "Chúa là Nguồn Sáng và là Ơn Cứu Độ của tôi." (Thánh Vịnh 27)
              </p>
              <p style="margin:5px 0 0 0;">
                Email tự động được gửi từ Hệ Thống Quản Lý Giáo Xứ Đồng Quan
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    // =========================
    // 6. CẬP NHẬT TRẠNG THÁI DB (replied & sent)
    // =========================
    await pool.execute(
      `
      UPDATE contact_messages
      SET
        status = 'replied',
        email_status = 'sent',
        email_error = NULL,
        updated_at = NOW()
      WHERE id = ?
      `,
      [id],
    );

    console.log(`✅ Đã gửi phản hồi thành công cho contact ID: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Đã gửi email phản hồi thành công",
    });
  } catch (error) {
    console.error("❌ REPLY CONTACT ERROR:", error);

    // Cập nhật trạng thái gửi lỗi vào DB nếu có lỗi SMTP
    try {
      await pool.execute(
        `
        UPDATE contact_messages
        SET
          email_status = 'failed',
          email_error = ?
        WHERE id = ?
        `,
        [error.message, id],
      );
    } catch (dbError) {
      console.error("❌ UPDATE ERROR STATUS FAILED:", dbError);
    }

    return res.status(500).json({
      success: false,
      message: "Không thể gửi email phản hồi",
      error: error.message,
    });
  }
});
module.exports = router;

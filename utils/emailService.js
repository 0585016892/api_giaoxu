// utils/emailService.js

const nodemailer = require("nodemailer");

// =========================================================
// SMTP TRANSPORTER
// =========================================================

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: 465,
  secure: true,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  tls: {
    rejectUnauthorized: false,
  },

  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
});
// =========================================================
// VERIFY SMTP
// =========================================================

const verifyEmailConnection = async () => {
  try {
    await transporter.verify();

    console.log("✅ SMTP EMAIL READY");
  } catch (error) {
    console.error("❌ SMTP VERIFY ERROR:", error?.message || error);
  }
};

// =========================================================
// ESCAPE HTML
// =========================================================

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// =========================================================
// PRIORITY
// =========================================================

const getPriorityConfig = (priority) => {
  switch (priority) {
    case "urgent":
      return {
        label: "KHẨN CẤP",
        color: "#dc2626",
      };

    case "high":
      return {
        label: "QUAN TRỌNG",
        color: "#ea580c",
      };

    case "low":
      return {
        label: "THÔNG TIN",
        color: "#16a34a",
      };

    default:
      return {
        label: "THÔNG BÁO",
        color: "#2563eb",
      };
  }
};

// =========================================================
// BUILD HTML
// =========================================================

const buildNotificationEmail = ({
  recipientName,
  title,
  content,
  priority,
}) => {
  const priorityConfig = getPriorityConfig(priority);

  const safeName = escapeHtml(recipientName || "Bạn");
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content || "").replace(/\n/g, "<br />");

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>${safeTitle}</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f8fafc;
    font-family:Arial,Helvetica,sans-serif;
    color:#334155;
  "
>

  <div
    style="
      width:100%;
      padding:40px 15px;
      box-sizing:border-box;
    "
  >

    <div
      style="
        max-width:620px;
        margin:0 auto;
        background:#ffffff;
        border-radius:18px;
        overflow:hidden;
        border:1px solid #e2e8f0;
        box-shadow:0 10px 30px rgba(15,23,42,0.08);
      "
    >

      <!-- HEADER -->

      <div
        style="
          padding:28px 30px;
          background:linear-gradient(
            135deg,
            #fff0f5 0%,
            #f6eeff 100%
          );
          border-bottom:1px solid #f1d5e1;
        "
      >

        <div
          style="
            font-size:12px;
            font-weight:700;
            letter-spacing:2px;
            color:#e85d87;
            margin-bottom:8px;
          "
        >
          FAITHEDU
        </div>

        <div
          style="
            font-size:26px;
            font-weight:800;
            color:#493f47;
          "
        >
          Thông báo mới
        </div>

      </div>

      <!-- CONTENT -->

      <div style="padding:30px;">

        <div
          style="
            font-size:15px;
            color:#64748b;
            margin-bottom:18px;
          "
        >
          Xin chào <strong>${safeName}</strong>,
        </div>

        <div
          style="
            display:inline-block;
            padding:6px 12px;
            border-radius:999px;
            background:${priorityConfig.color};
            color:#ffffff;
            font-size:11px;
            font-weight:700;
            margin-bottom:15px;
          "
        >
          ${priorityConfig.label}
        </div>

        <h1
          style="
            margin:5px 0 18px;
            font-size:24px;
            line-height:1.4;
            color:#1e293b;
          "
        >
          ${safeTitle}
        </h1>

        <div
          style="
            font-size:15px;
            line-height:1.8;
            color:#475569;
            background:#f8fafc;
            border-radius:12px;
            padding:20px;
          "
        >
          ${safeContent}
        </div>

        <div
          style="
            margin-top:28px;
            padding-top:20px;
            border-top:1px solid #e2e8f0;
            font-size:13px;
            line-height:1.7;
            color:#94a3b8;
          "
        >
          Đây là email thông báo tự động từ hệ thống FaithEdu.
          Vui lòng không trả lời email này.
        </div>

      </div>

      <!-- FOOTER -->

      <div
        style="
          padding:20px 30px;
          background:#fafafa;
          border-top:1px solid #f1f5f9;
          text-align:center;
          font-size:12px;
          color:#94a3b8;
        "
      >
        © ${new Date().getFullYear()} FaithEdu
      </div>

    </div>

  </div>

</body>
</html>
`;
};

// =========================================================
// SEND ONE EMAIL
// =========================================================

const sendNotificationEmail = async ({
  to,
  recipientName,
  title,
  content,
  priority = "normal",
}) => {
  if (!to) {
    throw new Error("Email người nhận không hợp lệ");
  }

  const mail = {
    from: {
      name: process.env.SMTP_FROM_NAME || "FaithEdu",
      address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    },

    to,

    subject: `[FaithEdu] ${title}`,

    text: [
      `Xin chào ${recipientName || "Bạn"},`,
      "",
      title,
      "",
      content || "",
      "",
      "Đây là email thông báo tự động từ FaithEdu.",
    ].join("\n"),

    html: buildNotificationEmail({
      recipientName,
      title,
      content,
      priority,
    }),
  };

  const result = await transporter.sendMail(mail);

  return {
    messageId: result.messageId,
    accepted: result.accepted || [],
    rejected: result.rejected || [],
  };
};

// =========================================================
// SEND MANY EMAILS
// =========================================================

const sendNotificationEmails = async ({
  recipients = [],
  title,
  content,
  priority = "normal",
}) => {
  const validRecipients = [];
  const invalidRecipients = [];

  for (const recipient of recipients) {
    const email = String(recipient?.email || "").trim();

    // Email không đúng format → bỏ qua
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalidRecipients.push({
        id: recipient?.id,
        email,
      });

      console.log(`⚠️ Bỏ qua email không hợp lệ: ${email}`);

      continue;
    }

    validRecipients.push({
      ...recipient,
      email,
    });
  }

  let success = 0;
  let failed = 0;

  const results = [];

  for (const recipient of validRecipients) {
    try {
      console.log(`📧 Đang gửi: ${recipient.email}`);

      await sendNotificationEmail({
        to: recipient.email,
        recipientName: recipient.full_name,
        title,
        content,
        priority,
      });

      success++;

      results.push({
        user_id: recipient.id,
        email: recipient.email,
        success: true,
      });

      console.log(`✅ Gửi thành công: ${recipient.email}`);
    } catch (error) {
      failed++;

      results.push({
        user_id: recipient.id,
        email: recipient.email,
        success: false,
        error: error?.message || "Unknown error",
      });

      // ❗ Lỗi email này chỉ bỏ qua
      // Không throw
      console.error(
        `⚠️ Bỏ qua email lỗi: ${recipient.email}`,
        error?.message || error,
      );
    }
  }

  return {
    total: recipients.length,
    valid: validRecipients.length,
    invalid: invalidRecipients.length,
    success,
    failed,
    results,
    invalidRecipients,
  };
};

module.exports = {
  transporter,
  verifyEmailConnection,
  sendNotificationEmail,
  sendNotificationEmails,
};

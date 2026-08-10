const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

router.post("/", async (req, res) => {
  console.log("CALL API EMAIL");

  try {
    const { name, email, subject, message } = req.body;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    console.log("EMAIL_USER =", process.env.EMAIL_USER);
    console.log("EMAIL_PASS =", process.env.EMAIL_PASS ? "CO" : "KHONG");
    await transporter.sendMail({
      from: `"${name}" <${process.env.EMAIL_USER}>`,
      to: "giaoxudongquan@gmail.com",
      replyTo: email, // Giúp bấm "Reply" là gửi trực tiếp cho người liên hệ
      subject: `[Website Giáo Xứ] ${subject || "Thư liên hệ mới"} - từ ${name}`,
      html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333333;">
      
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
        <tr>
          <td align="center" style="padding: 30px 15px;">
            
            <!-- Main Card -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
              
              <!-- Header -->
              <tr>
                <td align="center" style="background-color: #1a365d; background-image: linear-gradient(135deg, #1a365d 0%, #0f2942 100%); padding: 35px 20px; color: #ffffff;">
                  <!-- Icon Thánh Giá / Biểu tượng -->
                  <div style="font-size: 28px; color: #d69e2e; margin-bottom: 8px; font-weight: bold;">┼</div>
                  <h1 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 1px; color: #f7fafc; text-transform: uppercase;">
                    GIÁO XỨ ĐỒNG QUAN
                  </h1>
                  <p style="margin: 5px 0 0 0; font-size: 13px; color: #cbd5e0; font-style: italic;">
                    Thông tin liên hệ từ Website
                  </p>
                </td>
              </tr>

              <!-- Sub-header border -->
              <tr>
                <td style="height: 4px; background-color: #d69e2e;"></td>
              </tr>

              <!-- Content Body -->
              <tr>
                <td style="padding: 30px 25px;">
                  
                  <p style="margin-top: 0; font-size: 15px; color: #4a5568;">
                    Kính gửi Ban Hành Giáo / Ban Quản Trị,
                  </p>
                  <p style="font-size: 14px; color: #4a5568; margin-bottom: 25px;">
                    Hệ thống vừa nhận được một thông điệp liên hệ mới từ độc giả với chi tiết sau:
                  </p>

                  <!-- Info Table -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 6px; border: 1px solid #edf2f7; margin-bottom: 25px;">
                    <tr>
                      <td style="padding: 12px 15px; border-bottom: 1px solid #edf2f7; width: 30%; font-weight: bold; color: #2d3748; font-size: 14px;">
                        👤 Họ và tên:
                      </td>
                      <td style="padding: 12px 15px; border-bottom: 1px solid #edf2f7; color: #1a202c; font-size: 14px;">
                        ${name}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 15px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #2d3748; font-size: 14px;">
                        ✉️ Email:
                      </td>
                      <td style="padding: 12px 15px; border-bottom: 1px solid #edf2f7; color: #2b6cb0; font-size: 14px;">
                        <a href="mailto:${email}" style="color: #2b6cb0; text-decoration: none;">${email}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 15px; font-weight: bold; color: #2d3748; font-size: 14px;">
                        📌 Chủ đề:
                      </td>
                      <td style="padding: 12px 15px; color: #1a202c; font-size: 14px; font-weight: 600;">
                        ${subject || "Không có chủ đề"}
                      </td>
                    </tr>
                  </table>

                  <!-- Message Content -->
                  <div style="margin-bottom: 10px; font-weight: bold; color: #2d3748; font-size: 14px;">
                    📝 Nội dung lời nhắn:
                  </div>
                  <div style="padding: 18px; background-color: #ffffff; border-left: 4px solid #d69e2e; border-top: 1px solid #edf2f7; border-right: 1px solid #edf2f7; border-bottom: 1px solid #edf2f7; border-radius: 0 6px 6px 0; color: #2d3748; font-size: 14px; line-height: 1.6; white-space: pre-line;">
                    ${message}
                  </div>

                  <!-- Quick Reply Button -->
                  <div style="margin-top: 30px; text-align: center;">
                    <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject || "Liên hệ từ Giáo Xứ Đồng Quan")}" 
                       style="background-color: #1a365d; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-size: 13px; font-weight: bold; display: inline-block;">
                      Reply Trả lời ngay
                    </a>
                  </div>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="background-color: #f8fafc; padding: 20px; border-top: 1px solid #edf2f7; color: #718096; font-size: 12px;">
                  <p style="margin: 0 0 5px 0;"><i>"Đâu có hai hoặc ba người họp lại nhân danh Thầy, thì có Thầy ở đấy giữa họ." (Mt 18,20)</i></p>
                  <p style="margin: 0; color: #a0aec0;">Email tự động từ Website Giáo Xứ Đồng Quan</p>
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

    return res.status(200).json({
      success: true,
      message: "Đã gửi email thành công",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Không thể gửi email",
      error: error.message,
    });
  }
});
module.exports = router;

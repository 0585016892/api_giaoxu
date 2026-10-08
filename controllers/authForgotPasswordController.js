const db = require("../config/db");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const emailService = require("../utils/emailService");

const { writeLog } = require("../utils/activityLogger");

// ============================================================
// CONFIG
// ============================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_EXPIRES_MINUTES = 5;
const OTP_EXPIRES_SECONDS = OTP_EXPIRES_MINUTES * 60;

const MAX_OTP_ATTEMPTS = 5;

const BCRYPT_PASSWORD_ROUNDS = 12;
const BCRYPT_OTP_ROUNDS = 10;

const MIN_PASSWORD_LENGTH = 6;

// ============================================================
// HELPERS
// ============================================================

const normalizeString = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

const normalizeEmail = (value) => {
  return normalizeString(value).toLowerCase();
};

const generateOtp = () => {
  return String(crypto.randomInt(100000, 1000000));
};

// ============================================================
// JWT
// ============================================================

const createJwtToken = ({
  id,
  email,
  full_name,
  username,
  avatar = null,
  role,
  church_id = null,
  account_type = "member",
  catechist_id = null,
  teacher_id = null,
  parent_id = null,
}) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET_NOT_CONFIGURED");
  }

  return jwt.sign(
    {
      id: Number(id),

      email: email || null,

      full_name: full_name || username || null,

      username: username || null,

      avatar: avatar || null,

      role: role || null,

      church_id: church_id ? Number(church_id) : null,

      account_type: account_type || "member",

      catechist_id: catechist_id ? Number(catechist_id) : null,

      teacher_id: teacher_id ? Number(teacher_id) : null,

      parent_id: parent_id ? Number(parent_id) : null,
    },

    process.env.JWT_SECRET,

    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    },
  );
};

// ============================================================
// SAFE ERROR
// ============================================================

const logDbError = (prefix, error) => {
  console.error(prefix);
  console.error("Message:", error?.message);
  console.error("Code:", error?.code);
  console.error("Errno:", error?.errno);
  console.error("SQL Message:", error?.sqlMessage);
  console.error("SQL State:", error?.sqlState);
};

// ============================================================
// 1. REQUEST
// ============================================================
//
// POST /auth/forgot-password/request
//
// Body:
// {
//   "email": "email-cu@example.com"
// }
//
// ============================================================

exports.request = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("                 FORGOT PASSWORD REQUEST");
  console.log("============================================================");

  let connection = null;

  try {
    const email = normalizeEmail(req.body?.email);

    console.log("EMAIL:", email);

    // ========================================================
    // VALIDATE
    // ========================================================

    if (!email) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_REQUIRED",
        message: "Vui lòng nhập email đăng ký.",
      });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_EMAIL",
        message: "Email không hợp lệ.",
      });
    }

    // ========================================================
    // FIND ACCOUNT
    // ========================================================

    const [rows] = await db.query(
      `
        SELECT
          a.id,
          a.email,
          a.username,
          a.full_name,
          a.phone,
          a.avatar,
          a.role,
          a.account_type,
          a.church_id,

          c.id AS catechist_id,
          c.catechist_code,
          c.full_name AS catechist_full_name

        FROM admins a

        LEFT JOIN catechists c
          ON c.catechist_code = a.username
          AND c.church_id = a.church_id

        WHERE LOWER(a.email) = ?

        LIMIT 1
      `,
      [email],
    );

    // ========================================================
    // ACCOUNT NOT FOUND
    // ========================================================

    if (rows.length === 0) {
      console.log("[FORGOT PASSWORD] ACCOUNT NOT FOUND");

      return res.status(404).json({
        success: false,
        code: "ACCOUNT_NOT_FOUND",
        message: "Không tìm thấy tài khoản sử dụng email này.",
      });
    }

    const admin = rows[0];

    // ========================================================
    // CHECK ACTIVE
    // ========================================================

    if (
      admin.is_active === 0 ||
      admin.is_active === false ||
      admin.is_active === "0"
    ) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DISABLED",
        message: "Tài khoản đã bị khóa.",
      });
    }

    // ========================================================
    // NEW EMAIL FORM
    // ========================================================

    console.log("[FORGOT PASSWORD] ACCOUNT FOUND:", admin.id);

    return res.status(200).json({
      success: true,
      code: "ACCOUNT_FOUND",
      message:
        "Tìm thấy tài khoản. Vui lòng nhập email mới để nhận mã xác thực.",

      data: {
        admin_id: Number(admin.id),

        old_email: email,

        masked_email:
          email.length > 5
            ? `${email.slice(0, 2)}***@${email.split("@")[1]}`
            : "***",

        full_name: admin.full_name || admin.username || null,

        requires_new_email: true,
      },
    });
  } catch (error) {
    console.error("[FORGOT PASSWORD REQUEST ERROR]");

    logDbError("FORGOT PASSWORD REQUEST:", error);

    return res.status(500).json({
      success: false,
      code: "FORGOT_PASSWORD_REQUEST_ERROR",
      message: "Không thể xử lý yêu cầu. Vui lòng thử lại sau.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ============================================================
// 2. SEND OTP TO NEW EMAIL
// ============================================================
//
// POST /auth/forgot-password/send-otp
//
// Body:
// {
//   "old_email": "email-cu@example.com",
//   "new_email": "email-moi@gmail.com"
// }
//
// ============================================================

exports.sendOtp = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("             FORGOT PASSWORD SEND OTP");
  console.log("============================================================");

  let connection = null;

  const oldEmail = normalizeEmail(req.body?.old_email);

  const newEmail = normalizeEmail(req.body?.new_email);

  try {
    // ========================================================
    // VALIDATE
    // ========================================================

    if (!oldEmail || !newEmail) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_REQUIRED",
        message: "Vui lòng nhập email cũ và email mới.",
      });
    }

    if (!EMAIL_REGEX.test(oldEmail) || !EMAIL_REGEX.test(newEmail)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_EMAIL",
        message: "Email không hợp lệ.",
      });
    }

    if (oldEmail === newEmail) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_SAME",
        message: "Email mới phải khác email hiện tại.",
      });
    }

    // ========================================================
    // CONNECTION
    // ========================================================

    connection = await db.getConnection();

    // ========================================================
    // FIND OLD ACCOUNT
    // ========================================================

    const [adminRows] = await connection.query(
      `
          SELECT
            a.id,
            a.email,
            a.username,
            a.full_name,
            a.phone,
            a.avatar,
            a.role,
            a.account_type,
            a.church_id,

            c.id AS catechist_id,
            c.catechist_code,
            c.full_name AS catechist_full_name

          FROM admins a

          LEFT JOIN catechists c
            ON c.catechist_code = a.username
            AND c.church_id = a.church_id

          WHERE LOWER(a.email) = ?

          LIMIT 1
        `,
      [oldEmail],
    );

    if (adminRows.length === 0) {
      return res.status(404).json({
        success: false,
        code: "ACCOUNT_NOT_FOUND",
        message: "Không tìm thấy tài khoản.",
      });
    }

    const admin = adminRows[0];

    // ========================================================
    // CHECK NEW EMAIL
    // ========================================================

    const [existingEmail] = await connection.query(
      `
          SELECT
            id,
            email
          FROM admins
          WHERE LOWER(email) = ?
          LIMIT 1
        `,
      [newEmail],
    );

    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        code: "NEW_EMAIL_ALREADY_EXISTS",
        message: "Email mới đã được sử dụng bởi một tài khoản khác.",
      });
    }

    // ========================================================
    // CHECK CATECHIST EMAIL
    // ========================================================

    const [existingCatechistEmail] = await connection.query(
      `
          SELECT
            id
          FROM catechists
          WHERE LOWER(email) = ?

          LIMIT 1
        `,
      [newEmail],
    );

    if (existingCatechistEmail.length > 0) {
      return res.status(409).json({
        success: false,
        code: "NEW_EMAIL_ALREADY_EXISTS",
        message: "Email mới đã được sử dụng bởi một tài khoản khác.",
      });
    }

    // ========================================================
    // GENERATE OTP
    // ========================================================

    const otp = generateOtp();

    const otpHash = await bcrypt.hash(otp, BCRYPT_OTP_ROUNDS);

    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    // ========================================================
    // DELETE OLD RESET REQUEST
    // ========================================================

    await connection.query(
      `
        DELETE FROM password_reset_requests
        WHERE admin_id = ?
      `,
      [admin.id],
    );

    // ========================================================
    // INSERT RESET REQUEST
    // ========================================================

    await connection.query(
      `
        INSERT INTO password_reset_requests
        (
          admin_id,
          old_email,
          new_email,
          otp_hash,
          expires_at,
          attempts
        )
        VALUES (?, ?, ?, ?, ?, 0)
      `,
      [admin.id, oldEmail, newEmail, otpHash, expiresAt],
    );

    console.log("[FORGOT PASSWORD] RESET REQUEST CREATED:", admin.id);

    // ========================================================
    // SEND EMAIL
    // ========================================================

    try {
      if (typeof emailService.sendForgotPasswordOtpEmail !== "function") {
        throw new Error(
          "sendForgotPasswordOtpEmail is not exported from emailService",
        );
      }

      await emailService.sendForgotPasswordOtpEmail({
        to: newEmail,
        fullName: admin.full_name || admin.username || "Bạn",
        otp,
        expiresMinutes: OTP_EXPIRES_MINUTES,
      });
    } catch (emailError) {
      console.error(
        "[FORGOT PASSWORD] EMAIL ERROR:",
        emailError?.message || emailError,
      );

      await connection.query(
        `
          DELETE FROM password_reset_requests
          WHERE admin_id = ?
        `,
        [admin.id],
      );

      return res.status(500).json({
        success: false,
        code: "OTP_EMAIL_SEND_FAILED",
        message: "Không thể gửi email xác thực. Vui lòng thử lại.",
      });
    }

    console.log("[FORGOT PASSWORD] OTP SENT TO NEW EMAIL");

    return res.status(200).json({
      success: true,
      code: "OTP_SENT",
      message: "Mã xác thực đã được gửi đến email mới.",

      data: {
        old_email: oldEmail,

        new_email: newEmail,

        masked_email: `${newEmail.slice(0, 2)}***@${newEmail.split("@")[1]}`,

        expires_in: OTP_EXPIRES_SECONDS,
      },
    });
  } catch (error) {
    console.error("[FORGOT PASSWORD SEND OTP ERROR]");

    logDbError("FORGOT PASSWORD SEND OTP:", error);

    return res.status(500).json({
      success: false,
      code: "FORGOT_PASSWORD_SEND_OTP_ERROR",
      message: "Không thể gửi mã xác thực.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ============================================================
// 3. VERIFY OTP
// ============================================================
//
// POST /auth/forgot-password/verify-otp
//
// Body:
// {
//   "old_email": "...",
//   "new_email": "...",
//   "otp": "123456"
// }
//
// ============================================================

exports.verifyOtp = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("             FORGOT PASSWORD VERIFY OTP");
  console.log("============================================================");

  let connection = null;
  let transactionStarted = false;

  try {
    const oldEmail = normalizeEmail(req.body?.old_email);

    const newEmail = normalizeEmail(req.body?.new_email);

    const otp = normalizeString(req.body?.otp);

    // ========================================================
    // VALIDATE
    // ========================================================

    if (!oldEmail || !newEmail || !otp) {
      return res.status(400).json({
        success: false,
        code: "MISSING_DATA",
        message: "Vui lòng nhập đầy đủ thông tin.",
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_OTP_FORMAT",
        message: "Mã xác thực phải gồm 6 chữ số.",
      });
    }

    // ========================================================
    // CONNECTION
    // ========================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // ========================================================
    // LOCK REQUEST
    // ========================================================

    const [rows] = await connection.query(
      `
          SELECT
            *
          FROM password_reset_requests

          WHERE old_email = ?
            AND new_email = ?

          ORDER BY id DESC

          LIMIT 1

          FOR UPDATE
        `,
      [oldEmail, newEmail],
    );

    if (rows.length === 0) {
      await connection.rollback();

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "RESET_REQUEST_NOT_FOUND",
        message: "Không tìm thấy yêu cầu khôi phục. Vui lòng thực hiện lại.",
      });
    }

    const request = rows[0];

    // ========================================================
    // ALREADY VERIFIED
    // ========================================================

    if (request.verified_at) {
      await connection.rollback();

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        code: "OTP_ALREADY_USED",
        message: "Mã xác thực này đã được sử dụng.",
      });
    }

    // ========================================================
    // ATTEMPTS
    // ========================================================

    if (Number(request.attempts) >= MAX_OTP_ATTEMPTS) {
      await connection.rollback();

      transactionStarted = false;

      return res.status(429).json({
        success: false,
        code: "OTP_TOO_MANY_ATTEMPTS",
        message: "Bạn đã nhập sai mã quá nhiều lần. Vui lòng yêu cầu mã mới.",
      });
    }

    // ========================================================
    // EXPIRED
    // ========================================================

    if (new Date() > new Date(request.expires_at)) {
      await connection.rollback();

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        code: "OTP_EXPIRED",
        message: "Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.",
      });
    }

    // ========================================================
    // COMPARE
    // ========================================================

    const isValid = await bcrypt.compare(otp, request.otp_hash);

    if (!isValid) {
      await connection.query(
        `
          UPDATE password_reset_requests
          SET attempts = attempts + 1
          WHERE id = ?
            AND verified_at IS NULL
        `,
        [request.id],
      );

      await connection.commit();

      transactionStarted = false;

      const attemptsUsed = Number(request.attempts) + 1;

      return res.status(400).json({
        success: false,
        code: "INVALID_OTP",
        message: "Mã xác thực không chính xác.",

        data: {
          attempts_remaining: Math.max(0, MAX_OTP_ATTEMPTS - attemptsUsed),
        },
      });
    }

    // ========================================================
    // OTP CORRECT
    // ========================================================

    await connection.query(
      `
        UPDATE password_reset_requests

        SET verified_at = NOW()

        WHERE id = ?
          AND verified_at IS NULL
      `,
      [request.id],
    );

    await connection.commit();

    transactionStarted = false;

    console.log("[FORGOT PASSWORD] OTP VERIFIED:", request.admin_id);

    return res.status(200).json({
      success: true,
      code: "OTP_VERIFIED",
      message: "Xác thực email thành công. Vui lòng nhập mật khẩu mới.",

      data: {
        reset_request_id: Number(request.id),

        new_email: request.new_email,

        password_reset_allowed: true,
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (_) {}

      transactionStarted = false;
    }

    console.error("[FORGOT PASSWORD VERIFY OTP ERROR]");

    logDbError("FORGOT PASSWORD VERIFY OTP:", error);

    return res.status(500).json({
      success: false,
      code: "VERIFY_OTP_ERROR",
      message: "Không thể xác thực mã. Vui lòng thử lại.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ============================================================
// 4. RESET PASSWORD + UPDATE EMAIL
// ============================================================
//
// POST /auth/forgot-password/reset
//
// Body:
// {
//   "reset_request_id": 123,
//   "new_password": "...",
//   "confirm_password": "..."
// }
//
// ============================================================

exports.resetPassword = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("          FORGOT PASSWORD RESET PASSWORD");
  console.log("============================================================");

  let connection = null;
  let transactionStarted = false;

  try {
    const resetRequestId = Number(req.body?.reset_request_id);

    const newPassword =
      typeof req.body?.new_password === "string" ? req.body.new_password : "";

    const confirmPassword =
      typeof req.body?.confirm_password === "string"
        ? req.body.confirm_password
        : "";

    // ========================================================
    // VALIDATE
    // ========================================================

    if (!resetRequestId || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        code: "MISSING_PASSWORD_DATA",
        message: "Vui lòng nhập đầy đủ thông tin mật khẩu.",
      });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        code: "PASSWORD_TOO_SHORT",
        message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        code: "PASSWORD_NOT_MATCH",
        message: "Mật khẩu xác nhận không khớp.",
      });
    }

    // ========================================================
    // CONNECTION
    // ========================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // ========================================================
    // LOCK RESET REQUEST
    // ========================================================

    const [resetRows] = await connection.query(
      `
          SELECT
            *
          FROM password_reset_requests

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [resetRequestId],
    );

    if (resetRows.length === 0) {
      throw new Error("RESET_REQUEST_NOT_FOUND");
    }

    const resetRequest = resetRows[0];

    // ========================================================
    // OTP MUST BE VERIFIED
    // ========================================================

    if (!resetRequest.verified_at) {
      throw new Error("OTP_NOT_VERIFIED");
    }

    // ========================================================
    // EXPIRED
    // ========================================================

    if (new Date() > new Date(resetRequest.expires_at)) {
      throw new Error("RESET_REQUEST_EXPIRED");
    }

    // ========================================================
    // ALREADY COMPLETED
    // ========================================================

    if (resetRequest.completed_at) {
      throw new Error("RESET_ALREADY_COMPLETED");
    }

    // ========================================================
    // FIND ADMIN
    // ========================================================

    const [adminRows] = await connection.query(
      `
          SELECT
            a.*,

            c.id AS catechist_id,
            c.catechist_code,
            c.full_name AS catechist_full_name

          FROM admins a

          LEFT JOIN catechists c
            ON c.catechist_code = a.username
            AND c.church_id = a.church_id

          WHERE a.id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [resetRequest.admin_id],
    );

    if (adminRows.length === 0) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    const admin = adminRows[0];

    // ========================================================
    // VERIFY OLD EMAIL
    // ========================================================

    if (
      normalizeEmail(admin.email) !== normalizeEmail(resetRequest.old_email)
    ) {
      throw new Error("OLD_EMAIL_CHANGED");
    }

    // ========================================================
    // CHECK NEW EMAIL AGAIN
    // ========================================================

    const [existingAdminEmail] = await connection.query(
      `
          SELECT
            id
          FROM admins

          WHERE LOWER(email) = ?
            AND id <> ?

          LIMIT 1

          FOR UPDATE
        `,
      [resetRequest.new_email, admin.id],
    );

    if (existingAdminEmail.length > 0) {
      throw new Error("NEW_EMAIL_ALREADY_EXISTS");
    }

    // ========================================================
    // CHECK CATECHIST EMAIL
    // ========================================================

    const [existingCatechistEmail] = await connection.query(
      `
          SELECT
            id
          FROM catechists

          WHERE LOWER(email) = ?

            AND NOT (
              catechist_code = ?
              AND church_id = ?
            )

          LIMIT 1

          FOR UPDATE
        `,
      [resetRequest.new_email, admin.username, admin.church_id],
    );

    if (existingCatechistEmail.length > 0) {
      throw new Error("NEW_EMAIL_ALREADY_EXISTS");
    }

    // ========================================================
    // HASH NEW PASSWORD
    // ========================================================

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_PASSWORD_ROUNDS);

    // ========================================================
    // UPDATE ADMINS
    // ========================================================

    const [adminUpdate] = await connection.query(
      `
          UPDATE admins

          SET
            password = ?,
            email = ?

          WHERE id = ?
        `,
      [passwordHash, resetRequest.new_email, admin.id],
    );

    if (adminUpdate.affectedRows !== 1) {
      throw new Error("ADMIN_UPDATE_FAILED");
    }

    // ========================================================
    // UPDATE CATECHIST
    // ========================================================

    let catechistUpdated = false;

    if (admin.catechist_id) {
      const [catechistUpdate] = await connection.query(
        `
          UPDATE catechists

          SET email = ?

          WHERE id = ?

            AND church_id = ?
        `,
        [resetRequest.new_email, admin.catechist_id, admin.church_id],
      );

      catechistUpdated = catechistUpdate.affectedRows > 0;
    }

    // ========================================================
    // COMPLETE RESET
    // ========================================================

    const [completeResult] = await connection.query(
      `
        UPDATE password_reset_requests

        SET
          new_password_hash = ?,
          completed_at = NOW()

        WHERE id = ?
          AND completed_at IS NULL
      `,
      [passwordHash, resetRequest.id],
    );

    if (completeResult.affectedRows !== 1) {
      throw new Error("RESET_COMPLETE_FAILED");
    }

    // ========================================================
    // COMMIT EVERYTHING
    // ========================================================

    await connection.commit();

    transactionStarted = false;

    console.log("");
    console.log("============================================================");
    console.log("             PASSWORD RESET SUCCESS");
    console.log("============================================================");
    console.log("Admin ID       :", admin.id);
    console.log("Old Email      :", resetRequest.old_email);
    console.log("New Email      :", resetRequest.new_email);
    console.log("Catechist ID   :", admin.catechist_id);
    console.log("Catechist Update:", catechistUpdated);
    console.log("============================================================");

    // ========================================================
    // LOG
    // ========================================================

    try {
      await writeLog({
        admin_id: admin.id,

        action: "FORGOT_PASSWORD",

        target_type: admin.role || "admin",

        target_id: admin.id,

        description:
          `${admin.full_name || admin.username} ` +
          `đã khôi phục mật khẩu và cập nhật email tài khoản`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error(
        "⚠️ WRITE FORGOT PASSWORD LOG ERROR:",
        logError?.message || logError,
      );
    }

    // ========================================================
    // CREATE NEW JWT
    // ========================================================

    const teacherId = admin.catechist_id ? Number(admin.catechist_id) : null;

    const token = createJwtToken({
      id: admin.id,

      email: resetRequest.new_email,

      full_name: admin.full_name || admin.username,

      username: admin.username,

      avatar: admin.avatar,

      role: admin.role,

      church_id: admin.church_id,

      account_type: admin.account_type || "member",

      catechist_id: teacherId,

      teacher_id: teacherId,

      parent_id: admin.role === "parent" ? Number(admin.id) : null,
    });

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      code: "PASSWORD_RESET_SUCCESS",

      message: "Đổi mật khẩu và cập nhật email thành công.",

      token,

      admin: {
        id: Number(admin.id),

        email: resetRequest.new_email,

        role: admin.role,

        church_id: admin.church_id ? Number(admin.church_id) : null,

        full_name: admin.full_name || admin.username,

        username: admin.username,

        account_type: admin.account_type || "member",

        avatar: admin.avatar || null,

        catechist_id: teacherId,

        catechist_code: admin.catechist_code || null,

        catechist_full_name: admin.catechist_full_name || null,

        teacher_id: teacherId,

        parent_id: admin.role === "parent" ? Number(admin.id) : null,

        last_login: new Date(),
      },

      login: {
        email: resetRequest.new_email,

        password: "MẬT KHẨU MỚI BẠN VỪA ĐẶT",
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (_) {}

      transactionStarted = false;
    }

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("          FORGOT PASSWORD RESET ERROR");
    console.error(
      "============================================================",
    );

    logDbError("FORGOT PASSWORD RESET:", error);

    console.error(
      "============================================================",
    );

    switch (error?.message) {
      case "RESET_REQUEST_NOT_FOUND":
        return res.status(404).json({
          success: false,
          code: "RESET_REQUEST_NOT_FOUND",
          message: "Không tìm thấy yêu cầu khôi phục.",
        });

      case "OTP_NOT_VERIFIED":
        return res.status(400).json({
          success: false,
          code: "OTP_NOT_VERIFIED",
          message: "Bạn chưa xác thực mã OTP.",
        });

      case "RESET_REQUEST_EXPIRED":
        return res.status(400).json({
          success: false,
          code: "RESET_REQUEST_EXPIRED",
          message: "Phiên khôi phục đã hết hạn. Vui lòng thực hiện lại.",
        });

      case "RESET_ALREADY_COMPLETED":
        return res.status(400).json({
          success: false,
          code: "RESET_ALREADY_COMPLETED",
          message: "Yêu cầu khôi phục này đã được sử dụng.",
        });

      case "ACCOUNT_NOT_FOUND":
        return res.status(404).json({
          success: false,
          code: "ACCOUNT_NOT_FOUND",
          message: "Không tìm thấy tài khoản.",
        });

      case "OLD_EMAIL_CHANGED":
        return res.status(409).json({
          success: false,
          code: "OLD_EMAIL_CHANGED",
          message: "Email tài khoản đã thay đổi. Vui lòng thực hiện lại.",
        });

      case "NEW_EMAIL_ALREADY_EXISTS":
        return res.status(409).json({
          success: false,
          code: "NEW_EMAIL_ALREADY_EXISTS",
          message: "Email mới đã được sử dụng bởi tài khoản khác.",
        });

      case "ADMIN_UPDATE_FAILED":
        return res.status(500).json({
          success: false,
          code: "ADMIN_UPDATE_FAILED",
          message: "Không thể cập nhật tài khoản.",
        });

      case "RESET_COMPLETE_FAILED":
        return res.status(500).json({
          success: false,
          code: "RESET_COMPLETE_FAILED",
          message: "Không thể hoàn tất khôi phục tài khoản.",
        });

      case "JWT_SECRET_NOT_CONFIGURED":
        return res.status(500).json({
          success: false,
          code: "JWT_SECRET_NOT_CONFIGURED",
          message: "Hệ thống chưa cấu hình JWT.",
        });

      default:
        break;
    }

    return res.status(500).json({
      success: false,
      code: "FORGOT_PASSWORD_RESET_ERROR",
      message: "Không thể khôi phục tài khoản. Vui lòng thử lại sau.",
      error:
        process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

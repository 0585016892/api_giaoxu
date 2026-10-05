const db = require("../config/db");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const emailService = require("../utils/emailService");

const { writeLog } = require("../utils/activityLogger");
const { generateCatechistCode } = require("../utils/generateCode");

// ============================================================
// CONFIG
// ============================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OTP_EXPIRES_MINUTES = 5;
const OTP_EXPIRES_SECONDS = OTP_EXPIRES_MINUTES * 60;

const PENDING_REGISTRATION_EXPIRES_MINUTES = 15;

const MAX_OTP_ATTEMPTS = 5;

const MAX_REGISTER_RETRY = 5;

const BCRYPT_PASSWORD_ROUNDS = 12;
const BCRYPT_OTP_ROUNDS = 10;

// ============================================================
// HELPERS
// ============================================================

const normalizeString = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

const normalizeNullableString = (value) => {
  const result = normalizeString(value);

  return result || null;
};

const normalizeEmail = (value) => {
  return normalizeString(value).toLowerCase();
};

// ============================================================
// SECURE OTP
// ============================================================

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
// SAFE ERROR LOG
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
// LOGIN
// ============================================================

exports.login = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("                         LOGIN REQUEST");
  console.log("============================================================");

  try {
    const { email, password } = req.body || {};

    // ========================================================
    // 1. VALIDATE
    // ========================================================

    const loginValue =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    const cleanPassword = typeof password === "string" ? password : "";

    if (!loginValue || !cleanPassword) {
      console.log("❌ LOGIN VALIDATION FAILED");

      return res.status(400).json({
        success: false,
        message: "Email / số điện thoại và password là bắt buộc",
      });
    }

    console.log("🔐 LOGIN VALUE:", loginValue);

    // ========================================================
    // 2. FIND ACCOUNT
    // ========================================================

    const [rows] = await db.query(
      `
        SELECT
          a.*,

          c.id AS catechist_id,
          c.catechist_code,
          c.id AS catechist_teacher_id,
          c.full_name AS catechist_full_name

        FROM admins a

        LEFT JOIN catechists c
          ON c.catechist_code = a.username
          AND c.church_id = a.church_id

        WHERE
          LOWER(a.email) = ?
          OR a.username = ?

        LIMIT 1
      `,
      [loginValue, loginValue],
    );

    // ========================================================
    // 3. ACCOUNT NOT FOUND
    // ========================================================

    if (rows.length === 0) {
      console.log("❌ ACCOUNT NOT FOUND");

      return res.status(401).json({
        success: false,
        message: "Sai email / số điện thoại hoặc mật khẩu",
      });
    }

    const admin = rows[0];

    // ========================================================
    // 4. DEBUG SAFE ACCOUNT INFO
    // ========================================================

    console.log("");
    console.log("------------------------------------------------------------");
    console.log("LOGIN USER");
    console.log("------------------------------------------------------------");
    console.log("Admin ID       :", admin.id);
    console.log("Email          :", admin.email);
    console.log("Username       :", admin.username);
    console.log("Role           :", admin.role);
    console.log("Church ID      :", admin.church_id);
    console.log("Account Type   :", admin.account_type);
    console.log("Active         :", admin.is_active);
    console.log("Catechist ID   :", admin.catechist_id);
    console.log("Catechist Code :", admin.catechist_code);
    console.log("Teacher ID     :", admin.catechist_teacher_id);
    console.log("------------------------------------------------------------");

    // ========================================================
    // 5. CHECK ACTIVE
    // ========================================================

    if (
      admin.is_active === 0 ||
      admin.is_active === false ||
      admin.is_active === "0"
    ) {
      console.log("❌ ACCOUNT DISABLED");

      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa",
      });
    }

    // ========================================================
    // 6. CHECK CHURCH
    // ========================================================

    if (admin.role === "parent" && !admin.church_id) {
      console.log("❌ PARENT WITHOUT CHURCH:", admin.id);

      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh chưa được gắn với giáo xứ",
      });
    }

    // ========================================================
    // 7. PASSWORD
    // ========================================================

    if (!admin.password) {
      console.log("❌ ACCOUNT HAS NO PASSWORD:", admin.id);

      return res.status(401).json({
        success: false,
        message: "Tài khoản chưa được thiết lập mật khẩu",
      });
    }

    const isMatch = await bcrypt.compare(cleanPassword, admin.password);

    if (!isMatch) {
      console.log("❌ WRONG PASSWORD");

      return res.status(401).json({
        success: false,
        message: "Sai email / số điện thoại hoặc mật khẩu",
      });
    }

    console.log("✅ PASSWORD CORRECT");

    // ========================================================
    // 8. TEACHER / CATECHIST
    // ========================================================

    const teacherId = admin.catechist_teacher_id
      ? Number(admin.catechist_teacher_id)
      : null;

    console.log("🎓 TEACHER ID:", teacherId);

    // ========================================================
    // 9. PARENT STUDENT COUNT
    // ========================================================

    let parentStudentCount = 0;

    if (admin.role === "parent") {
      const [parentRows] = await db.query(
        `
          SELECT COUNT(*) AS total

          FROM parent_students ps

          INNER JOIN students s
            ON s.id = ps.student_id

          WHERE
            ps.parent_id = ?
            AND ps.church_id = ?
            AND s.church_id = ?
        `,
        [admin.id, admin.church_id, admin.church_id],
      );

      parentStudentCount = Number(parentRows[0]?.total || 0);

      console.log("👨‍👩‍👧 PARENT STUDENT COUNT:", parentStudentCount);
    }

    // ========================================================
    // 10. UPDATE LAST LOGIN
    // ========================================================

    await db.query(
      `
        UPDATE admins
        SET last_login = NOW()
        WHERE id = ?
      `,
      [admin.id],
    );

    // ========================================================
    // 11. CREATE JWT
    // ========================================================

    const token = createJwtToken({
      id: admin.id,
      email: admin.email,
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

    console.log("✅ JWT CREATED");

    // ========================================================
    // 12. LOGIN LOG
    // ========================================================

    try {
      await writeLog({
        admin_id: admin.id,
        action: "LOGIN",
        target_type: admin.role,
        target_id: admin.id,
        description: `${admin.full_name || admin.username} đăng nhập hệ thống`,
        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ WRITE LOGIN LOG ERROR:", logError?.message || logError);
    }

    // ========================================================
    // 13. SUCCESS
    // ========================================================

    console.log("");
    console.log("============================================================");
    console.log("                     LOGIN SUCCESS");
    console.log("============================================================");
    console.log("Admin ID       :", admin.id);
    console.log("Username       :", admin.username);
    console.log("Email          :", admin.email);
    console.log("Role           :", admin.role);
    console.log("Church ID      :", admin.church_id);
    console.log("Catechist ID   :", teacherId);
    console.log("Parent Student :", parentStudentCount);
    console.log("============================================================");

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",

      token,

      admin: {
        id: Number(admin.id),
        email: admin.email || null,
        role: admin.role,

        church_id: admin.church_id ? Number(admin.church_id) : null,

        full_name: admin.full_name || admin.username || null,

        username: admin.username,

        account_type: admin.account_type || "member",

        avatar: admin.avatar || null,

        catechist_id: teacherId,

        catechist_code: admin.catechist_code || null,

        catechist_full_name: admin.catechist_full_name || null,

        teacher_id: teacherId,

        parent_id: admin.role === "parent" ? Number(admin.id) : null,

        parent_student_count: parentStudentCount,

        last_login: new Date(),
      },
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("                         LOGIN ERROR");
    console.error(
      "============================================================",
    );

    logDbError("LOGIN ERROR DETAILS:", error);

    console.error(
      "============================================================",
    );

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ============================================================
// REGISTER REQUEST
//
// POST /api/auth/register
//
// 1. Validate
// 2. Check email
// 3. Hash password
// 4. Save pending registration
// 5. Generate OTP
// 6. Hash OTP
// 7. Save OTP
// 8. Release DB
// 9. Send email
// ============================================================

exports.registerRequest = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("                  REGISTER REQUEST");
  console.log("============================================================");

  let connection = null;

  const cleanEmail = normalizeEmail(req.body?.email);

  try {
    const {
      email,
      password,
      full_name,
      phone,
      church_name,
      church_type,
      address,
      district,
      ward,
      pastor_name,
    } = req.body || {};

    // ========================================================
    // NORMALIZE
    // ========================================================

    const normalizedEmail = normalizeEmail(email);

    const cleanPassword = typeof password === "string" ? password : "";

    const cleanFullName = normalizeString(full_name);

    const cleanPhone = normalizeNullableString(phone);

    const cleanChurchName = normalizeString(church_name);

    const cleanChurchType = normalizeNullableString(church_type) || "GIAO_HO";

    const cleanAddress = normalizeNullableString(address);

    const cleanDistrict = normalizeNullableString(district);

    const cleanWard = normalizeNullableString(ward);

    const cleanPastorName = normalizeNullableString(pastor_name);

    // ========================================================
    // LOG SAFE DATA
    // ========================================================

    console.log("EMAIL:", normalizedEmail);
    console.log("FULL NAME:", cleanFullName);
    console.log("PHONE:", cleanPhone);
    console.log("CHURCH NAME:", cleanChurchName);

    // ========================================================
    // REQUIRED
    // ========================================================

    if (
      !normalizedEmail ||
      !cleanPassword ||
      !cleanFullName ||
      !cleanChurchName
    ) {
      return res.status(400).json({
        success: false,
        code: "MISSING_REQUIRED_FIELDS",
        message: "Vui lòng nhập email, mật khẩu, họ tên và tên giáo xứ",
      });
    }

    // ========================================================
    // EMAIL
    // ========================================================

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_EMAIL",
        message: "Email không hợp lệ",
      });
    }

    // ========================================================
    // PASSWORD
    // ========================================================

    if (cleanPassword.length < 6) {
      return res.status(400).json({
        success: false,
        code: "PASSWORD_TOO_SHORT",
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }

    // ========================================================
    // DB CONNECTION
    // ========================================================

    connection = await db.getConnection();

    // ========================================================
    // CHECK EXISTING EMAIL
    // ========================================================

    const [existingAdmins] = await connection.query(
      `
          SELECT
            id,
            username,
            email,
            church_id,
            role

          FROM admins

          WHERE LOWER(email) = ?

          LIMIT 1
        `,
      [normalizedEmail],
    );

    if (existingAdmins.length > 0) {
      console.warn(`[REGISTER] EMAIL ALREADY EXISTS: ${normalizedEmail}`);

      return res.status(409).json({
        success: false,
        code: "EMAIL_ALREADY_EXISTS",
        message:
          "Email này đã được sử dụng. Vui lòng đăng nhập hoặc sử dụng email khác.",
      });
    }

    // ========================================================
    // HASH PASSWORD
    // ========================================================

    const passwordHash = await bcrypt.hash(
      cleanPassword,
      BCRYPT_PASSWORD_ROUNDS,
    );

    // ========================================================
    // GENERATE OTP
    // ========================================================

    const otp = generateOtp();

    // KHÔNG BAO GIỜ LOG OTP

    const otpHash = await bcrypt.hash(otp, BCRYPT_OTP_ROUNDS);

    // ========================================================
    // EXPIRES
    // ========================================================

    const registrationExpiresAt = new Date(
      Date.now() + PENDING_REGISTRATION_EXPIRES_MINUTES * 60 * 1000,
    );

    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    // ========================================================
    // BEGIN TRANSACTION
    // ========================================================

    await connection.beginTransaction();

    try {
      // ======================================================
      // SAVE / UPDATE PENDING REGISTRATION
      // ======================================================

      await connection.query(
        `
          INSERT INTO pending_registrations
          (
            email,
            password_hash,
            full_name,
            phone,
            church_name,
            church_type,
            address,
            district,
            ward,
            pastor_name,
            expires_at
          )

          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

          ON DUPLICATE KEY UPDATE
            password_hash = VALUES(password_hash),
            full_name = VALUES(full_name),
            phone = VALUES(phone),
            church_name = VALUES(church_name),
            church_type = VALUES(church_type),
            address = VALUES(address),
            district = VALUES(district),
            ward = VALUES(ward),
            pastor_name = VALUES(pastor_name),
            expires_at = VALUES(expires_at),
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          normalizedEmail,
          passwordHash,
          cleanFullName,
          cleanPhone,
          cleanChurchName,
          cleanChurchType,
          cleanAddress,
          cleanDistrict,
          cleanWard,
          cleanPastorName,
          registrationExpiresAt,
        ],
      );

      // ======================================================
      // DELETE OLD REGISTER OTP
      // ======================================================

      await connection.query(
        `
          DELETE FROM email_verifications

          WHERE email = ?
            AND purpose = 'register'
        `,
        [normalizedEmail],
      );

      // ======================================================
      // INSERT NEW OTP
      // ======================================================

      await connection.query(
        `
          INSERT INTO email_verifications
          (
            email,
            otp_hash,
            purpose,
            expires_at,
            attempts
          )

          VALUES (?, ?, 'register', ?, 0)
        `,
        [normalizedEmail, otpHash, otpExpiresAt],
      );

      // ======================================================
      // COMMIT DB
      // ======================================================

      await connection.commit();

      console.log("[REGISTER] PENDING + OTP SAVED:", normalizedEmail);
    } catch (dbError) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "⚠️ REGISTER REQUEST ROLLBACK ERROR:",
          rollbackError?.message || rollbackError,
        );
      }

      throw dbError;
    }

    // ========================================================
    // RELEASE CONNECTION BEFORE SMTP
    // ========================================================

    connection.release();
    connection = null;

    // ========================================================
    // SEND EMAIL
    // ========================================================

    try {
      if (typeof emailService.sendRegisterOtpEmail !== "function") {
        throw new Error(
          "sendRegisterOtpEmail is not exported from emailService",
        );
      }

      await emailService.sendRegisterOtpEmail({
        to: normalizedEmail,
        fullName: cleanFullName,
        otp,
        expiresMinutes: OTP_EXPIRES_MINUTES,
      });

      console.log("[REGISTER] OTP EMAIL SENT:", normalizedEmail);
    } catch (emailError) {
      console.error(
        "[REGISTER] SEND OTP EMAIL ERROR:",
        emailError?.message || emailError,
      );

      // ======================================================
      // CLEANUP AFTER EMAIL FAILURE
      // ======================================================

      let cleanupConnection = null;

      try {
        cleanupConnection = await db.getConnection();

        await cleanupConnection.beginTransaction();

        await cleanupConnection.query(
          `
            DELETE FROM email_verifications

            WHERE email = ?
              AND purpose = 'register'
          `,
          [normalizedEmail],
        );

        await cleanupConnection.query(
          `
            DELETE FROM pending_registrations

            WHERE email = ?
          `,
          [normalizedEmail],
        );

        await cleanupConnection.commit();
      } catch (cleanupError) {
        try {
          if (cleanupConnection) {
            await cleanupConnection.rollback();
          }
        } catch (_) {}

        console.error(
          "⚠️ REGISTER CLEANUP ERROR:",
          cleanupError?.message || cleanupError,
        );
      } finally {
        if (cleanupConnection) {
          cleanupConnection.release();
        }
      }

      return res.status(500).json({
        success: false,
        code: "OTP_EMAIL_SEND_FAILED",
        message: "Không thể gửi email xác thực. Vui lòng thử lại sau.",
      });
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("[REGISTER] OTP SENT SUCCESSFULLY:", normalizedEmail);

    return res.status(200).json({
      success: true,
      code: "OTP_SENT",
      message: "Mã xác thực đã được gửi đến email của bạn",

      data: {
        email: normalizedEmail,
        expires_in: OTP_EXPIRES_SECONDS,
      },
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("                 REGISTER REQUEST ERROR");
    console.error(
      "============================================================",
    );

    logDbError("REGISTER REQUEST DETAILS:", error);

    console.error(
      "============================================================",
    );

    return res.status(500).json({
      success: false,
      code: "REGISTER_REQUEST_ERROR",
      message: "Không thể xử lý đăng ký. Vui lòng thử lại sau.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ============================================================
// REGISTER VERIFY
//
// POST /api/auth/register/verify
//
// 1. Validate
// 2. Lock OTP
// 3. Compare OTP
// 4. Lock pending registration
// 5. Check email
// 6. Generate username
// 7. Create church
// 8. Create admin
// 9. Mark OTP verified
// 10. Delete pending
// 11. Commit
// 12. Write log
// 13. JWT
// ============================================================

exports.registerVerify = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("                  REGISTER VERIFY");
  console.log("============================================================");

  let connection = null;
  let transactionStarted = false;

  try {
    const { email, otp } = req.body || {};

    // ========================================================
    // NORMALIZE
    // ========================================================

    const cleanEmail = normalizeEmail(email);

    const cleanOtp = normalizeString(otp);

    console.log("EMAIL:", cleanEmail);
    console.log("OTP RECEIVED:", cleanOtp ? "YES" : "NO");

    // KHÔNG LOG OTP THẬT

    // ========================================================
    // VALIDATE
    // ========================================================

    if (!cleanEmail || !cleanOtp) {
      return res.status(400).json({
        success: false,
        code: "MISSING_VERIFICATION_DATA",
        message: "Vui lòng nhập email và mã xác thực",
      });
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_EMAIL",
        message: "Email không hợp lệ",
      });
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_OTP_FORMAT",
        message: "Mã xác thực phải gồm 6 chữ số",
      });
    }

    // ========================================================
    // CONNECTION
    // ========================================================

    connection = await db.getConnection();

    // ========================================================
    // BEGIN TRANSACTION
    // ========================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // ========================================================
    // LOCK OTP
    //
    // RẤT QUAN TRỌNG:
    // Không để 2 request verify chạy đồng thời.
    // ========================================================

    const [verificationRows] = await connection.query(
      `
          SELECT
            id,
            email,
            otp_hash,
            expires_at,
            verified_at,
            attempts

          FROM email_verifications

          WHERE email = ?
            AND purpose = 'register'

          ORDER BY id DESC

          LIMIT 1

          FOR UPDATE
        `,
      [cleanEmail],
    );

    if (verificationRows.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "OTP_NOT_FOUND",
        message: "Không tìm thấy mã xác thực. Vui lòng yêu cầu gửi lại mã.",
      });
    }

    const verification = verificationRows[0];

    // ========================================================
    // OTP ALREADY USED
    // ========================================================

    if (verification.verified_at) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        code: "OTP_ALREADY_USED",
        message: "Mã xác thực này đã được sử dụng.",
      });
    }

    // ========================================================
    // MAX ATTEMPTS
    // ========================================================

    if (Number(verification.attempts) >= MAX_OTP_ATTEMPTS) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(429).json({
        success: false,
        code: "OTP_TOO_MANY_ATTEMPTS",
        message: "Bạn đã nhập sai mã quá nhiều lần. Vui lòng yêu cầu mã mới.",
      });
    }

    // ========================================================
    // OTP EXPIRED
    // ========================================================

    const now = new Date();

    const otpExpiresAt = new Date(verification.expires_at);

    if (now > otpExpiresAt) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        code: "OTP_EXPIRED",
        message: "Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.",
      });
    }

    // ========================================================
    // COMPARE OTP
    // ========================================================

    const isOtpValid = await bcrypt.compare(cleanOtp, verification.otp_hash);

    // ========================================================
    // WRONG OTP
    // ========================================================

    if (!isOtpValid) {
      await connection.query(
        `
          UPDATE email_verifications

          SET attempts = attempts + 1

          WHERE id = ?
            AND verified_at IS NULL
        `,
        [verification.id],
      );

      await connection.commit();
      transactionStarted = false;

      const attemptsUsed = Number(verification.attempts) + 1;

      console.warn(
        `[REGISTER] INVALID OTP | EMAIL=${cleanEmail} | ATTEMPTS=${attemptsUsed}`,
      );

      return res.status(400).json({
        success: false,
        code: "INVALID_OTP",
        message: "Mã xác thực không chính xác",

        data: {
          attempts_remaining: Math.max(0, MAX_OTP_ATTEMPTS - attemptsUsed),
        },
      });
    }

    console.log("[REGISTER] OTP CORRECT:", cleanEmail);

    // ========================================================
    // LOCK PENDING REGISTRATION
    // ========================================================

    const [pendingRows] = await connection.query(
      `
          SELECT
            id,
            email,
            password_hash,
            full_name,
            phone,
            church_name,
            church_type,
            address,
            district,
            ward,
            pastor_name,
            expires_at

          FROM pending_registrations

          WHERE email = ?

          LIMIT 1

          FOR UPDATE
        `,
      [cleanEmail],
    );

    if (pendingRows.length === 0) {
      throw new Error("PENDING_REGISTRATION_NOT_FOUND");
    }

    const pending = pendingRows[0];

    // ========================================================
    // PENDING EXPIRED
    // ========================================================

    const pendingExpiresAt = new Date(pending.expires_at);

    if (now > pendingExpiresAt) {
      throw new Error("PENDING_REGISTRATION_EXPIRED");
    }

    // ========================================================
    // CHECK EMAIL AGAIN
    // ========================================================

    const [existingAccount] = await connection.query(
      `
          SELECT
            id,
            username,
            email,
            church_id,
            role

          FROM admins

          WHERE LOWER(email) = ?

          LIMIT 1

          FOR UPDATE
        `,
      [cleanEmail],
    );

    if (existingAccount.length > 0) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }

    // ========================================================
    // GENERATE CATECHIST CODE
    // ========================================================

    const baseCatechistCode = await generateCatechistCode(connection);

    console.log("🔢 BASE CATECHIST CODE:", baseCatechistCode);

    // ========================================================
    // FIND AVAILABLE USERNAME
    // ========================================================

    let catechistCode = baseCatechistCode;

    let codeIndex = 0;

    while (true) {
      const [existingCatechist] = await connection.query(
        `
            SELECT id

            FROM catechists

            WHERE catechist_code = ?

            LIMIT 1
          `,
        [catechistCode],
      );

      const [existingAdmin] = await connection.query(
        `
            SELECT id

            FROM admins

            WHERE username = ?

            LIMIT 1
          `,
        [catechistCode],
      );

      console.log(`🔍 CHECK CODE "${catechistCode}"`, {
        catechistExists: existingCatechist.length > 0,

        adminExists: existingAdmin.length > 0,
      });

      if (existingCatechist.length === 0 && existingAdmin.length === 0) {
        break;
      }

      codeIndex++;

      if (codeIndex >= MAX_REGISTER_RETRY) {
        throw new Error("CATECHIST_CODE_GENERATION_FAILED");
      }

      catechistCode = `${baseCatechistCode}_${codeIndex}`;
    }

    const username = catechistCode;

    console.log("✅ FINAL USERNAME:", username);

    // ========================================================
    // TRIAL 30 DAYS
    // ========================================================

    const trialStartedAt = new Date();

    const trialExpiresAt = new Date(trialStartedAt);

    trialExpiresAt.setDate(trialExpiresAt.getDate() + 30);

    // ========================================================
    // CHURCH CODE
    // ========================================================

    let churchCode = null;

    let churchCodeAvailable = false;

    for (let attempt = 0; attempt < MAX_REGISTER_RETRY; attempt++) {
      const candidate = `FE${Date.now()}${crypto.randomInt(100, 1000)}`;

      const [existingChurch] = await connection.query(
        `
            SELECT id

            FROM churches

            WHERE code = ?

            LIMIT 1
          `,
        [candidate],
      );

      if (existingChurch.length === 0) {
        churchCode = candidate;
        churchCodeAvailable = true;
        break;
      }
    }

    if (!churchCodeAvailable) {
      throw new Error("CHURCH_CODE_GENERATION_FAILED");
    }

    console.log("⛪ CHURCH CODE:", churchCode);

    // ========================================================
    // CREATE CHURCH
    // ========================================================

    const [churchResult] = await connection.query(
      `
          INSERT INTO churches
          (
            name,
            type,
            address,
            is_active,
            phone,
            email,
            pastor_name,
            district,
            ward,
            code,
            image,
            license_status,
            trial_started_at,
            trial_expires_at
          )

          VALUES
          (
            ?,
            ?,
            ?,
            1,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'trial',
            ?,
            ?
          )
        `,
      [
        pending.church_name,

        pending.church_type || "GIAO_HO",

        pending.address || null,

        pending.phone || null,

        pending.email,

        pending.pastor_name || null,

        pending.district || null,

        pending.ward || null,

        churchCode,

        "/uploads/churches/default.jpg",

        trialStartedAt,

        trialExpiresAt,
      ],
    );

    const churchId = churchResult.insertId;

    if (!churchId) {
      throw new Error("CHURCH_CREATE_FAILED");
    }

    console.log("✅ CHURCH CREATED:", churchId);

    // ========================================================
    // CREATE ADMIN
    // ========================================================

    const [adminResult] = await connection.query(
      `
          INSERT INTO admins
          (
            church_id,
            username,
            password,
            role,
            account_type,
            is_active,
            full_name,
            email,
            phone
          )

          VALUES
          (
            ?,
            ?,
            ?,
            'catechist',
            'member',
            1,
            ?,
            ?,
            ?
          )
        `,
      [
        churchId,

        username,

        pending.password_hash,

        pending.full_name,

        pending.email,

        pending.phone || null,
      ],
    );

    const adminId = adminResult.insertId;

    if (!adminId) {
      throw new Error("ADMIN_CREATE_FAILED");
    }

    console.log("✅ ADMIN CREATED:", adminId);

    // ========================================================
    // MARK OTP VERIFIED
    // ========================================================

    const [updateOtpResult] = await connection.query(
      `
          UPDATE email_verifications

          SET verified_at = NOW()

          WHERE id = ?

            AND verified_at IS NULL
        `,
      [verification.id],
    );

    if (updateOtpResult.affectedRows !== 1) {
      throw new Error("OTP_VERIFY_UPDATE_FAILED");
    }

    // ========================================================
    // DELETE PENDING REGISTRATION
    // ========================================================

    const [deletePendingResult] = await connection.query(
      `
          DELETE FROM pending_registrations

          WHERE id = ?
        `,
      [pending.id],
    );

    if (deletePendingResult.affectedRows !== 1) {
      throw new Error("PENDING_REGISTRATION_DELETE_FAILED");
    }

    // ========================================================
    // COMMIT
    // ========================================================

    await connection.commit();
    transactionStarted = false;

    console.log("✅ REGISTER TRANSACTION COMMITTED");

    // ========================================================
    // WRITE REGISTER LOG
    // ========================================================

    try {
      await writeLog({
        admin_id: adminId,

        action: "REGISTER",

        target_type: "catechist",

        target_id: adminId,

        description:
          `${pending.full_name} đăng ký FaithEdu ` +
          `- giáo xứ "${pending.church_name}" ` +
          `- mã ${catechistCode} ` +
          `- username ${username}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error(
        "⚠️ WRITE REGISTER LOG ERROR:",
        logError?.message || logError,
      );
    }

    // ========================================================
    // CREATE JWT
    // ========================================================

    const token = createJwtToken({
      id: adminId,

      email: pending.email,

      full_name: pending.full_name,

      username,

      avatar: null,

      role: "catechist",

      church_id: churchId,

      account_type: "member",

      catechist_id: null,

      teacher_id: null,

      parent_id: null,
    });

    // ========================================================
    // SUCCESS LOG
    // ========================================================

    console.log("");
    console.log("============================================================");
    console.log("             FAITHEDU REGISTER SUCCESS");
    console.log("============================================================");
    console.log("Admin ID       :", adminId);
    console.log("Username       :", username);
    console.log("Catechist Code :", catechistCode);
    console.log("Email          :", pending.email);
    console.log("Role           :", "catechist");
    console.log("Church ID      :", churchId);
    console.log("Church         :", pending.church_name);
    console.log("Church Code    :", churchCode);
    console.log("Trial Start    :", trialStartedAt);
    console.log("Trial Expire   :", trialExpiresAt);
    console.log("============================================================");

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,

      code: "REGISTER_SUCCESS",

      message: "Xác thực email và đăng ký FaithEdu thành công",

      token,

      admin: {
        id: Number(adminId),

        email: pending.email,

        role: "catechist",

        church_id: Number(churchId),

        full_name: pending.full_name,

        username,

        catechist_code: catechistCode,

        account_type: "member",

        avatar: null,

        catechist_id: null,

        catechist_full_name: null,

        teacher_id: null,

        parent_id: null,

        last_login: new Date(),
      },

      church: {
        id: Number(churchId),

        name: pending.church_name,

        code: churchCode,

        type: pending.church_type || "GIAO_HO",

        license_status: "trial",

        trial_started_at: trialStartedAt,

        trial_expires_at: trialExpiresAt,

        trial_days: 30,

        activated_at: null,
      },
    });
  } catch (error) {
    // ========================================================
    // ROLLBACK
    // ========================================================

    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "⚠️ REGISTER VERIFY ROLLBACK ERROR:",
          rollbackError?.message || rollbackError,
        );
      }

      transactionStarted = false;
    }

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("             FAITHEDU REGISTER VERIFY ERROR");
    console.error(
      "============================================================",
    );

    logDbError("REGISTER VERIFY DETAILS:", error);

    console.error(
      "============================================================",
    );

    // ========================================================
    // KNOWN ERRORS
    // ========================================================

    switch (error?.message) {
      case "PENDING_REGISTRATION_NOT_FOUND":
        return res.status(404).json({
          success: false,
          code: "PENDING_REGISTRATION_NOT_FOUND",
          message: "Không tìm thấy thông tin đăng ký. Vui lòng đăng ký lại.",
        });

      case "PENDING_REGISTRATION_EXPIRED":
        return res.status(400).json({
          success: false,
          code: "REGISTRATION_EXPIRED",
          message: "Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.",
        });

      case "EMAIL_ALREADY_EXISTS":
        return res.status(409).json({
          success: false,
          code: "EMAIL_ALREADY_EXISTS",
          message: "Email này đã được sử dụng.",
        });

      case "CHURCH_CREATE_FAILED":
        return res.status(500).json({
          success: false,
          code: "CHURCH_CREATE_FAILED",
          message: "Không thể tạo giáo xứ. Vui lòng thử lại.",
        });

      case "ADMIN_CREATE_FAILED":
        return res.status(500).json({
          success: false,
          code: "ADMIN_CREATE_FAILED",
          message: "Không thể tạo tài khoản. Vui lòng thử lại.",
        });

      case "OTP_VERIFY_UPDATE_FAILED":
        return res.status(500).json({
          success: false,
          code: "OTP_VERIFY_UPDATE_FAILED",
          message: "Không thể xác nhận email. Vui lòng thử lại.",
        });

      case "PENDING_REGISTRATION_DELETE_FAILED":
        return res.status(500).json({
          success: false,
          code: "PENDING_REGISTRATION_DELETE_FAILED",
          message: "Không thể hoàn tất đăng ký. Vui lòng thử lại.",
        });

      case "CATECHIST_CODE_GENERATION_FAILED":
        return res.status(500).json({
          success: false,
          code: "CATECHIST_CODE_GENERATION_FAILED",
          message: "Không thể tạo mã Giáo lý viên. Vui lòng thử lại.",
        });

      case "CHURCH_CODE_GENERATION_FAILED":
        return res.status(500).json({
          success: false,
          code: "CHURCH_CODE_GENERATION_FAILED",
          message: "Không thể tạo mã giáo xứ. Vui lòng thử lại.",
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

    // ========================================================
    // DUPLICATE
    // ========================================================

    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "REGISTER_DUPLICATE",
        message:
          "Email, username, mã Giáo lý viên hoặc mã giáo xứ đã tồn tại. Vui lòng thử lại.",
      });
    }

    // ========================================================
    // GENERAL ERROR
    // ========================================================

    return res.status(500).json({
      success: false,

      code: "REGISTER_VERIFY_ERROR",

      message: "Không thể hoàn tất đăng ký FaithEdu. Vui lòng thử lại sau.",

      error:
        process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();

      console.log("🔓 REGISTER VERIFY DB CONNECTION RELEASED");
    }
  }
};

// ============================================================
// BACKWARD COMPATIBILITY
//
// Nếu một chỗ nào đó trong BE vẫn gọi:
//
// authController.register
//
// thì sẽ tự chuyển sang registerRequest.
// ============================================================

exports.register = exports.registerRequest;

const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { writeLog } = require("../utils/activityLogger");
const { generateCatechistCode } = require("../utils/generateCode");
exports.login = async (req, res) => {
  console.log("===== LOGIN REQUEST =====");

  try {
    const { email, password } = req.body;

    // =====================================================
    // 1. VALIDATE
    // =====================================================

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email và password là bắt buộc",
      });
    }

    // =====================================================
    // 2. LẤY ADMIN + CATECHIST
    //
    // QUAN HỆ:
    // admins.username = catechists.catechist_code
    //
    // Đồng thời phải cùng church_id
    // =====================================================

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

      WHERE a.email = ?

      LIMIT 1
      `,
      [email.trim()],
    );

    // =====================================================
    // 3. KHÔNG TÌM THẤY ACCOUNT
    // =====================================================

    if (rows.length === 0) {
      console.log("❌ ACCOUNT NOT FOUND:", email);

      return res.status(401).json({
        success: false,
        message: "Sai email hoặc mật khẩu",
      });
    }

    const admin = rows[0];

    // =====================================================
    // DEBUG
    // =====================================================

    console.log("========================================");
    console.log("LOGIN USER");
    console.log("========================================");
    console.log("Admin ID       :", admin.id);
    console.log("Email          :", admin.email);
    console.log("Username       :", admin.username);
    console.log("Role           :", admin.role);
    console.log("Church ID      :", admin.church_id);

    console.log("Catechist ID   :", admin.catechist_id);

    console.log("Catechist Code :", admin.catechist_code);

    console.log("Teacher ID     :", admin.catechist_teacher_id);

    console.log("========================================");

    // =====================================================
    // 4. CHECK ACTIVE
    // =====================================================

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

    // =====================================================
    // 5. CHECK PASSWORD
    // =====================================================

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      console.log("❌ WRONG PASSWORD");

      return res.status(401).json({
        success: false,
        message: "Sai email hoặc mật khẩu",
      });
    }

    // =====================================================
    // 6. TEACHER / CATECHIST ID
    //
    // admins.username
    //        ↓
    // catechists.catechist_code
    //        ↓
    // catechists.id
    // =====================================================

    const teacherId = admin.catechist_teacher_id
      ? Number(admin.catechist_teacher_id)
      : null;

    console.log("🎓 TEACHER ID:", teacherId);

    // =====================================================
    // 7. UPDATE LAST LOGIN
    // =====================================================

    await db.query(
      `
      UPDATE admins
      SET last_login = NOW()
      WHERE id = ?
      `,
      [admin.id],
    );

    // =====================================================
    // 8. CREATE JWT
    // =====================================================

    const token = jwt.sign(
      {
        id: Number(admin.id),

        email: admin.email,

        full_name: admin.full_name,

        username: admin.username,

        avatar: admin.avatar || null,

        role: admin.role,

        church_id: admin.church_id ? Number(admin.church_id) : null,

        account_type: admin.account_type,

        // ================================================
        // GIÁO LÝ VIÊN
        // ================================================

        catechist_id: teacherId,

        // Các API hiện tại đang dùng teacher_id
        teacher_id: teacherId,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
    );

    // =====================================================
    // 9. WRITE LOGIN LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: admin.id,
        action: "LOGIN",
        target_type: admin.role,
        target_id: admin.id,
        description: `${admin.full_name} đăng nhập hệ thống`,
        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ WRITE LOGIN LOG ERROR:", logError);
    }

    // =====================================================
    // 10. RESPONSE
    // =====================================================

    console.log("========================================");
    console.log("✅ LOGIN SUCCESS");
    console.log("Admin ID    :", admin.id);
    console.log("Username    :", admin.username);
    console.log("Catechist ID:", teacherId);
    console.log("Church ID   :", admin.church_id);
    console.log("========================================");

    return res.status(200).json({
      success: true,

      message: "Đăng nhập thành công",

      token,

      admin: {
        id: Number(admin.id),

        email: admin.email,

        role: admin.role,

        church_id: admin.church_id ? Number(admin.church_id) : null,

        full_name: admin.full_name,

        username: admin.username,

        account_type: admin.account_type,

        avatar: admin.avatar || null,

        // ================================================
        // CATECHIST
        // ================================================

        catechist_id: teacherId,

        catechist_code: admin.catechist_code || null,

        catechist_full_name: admin.catechist_full_name || null,

        // ================================================
        // TEACHER ID
        // ================================================

        teacher_id: teacherId,

        last_login: new Date(),
      },
    });
  } catch (err) {
    console.error("========================================");
    console.error("❌ LOGIN ERROR");
    console.error(err);
    console.error("========================================");

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
// const { writeLog } = require("../utils/writeLog");

exports.register = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("              FAITHEDU REGISTER REQUEST");
  console.log("============================================================");

  let connection = null;

  try {
    // =====================================================
    // 1. GET BODY
    // =====================================================

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
    } = req.body;

    console.log("📥 REGISTER BODY:", {
      email,
      full_name,
      phone,
      church_name,
      church_type,
      address,
      district,
      ward,
      pastor_name,
      hasPassword: !!password,
    });

    // =====================================================
    // 2. VALIDATE REQUIRED
    // =====================================================

    if (!email || !password || !full_name || !church_name) {
      return res.status(400).json({
        success: false,
        message: "Email, password, họ tên và tên giáo xứ là bắt buộc",
      });
    }

    // =====================================================
    // 3. CLEAN DATA
    // =====================================================

    const cleanEmail = String(email).trim().toLowerCase();

    const cleanFullName = String(full_name).trim();

    const cleanChurchName = String(church_name).trim();

    const cleanPhone =
      phone !== undefined && phone !== null && String(phone).trim() !== ""
        ? String(phone).trim()
        : null;

    const cleanChurchType =
      church_type !== undefined &&
      church_type !== null &&
      String(church_type).trim() !== ""
        ? String(church_type).trim()
        : "GIAO_HO";

    const cleanAddress =
      address !== undefined && address !== null && String(address).trim() !== ""
        ? String(address).trim()
        : null;

    const cleanDistrict =
      district !== undefined &&
      district !== null &&
      String(district).trim() !== ""
        ? String(district).trim()
        : null;

    const cleanWard =
      ward !== undefined && ward !== null && String(ward).trim() !== ""
        ? String(ward).trim()
        : null;

    const cleanPastorName =
      pastor_name !== undefined &&
      pastor_name !== null &&
      String(pastor_name).trim() !== ""
        ? String(pastor_name).trim()
        : null;

    // =====================================================
    // 4. VALIDATE CLEAN DATA
    // =====================================================

    if (!cleanEmail || !cleanFullName || !cleanChurchName) {
      return res.status(400).json({
        success: false,
        message: "Thông tin đăng ký không hợp lệ",
      });
    }

    // =====================================================
    // 5. VALIDATE PASSWORD
    // =====================================================

    const cleanPassword = String(password);

    if (cleanPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }

    // =====================================================
    // 6. VALIDATE EMAIL BASIC
    // =====================================================

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Email không hợp lệ",
      });
    }

    // =====================================================
    // 7. CHECK EMAIL TRƯỚC KHI TẠO TRANSACTION
    // =====================================================

    const [emailRows] = await db.query(
      `
      SELECT
        id,
        username,
        email,
        church_id,
        role
      FROM admins
      WHERE email = ?
      LIMIT 1
      `,
      [cleanEmail],
    );

    if (emailRows.length > 0) {
      console.log("⚠️ EMAIL ALREADY EXISTS:", cleanEmail);

      return res.status(409).json({
        success: false,
        message: "Email đã được sử dụng",
      });
    }

    // =====================================================
    // 8. HASH PASSWORD
    // =====================================================

    const hashedPassword = await bcrypt.hash(cleanPassword, 12);

    // =====================================================
    // 9. GET CONNECTION
    // =====================================================

    connection = await db.getConnection();

    // =====================================================
    // 10. GENERATE BASE CATECHIST CODE
    // =====================================================
    //
    // Ví dụ:
    //
    // GLV20260001
    //
    // Không dùng code này trực tiếp nếu đã tồn tại.
    // Phần bên dưới sẽ check:
    //
    // catechists.catechist_code
    // admins.username
    //
    // rồi tự thêm:
    //
    // GLV20260001_1
    // GLV20260001_2
    //
    // =====================================================

    const baseCatechistCode = await generateCatechistCode(connection);

    console.log("🔢 BASE CATECHIST CODE:", baseCatechistCode);

    // =====================================================
    // 11. RETRY
    // =====================================================

    const MAX_RETRY = 5;

    let lastError = null;

    // =====================================================
    // 12. CREATE LOOP
    // =====================================================

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        console.log("");
        console.log(`🔄 REGISTER ATTEMPT ${attempt}/${MAX_RETRY}`);

        // =================================================
        // BEGIN TRANSACTION
        // =================================================

        await connection.beginTransaction();

        // =================================================
        // 13. CHECK EMAIL INSIDE TRANSACTION
        // =================================================

        const [existingAccount] = await connection.query(
          `
            SELECT
              id,
              username,
              email,
              church_id,
              role
            FROM admins
            WHERE email = ?
            LIMIT 1
            `,
          [cleanEmail],
        );

        if (existingAccount.length > 0) {
          await connection.rollback();

          return res.status(409).json({
            success: false,
            message: `Email "${cleanEmail}" đã được sử dụng`,
          });
        }

        // =================================================
        // 14. FIND AVAILABLE CATECHIST CODE
        // =================================================

        let catechistCode = baseCatechistCode;

        let codeIndex = 0;

        while (true) {
          // ===============================================
          // CHECK CATECHISTS
          // ===============================================

          const [existingCatechist] = await connection.query(
            `
              SELECT id
              FROM catechists
              WHERE catechist_code = ?
              LIMIT 1
              `,
            [catechistCode],
          );

          // ===============================================
          // CHECK ADMINS
          // ===============================================

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

          // ===============================================
          // CODE AVAILABLE
          // ===============================================

          if (existingCatechist.length === 0 && existingAdmin.length === 0) {
            break;
          }

          // ===============================================
          // CODE EXISTS
          // ===============================================

          codeIndex++;

          catechistCode = `${baseCatechistCode}_${codeIndex}`;
        }

        // =================================================
        // 15. USERNAME = CATECHIST CODE
        // =================================================

        const username = catechistCode;

        console.log("✅ FINAL CATECHIST CODE:", catechistCode);

        console.log("✅ FINAL USERNAME:", username);

        // =================================================
        // SAFETY CHECK
        // =================================================

        if (username !== catechistCode) {
          throw new Error("Username và catechist_code không đồng nhất");
        }

        // =================================================
        // 16. TRIAL 30 DAYS
        // =================================================

        const trialStartedAt = new Date();

        const trialExpiresAt = new Date(trialStartedAt);

        trialExpiresAt.setDate(trialExpiresAt.getDate() + 30);

        // =================================================
        // 17. CREATE CHURCH CODE
        // =================================================

        const churchCode = `FE${Date.now()}${Math.floor(
          100 + Math.random() * 900,
        )}`;

        console.log("⛪ CHURCH CODE:", churchCode);

        // =================================================
        // 18. CREATE CHURCH
        // =================================================

        const [churchResult] = await connection.query(
          `
            INSERT INTO churches (
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
            VALUES (
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
            cleanChurchName,

            cleanChurchType,

            cleanAddress,

            cleanPhone,

            cleanEmail,

            cleanPastorName,

            cleanDistrict,

            cleanWard,

            churchCode,

            // churches.image NOT NULL
            "/uploads/churches/default.jpg",

            trialStartedAt,

            trialExpiresAt,
          ],
        );

        const churchId = churchResult.insertId;

        if (!churchId) {
          throw new Error("Không thể tạo giáo xứ");
        }

        console.log("✅ CHURCH CREATED:", churchId);

        // =================================================
        // 19. CREATE ADMIN CATECHIST
        // =================================================
        //
        // QUAN TRỌNG:
        //
        // username = catechistCode
        //
        // Ví dụ:
        //
        // catechist_code = GLV20260049_1
        // username       = GLV20260049_1
        //
        // =================================================

        const [adminResult] = await connection.query(
          `
            INSERT INTO admins (
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
            VALUES (
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

            // LUÔN BẰNG CATECHIST CODE
            username,

            hashedPassword,

            cleanFullName,

            cleanEmail,

            cleanPhone,
          ],
        );

        const adminId = adminResult.insertId;

        if (!adminId) {
          throw new Error("Không thể tạo tài khoản quản trị");
        }

        console.log("✅ ADMIN CREATED:", adminId);

        console.log("Username:", username);

        console.log("Catechist Code:", catechistCode);

        // =================================================
        // 20. COMMIT
        // =================================================

        await connection.commit();

        console.log("✅ REGISTER TRANSACTION COMMITTED");

        // =================================================
        // 21. WRITE LOG
        // =================================================
        //
        // Log SAU commit.
        //
        // Nếu log lỗi:
        // KHÔNG rollback dữ liệu.
        //
        // =================================================

        try {
          await writeLog({
            admin_id: adminId,

            action: "REGISTER",

            target_type: "catechist",

            target_id: adminId,

            description:
              `${cleanFullName} đăng ký FaithEdu ` +
              `- giáo xứ "${cleanChurchName}" ` +
              `- mã ${catechistCode} ` +
              `- username ${username}`,

            ip_address: req.ip,
          });
        } catch (logError) {
          console.error("⚠️ WRITE REGISTER LOG ERROR:", logError.message);
        }

        // =================================================
        // 22. CREATE JWT
        // =================================================

        const token = jwt.sign(
          {
            id: Number(adminId),

            email: cleanEmail,

            full_name: cleanFullName,

            // username = catechist_code
            username: username,

            avatar: null,

            role: "catechist",

            church_id: Number(churchId),

            account_type: "member",

            // Chưa có record catechists
            catechist_id: null,

            teacher_id: null,
          },

          process.env.JWT_SECRET,

          {
            expiresIn: process.env.JWT_EXPIRES_IN || "1d",
          },
        );

        // =================================================
        // 23. SUCCESS LOG
        // =================================================

        console.log("");
        console.log(
          "============================================================",
        );
        console.log("             FAITHEDU REGISTER SUCCESS");
        console.log(
          "============================================================",
        );

        console.log("Admin ID       :", adminId);

        console.log("Username       :", username);

        console.log("Catechist Code :", catechistCode);

        console.log("Email          :", cleanEmail);

        console.log("Role           :", "catechist");

        console.log("Church ID      :", churchId);

        console.log("Church         :", cleanChurchName);

        console.log("Church Code    :", churchCode);

        console.log("Trial Start    :", trialStartedAt);

        console.log("Trial Expire   :", trialExpiresAt);

        console.log(
          "============================================================",
        );

        // =================================================
        // 24. RESPONSE
        // =================================================

        return res.status(201).json({
          success: true,

          message: "Đăng ký FaithEdu thành công",

          token,

          admin: {
            id: Number(adminId),

            email: cleanEmail,

            role: "catechist",

            church_id: Number(churchId),

            full_name: cleanFullName,

            // username = catechist_code
            username: username,

            // LUÔN GIỐNG username
            catechist_code: username,

            account_type: "member",

            avatar: null,

            catechist_id: null,

            catechist_full_name: null,

            teacher_id: null,

            last_login: new Date(),
          },

          church: {
            id: Number(churchId),

            name: cleanChurchName,

            code: churchCode,

            license_status: "trial",

            trial_started_at: trialStartedAt,

            trial_expires_at: trialExpiresAt,

            trial_days: 30,

            activated_at: null,
          },
        });
      } catch (error) {
        lastError = error;

        // =================================================
        // ROLLBACK ATTEMPT
        // =================================================

        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("⚠️ ATTEMPT ROLLBACK ERROR:", rollbackError.message);
        }

        console.error("");
        console.error(`❌ REGISTER ATTEMPT ${attempt}/${MAX_RETRY} ERROR`);

        console.error("Message:", error.message);

        console.error("Code:", error.code);

        console.error("SQL Message:", error.sqlMessage);

        // =================================================
        // DUPLICATE
        // =================================================

        if (error.code === "ER_DUP_ENTRY") {
          if (attempt < MAX_RETRY) {
            console.log("⚠️ DUPLICATE DETECTED → RETRY");

            continue;
          }

          return res.status(409).json({
            success: false,

            message:
              "Dữ liệu vừa được tạo bởi một yêu cầu khác, vui lòng thử lại",

            errorCode: error.code,
          });
        }

        // =================================================
        // OTHER ERROR
        // =================================================

        throw error;
      }
    }

    // =====================================================
    // RETRY EXHAUSTED
    // =====================================================

    console.error("❌ REGISTER FAILED AFTER MAX RETRIES");

    return res.status(500).json({
      success: false,

      message: "Không thể đăng ký FaithEdu",

      errorCode: lastError?.code || null,
    });
  } catch (error) {
    // =====================================================
    // OUTER ROLLBACK
    // =====================================================

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ OUTER ROLLBACK ERROR:", rollbackError.message);
      }
    }

    // =====================================================
    // ERROR LOG
    // =====================================================

    console.error("");
    console.error(
      "============================================================",
    );

    console.error("             FAITHEDU REGISTER ERROR");

    console.error(
      "============================================================",
    );

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("Errno:", error.errno);

    console.error("SQL Message:", error.sqlMessage);

    console.error("SQL State:", error.sqlState);

    console.error("Stack:", error.stack);

    console.error(
      "============================================================",
    );

    // =====================================================
    // DUPLICATE
    // =====================================================

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        message: "Email, username hoặc mã Giáo lý viên đã tồn tại",

        errorCode: error.code,
      });
    }

    // =====================================================
    // RESPONSE ERROR
    // =====================================================

    return res.status(500).json({
      success: false,

      message: "Đăng ký FaithEdu thất bại",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,

      errorCode:
        process.env.NODE_ENV === "development" ? error.code : undefined,
    });
  } finally {
    // =====================================================
    // RELEASE CONNECTION
    // =====================================================

    if (connection) {
      connection.release();

      console.log("🔓 REGISTER DB CONNECTION RELEASED");
    }
  }
};

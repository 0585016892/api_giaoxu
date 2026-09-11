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
  console.log("===== FAITHEDU REGISTER REQUEST =====");

  let connection;

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
    } = req.body;

    // =====================================================
    // 1. VALIDATE
    // =====================================================

    if (!email || !password || !full_name || !church_name) {
      return res.status(400).json({
        success: false,
        message: "Email, password, họ tên và tên giáo xứ là bắt buộc",
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFullName = String(full_name).trim();
    const cleanChurchName = String(church_name).trim();

    if (!cleanEmail || !cleanFullName || !cleanChurchName) {
      return res.status(400).json({
        success: false,
        message: "Thông tin đăng ký không hợp lệ",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }

    // =====================================================
    // 2. CHECK EMAIL
    // =====================================================

    const [emailRows] = await db.query(
      `
      SELECT id
      FROM admins
      WHERE email = ?
      LIMIT 1
      `,
      [cleanEmail],
    );

    if (emailRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email đã được sử dụng",
      });
    }

    // =====================================================
    // 3. HASH PASSWORD
    // =====================================================

    const hashedPassword = await bcrypt.hash(password, 12);

    // =====================================================
    // 4. CONNECTION + TRANSACTION
    // =====================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =====================================================
    // 5. TẠO MÃ GIÁO LÝ VIÊN
    // =====================================================
    // generateCatechistCode sẽ đảm bảo code không bị trùng
    //
    // Ví dụ:
    // GLV20260035
    //
    // Mã này đồng thời được dùng làm username.
    // =====================================================

    const catechistCode = await generateCatechistCode(connection);

    const cleanUsername = catechistCode;

    console.log("✅ CATECHIST CODE GENERATED");
    console.log("Catechist Code:", catechistCode);
    console.log("Username:", cleanUsername);

    // =====================================================
    // 6. TRIAL 30 NGÀY
    // =====================================================

    const trialStartedAt = new Date();

    const trialExpiresAt = new Date(trialStartedAt);

    trialExpiresAt.setDate(trialExpiresAt.getDate() + 30);

    // =====================================================
    // 7. TẠO MÃ GIÁO XỨ
    // =====================================================

    const churchCode = `FE${Date.now()}${Math.floor(
      100 + Math.random() * 900,
    )}`;

    console.log("Church Code:", churchCode);

    // =====================================================
    // 8. TẠO CHURCH
    // =====================================================

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
        church_type || "GIAO_HO",
        address || null,
        phone || null,
        cleanEmail,
        pastor_name || null,
        district || null,
        ward || null,
        churchCode,

        // churches.image đang NOT NULL
        "/uploads/churches/default.jpg",

        trialStartedAt,
        trialExpiresAt,
      ],
    );

    const churchId = churchResult.insertId;

    console.log("✅ CHURCH CREATED");
    console.log("Church ID:", churchId);
    console.log("Church:", cleanChurchName);

    // =====================================================
    // 9. TẠO ADMIN CATECHIST
    // =====================================================

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
        cleanUsername,
        hashedPassword,
        cleanFullName,
        cleanEmail,
        phone || null,
      ],
    );

    const adminId = adminResult.insertId;

    console.log("✅ ADMIN CREATED");
    console.log("Admin ID:", adminId);
    console.log("Username:", cleanUsername);
    console.log("Role:", "catechist");

    // =====================================================
    // 10. COMMIT
    // =====================================================

    await connection.commit();

    console.log("✅ REGISTER TRANSACTION COMMITTED");

    // =====================================================
    // 11. CREATE JWT
    // =====================================================

    const token = jwt.sign(
      {
        id: Number(adminId),

        email: cleanEmail,

        full_name: cleanFullName,

        username: cleanUsername,

        avatar: null,

        role: "catechist",

        church_id: Number(churchId),

        account_type: "member",

        // Admin catechist mới đăng ký
        // chưa có record catechists / teachers
        catechist_id: null,

        teacher_id: null,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
    );

    // =====================================================
    // 12. WRITE LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: adminId,

        action: "REGISTER",

        target_type: "catechist",

        target_id: adminId,

        description: `${cleanFullName} đăng ký FaithEdu - ${cleanChurchName}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      // Không để lỗi ghi log làm fail đăng ký
      console.error("⚠️ WRITE REGISTER LOG ERROR:", logError);
    }

    // =====================================================
    // 13. RESPONSE
    // =====================================================

    console.log("========================================");
    console.log("✅ FAITHEDU REGISTER SUCCESS");
    console.log("Admin ID :", adminId);
    console.log("Username :", cleanUsername);
    console.log("Email    :", cleanEmail);
    console.log("Role     :", "catechist");
    console.log("Church ID:", churchId);
    console.log("Church   :", cleanChurchName);
    console.log("Code     :", catechistCode);
    console.log("Trial    :", trialStartedAt);
    console.log("Expires  :", trialExpiresAt);
    console.log("========================================");

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
        username: cleanUsername,

        // Trả luôn catechist_code cho frontend
        catechist_code: catechistCode,

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
  } catch (err) {
    // =====================================================
    // ROLLBACK
    // =====================================================

    if (connection) {
      try {
        await connection.rollback();

        console.log("↩️ REGISTER TRANSACTION ROLLBACK");
      } catch (rollbackError) {
        console.error("❌ ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("========================================");
    console.error("❌ FAITHEDU REGISTER ERROR");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    console.error(err);
    console.error("========================================");

    // =====================================================
    // DUPLICATE
    // =====================================================

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email, username hoặc mã giáo lý viên đã tồn tại",
      });
    }

    // =====================================================
    // RESPONSE ERROR
    // =====================================================

    return res.status(500).json({
      success: false,

      message: "Đăng ký FaithEdu thất bại",

      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  } finally {
    // =====================================================
    // RELEASE CONNECTION
    // =====================================================

    if (connection) {
      connection.release();
    }
  }
};

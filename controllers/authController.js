const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { writeLog } = require("../utils/activityLogger");
exports.login = async (req, res) => {
  console.log("===== LOGIN REQUEST =====");

  try {
    const { email, password } = req.body;

    // =====================================================
    // 1. VALIDATE INPUT
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
    // Quan hệ:
    // admins.catechist_id -> catechists.id
    //
    // KHÔNG dùng:
    // admins.username = catechists.catechist_code
    // =====================================================

    const [rows] = await db.query(
      `
      SELECT
        a.*,

        c.id AS catechist_id,
        c.catechist_code,
        c.full_name AS catechist_full_name

      FROM admins a

      LEFT JOIN catechists c
        ON c.id = a.catechist_id
        AND c.church_id = a.church_id

      WHERE a.email = ?

      LIMIT 1
      `,
      [email.trim()],
    );

    // =====================================================
    // 3. KHÔNG TÌM THẤY TÀI KHOẢN
    // =====================================================

    if (rows.length === 0) {
      console.log("❌ LOGIN FAILED: ACCOUNT NOT FOUND");

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
    console.log("Account Type   :", admin.account_type);
    console.log("Catechist ID   :", admin.catechist_id);
    console.log("Catechist Code :", admin.catechist_code);
    console.log("========================================");

    // =====================================================
    // 4. CHECK ACTIVE
    // =====================================================

    if (
      admin.is_active === 0 ||
      admin.is_active === false ||
      admin.is_active === "0"
    ) {
      console.log("❌ LOGIN FAILED: ACCOUNT DISABLED");

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
      console.log("❌ LOGIN FAILED: WRONG PASSWORD");

      return res.status(401).json({
        success: false,
        message: "Sai email hoặc mật khẩu",
      });
    }

    // =====================================================
    // 6. XÁC ĐỊNH CATECHIST / TEACHER ID
    // =====================================================

    const teacherId = admin.catechist_id ? Number(admin.catechist_id) : null;

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

    const tokenPayload = {
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

      // Giữ teacher_id để các API hiện tại sử dụng
      teacher_id: teacherId,
    };

    console.log("JWT USER:", tokenPayload);

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    });

    // =====================================================
    // 9. WRITE LOGIN ACTIVITY
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
      // Không để lỗi ghi log làm login thất bại
      console.error("⚠️ WRITE LOGIN LOG ERROR:", logError);
    }

    // =====================================================
    // 10. RESPONSE
    // =====================================================

    console.log("✅ LOGIN SUCCESS");
    console.log("Admin ID    :", admin.id);
    console.log("Catechist ID:", teacherId);
    console.log("code  :", admin.username);
    console.log("Teacher ID  :", teacherId);
    console.log("Church ID   :", admin.church_id);

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
        // GIÁO LÝ VIÊN
        // ================================================

        catechist_id: teacherId,

        catechist_code: admin.catechist_code || null,

        catechist_full_name: admin.catechist_full_name || null,

        // Các API teacher hiện tại dùng cái này
        teacher_id: teacherId,

        last_login: new Date(),
      },
    });
  } catch (err) {
    console.error("========================================");
    console.error("❌ LOGIN ERROR");
    console.error("========================================");
    console.error(err);
    console.error("========================================");

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

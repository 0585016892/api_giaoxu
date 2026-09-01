const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { writeLog } = require("../utils/activityLogger");
exports.login = async (req, res) => {
  console.log("===== LOGIN REQUEST =====");

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email và password là bắt buộc",
      });
    }

    // =====================================================
    // 1. QUERY ADMIN + CATECHIST
    // admins.username = catechists.catechist_code
    // Nếu không có catechist -> teacher_id = null
    // =====================================================

    const [rows] = await db.query(
      `
      SELECT
        a.*,

        c.id AS catechist_id,
        c.catechist_code,
        c.teacher_id AS catechist_teacher_id

      FROM admins a

      LEFT JOIN catechists c
        ON c.catechist_code = a.username

      WHERE a.email = ?

      LIMIT 1
      `,
      [email],
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Sai email hoặc mật khẩu",
      });
    }

    const admin = rows[0];

    console.log("LOGIN USER:", {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      church_id: admin.church_id,
      catechist_id: admin.catechist_id,
      teacher_id: admin.catechist_teacher_id,
    });

    // =====================================================
    // 2. CHECK ACTIVE
    // =====================================================

    if (admin.is_active === 0) {
      return res.status(403).json({
        message: "Tài khoản đã bị khóa",
      });
    }

    // =====================================================
    // 3. CHECK PASSWORD
    // =====================================================

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Sai email hoặc mật khẩu",
      });
    }

    // =====================================================
    // 4. UPDATE LAST LOGIN
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
    // 5. TEACHER ID
    // =====================================================

    const teacherId = admin.catechist_teacher_id
      ? Number(admin.catechist_teacher_id)
      : null;

    // =====================================================
    // 6. CREATE JWT
    // =====================================================

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        username: admin.username,
        avatar: admin.avatar,
        role: admin.role,
        church_id: admin.church_id,
        account_type: admin.account_type,

        // Giáo lý viên có thể có teacher_id
        teacher_id: teacherId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
    );

    // =====================================================
    // 7. WRITE LOGIN ACTIVITY
    // =====================================================

    await writeLog({
      admin_id: admin.id,
      action: "LOGIN",
      target_type: admin.role,
      target_id: admin.id,
      description: `${admin.full_name} đăng nhập hệ thống`,
      ip_address: req.ip,
    });

    // =====================================================
    // 8. RESPONSE
    // =====================================================

    return res.json({
      message: "Đăng nhập thành công",

      token,

      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        church_id: admin.church_id,
        full_name: admin.full_name,
        username: admin.username,
        account_type: admin.account_type,
        avatar: admin.avatar,

        // Giáo lý viên
        catechist_id: admin.catechist_id ? Number(admin.catechist_id) : null,

        catechist_code: admin.catechist_code || null,

        // Có giáo viên -> ID
        // Không có -> null
        teacher_id: teacherId,

        last_login: new Date(),
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

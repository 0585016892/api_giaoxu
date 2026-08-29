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

    // 1️⃣ Query admin
    const [rows] = await db.query(
      `SELECT *
       FROM admins 
       WHERE email = ? 
       LIMIT 1`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Sai email hoặc mật khẩu",
      });
    }

    const admin = rows[0];
    console.log(admin);

    // 2️⃣ Check active
    if (admin.is_active === 0) {
      return res.status(403).json({
        message: "Tài khoản đã bị khóa",
      });
    }

    // 3️⃣ Check password
    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Sai email hoặc mật khẩu",
      });
    }

    // 4️⃣ UPDATE LAST LOGIN 🔥
    await db.query(`UPDATE admins SET last_login = NOW() WHERE id = ?`, [
      admin.id,
    ]);

    // 5️⃣ Create JWT
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
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
    );
    // Write login activity log
    await writeLog({
      admin_id: admin.id,
      action: "LOGIN",
      target_type: "admins",
      target_id: admin.id,
      description: `${admin.full_name} đăng nhập hệ thống`,
      ip_address: req.ip,
    });
    // 6️⃣ Response
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

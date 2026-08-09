const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { writeLog } = require("../utils/activityLogger");
const { createNotification } = require("../services/notification.service");
const fs = require("fs");
const path = require("path");

/* =========================================================
   CREATE ADMIN
========================================================= */
exports.createAdmin = async (req, res) => {
  try {
    const {
      username,
      password,
      role = "admin",
      full_name,
      saint_name,
      email,
      phone,
      birthday,
      hometown,
      address,
      ordination_date,
      position,
      motto,
      bio,
    } = req.body;

    if (!username || !password || !email || !full_name) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });
    }

    const [exist] = await db.query(
      "SELECT id FROM admins WHERE username=? OR email=?",
      [username, email],
    );

    if (exist.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Username hoặc Email đã tồn tại",
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const avatar = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    const [result] = await db.query(
      `INSERT INTO admins (
        username, password, role,
        full_name, saint_name, email, phone, avatar,
        birthday, hometown, address,
        ordination_date, position, motto, bio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        hash,
        role,
        full_name,
        saint_name || null,
        email,
        phone || null,
        avatar,
        birthday || null,
        hometown || null,
        address || null,
        ordination_date || null,
        position || null,
        motto || null,
        bio || null,
      ],
    );

    await writeLog({
      admin_id: req.user?.id,
      action: "CREATE_ADMIN",
      target_type: "admins",
      target_id: result.insertId,
      description: `Tạo tài khoản ${full_name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "CREATE_ADMIN",
      title: "Tạo tài khoản mới",
      content: `${full_name} vừa được tạo`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: result.insertId,
    });

    return res.json({
      success: true,
      message: "Tạo thành công",
      id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.changePassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu tối thiểu 6 ký tự",
      });
    }

    const bcrypt = require("bcryptjs");

    const hash = await bcrypt.hash(password, 10);

    await db.query(`UPDATE admins SET password=? WHERE id=?`, [
      hash,
      req.params.id,
    ]);

    await writeLog({
      admin_id: req.user?.id,
      action: "CHANGE_PASSWORD",
      target_type: "admins",
      target_id: req.params.id,
      description: `Đổi mật khẩu tài khoản ID ${req.params.id}`,
      ip_address: req.ip,
    });

    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
/* =========================================================
   GET ALL
========================================================= */
exports.getAllAdmins = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins ORDER BY id DESC");
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   GET BY ID
========================================================= */
exports.getAdminById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy",
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   UPDATE ADMIN
========================================================= */
exports.updateAdmin = async (req, res) => {
  try {
    const {
      role,
      full_name,
      saint_name,
      email,
      phone,
      birthday,
      hometown,
      address,
      ordination_date,
      position,
      motto,
      bio,
    } = req.body;

    // 1. Lấy dữ liệu tài khoản cũ từ DB
    const [old] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!old.length) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    const currentAdmin = old[0];

    // 2. TỰ ĐỘNG TẠO USERNAME TỪ EMAIL (Lấy phần trước @)
    let finalUsername = currentAdmin.username; // Mặc định giữ username cũ

    if (email && email.includes("@")) {
      // Cắt lấy phần trước dấu @, chuyển về chữ thường và lọc ký tự đặc biệt
      finalUsername = email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
    }

    // 3. Xử lý Avatar (Giữ ảnh cũ nếu không upload ảnh mới)
    let avatar = currentAdmin.avatar;
    if (req.file) {
      avatar = `/uploads/avatars/${req.file.filename}`;
    }

    // 4. Cập nhật dữ liệu vào DB (Sử dụng '??' để fallback về giá trị cũ nếu trường gửi lên bị trống)
    await db.query(
      `UPDATE admins SET
        username=?, 
        role=?,
        full_name=?, 
        saint_name=?, 
        email=?, 
        phone=?, 
        avatar=?,
        birthday=?, 
        hometown=?, 
        address=?,
        ordination_date=?, 
        position=?, 
        motto=?, 
        bio=?
      WHERE id=?`,
      [
        finalUsername,
        role ?? currentAdmin.role,
        full_name ?? currentAdmin.full_name,
        saint_name ?? currentAdmin.saint_name,
        email ?? currentAdmin.email,
        phone ?? currentAdmin.phone,
        avatar,
        birthday || null,
        hometown ?? currentAdmin.hometown,
        address ?? currentAdmin.address,
        ordination_date || null,
        position ?? currentAdmin.position,
        motto ?? currentAdmin.motto,
        bio ?? currentAdmin.bio,
        req.params.id,
      ],
    );

    // 5. Ghi nhật ký (Audit Log)
    const updatedName = full_name || currentAdmin.full_name;
    await writeLog({
      admin_id: req.user?.id,
      action: "UPDATE_ADMIN",
      target_type: "admins",
      target_id: req.params.id,
      description: `Cập nhật thông tin tài khoản ${updatedName} (@${finalUsername})`,
      ip_address: req.ip,
    });

    // 6. Gửi thông báo
    await createNotification({
      type: "UPDATE_ADMIN",
      title: "Cập nhật tài khoản",
      content: `Tài khoản ${updatedName} vừa được cập nhật thông tin mới`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: req.params.id,
    });

    return res.json({
      success: true,
      message: "Cập nhật tài khoản thành công!",
      data: {
        username: finalUsername,
      },
    });
  } catch (err) {
    console.error("Lỗi updateAdmin:", err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   RESET PASSWORD
========================================================= */
exports.resetAdminPassword = async (req, res) => {
  try {
    const { password } = req.body;

    const [admin] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!admin.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const hash = await bcrypt.hash(password, 10);

    await db.query("UPDATE admins SET password=? WHERE id=?", [
      hash,
      req.params.id,
    ]);

    await writeLog({
      admin_id: req.user?.id,
      action: "RESET_PASSWORD",
      target_type: "admins",
      target_id: req.params.id,
      description: `Reset password ${admin[0].full_name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "RESET_PASSWORD",
      title: "Reset mật khẩu",
      content: `${admin[0].full_name} vừa được reset mật khẩu`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: req.params.id,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   DELETE ADMIN
========================================================= */
exports.deleteAdmin = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const admin = rows[0];

    if (admin.avatar) {
      const filePath = path.join(__dirname, "..", admin.avatar);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.query("DELETE FROM admins WHERE id=?", [req.params.id]);

    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_ADMIN",
      target_type: "admins",
      target_id: req.params.id,
      description: `Xóa ${admin.full_name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "DELETE_ADMIN",
      title: "Xóa tài khoản",
      content: `${admin.full_name} vừa bị xóa`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: req.params.id,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   TOGGLE ACTIVE
========================================================= */
exports.toggleActive = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const admin = rows[0];
    const newStatus = admin.is_active ? 0 : 1;

    await db.query("UPDATE admins SET is_active=? WHERE id=?", [
      newStatus,
      req.params.id,
    ]);

    await writeLog({
      admin_id: req.user?.id,
      action: "TOGGLE_ACTIVE",
      target_type: "admins",
      target_id: req.params.id,
      description: `${newStatus ? "Bật" : "Tắt"} ${admin.full_name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "TOGGLE_ACTIVE",
      title: "Trạng thái tài khoản",
      content: `${admin.full_name} vừa được cập nhật`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: req.params.id,
    });

    return res.json({ success: true, is_active: newStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

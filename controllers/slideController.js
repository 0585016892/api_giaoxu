const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { writeLog } = require("../utils/activityLogger");
// ================= GET ALL =================
exports.getSlides = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM slides ORDER BY sort_order ASC",
    );
    res.json(rows);
  } catch (error) {
    console.error("Lỗi lấy slides:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// ================= GET ACTIVE =================
exports.getActiveSlides = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM slides WHERE is_active = 1 ORDER BY sort_order ASC",
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

// ================= CREATE =================
exports.createSlide = async (req, res) => {
  try {
    const { title, subtitle, link, sort_order } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng upload hình ảnh" });
    }

    const imagePath = `/uploads/slides/${req.file.filename}`;

    const [result] = await db.query(
      "INSERT INTO slides (title, subtitle, image, link, sort_order) VALUES (?, ?, ?, ?, ?)",
      [title, subtitle, imagePath, link || null, sort_order || 0],
    );

    // ================= LOG =================
    await writeLog({
      admin_id: req.user?.id,
      action: "CREATE_SLIDE",
      target_type: "slides",
      target_id: result.insertId,
      description: `Tạo slide: ${title}`,
      ip_address: req.ip,
    });

    res.json({ message: "Thêm slide thành công" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi thêm slide" });
  }
};
// ================= UPDATE =================
exports.updateSlide = async (req, res) => {
  try {
    const { id } = req.params;

    const { title, subtitle, link, sort_order } = req.body;

    // =====================================================
    // LẤY DATA CŨ
    // =====================================================

    const [old] = await db.query("SELECT * FROM slides WHERE id = ?", [id]);

    if (old.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy slide",
      });
    }

    const oldSlide = old[0];

    // =====================================================
    // SQL UPDATE
    // is_active LUÔN = 1
    // =====================================================

    let sql = `
      UPDATE slides 
      SET 
        title = ?,
        subtitle = ?,
        link = ?,
        sort_order = ?,
        is_active = 1
    `;

    let params = [title, subtitle, link, sort_order];

    // =====================================================
    // NẾU CÓ ẢNH MỚI
    // =====================================================

    if (req.file) {
      const imagePath = `/uploads/slides/${req.file.filename}`;

      sql += `, image = ?`;

      params.push(imagePath);
    }

    sql += ` WHERE id = ?`;

    params.push(id);

    // =====================================================
    // UPDATE DATABASE
    // =====================================================

    await db.query(sql, params);

    // =====================================================
    // LOG
    // =====================================================

    await writeLog({
      admin_id: req.user?.id,
      action: "UPDATE_SLIDE",
      target_type: "slides",
      target_id: id,
      description: `Cập nhật slide: ${title}`,
      ip_address: req.ip,
    });

    // =====================================================
    // NOTIFICATION
    // =====================================================

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,
      message: "Cập nhật slide thành công",
    });
  } catch (error) {
    console.error("UPDATE SLIDE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi cập nhật slide",
      error: error.message,
    });
  }
};
// ================= UPDATE STATUS =================
exports.updateSlideStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const [rows] = await db.query("SELECT * FROM slides WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy slide" });
    }

    await db.query("UPDATE slides SET is_active = ? WHERE id = ?", [
      is_active,
      id,
    ]);

    const statusText = is_active == 1 ? "hiển thị" : "ẩn";

    // ================= LOG =================
    await writeLog({
      admin_id: req.user?.id,
      action: "TOGGLE_SLIDE",
      target_type: "slides",
      target_id: id,
      description: `Đổi trạng thái slide: ${statusText}`,
      ip_address: req.ip,
    });

    res.json({ message: "Cập nhật trạng thái thành công" });
  } catch (error) {
    console.error("Lỗi cập nhật status:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};
// ================= DELETE =================
exports.deleteSlide = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query("SELECT * FROM slides WHERE id=?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy slide" });
    }

    const imagePath = rows[0].image;
    const fullPath = path.join(__dirname, "..", imagePath);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await db.query("DELETE FROM slides WHERE id=?", [id]);

    // ================= LOG =================
    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_SLIDE",
      target_type: "slides",
      target_id: id,
      description: `Xóa slide: ${rows[0].title}`,
      ip_address: req.ip,
    });

    res.json({ message: "Xóa thành công" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi xóa slide" });
  }
};

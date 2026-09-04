const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");
const { createNotification } = require("../services/notificationService");

// ==========================================
// 1. GET ALL (Chỉ lấy danh sách CHỦ HỘ hiển thị bảng chính)
// ==========================================
router.get("/all", async (req, res) => {
  try {
    const { keyword = "", status, churches_id } = req.query;

    // 📌 Lấy tất cả giáo dân (đã bỏ điều kiện is_head = 1)
    let sql = `
      SELECT
        p.*,
        c.name AS church_name
      FROM parishioners p
      LEFT JOIN churches c
        ON p.churches_id = c.id
      WHERE 1=1
    `;

    const params = [];

    // Lọc theo từ khóa (tên, mã, SĐT)
    if (keyword) {
      sql += `
        AND (
          p.full_name LIKE ?
          OR p.code LIKE ?
          OR p.phone LIKE ?
        )
      `;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // Lọc theo trạng thái
    if (status && status !== "all") {
      sql += ` AND p.status = ? `;
      params.push(status);
    }

    // Lọc theo giáo xứ/họ
    if (churches_id && churches_id !== "all") {
      sql += ` AND p.churches_id = ? `;
      params.push(churches_id);
    }

    // Sắp xếp giảm dần theo ID
    sql += ` ORDER BY p.id DESC `;

    // Thực thi câu truy vấn
    const [rows] = await db.query(sql, params);

    res.json({
      success: true,
      data: rows,
      total: rows.length, // Tổng số giáo dân lấy ra
    });
  } catch (error) {
    console.error("GET ALL PARISHIONERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
router.get("/", async (req, res) => {
  try {
    const {
      keyword = "",
      status,
      churches_id,
      page = 1,
      limit = 10,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    let sql = `
      SELECT
        p.*,
        c.name AS church_name
      FROM parishioners p
      LEFT JOIN churches c
        ON p.churches_id = c.id
      WHERE p.is_head = 1
    `;

    const params = [];

    if (keyword) {
      sql += `
        AND (
          p.full_name LIKE ?
          OR p.code LIKE ?
          OR p.phone LIKE ?
        )
      `;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (status && status !== "all") {
      sql += ` AND p.status = ? `;
      params.push(status);
    }

    // Lọc theo giáo xứ
    if (churches_id && churches_id !== "all") {
      sql += ` AND p.churches_id = ? `;
      params.push(churches_id);
    }

    sql += `
      ORDER BY p.id DESC
      LIMIT ?
      OFFSET ?
    `;

    params.push(Number(limit));
    params.push(Number(offset));

    // =========================
    // COUNT
    // =========================

    let countSql = `
      SELECT COUNT(*) AS total
      FROM parishioners p
      WHERE p.is_head = 1
    `;

    const countParams = [];

    if (keyword) {
      countSql += `
        AND (
          p.full_name LIKE ?
          OR p.code LIKE ?
          OR p.phone LIKE ?
        )
      `;

      countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (status && status !== "all") {
      countSql += ` AND p.status = ? `;
      countParams.push(status);
    }

    if (churches_id && churches_id !== "all") {
      countSql += ` AND p.churches_id = ? `;
      countParams.push(churches_id);
    }

    const [[rows], [[totalResult]]] = await Promise.all([
      db.query(sql, params),
      db.query(countSql, countParams),
    ]);

    res.json({
      success: true,
      data: rows,
      total: totalResult.total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==========================================
// 2. GET MEMBERS (Lấy thành viên của một Chủ hộ)
// ==========================================
router.get("/:id/members", async (req, res) => {
  try {
    const [members] = await db.query(
      `SELECT * FROM parishioners WHERE head_id = ? ORDER BY date_of_birth ASC`,
      [req.params.id],
    );
    res.json({ success: true, data: members });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. GET ALL HEADS (Để đổ vào Dropdown tìm kiếm chủ hộ)
// ==========================================
router.get("/heads/all", async (req, res) => {
  try {
    const [heads] = await db.query(
      `SELECT id, full_name, code FROM parishioners WHERE is_head = 1 ORDER BY full_name ASC`,
    );
    res.json({ success: true, data: heads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. CREATE (Tự sinh mã, Lưu quan hệ & Ghi nhận Log / Notification)
// ==========================================
router.post("/", async (req, res) => {
  try {
    let {
      code,
      full_name,
      gender,
      date_of_birth,
      phone,
      email,
      address,
      churches_id,
      occupation,
      marital_status,
      baptism_date,
      confirmation_date,
      first_communion_date,
      status,
      avatar,
      notes,
      is_head,
      head_id,
      saint_name,
      relationship_with_head,
    } = req.body;

    // A. Tự động sinh mã nếu không nhập
    if (!code) {
      const prefix = is_head === 1 ? "HỘ-" : "TV-";
      const [lastRecord] = await db.query(
        `SELECT code FROM parishioners WHERE code LIKE ? ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`],
      );

      if (lastRecord.length > 0) {
        const lastNumber = parseInt(lastRecord[0].code.replace(prefix, ""), 10);
        code = `${prefix}${String(lastNumber + 1).padStart(4, "0")}`;
      } else {
        code = `${prefix}0001`;
      }
    } else {
      // Kiểm tra trùng mã thủ công
      const [exists] = await db.query(
        "SELECT id FROM parishioners WHERE code = ?",
        [code],
      );
      if (exists.length > 0)
        return res
          .status(400)
          .json({ success: false, message: "Mã định danh đã tồn tại!" });
    }

    // B. Chuẩn hóa dữ liệu logic hộ gia đình
    const final_is_head = is_head === 1 ? 1 : 0;
    const final_head_id = final_is_head === 1 ? null : head_id;
    const final_relationship =
      final_is_head === 1 ? "Chủ hộ" : relationship_with_head || "Thành viên";

    const sql = `
      INSERT INTO parishioners (
        code, full_name, gender, date_of_birth, phone, email,
        address, churches_id, occupation, marital_status,
        baptism_date, confirmation_date, first_communion_date,
        status, avatar, notes, is_head, head_id, relationship_with_head, saint_name
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const values = [
      code,
      full_name,
      gender,
      date_of_birth || null,
      phone,
      email,
      address,
      churches_id || null,
      occupation,
      marital_status,
      baptism_date || null,
      confirmation_date || null,
      first_communion_date || null,
      status,
      avatar,
      notes,
      final_is_head,
      final_head_id,
      final_relationship,
      saint_name,
    ];

    const [result] = await db.query(sql, values);

    // ================= LOG PARISHIONER =================
    await writeLog({
      admin_id: req.user?.id,
      action: "CREATE_PARISHIONER",
      target_type: "parishioners",
      target_id: result.insertId,
      description: `Khai báo giáo dân mới: ${full_name} (${code})`,
      ip_address: req.ip,
    });

    // ================= NOTIFICATION PARISHIONER =================
    await createNotification({
      type: "PARISHIONER_CREATE",
      title:
        final_is_head === 1 ? "Thêm hộ gia đình mới" : "Thêm thành viên mới",
      content: `${final_is_head === 1 ? "Chủ hộ" : "Thành viên"} "${full_name}" đã được tạo thành công trong hệ thống.`,
      created_by: req.user?.id,
      related_type: "parishioners",
      related_id: result.insertId,
    });

    res.status(201).json({
      success: true,
      message: "Khai báo thành công",
      id: result.insertId,
      code,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. UPDATE (Cập nhật thông tin & quan hệ)
// ==========================================
router.put("/:id", async (req, res) => {
  try {
    const {
      code,
      full_name,
      gender,
      date_of_birth,
      phone,
      email,
      address,
      churches_id,
      occupation,
      marital_status,
      baptism_date,
      confirmation_date,
      first_communion_date,
      status,
      avatar,
      notes,
      is_head,
      head_id,
      saint_name,
      relationship_with_head,
    } = req.body;

    const final_is_head = is_head === 1 ? 1 : 0;
    const final_head_id = final_is_head === 1 ? null : head_id;
    const final_relationship =
      final_is_head === 1 ? "Chủ hộ" : relationship_with_head || "Thành viên";

    const sql = `
      UPDATE parishioners
      SET
        code=?, full_name=?, gender=?, date_of_birth=?, phone=?, email=?,
        address=?, churches_id=?, occupation=?, marital_status=?,
        baptism_date=?, confirmation_date=?, first_communion_date=?,
        status=?, avatar=?, notes=?, is_head=?, head_id=?, relationship_with_head=?, saint_name=?
      WHERE id=?
    `;

    const values = [
      code,
      full_name,
      gender,
      date_of_birth || null,
      phone,
      email,
      address,
      churches_id || null,
      occupation,
      marital_status,
      baptism_date || null,
      confirmation_date || null,
      first_communion_date || null,
      status,
      avatar,
      notes,
      final_is_head,
      final_head_id,
      final_relationship,
      saint_name,
      req.params.id,
    ];

    await db.query(sql, values);
    // ================= LOG PARISHIONER =================
    await writeLog({
      admin_id: req.user?.id,
      action: "UPDATE_PARISHIONER",
      target_type: "parishioners",
      target_id: req.params.id,
      description: `Cập nhật thông tin giáo dân: ${full_name} (${code})`,
      ip_address: req.ip,
    });

    // ================= NOTIFICATION PARISHIONER =================
    await createNotification({
      type: "PARISHIONER_UPDATE",
      title:
        final_is_head === 1 ? "Cập nhật hộ gia đình" : "Cập nhật thành viên",
      content: `${final_is_head === 1 ? "Chủ hộ" : "Thành viên"} "${full_name}" đã được cập nhật thành công trong hệ thống.`,
      created_by: req.user?.id,
      related_type: "parishioners",
      related_id: req.params.id,
    });

    res.json({ success: true, message: "Cập nhật thành công" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. DELETE
// ==========================================
router.delete("/:id", async (req, res) => {
  const parishionerId = req.params.id;

  console.log("Deleting parishioner with ID:", parishionerId);

  try {
    // =====================================================
    // 1. LẤY THÔNG TIN GIÁO DÂN TRƯỚC KHI XÓA
    // =====================================================

    const [rows] = await db.query(
      `
      SELECT
        id,
        full_name,
        code,
        is_head,
        head_id
      FROM parishioners
      WHERE id = ?
      LIMIT 1
      `,
      [parishionerId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo dân cần xóa",
      });
    }

    const parishioner = rows[0];

    const final_is_head = Number(parishioner.is_head) === 1 ? 1 : 0;

    const full_name = parishioner.full_name || "Không rõ tên";

    // =====================================================
    // 2. KIỂM TRA CHỦ HỘ
    // =====================================================

    if (final_is_head === 1) {
      const [members] = await db.query(
        `
        SELECT id, full_name
        FROM parishioners
        WHERE head_id = ?
        `,
        [parishionerId],
      );

      if (members.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Không thể xóa chủ hộ "${full_name}" vì hộ gia đình vẫn còn ${members.length} thành viên.`,
        });
      }
    }

    // =====================================================
    // 3. XÓA GIÁO DÂN
    // =====================================================

    await db.query("DELETE FROM parishioners WHERE id = ?", [parishionerId]);

    // =====================================================
    // 4. GHI LOG
    // =====================================================

    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_PARISHIONER",
      target_type: "parishioners",
      target_id: parishionerId,
      description:
        final_is_head === 1
          ? `Xóa chủ hộ "${full_name}" thành công`
          : `Xóa giáo dân "${full_name}" thành công`,
      ip_address: req.ip,
    });

    // =====================================================
    // 5. TẠO NOTIFICATION
    // =====================================================

    await createNotification({
      type: "PARISHIONER_DELETE",

      title: final_is_head === 1 ? "Xóa hộ gia đình" : "Xóa thành viên",

      content:
        final_is_head === 1
          ? `Chủ hộ "${full_name}" đã được xóa khỏi hệ thống.`
          : `Giáo dân "${full_name}" đã được xóa khỏi hệ thống.`,

      created_by: req.user?.id,

      related_type: "parishioners",

      related_id: parishionerId,
    });

    // =====================================================
    // 6. RESPONSE
    // =====================================================

    return res.json({
      success: true,
      message: "Xóa thành công",
      data: {
        id: parishionerId,
        full_name,
        is_head: final_is_head,
      },
    });
  } catch (error) {
    console.error("❌ Lỗi xóa giáo dân:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
module.exports = router;

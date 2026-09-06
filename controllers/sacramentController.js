const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");

// ==========================================
// 1. GET ALL (SEARCH + FILTER + PAGINATION)
// ==========================================
exports.getAll = async (req, res) => {
  console.log("CALL API");

  try {
    let {
      page = 1,
      limit = 10,
      keyword = "",
      type,
      church_id,
      from_date,
      to_date,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    let params = [];

    // Tìm theo tên/mã giáo dân hoặc tên linh mục
    if (keyword) {
      where += `
        AND (
          p.full_name LIKE ? 
          OR p.code LIKE ?
          OR s.saint_name LIKE ?
          OR s.officiant_name LIKE ?
          OR s.godparent_name LIKE ?
        )
      `;
      params.push(
        `%${keyword}%`,
        `%${keyword}%`,
        `%${keyword}%`,
        `%${keyword}%`,
        `%${keyword}%`,
      );
    }

    if (type) {
      where += " AND s.type = ?";
      params.push(type);
    }

    if (church_id) {
      where += " AND s.church_id = ?";
      params.push(church_id);
    }

    if (from_date) {
      where += " AND s.date_received >= ?";
      params.push(from_date);
    }

    if (to_date) {
      where += " AND s.date_received <= ?";
      params.push(to_date);
    }

    // Đếm tổng số bản ghi
    const countSql = `
      SELECT COUNT(*) as total 
      FROM sacraments s
      JOIN parishioners p ON s.parishioner_id = p.id
      ${where}
    `;
    const [[count]] = await db.query(countSql, params);

    // Lấy danh sách kèm thông tin Giáo dân & Giáo xứ/Họ
    const dataSql = `
      SELECT 
        s.*,
        p.full_name AS parishioner_name,
        p.code AS parishioner_code,
        p.saint_name AS parishioner_saint,
        p.phone AS parishioner_phone,
        c.name AS church_name,
        sp.full_name AS spouse_name,
        sp.saint_name AS spouse_saint
      FROM sacraments s
      JOIN parishioners p ON s.parishioner_id = p.id
      LEFT JOIN churches c ON s.church_id = c.id
      LEFT JOIN parishioners sp ON s.spouse_parishioner_id = sp.id
      ${where}
      ORDER BY s.date_received DESC, s.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(dataSql, [...params, limit, offset]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count.total,
        page,
        limit,
        totalPages: Math.ceil(count.total / limit),
      },
    });
  } catch (err) {
    console.error("GET ALL SACRAMENTS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==========================================
// 2. GET BY PARISHIONER ID (LỊCH SỬ BÍ TÍCH)
// ==========================================
exports.getByParishionerId = async (req, res) => {
  try {
    const { parishioner_id } = req.params;

    const sql = `
      SELECT 
        s.*,
        c.name AS church_name,
        sp.full_name AS spouse_name,
        sp.saint_name AS spouse_saint
      FROM sacraments s
      LEFT JOIN churches c ON s.church_id = c.id
      LEFT JOIN parishioners sp ON s.spouse_parishioner_id = sp.id
      WHERE s.parishioner_id = ?
      ORDER BY s.date_received ASC
    `;

    const [rows] = await db.query(sql, [parishioner_id]);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("GET PARISHIONER SACRAMENTS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==========================================
// 3. GET BY ID (CHI TIẾT IN TRÍCH LỤC)
// ==========================================
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        s.*,
        p.full_name AS parishioner_name,
        p.saint_name AS parishioner_saint,
        p.gender AS parishioner_gender,
        p.date_of_birth AS parishioner_dob,
        p.code AS parishioner_code,
        p.address AS parishioner_address,
        c.name AS church_name,
        c.address AS church_address,
        sp.full_name AS spouse_name,
        sp.saint_name AS spouse_saint
      FROM sacraments s
      JOIN parishioners p ON s.parishioner_id = p.id
      LEFT JOIN churches c ON s.church_id = c.id
      LEFT JOIN parishioners sp ON s.spouse_parishioner_id = sp.id
      WHERE s.id = ?
    `;

    const [rows] = await db.query(sql, [id]);

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy hồ sơ bí tích!" });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("GET SACRAMENT BY ID ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==========================================
// 4. CREATE (KHAI BÁO BÍ TÍCH MỚI)
// ==========================================
exports.create = async (req, res) => {
  try {
    const {
      parishioner_id,
      type,
      date_received,
      saint_name,
      godparent_name,
      godparent_phone,
      godparent_address,
      godparent_church,
      officiant_name,
      church_id,
      church_name_custom,
      book_number,
      page_number,
      entry_number,
      spouse_parishioner_id,
      spouse_custom_name,
      witness_1_name,
      witness_1_phone,
      witness_1_address,
      witness_2_name,
      witness_2_phone,
      witness_2_address,
      notes,
    } = req.body;

    // Validate bắt buộc
    if (!parishioner_id || !type || !date_received) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ Giáo dân, Loại bí tích và Ngày cử hành!",
      });
    }

    const sql = `
      INSERT INTO sacraments (
        parishioner_id, type, date_received, saint_name,
        godparent_name, godparent_phone, godparent_address, godparent_church,
        officiant_name, church_id, church_name_custom,
        book_number, page_number, entry_number,
        spouse_parishioner_id, spouse_custom_name,
        witness_1_name, witness_1_phone, witness_1_address,
        witness_2_name, witness_2_phone, witness_2_address,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      parishioner_id,
      type,
      date_received,
      saint_name || null,
      godparent_name || null,
      godparent_phone || null,
      godparent_address || null,
      godparent_church || null,
      officiant_name || null,
      church_id || null,
      church_name_custom || null,
      book_number || null,
      page_number || null,
      entry_number || null,
      spouse_parishioner_id || null,
      spouse_custom_name || null,
      witness_1_name || null,
      witness_1_phone || null,
      witness_1_address || null,
      witness_2_name || null,
      witness_2_phone || null,
      witness_2_address || null,
      notes || null,
    ];

    const [result] = await db.query(sql, values);
    const newId = result.insertId;

    // 💡 Tự động đồng bộ cập nhật ngày Bí tích tương ứng bên bảng `parishioners`
    try {
      let updateCol = null;
      if (type === "BAPTISM") updateCol = "baptism_date";
      else if (type === "CONFIRMATION") updateCol = "confirmation_date";
      else if (type === "FIRST_COMMUNION") updateCol = "first_communion_date";

      if (updateCol) {
        await db.query(
          `UPDATE parishioners SET ${updateCol} = ? WHERE id = ?`,
          [date_received, parishioner_id],
        );
      }
    } catch (syncErr) {
      console.error("Sync to parishioners error:", syncErr.message);
    }

    // Ghi Log & Thông báo
    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user?.id,
          action: "CREATE_SACRAMENT",
          target_type: "sacraments",
          target_id: newId,
          description: `Thêm bí tích ${type} cho giáo dân ID ${parishioner_id}`,
          ip_address: req.ip,
        });
      }
    } catch (logErr) {
      console.error("Log error:", logErr.message);
    }

    res.json({
      success: true,
      message: "Ghi nhận bí tích thành công!",
      id: newId,
    });
  } catch (err) {
    console.error("CREATE SACRAMENT ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==========================================
// 5. UPDATE (CẬP NHẬT HO SƠ BÍ TÍCH)
// ==========================================
exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      parishioner_id,
      type,
      date_received,
      saint_name,
      godparent_name,
      godparent_phone,
      godparent_address,
      godparent_church,
      officiant_name,
      church_id,
      church_name_custom,
      book_number,
      page_number,
      entry_number,
      spouse_parishioner_id,
      spouse_custom_name,
      witness_1_name,
      witness_1_phone,
      witness_1_address,
      witness_2_name,
      witness_2_phone,
      witness_2_address,
      notes,
    } = req.body;

    const sql = `
      UPDATE sacraments SET
        parishioner_id = ?,
        type = ?,
        date_received = ?,
        saint_name = ?,
        godparent_name = ?,
        godparent_phone = ?,
        godparent_address = ?,
        godparent_church = ?,
        officiant_name = ?,
        church_id = ?,
        church_name_custom = ?,
        book_number = ?,
        page_number = ?,
        entry_number = ?,
        spouse_parishioner_id = ?,
        spouse_custom_name = ?,
        witness_1_name = ?,
        witness_1_phone = ?,
        witness_1_address = ?,
        witness_2_name = ?,
        witness_2_phone = ?,
        witness_2_address = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const values = [
      parishioner_id,
      type,
      date_received,
      saint_name || null,
      godparent_name || null,
      godparent_phone || null,
      godparent_address || null,
      godparent_church || null,
      officiant_name || null,
      church_id || null,
      church_name_custom || null,
      book_number || null,
      page_number || null,
      entry_number || null,
      spouse_parishioner_id || null,
      spouse_custom_name || null,
      witness_1_name || null,
      witness_1_phone || null,
      witness_1_address || null,
      witness_2_name || null,
      witness_2_phone || null,
      witness_2_address || null,
      notes || null,
      id,
    ];

    await db.query(sql, values);

    // Ghi Log
    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user?.id,
          action: "UPDATE_SACRAMENT",
          target_type: "sacraments",
          target_id: id,
          description: `Cập nhật bí tích ID ${id}`,
          ip_address: req.ip,
        });
      }
    } catch (logErr) {}

    res.json({
      success: true,
      message: "Cập nhật hồ sơ bí tích thành công!",
    });
  } catch (err) {
    console.error("UPDATE SACRAMENT ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==========================================
// 6. DELETE (XÓA BÍ TÍCH)
// ==========================================
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query("DELETE FROM sacraments WHERE id = ?", [id]);

    // Ghi Log
    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user?.id,
          action: "DELETE_SACRAMENT",
          target_type: "sacraments",
          target_id: id,
          description: `Xóa hồ sơ bí tích ID ${id}`,
          ip_address: req.ip,
        });
      }
    } catch (logErr) {}

    res.json({
      success: true,
      message: "Xóa hồ sơ bí tích thành công!",
    });
  } catch (err) {
    console.error("DELETE SACRAMENT ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

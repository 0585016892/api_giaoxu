const db = require("../config/db");
const { generateCatechistCode } = require("../utils/generateCode");

// Lấy danh sách Giáo lý viên
exports.getAllCatechists = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM catechists ORDER BY id DESC");
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Lấy chi tiết 1 Giáo lý viên (kèm danh sách lớp đang dạy)
exports.getCatechistById = async (req, res) => {
  try {
    const { id } = req.params;
    const [catechist] = await db.query(
      "SELECT * FROM catechists WHERE id = ?",
      [id],
    );

    if (catechist.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy Giáo lý viên" });
    }

    // Lấy thông tin lớp học được phân công
    const [classes] = await db.query(
      `SELECT cc.*, c.name as class_name
       FROM catechist_classes cc
       JOIN classes c ON cc.class_id = c.id
       WHERE cc.catechist_id = ?`,
      [id],
    );

    res.status(200).json({
      success: true,
      data: { ...catechist[0], classes },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Tạo mới Giáo lý viên (Tự động sinh catechist_code)
exports.createCatechist = async (req, res) => {
  try {
    console.log("========== CREATE CATECHIST ==========");
    console.log("📥 req.body:", req.body);

    const catechistCode = await generateCatechistCode();

    console.log("🔢 Generated catechist code:", catechistCode);

    const {
      holy_name,
      full_name,
      gender,
      date_of_birth,
      phone,
      email,
      address,
      parish,
      diocese,
      baptism_date,
      baptism_place,
      first_communion_date,
      confirmation_date,
      oath_date,
      father_name,
      father_phone,
      mother_name,
      mother_phone,
      level,
      status,
      notes,
    } = req.body;

    const sql = `
      INSERT INTO catechists (
        catechist_code,
        holy_name,
        full_name,
        gender,
        date_of_birth,
        phone,
        email,
        address,
        parish,
        diocese,
        baptism_date,
        baptism_place,
        first_communion_date,
        confirmation_date,
        oath_date,
        father_name,
        father_phone,
        mother_name,
        mother_phone,
        level,
        status,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      catechistCode,
      holy_name || null,
      full_name,
      gender || "Nam",
      date_of_birth || null,
      phone || null,
      email || null,
      address || null,
      parish || null,
      diocese || null,
      baptism_date || null,
      baptism_place || null,
      first_communion_date || null,
      confirmation_date || null,
      oath_date || null,
      father_name || null,
      father_phone || null,
      mother_name || null,
      mother_phone || null,
      level || "Dự bị",
      status || "active",
      notes || null,
    ];

    console.log("📝 SQL:", sql);
    console.log("📦 VALUES:", values);

    const [result] = await db.query(sql, values);

    console.log("✅ Insert thành công!");
    console.log("📊 Result:", result);
    console.log("🆔 Insert ID:", result.insertId);
    console.log("=====================================");

    res.status(201).json({
      success: true,
      message: "Thêm Giáo lý viên thành công",
      data: {
        id: result.insertId,
        catechist_code: catechistCode,
      },
    });
  } catch (error) {
    console.error("❌ CREATE CATECHIST ERROR:");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL Message:", error.sqlMessage);
    console.error("Stack:", error.stack);

    res.status(500).json({
      success: false,
      message: error.message,
      errorCode: error.code,
    });
  }
};

// Cập nhật thông tin Giáo lý viên
exports.updateCatechist = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Bỏ trường catechist_code để không cho thay đổi mã
    delete updateData.catechist_code;

    const sql = "UPDATE catechists SET ? WHERE id = ?";
    await db.query(sql, [updateData, id]);

    res.status(200).json({ success: true, message: "Cập nhật thành công" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Xóa Giáo lý viên
exports.deleteCatechist = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM catechists WHERE id = ?", [id]);
    res
      .status(200)
      .json({ success: true, message: "Xóa Giáo lý viên thành công" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Phân lớp cho Giáo lý viên
exports.assignClass = async (req, res) => {
  try {
    const { catechist_id, class_id, role, status, assigned_date, notes } =
      req.body;

    const sql = `
      INSERT INTO catechist_classes (catechist_id, class_id, role, status, assigned_date, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE role = VALUES(role), status = VALUES(status), notes = VALUES(notes)
    `;

    await db.query(sql, [
      catechist_id,
      class_id,
      role || "Trưởng lớp",
      status || "teaching",
      assigned_date || new Date(),
      notes || null,
    ]);

    res.status(200).json({ success: true, message: "Phân lớp thành công" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

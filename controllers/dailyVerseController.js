const db = require("../config/db");

// =====================================================
// LẤY DANH SÁCH LỜI CHÚA
// GET /api/daily-verses
// =====================================================
exports.getDailyVerses = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        verse_text,
        reference,
        created_at
      FROM daily_verses
      ORDER BY id DESC
    `);

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("GET DAILY VERSES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Lời Chúa",
      error: error.message,
    });
  }
};
// =====================================================
// LẤY 1 CÂU LỜI CHÚA RANDOM
// GET /api/daily-verses/random
// =====================================================
exports.getRandomVerse = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        verse_text,
        reference,
        created_at
      FROM daily_verses
      ORDER BY RAND()
      LIMIT 1
    `);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Chưa có câu Lời Chúa nào",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ getRandomVerse:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
};
// =====================================================
// LẤY CHI TIẾT LỜI CHÚA
// GET /api/daily-verses/:id
// =====================================================
exports.getDailyVerseById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        id,
        verse_text,
        reference,
        created_at
      FROM daily_verses
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Lời Chúa",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("GET DAILY VERSE BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy Lời Chúa",
      error: error.message,
    });
  }
};

// =====================================================
// THÊM LỜI CHÚA
// POST /api/daily-verses
// =====================================================
exports.createDailyVerse = async (req, res) => {
  try {
    const { verse_text, reference } = req.body;

    // -----------------------------
    // Validate
    // -----------------------------
    if (!verse_text || !verse_text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập nội dung Lời Chúa",
      });
    }

    if (!reference || !reference.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tham chiếu Kinh Thánh",
      });
    }

    // -----------------------------
    // Kiểm tra reference trùng
    // -----------------------------
    const [existing] = await db.query(
      `
      SELECT id
      FROM daily_verses
      WHERE reference = ?
      LIMIT 1
      `,
      [reference.trim()],
    );

    // -----------------------------
    // Insert
    // -----------------------------
    const [result] = await db.query(
      `
      INSERT INTO daily_verses (
        verse_text,
        reference
      )
      VALUES (?, ?)
      `,
      [verse_text.trim(), reference.trim()],
    );

    // -----------------------------
    // Lấy lại record vừa tạo
    // -----------------------------
    const [rows] = await db.query(
      `
      SELECT
        id,
        verse_text,
        reference,
        created_at
      FROM daily_verses
      WHERE id = ?
      `,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Thêm Lời Chúa thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("CREATE DAILY VERSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể thêm Lời Chúa",
      error: error.message,
    });
  }
};

// =====================================================
// CẬP NHẬT LỜI CHÚA
// PUT /api/daily-verses/:id
// =====================================================
exports.updateDailyVerse = async (req, res) => {
  try {
    const { id } = req.params;
    const { verse_text, reference } = req.body;

    // -----------------------------
    // Validate
    // -----------------------------
    if (!verse_text || !verse_text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập nội dung Lời Chúa",
      });
    }

    if (!reference || !reference.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tham chiếu Kinh Thánh",
      });
    }

    // -----------------------------
    // Kiểm tra tồn tại
    // -----------------------------
    const [current] = await db.query(
      `
      SELECT id
      FROM daily_verses
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (!current.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Lời Chúa",
      });
    }

    // -----------------------------
    // Kiểm tra reference trùng
    // Không tính chính record đang sửa
    // -----------------------------
    const [existing] = await db.query(
      `
      SELECT id
      FROM daily_verses
      WHERE reference = ?
      AND id <> ?
      LIMIT 1
      `,
      [reference.trim(), id],
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Reference này đã tồn tại",
      });
    }

    // -----------------------------
    // Update
    // -----------------------------
    await db.query(
      `
      UPDATE daily_verses
      SET
        verse_text = ?,
        reference = ?
      WHERE id = ?
      `,
      [verse_text.trim(), reference.trim(), id],
    );

    // -----------------------------
    // Lấy lại record
    // -----------------------------
    const [rows] = await db.query(
      `
      SELECT
        id,
        verse_text,
        reference,
        created_at
      FROM daily_verses
      WHERE id = ?
      `,
      [id],
    );

    return res.json({
      success: true,
      message: "Cập nhật Lời Chúa thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("UPDATE DAILY VERSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật Lời Chúa",
      error: error.message,
    });
  }
};

// =====================================================
// XÓA LỜI CHÚA
// DELETE /api/daily-verses/:id
// =====================================================
exports.deleteDailyVerse = async (req, res) => {
  try {
    const { id } = req.params;

    // -----------------------------
    // Kiểm tra tồn tại
    // -----------------------------
    const [rows] = await db.query(
      `
      SELECT id
      FROM daily_verses
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Lời Chúa",
      });
    }

    // -----------------------------
    // Delete
    // -----------------------------
    await db.query(
      `
      DELETE FROM daily_verses
      WHERE id = ?
      `,
      [id],
    );

    return res.json({
      success: true,
      message: "Xóa Lời Chúa thành công",
    });
  } catch (error) {
    console.error("DELETE DAILY VERSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa Lời Chúa",
      error: error.message,
    });
  }
};

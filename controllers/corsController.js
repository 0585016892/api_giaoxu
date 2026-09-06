const db = require("../config/db");

const {
  reloadCorsOrigins,
  validateOrigin,
  normalizeOrigin,
  getAllowedOrigins,
} = require("../services/cors.service");

// =====================================================
// GET ALL
// GET /api/cors
// =====================================================

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        origin,
        description,
        is_active,
        created_at,
        updated_at
      FROM cors_origins
      ORDER BY id DESC
    `);

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("❌ GET CORS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách CORS",
    });
  }
};

// =====================================================
// GET ACTIVE FROM CACHE
// GET /api/cors/active
// =====================================================

exports.getActive = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: getAllowedOrigins(),
    });
  } catch (error) {
    console.error("❌ GET ACTIVE CORS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách CORS đang hoạt động",
    });
  }
};

// =====================================================
// CREATE
// POST /api/cors
// =====================================================

exports.create = async (req, res) => {
  try {
    const { origin, description, is_active = true } = req.body;

    // ===============================
    // VALIDATE
    // ===============================

    const validation = validateOrigin(origin);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const normalizedOrigin = validation.origin;

    // ===============================
    // CHECK DUPLICATE
    // ===============================

    const [existing] = await db.query(
      `
      SELECT id
      FROM cors_origins
      WHERE origin = ?
      LIMIT 1
      `,
      [normalizedOrigin],
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Domain này đã tồn tại",
      });
    }

    // ===============================
    // INSERT
    // ===============================

    const [result] = await db.query(
      `
      INSERT INTO cors_origins
      (
        origin,
        description,
        is_active
      )
      VALUES (?, ?, ?)
      `,
      [normalizedOrigin, description?.trim() || null, is_active ? 1 : 0],
    );

    // ===============================
    // RELOAD CACHE
    // ===============================

    await reloadCorsOrigins();

    return res.status(201).json({
      success: true,
      message: "Đã thêm domain CORS",
      data: {
        id: result.insertId,
        origin: normalizedOrigin,
        description: description?.trim() || null,
        is_active: is_active ? 1 : 0,
      },
    });
  } catch (error) {
    console.error("❌ CREATE CORS ERROR:", error);

    // MySQL duplicate
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Domain này đã tồn tại",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể thêm domain CORS",
    });
  }
};

// =====================================================
// UPDATE
// PUT /api/cors/:id
// =====================================================

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    const { origin, description, is_active } = req.body;

    // ===============================
    // CHECK ID
    // ===============================

    if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "ID không hợp lệ",
      });
    }

    // ===============================
    // CHECK EXIST
    // ===============================

    const [existing] = await db.query(
      `
      SELECT *
      FROM cors_origins
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy domain",
      });
    }

    // ===============================
    // VALIDATE ORIGIN
    // ===============================

    const validation = validateOrigin(origin);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const normalizedOrigin = validation.origin;

    // ===============================
    // CHECK DUPLICATE
    // ===============================

    const [duplicate] = await db.query(
      `
      SELECT id
      FROM cors_origins
      WHERE origin = ?
      AND id != ?
      LIMIT 1
      `,
      [normalizedOrigin, id],
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Domain này đã tồn tại",
      });
    }

    // ===============================
    // UPDATE
    // ===============================

    await db.query(
      `
      UPDATE cors_origins
      SET
        origin = ?,
        description = ?,
        is_active = ?
      WHERE id = ?
      `,
      [normalizedOrigin, description?.trim() || null, is_active ? 1 : 0, id],
    );

    // ===============================
    // RELOAD CACHE
    // ===============================

    await reloadCorsOrigins();

    return res.json({
      success: true,
      message: "Đã cập nhật domain CORS",
    });
  } catch (error) {
    console.error("❌ UPDATE CORS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật domain CORS",
    });
  }
};

// =====================================================
// TOGGLE
// PATCH /api/cors/:id/toggle
// =====================================================

exports.toggle = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        id,
        origin,
        is_active
      FROM cors_origins
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy domain",
      });
    }

    const current = Boolean(rows[0].is_active);

    const newStatus = current ? 0 : 1;

    await db.query(
      `
      UPDATE cors_origins
      SET is_active = ?
      WHERE id = ?
      `,
      [newStatus, id],
    );

    // ===============================
    // RELOAD CACHE
    // ===============================

    await reloadCorsOrigins();

    return res.json({
      success: true,
      message: newStatus ? "Đã cho phép domain" : "Đã chặn domain",
      data: {
        id: Number(id),
        origin: rows[0].origin,
        is_active: newStatus,
      },
    });
  } catch (error) {
    console.error("❌ TOGGLE CORS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể thay đổi trạng thái domain",
    });
  }
};

// =====================================================
// DELETE
// DELETE /api/cors/:id
// =====================================================

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    // ===============================
    // CHECK EXIST
    // ===============================

    const [rows] = await db.query(
      `
      SELECT id, origin
      FROM cors_origins
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy domain",
      });
    }

    // ===============================
    // DELETE
    // ===============================

    await db.query(
      `
      DELETE FROM cors_origins
      WHERE id = ?
      `,
      [id],
    );

    // ===============================
    // RELOAD CACHE
    // ===============================

    await reloadCorsOrigins();

    return res.json({
      success: true,
      message: "Đã xóa domain CORS",
      data: {
        id: Number(id),
        origin: rows[0].origin,
      },
    });
  } catch (error) {
    console.error("❌ DELETE CORS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa domain CORS",
    });
  }
};

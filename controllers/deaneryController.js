const db = require("../config/db");

/**
 * =========================================================
 * HELPER
 * =========================================================
 */
const normalizeBoolean = (value) => {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }

  return 0;
};

/**
 * =========================================================
 * GET ALL DEANERIES
 *
 * GET /api/deaneries
 *
 * Query:
 * ?diocese_id=8
 * ?is_active=1
 * ?keyword=...
 * =========================================================
 */
exports.getAllDeaneries = async (req, res) => {
  try {
    const { diocese_id, is_active, keyword } = req.query;

    let sql = `
      SELECT
        d.id,
        d.code,
        d.name,
        d.diocese_id,
        d.address,
        d.phone,
        d.email,
        d.is_active,

        gp.code AS diocese_code,
        gp.name AS diocese_name,

        parent.id AS archdiocese_id,
        parent.code AS archdiocese_code,
        parent.name AS archdiocese_name

      FROM deaneries d

      INNER JOIN dioceses gp
        ON gp.id = d.diocese_id

      LEFT JOIN dioceses parent
        ON parent.id = gp.parent_diocese_id

      WHERE 1 = 1
    `;

    const params = [];

    /**
     * FILTER GIÁO PHẬN
     */
    if (diocese_id !== undefined && diocese_id !== null && diocese_id !== "") {
      sql += ` AND d.diocese_id = ?`;
      params.push(diocese_id);
    }

    /**
     * FILTER ACTIVE
     */
    if (is_active !== undefined && is_active !== null && is_active !== "") {
      sql += ` AND d.is_active = ?`;
      params.push(normalizeBoolean(is_active));
    }

    /**
     * SEARCH
     */
    if (keyword && keyword.trim()) {
      sql += `
        AND (
          d.code LIKE ?
          OR d.name LIKE ?
          OR gp.name LIKE ?
        )
      `;

      const search = `%${keyword.trim()}%`;

      params.push(search, search, search);
    }

    sql += `
      ORDER BY
        d.name ASC
    `;

    const [rows] = await db.query(sql, params);

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("[getAllDeaneries] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Giáo hạt",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET DEANERY BY ID
 *
 * GET /api/deaneries/:id
 * =========================================================
 */
exports.getDeaneryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo hạt",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          d.id,
          d.code,
          d.name,
          d.diocese_id,
          d.address,
          d.phone,
          d.email,
          d.is_active,

          gp.code AS diocese_code,
          gp.name AS diocese_name,

          parent.id AS archdiocese_id,
          parent.code AS archdiocese_code,
          parent.name AS archdiocese_name

        FROM deaneries d

        INNER JOIN dioceses gp
          ON gp.id = d.diocese_id

        LEFT JOIN dioceses parent
          ON parent.id = gp.parent_diocese_id

        WHERE d.id = ?

        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo hạt",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("[getDeaneryById] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin Giáo hạt",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET DEANERIES BY DIOCESE
 *
 * GET /api/deaneries/diocese/:dioceseId
 *
 * Dùng cho cascading:
 *
 * Tổng GP
 *     ↓
 * Giáo phận
 *     ↓
 * Giáo hạt
 * =========================================================
 */
exports.getDeaneriesByDiocese = async (req, res) => {
  try {
    const { dioceseId } = req.params;

    if (!dioceseId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo phận",
      });
    }

    /**
     * CHECK GIÁO PHẬN
     */
    const [dioceseRows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          parent_diocese_id,
          type

        FROM dioceses

        WHERE id = ?

        LIMIT 1
      `,
      [dioceseId],
    );

    if (!dioceseRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo phận",
      });
    }

    if (dioceseRows[0].type !== "GIAO_PHAN") {
      return res.status(400).json({
        success: false,
        message: "Giáo hạt phải thuộc một Giáo phận",
      });
    }

    /**
     * LẤY GIÁO HẠT
     */
    const [rows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          diocese_id,
          address,
          phone,
          email,
          is_active

        FROM deaneries

        WHERE diocese_id = ?

        ORDER BY name ASC
      `,
      [dioceseId],
    );

    return res.json({
      success: true,
      diocese: dioceseRows[0],
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("[getDeaneriesByDiocese] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Giáo hạt",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * CREATE DEANERY
 *
 * POST /api/deaneries
 * =========================================================
 */
exports.createDeanery = async (req, res) => {
  try {
    const { code, name, diocese_id, address, phone, email, is_active } =
      req.body;

    /**
     * ===============================
     * VALIDATE
     * ===============================
     */
    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập mã Giáo hạt",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên Giáo hạt",
      });
    }

    if (!diocese_id) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn Giáo phận",
      });
    }

    /**
     * ===============================
     * CHECK DIOCESE
     * ===============================
     */
    const [dioceseRows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          type,
          is_active

        FROM dioceses

        WHERE id = ?

        LIMIT 1
      `,
      [diocese_id],
    );

    if (!dioceseRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo phận",
      });
    }

    if (dioceseRows[0].type !== "GIAO_PHAN") {
      return res.status(400).json({
        success: false,
        message: "Giáo hạt chỉ có thể thuộc Giáo phận",
      });
    }

    /**
     * ===============================
     * CHECK CODE
     * ===============================
     */
    const [codeRows] = await db.query(
      `
        SELECT id
        FROM deaneries
        WHERE code = ?
        LIMIT 1
      `,
      [code.trim()],
    );

    if (codeRows.length) {
      return res.status(409).json({
        success: false,
        message: "Mã Giáo hạt đã tồn tại",
      });
    }

    /**
     * ===============================
     * INSERT
     * ===============================
     */
    const [result] = await db.execute(
      `
        INSERT INTO deaneries (
          code,
          name,
          diocese_id,
          address,
          phone,
          email,
          is_active
        )

        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        code.trim(),
        name.trim(),
        diocese_id,
        address?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        normalizeBoolean(is_active === undefined ? 1 : is_active),
      ],
    );

    /**
     * Lấy lại
     */
    const [rows] = await db.query(
      `
        SELECT
          d.*,

          gp.name AS diocese_name,
          gp.code AS diocese_code

        FROM deaneries d

        INNER JOIN dioceses gp
          ON gp.id = d.diocese_id

        WHERE d.id = ?

        LIMIT 1
      `,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Thêm Giáo hạt thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("[createDeanery] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể thêm Giáo hạt",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * UPDATE DEANERY
 *
 * PUT /api/deaneries/:id
 * =========================================================
 */
exports.updateDeanery = async (req, res) => {
  try {
    const { id } = req.params;

    const { code, name, diocese_id, address, phone, email, is_active } =
      req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo hạt",
      });
    }

    /**
     * ===============================
     * CHECK EXIST
     * ===============================
     */
    const [existingRows] = await db.query(
      `
        SELECT *
        FROM deaneries
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!existingRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo hạt",
      });
    }

    const existing = existingRows[0];

    const finalCode = code !== undefined ? code.trim() : existing.code;

    const finalName = name !== undefined ? name.trim() : existing.name;

    const finalDioceseId =
      diocese_id !== undefined ? diocese_id : existing.diocese_id;

    /**
     * ===============================
     * CHECK DIOCESE
     * ===============================
     */
    const [dioceseRows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          type

        FROM dioceses

        WHERE id = ?

        LIMIT 1
      `,
      [finalDioceseId],
    );

    if (!dioceseRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo phận",
      });
    }

    if (dioceseRows[0].type !== "GIAO_PHAN") {
      return res.status(400).json({
        success: false,
        message: "Giáo hạt chỉ có thể thuộc Giáo phận",
      });
    }

    /**
     * ===============================
     * CHECK CODE
     * ===============================
     */
    const [duplicateRows] = await db.query(
      `
        SELECT id

        FROM deaneries

        WHERE code = ?
          AND id <> ?

        LIMIT 1
      `,
      [finalCode, id],
    );

    if (duplicateRows.length) {
      return res.status(409).json({
        success: false,
        message: "Mã Giáo hạt đã tồn tại",
      });
    }

    /**
     * ===============================
     * UPDATE
     * ===============================
     */
    await db.execute(
      `
        UPDATE deaneries

        SET
          code = ?,
          name = ?,
          diocese_id = ?,
          address = ?,
          phone = ?,
          email = ?,
          is_active = ?

        WHERE id = ?
      `,
      [
        finalCode,
        finalName,
        finalDioceseId,

        address !== undefined ? address?.trim() || null : existing.address,

        phone !== undefined ? phone?.trim() || null : existing.phone,

        email !== undefined ? email?.trim() || null : existing.email,

        is_active !== undefined
          ? normalizeBoolean(is_active)
          : existing.is_active,

        id,
      ],
    );

    /**
     * ===============================
     * GET RESULT
     * ===============================
     */
    const [rows] = await db.query(
      `
        SELECT
          d.*,

          gp.name AS diocese_name,
          gp.code AS diocese_code

        FROM deaneries d

        INNER JOIN dioceses gp
          ON gp.id = d.diocese_id

        WHERE d.id = ?

        LIMIT 1
      `,
      [id],
    );

    return res.json({
      success: true,
      message: "Cập nhật Giáo hạt thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("[updateDeanery] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật Giáo hạt",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * DELETE DEANERY
 *
 * DELETE /api/deaneries/:id
 *
 * Không xóa nếu đang có Giáo xứ sử dụng
 * =========================================================
 */
exports.deleteDeanery = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo hạt",
      });
    }

    await connection.beginTransaction();

    /**
     * ===============================
     * CHECK EXIST
     * ===============================
     */
    const [rows] = await connection.query(
      `
        SELECT *
        FROM deaneries
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo hạt",
      });
    }

    /**
     * ===============================
     * CHECK CHURCHES
     * ===============================
     */
    const [churchRows] = await connection.query(
      `
        SELECT COUNT(*) AS total

        FROM churches

        WHERE deanery_id = ?
      `,
      [id],
    );

    if (Number(churchRows[0].total) > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Không thể xóa Giáo hạt vì vẫn còn Giáo xứ trực thuộc",
        total_churches: Number(churchRows[0].total),
      });
    }

    /**
     * ===============================
     * DELETE
     * ===============================
     */
    await connection.execute(
      `
        DELETE FROM deaneries

        WHERE id = ?
      `,
      [id],
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Xóa Giáo hạt thành công",
      id,
    });
  } catch (error) {
    await connection.rollback();

    console.error("[deleteDeanery] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa Giáo hạt",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

/**
 * =========================================================
 * TOGGLE ACTIVE
 *
 * PATCH /api/deaneries/:id/toggle
 * =========================================================
 */
exports.toggleDeaneryActive = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo hạt",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          id,
          name,
          is_active

        FROM deaneries

        WHERE id = ?

        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo hạt",
      });
    }

    const nextStatus = rows[0].is_active ? 0 : 1;

    await db.execute(
      `
        UPDATE deaneries

        SET is_active = ?

        WHERE id = ?
      `,
      [nextStatus, id],
    );

    return res.json({
      success: true,
      message: nextStatus ? "Đã kích hoạt Giáo hạt" : "Đã khóa Giáo hạt",
      data: {
        id: Number(id),
        is_active: nextStatus,
      },
    });
  } catch (error) {
    console.error("[toggleDeaneryActive] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể thay đổi trạng thái Giáo hạt",
      error: error.message,
    });
  }
};

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
 * GET ALL DIOCESES
 * GET /api/dioceses
 *
 * Query:
 * ?type=GIAO_PHAN
 * ?type=TONG_GIAO_PHAN
 * ?parent_diocese_id=1
 * ?is_active=1
 * =========================================================
 */
exports.getAllDioceses = async (req, res) => {
  try {
    const { type, parent_diocese_id, is_active, keyword } = req.query;

    let sql = `
      SELECT
        d.id,
        d.code,
        d.name,
        d.bishop_name,
        d.address,
        d.phone,
        d.email,
        d.parent_diocese_id,
        d.type,
        d.is_active,

        p.id AS parent_id,
        p.code AS parent_code,
        p.name AS parent_name

      FROM dioceses d

      LEFT JOIN dioceses p
        ON p.id = d.parent_diocese_id

      WHERE 1 = 1
    `;

    const params = [];

    /**
     * TYPE
     */
    if (type) {
      sql += ` AND d.type = ?`;
      params.push(type);
    }

    /**
     * PARENT
     */
    if (
      parent_diocese_id !== undefined &&
      parent_diocese_id !== null &&
      parent_diocese_id !== ""
    ) {
      sql += ` AND d.parent_diocese_id = ?`;
      params.push(parent_diocese_id);
    }

    /**
     * ACTIVE
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
          OR d.bishop_name LIKE ?
        )
      `;

      const search = `%${keyword.trim()}%`;

      params.push(search, search, search);
    }

    sql += `
      ORDER BY
        CASE
          WHEN d.type = 'TONG_GIAO_PHAN' THEN 0
          ELSE 1
        END,
        d.name ASC
    `;

    const [rows] = await db.query(sql, params);

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("[getAllDioceses] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Giáo phận",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET DIOCESE BY ID
 * GET /api/dioceses/:id
 * =========================================================
 */
exports.getDioceseById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo phận",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          d.id,
          d.code,
          d.name,
          d.bishop_name,
          d.address,
          d.phone,
          d.email,
          d.parent_diocese_id,
          d.type,
          d.is_active,

          p.id AS parent_id,
          p.code AS parent_code,
          p.name AS parent_name

        FROM dioceses d

        LEFT JOIN dioceses p
          ON p.id = d.parent_diocese_id

        WHERE d.id = ?

        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo phận",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("[getDioceseById] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin Giáo phận",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET ARCHDIOCESES
 * Tổng Giáo phận
 *
 * GET /api/dioceses/archdioceses
 * =========================================================
 */
exports.getArchdioceses = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        code,
        name,
        bishop_name,
        address,
        phone,
        email,
        parent_diocese_id,
        type,
        is_active

      FROM dioceses

      WHERE type = 'TONG_GIAO_PHAN'

      ORDER BY name ASC
    `);

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("[getArchdioceses] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Tổng Giáo phận",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET DIOCESES BY PARENT
 *
 * GET /api/dioceses/by-parent/:parentDioceseId
 *
 * Ví dụ:
 * Tổng GP Hà Nội id = 1
 *
 * /api/dioceses/by-parent/1
 *
 * => các Giáo phận thuộc Tổng GP Hà Nội
 * =========================================================
 */
exports.getDiocesesByParent = async (req, res) => {
  try {
    const { parentDioceseId } = req.params;

    if (!parentDioceseId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Tổng Giáo phận",
      });
    }

    /**
     * Kiểm tra Tổng Giáo phận
     */
    const [parentRows] = await db.query(
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
      [parentDioceseId],
    );

    if (!parentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Tổng Giáo phận",
      });
    }

    if (parentRows[0].type !== "TONG_GIAO_PHAN") {
      return res.status(400).json({
        success: false,
        message: "ID được chọn không phải Tổng Giáo phận",
      });
    }

    /**
     * Lấy Giáo phận con
     */
    const [rows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          bishop_name,
          address,
          phone,
          email,
          parent_diocese_id,
          type,
          is_active

        FROM dioceses

        WHERE parent_diocese_id = ?
          AND type = 'GIAO_PHAN'

        ORDER BY name ASC
      `,
      [parentDioceseId],
    );

    return res.json({
      success: true,
      parent: parentRows[0],
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("[getDiocesesByParent] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Giáo phận",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * CREATE DIOCESE
 *
 * POST /api/dioceses
 *
 * Body:
 * {
 *   code: "GP_THAI_BINH",
 *   name: "Giáo phận Thái Bình",
 *   bishop_name: "...",
 *   address: "...",
 *   phone: "...",
 *   email: "...",
 *   parent_diocese_id: 1,
 *   type: "GIAO_PHAN",
 *   is_active: 1
 * }
 * =========================================================
 */
exports.createDiocese = async (req, res) => {
  try {
    const {
      code,
      name,
      bishop_name,
      address,
      phone,
      email,
      parent_diocese_id,
      type,
      is_active,
    } = req.body;

    /**
     * ===============================
     * VALIDATE
     * ===============================
     */
    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập mã Giáo phận",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên Giáo phận",
      });
    }

    const finalType = type || "GIAO_PHAN";

    if (!["GIAO_PHAN", "TONG_GIAO_PHAN"].includes(finalType)) {
      return res.status(400).json({
        success: false,
        message: "Loại Giáo phận không hợp lệ",
      });
    }

    /**
     * ===============================
     * QUY TẮC PARENT
     * ===============================
     *
     * Tổng GP:
     * parent_diocese_id = NULL
     *
     * Giáo phận:
     * phải thuộc một Tổng GP
     */
    let finalParentId = null;

    if (finalType === "GIAO_PHAN") {
      if (!parent_diocese_id) {
        return res.status(400).json({
          success: false,
          message: "Giáo phận phải thuộc một Tổng Giáo phận",
        });
      }

      const [parentRows] = await db.query(
        `
          SELECT
            id,
            type,
            name

          FROM dioceses

          WHERE id = ?

          LIMIT 1
        `,
        [parent_diocese_id],
      );

      if (!parentRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy Tổng Giáo phận",
        });
      }

      if (parentRows[0].type !== "TONG_GIAO_PHAN") {
        return res.status(400).json({
          success: false,
          message: "Giáo phận cha phải là Tổng Giáo phận",
        });
      }

      finalParentId = parent_diocese_id;
    }

    /**
     * ===============================
     * CHECK CODE
     * ===============================
     */
    const [codeRows] = await db.query(
      `
        SELECT id
        FROM dioceses
        WHERE code = ?
        LIMIT 1
      `,
      [code.trim()],
    );

    if (codeRows.length) {
      return res.status(409).json({
        success: false,
        message: "Mã Giáo phận đã tồn tại",
      });
    }

    /**
     * ===============================
     * INSERT
     * ===============================
     */
    const [result] = await db.execute(
      `
        INSERT INTO dioceses (
          code,
          name,
          bishop_name,
          address,
          phone,
          email,
          parent_diocese_id,
          type,
          is_active
        )

        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        code.trim(),
        name.trim(),
        bishop_name?.trim() || null,
        address?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        finalParentId,
        finalType,
        normalizeBoolean(is_active === undefined ? 1 : is_active),
      ],
    );

    /**
     * Lấy lại record
     */
    const [rows] = await db.query(
      `
        SELECT
          d.*,

          p.name AS parent_name,
          p.code AS parent_code

        FROM dioceses d

        LEFT JOIN dioceses p
          ON p.id = d.parent_diocese_id

        WHERE d.id = ?

        LIMIT 1
      `,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Thêm Giáo phận thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("[createDiocese] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể thêm Giáo phận",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * UPDATE DIOCESE
 *
 * PUT /api/dioceses/:id
 * =========================================================
 */
exports.updateDiocese = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      code,
      name,
      bishop_name,
      address,
      phone,
      email,
      parent_diocese_id,
      type,
      is_active,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo phận",
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
        FROM dioceses
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!existingRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo phận",
      });
    }

    const existing = existingRows[0];

    const finalCode = code !== undefined ? code.trim() : existing.code;

    const finalName = name !== undefined ? name.trim() : existing.name;

    const finalType = type || existing.type;

    /**
     * ===============================
     * VALIDATE TYPE
     * ===============================
     */
    if (!["GIAO_PHAN", "TONG_GIAO_PHAN"].includes(finalType)) {
      return res.status(400).json({
        success: false,
        message: "Loại Giáo phận không hợp lệ",
      });
    }

    /**
     * ===============================
     * CHECK CODE TRÙNG
     * ===============================
     */
    const [duplicateRows] = await db.query(
      `
        SELECT id
        FROM dioceses

        WHERE code = ?
          AND id <> ?

        LIMIT 1
      `,
      [finalCode, id],
    );

    if (duplicateRows.length) {
      return res.status(409).json({
        success: false,
        message: "Mã Giáo phận đã tồn tại",
      });
    }

    /**
     * ===============================
     * XỬ LÝ PARENT
     * ===============================
     */
    let finalParentId = null;

    if (finalType === "GIAO_PHAN") {
      const parentId =
        parent_diocese_id !== undefined
          ? parent_diocese_id
          : existing.parent_diocese_id;

      if (!parentId) {
        return res.status(400).json({
          success: false,
          message: "Giáo phận phải thuộc một Tổng Giáo phận",
        });
      }

      /**
       * Không được chọn chính nó làm cha
       */
      if (Number(parentId) === Number(id)) {
        return res.status(400).json({
          success: false,
          message: "Giáo phận không thể là cha của chính nó",
        });
      }

      const [parentRows] = await db.query(
        `
          SELECT
            id,
            type,
            name

          FROM dioceses

          WHERE id = ?

          LIMIT 1
        `,
        [parentId],
      );

      if (!parentRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy Tổng Giáo phận",
        });
      }

      if (parentRows[0].type !== "TONG_GIAO_PHAN") {
        return res.status(400).json({
          success: false,
          message: "Giáo phận cha phải là Tổng Giáo phận",
        });
      }

      finalParentId = parentId;
    }

    /**
     * ===============================
     * UPDATE
     * ===============================
     */
    await db.execute(
      `
        UPDATE dioceses

        SET
          code = ?,
          name = ?,
          bishop_name = ?,
          address = ?,
          phone = ?,
          email = ?,
          parent_diocese_id = ?,
          type = ?,
          is_active = ?

        WHERE id = ?
      `,
      [
        finalCode,
        finalName,
        bishop_name !== undefined
          ? bishop_name?.trim() || null
          : existing.bishop_name,

        address !== undefined ? address?.trim() || null : existing.address,

        phone !== undefined ? phone?.trim() || null : existing.phone,

        email !== undefined ? email?.trim() || null : existing.email,

        finalParentId,
        finalType,

        is_active !== undefined
          ? normalizeBoolean(is_active)
          : existing.is_active,

        id,
      ],
    );

    /**
     * Lấy lại dữ liệu
     */
    const [rows] = await db.query(
      `
        SELECT
          d.*,

          p.name AS parent_name,
          p.code AS parent_code

        FROM dioceses d

        LEFT JOIN dioceses p
          ON p.id = d.parent_diocese_id

        WHERE d.id = ?

        LIMIT 1
      `,
      [id],
    );

    return res.json({
      success: true,
      message: "Cập nhật Giáo phận thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("[updateDiocese] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật Giáo phận",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * DELETE DIOCESE
 *
 * DELETE /api/dioceses/:id
 *
 * Không cho xóa nếu:
 * - Có Giáo phận con
 * - Có Giáo hạt
 * - Có Giáo xứ đang tham chiếu
 * =========================================================
 */
exports.deleteDiocese = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo phận",
      });
    }

    await connection.beginTransaction();

    /**
     * ===============================
     * CHECK DIOCESE
     * ===============================
     */
    const [dioceseRows] = await connection.query(
      `
        SELECT *
        FROM dioceses
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!dioceseRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo phận",
      });
    }

    const diocese = dioceseRows[0];

    /**
     * ===============================
     * NẾU LÀ TỔNG GP
     * CHECK GIÁO PHẬN CON
     * ===============================
     */
    if (diocese.type === "TONG_GIAO_PHAN") {
      const [children] = await connection.query(
        `
          SELECT COUNT(*) AS total
          FROM dioceses
          WHERE parent_diocese_id = ?
        `,
        [id],
      );

      if (Number(children[0].total) > 0) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            "Không thể xóa Tổng Giáo phận vì vẫn còn Giáo phận trực thuộc",
          total_children: Number(children[0].total),
        });
      }
    }

    /**
     * ===============================
     * CHECK GIÁO HẠT
     * ===============================
     */
    const [deaneryRows] = await connection.query(
      `
        SELECT COUNT(*) AS total
        FROM deaneries
        WHERE diocese_id = ?
      `,
      [id],
    );

    if (Number(deaneryRows[0].total) > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Không thể xóa Giáo phận vì vẫn còn Giáo hạt trực thuộc",
        total_deaneries: Number(deaneryRows[0].total),
      });
    }

    /**
     * ===============================
     * CHECK GIÁO XỨ
     * ===============================
     */
    const [churchRows] = await connection.query(
      `
        SELECT COUNT(*) AS total
        FROM churches
        WHERE diocese_id = ?
      `,
      [id],
    );

    if (Number(churchRows[0].total) > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Không thể xóa Giáo phận vì vẫn còn Giáo xứ trực thuộc",
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
        DELETE FROM dioceses
        WHERE id = ?
      `,
      [id],
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Xóa Giáo phận thành công",
      id,
    });
  } catch (error) {
    await connection.rollback();

    console.error("[deleteDiocese] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa Giáo phận",
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
 * PATCH /api/dioceses/:id/toggle
 * =========================================================
 */
exports.toggleDioceseActive = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID Giáo phận",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          id,
          name,
          is_active

        FROM dioceses

        WHERE id = ?

        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo phận",
      });
    }

    const nextStatus = rows[0].is_active ? 0 : 1;

    await db.execute(
      `
        UPDATE dioceses

        SET is_active = ?

        WHERE id = ?
      `,
      [nextStatus, id],
    );

    return res.json({
      success: true,
      message: nextStatus ? "Đã kích hoạt Giáo phận" : "Đã khóa Giáo phận",
      data: {
        id: Number(id),
        is_active: nextStatus,
      },
    });
  } catch (error) {
    console.error("[toggleDioceseActive] ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể thay đổi trạng thái Giáo phận",
      error: error.message,
    });
  }
};

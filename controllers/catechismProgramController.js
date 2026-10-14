// controllers/catechismProgramController.js

const db = require("../config/db");

// ============================================================
// CONSTANTS
// ============================================================

const TARGET_TYPES = ["children", "youth", "adult", "catechumen", "all"];

const PROGRAM_STATUSES = ["active", "inactive", "archived"];

// ============================================================
// HELPERS
// ============================================================

const log = (...args) => {
  console.log("[CATECHISM_PROGRAM]", ...args);
};

const sendSuccess = (res, message, data = null, extra = {}) => {
  return res.status(200).json({
    success: true,
    message,
    data,
    ...extra,
  });
};

const sendError = (res, statusCode, message, errorCode = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
  });
};

const parsePositiveInt = (value, defaultValue = null) => {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    return defaultValue;
  }

  return number;
};

const normalizeText = (value) => {
  if (typeof value !== "string") return null;

  const text = value.trim();

  return text.length ? text : null;
};

const normalizeCode = (value) => {
  const code = normalizeText(value);

  if (!code) return null;

  return code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
};

const isValidTargetType = (value) => TARGET_TYPES.includes(value);

const isValidStatus = (value) => PROGRAM_STATUSES.includes(value);

const validateProgram = (data) => {
  const errors = [];

  if (typeof data.code !== "string" || !normalizeCode(data.code)) {
    errors.push("Mã chương trình không được để trống.");
  } else if (normalizeCode(data.code).length > 100) {
    errors.push("Mã chương trình không được vượt quá 100 ký tự.");
  }

  if (typeof data.name !== "string" || !normalizeText(data.name)) {
    errors.push("Tên chương trình không được để trống.");
  } else if (normalizeText(data.name).length > 255) {
    errors.push("Tên chương trình không được vượt quá 255 ký tự.");
  }

  if (
    data.description !== undefined &&
    data.description !== null &&
    typeof data.description !== "string"
  ) {
    errors.push("Mô tả chương trình không hợp lệ.");
  }

  if (!isValidTargetType(data.target_type)) {
    errors.push(`Đối tượng học phải thuộc: ${TARGET_TYPES.join(", ")}.`);
  }

  const duration = Number(data.duration_years);

  if (!Number.isInteger(duration) || duration < 1 || duration > 255) {
    errors.push("Thời lượng phải là số nguyên từ 1 đến 255 năm.");
  }

  const sortOrder = Number(data.sort_order);

  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < -2147483648 ||
    sortOrder > 2147483647
  ) {
    errors.push("Thứ tự hiển thị không hợp lệ.");
  }

  if (!isValidStatus(data.status)) {
    errors.push(`Trạng thái phải thuộc: ${PROGRAM_STATUSES.join(", ")}.`);
  }

  return errors;
};

// ============================================================
// 1. GET /api/catechism-programs
// Lấy danh sách, tìm kiếm, lọc trạng thái, phân trang
// ============================================================

exports.getAllPrograms = async (req, res) => {
  try {
    const keyword = normalizeText(req.query.search) || "";
    const status = req.query.status || "";
    const targetType = req.query.target_type || "";

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);

    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
      return sendError(res, 400, "Thông tin phân trang không hợp lệ.");
    }

    if (status && !isValidStatus(status)) {
      return sendError(res, 400, "Trạng thái lọc không hợp lệ.");
    }

    if (targetType && !isValidTargetType(targetType)) {
      return sendError(res, 400, "Đối tượng học không hợp lệ.");
    }

    const conditions = [];
    const params = [];

    if (keyword) {
      conditions.push("(name LIKE ? OR code LIKE ? OR description LIKE ?)");

      const searchValue = `%${keyword}%`;

      params.push(searchValue, searchValue, searchValue);
    }

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }

    if (targetType) {
      conditions.push("target_type = ?");
      params.push(targetType);
    }

    const whereSql = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    log("GET ALL", {
      search: keyword,
      status,
      targetType,
      page,
      limit,
    });

    const [countRows] = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM catechism_programs
        ${whereSql}
      `,
      params,
    );

    const total = Number(countRows[0].total);

    const [rows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          description,
          target_type,
          duration_years,
          sort_order,
          status,
          created_at,
          updated_at
        FROM catechism_programs
        ${whereSql}
        ORDER BY sort_order ASC, id ASC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return sendSuccess(
      res,
      "Lấy danh sách chương trình giáo lý thành công.",
      rows,
      {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    );
  } catch (error) {
    console.error("[CATECHISM_PROGRAM] getAllPrograms error:", error);

    return sendError(
      res,
      500,
      "Lỗi máy chủ khi lấy danh sách chương trình giáo lý.",
    );
  }
};

// ============================================================
// 2. GET /api/catechism-programs/:id
// Chi tiết chương trình
// ============================================================

exports.getProgramById = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);

    if (!id) {
      return sendError(res, 400, "ID chương trình không hợp lệ.");
    }

    const [rows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          description,
          target_type,
          duration_years,
          sort_order,
          status,
          created_at,
          updated_at
        FROM catechism_programs
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return sendError(res, 404, "Không tìm thấy chương trình giáo lý.");
    }

    return sendSuccess(res, "Lấy chi tiết chương trình thành công.", rows[0]);
  } catch (error) {
    console.error("[CATECHISM_PROGRAM] getProgramById error:", error);

    return sendError(res, 500, "Lỗi máy chủ khi lấy chi tiết chương trình.");
  }
};

// ============================================================
// 3. POST /api/catechism-programs
// Tạo chương trình mới
// ============================================================

exports.createProgram = async (req, res) => {
  try {
    const payload = {
      code: normalizeCode(req.body.code),
      name: normalizeText(req.body.name),
      description:
        req.body.description === undefined ? null : req.body.description,
      target_type: req.body.target_type || "all",
      duration_years:
        req.body.duration_years === undefined
          ? 1
          : Number(req.body.duration_years),
      sort_order:
        req.body.sort_order === undefined ? 0 : Number(req.body.sort_order),
      status: req.body.status || "active",
    };

    const errors = validateProgram(payload);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu chương trình không hợp lệ.",
        errors,
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO catechism_programs (
          code,
          name,
          description,
          target_type,
          duration_years,
          sort_order,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.code,
        payload.name,
        payload.description,
        payload.target_type,
        payload.duration_years,
        payload.sort_order,
        payload.status,
      ],
    );

    log("CREATED", {
      id: result.insertId,
      code: payload.code,
      name: payload.name,
    });

    const [rows] = await db.query(
      `
        SELECT *
        FROM catechism_programs
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Tạo chương trình giáo lý thành công.",
      data: rows[0],
    });
  } catch (error) {
    console.error("[CATECHISM_PROGRAM] createProgram error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "Mã chương trình đã tồn tại.",
        "DUPLICATE_PROGRAM_CODE",
      );
    }

    return sendError(res, 500, "Lỗi máy chủ khi tạo chương trình giáo lý.");
  }
};

// ============================================================
// 4. PUT /api/catechism-programs/:id
// Cập nhật chương trình
// Cho phép gửi đầy đủ hoặc chỉ các trường cần sửa
// ============================================================

exports.updateProgram = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);

    if (!id) {
      return sendError(res, 400, "ID chương trình không hợp lệ.");
    }

    const [existingRows] = await db.query(
      `
        SELECT *
        FROM catechism_programs
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!existingRows.length) {
      return sendError(res, 404, "Không tìm thấy chương trình giáo lý.");
    }

    const existing = existingRows[0];
    const body = req.body || {};

    const payload = {
      code: body.code !== undefined ? normalizeCode(body.code) : existing.code,

      name: body.name !== undefined ? normalizeText(body.name) : existing.name,

      description:
        body.description !== undefined
          ? body.description
          : existing.description,

      target_type:
        body.target_type !== undefined
          ? body.target_type
          : existing.target_type,

      duration_years:
        body.duration_years !== undefined
          ? Number(body.duration_years)
          : Number(existing.duration_years),

      sort_order:
        body.sort_order !== undefined
          ? Number(body.sort_order)
          : Number(existing.sort_order),

      status: body.status !== undefined ? body.status : existing.status,
    };

    const errors = validateProgram(payload);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu cập nhật không hợp lệ.",
        errors,
      });
    }

    await db.query(
      `
        UPDATE catechism_programs
        SET
          code = ?,
          name = ?,
          description = ?,
          target_type = ?,
          duration_years = ?,
          sort_order = ?,
          status = ?
        WHERE id = ?
      `,
      [
        payload.code,
        payload.name,
        payload.description,
        payload.target_type,
        payload.duration_years,
        payload.sort_order,
        payload.status,
        id,
      ],
    );

    const [updatedRows] = await db.query(
      `
        SELECT *
        FROM catechism_programs
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    log("UPDATED", {
      id,
      code: payload.code,
      name: payload.name,
    });

    return sendSuccess(
      res,
      "Cập nhật chương trình giáo lý thành công.",
      updatedRows[0],
    );
  } catch (error) {
    console.error("[CATECHISM_PROGRAM] updateProgram error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "Mã chương trình đã tồn tại.",
        "DUPLICATE_PROGRAM_CODE",
      );
    }

    return sendError(
      res,
      500,
      "Lỗi máy chủ khi cập nhật chương trình giáo lý.",
    );
  }
};

// ============================================================
// 5. PATCH /api/catechism-programs/:id/status
// Thay đổi trạng thái nhanh
// ============================================================

exports.updateProgramStatus = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    const { status } = req.body || {};

    if (!id) {
      return sendError(res, 400, "ID chương trình không hợp lệ.");
    }

    if (!isValidStatus(status)) {
      return sendError(res, 400, "Trạng thái không hợp lệ.");
    }

    const [result] = await db.query(
      `
        UPDATE catechism_programs
        SET status = ?
        WHERE id = ?
      `,
      [status, id],
    );

    if (!result.affectedRows) {
      return sendError(res, 404, "Không tìm thấy chương trình giáo lý.");
    }

    const [rows] = await db.query(
      `
        SELECT *
        FROM catechism_programs
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    log("STATUS UPDATED", { id, status });

    return sendSuccess(
      res,
      "Cập nhật trạng thái chương trình thành công.",
      rows[0],
    );
  } catch (error) {
    console.error("[CATECHISM_PROGRAM] updateProgramStatus error:", error);

    return sendError(res, 500, "Lỗi máy chủ khi cập nhật trạng thái.");
  }
};

// ============================================================
// 6. DELETE /api/catechism-programs/:id
// Xóa chương trình
// ============================================================

exports.deleteProgram = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);

    if (!id) {
      return sendError(res, 400, "ID chương trình không hợp lệ.");
    }

    const [existingRows] = await db.query(
      `
        SELECT id, code, name
        FROM catechism_programs
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!existingRows.length) {
      return sendError(res, 404, "Không tìm thấy chương trình giáo lý.");
    }

    await db.query(
      `
        DELETE FROM catechism_programs
        WHERE id = ?
      `,
      [id],
    );

    log("DELETED", existingRows[0]);

    return sendSuccess(
      res,
      "Xóa chương trình giáo lý thành công.",
      existingRows[0],
    );
  } catch (error) {
    console.error("[CATECHISM_PROGRAM] deleteProgram error:", error);

    if (
      error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_ROW_IS_REFERENCED"
    ) {
      return sendError(
        res,
        409,
        "Không thể xóa chương trình vì đang được dữ liệu khác sử dụng.",
        "PROGRAM_IN_USE",
      );
    }

    return sendError(res, 500, "Lỗi máy chủ khi xóa chương trình giáo lý.");
  }
};

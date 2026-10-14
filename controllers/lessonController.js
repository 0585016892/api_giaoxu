"use strict";

const db = require("../config/db");

/**
 * ============================================================
 * LESSON CONTROLLER
 * ============================================================
 * Bảng chương trình: catechism_programs
 * Bảng bài học:      lessons
 *
 * Luồng mới:
 * - Không sử dụng catechism_type để tạo/sửa/lọc bài học.
 * - Bài học được phân loại bằng program_id.
 * - catechism_programs là bảng chương trình dùng chung.
 * - lessons được phân tách dữ liệu theo church_id.
 * ============================================================
 */

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function logInfo(message, data = null) {
  console.log(`[LESSON API] ${message}`, data ?? "");
}

function logError(message, error) {
  console.error(`[LESSON API] ${message}`, {
    message: error?.message,
    code: error?.code,
    errno: error?.errno,
    sqlMessage: error?.sqlMessage,
    sql: error?.sql,
  });
}

function getChurchId(req) {
  const rawChurchId =
    req.user?.church_id ??
    req.user?.parish_id ??
    req.admin?.church_id ??
    req.admin?.parish_id;

  const churchId = Number(rawChurchId);

  return Number.isInteger(churchId) && churchId > 0 ? churchId : null;
}

function parseId(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function escapeLike(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function sendServerError(res, message, error) {
  logError(message, error);

  return res.status(500).json({
    success: false,
    message: "Đã xảy ra lỗi máy chủ khi xử lý bài học",
  });
}

/**
 * ------------------------------------------------------------
 * VALIDATE PROGRAM
 * ------------------------------------------------------------
 *
 * Hàm độc lập, không phụ thuộc this.
 * Tránh lỗi:
 * Cannot read properties of undefined (reading 'validateProgram')
 * ------------------------------------------------------------
 */

async function validateProgram(programId) {
  const id = parseId(programId);

  if (!id) {
    return {
      valid: false,
      status: 400,
      message: "Vui lòng chọn chương trình giáo lý hợp lệ",
    };
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
        status
      FROM catechism_programs
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  const program = rows[0] || null;

  if (!program) {
    return {
      valid: false,
      status: 400,
      message: "Chương trình giáo lý không tồn tại",
    };
  }

  if (program.status !== "active") {
    return {
      valid: false,
      status: 400,
      message: "Chương trình giáo lý đã ngừng hoạt động",
    };
  }

  return {
    valid: true,
    program,
  };
}

/**
 * ------------------------------------------------------------
 * GET ALL LESSONS
 * ------------------------------------------------------------
 *
 * GET /lessons?page=1&limit=20&search=&program_id=
 *
 * Chỉ trả bài học thuộc giáo xứ của người đăng nhập.
 * ------------------------------------------------------------
 */

async function getAll(req, res) {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ của tài khoản",
      });
    }

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 20), 100);
    const offset = (page - 1) * limit;

    const search = cleanText(req.query.search ?? req.query.q ?? "");

    const rawProgramId = req.query.program_id;
    const programId =
      rawProgramId !== undefined && rawProgramId !== ""
        ? parseId(rawProgramId)
        : null;

    if (rawProgramId !== undefined && rawProgramId !== "" && !programId) {
      return res.status(400).json({
        success: false,
        message: "Mã chương trình giáo lý không hợp lệ",
      });
    }

    const conditions = ["l.church_id = ?"];
    const params = [churchId];

    if (programId) {
      conditions.push("l.program_id = ?");
      params.push(programId);
    }

    if (search) {
      conditions.push("l.title LIKE ?");
      params.push(`%${escapeLike(search)}%`);
    }

    const whereClause = conditions.join(" AND ");

    const [countRows] = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM lessons l
        WHERE ${whereClause}
      `,
      params,
    );

    const total = Number(countRows[0]?.total || 0);

    const [rows] = await db.query(
      `
        SELECT
          l.id,
          l.church_id,
          l.program_id,
          l.title,
          l.created_at,
          l.updated_at,
          p.code AS program_code,
          p.name AS program_name,
          p.target_type AS program_target_type
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        WHERE ${whereClause}
        ORDER BY
          p.sort_order ASC,
          l.title ASC,
          l.id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách bài học thành công",
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendServerError(res, "Lỗi lấy danh sách bài học", error);
  }
}

/**
 * ------------------------------------------------------------
 * GET LESSON BY ID
 * ------------------------------------------------------------
 *
 * GET /lessons/:id
 * ------------------------------------------------------------
 */

async function getById(req, res) {
  try {
    const churchId = getChurchId(req);
    const lessonId = parseId(req.params.id);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ của tài khoản",
      });
    }

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "ID bài học không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          l.id,
          l.church_id,
          l.program_id,
          l.title,
          l.created_at,
          l.updated_at,
          p.code AS program_code,
          p.name AS program_name,
          p.description AS program_description,
          p.target_type AS program_target_type,
          p.duration_years AS program_duration_years
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        WHERE l.id = ?
          AND l.church_id = ?
        LIMIT 1
      `,
      [lessonId, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài học trong giáo xứ của bạn",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lấy thông tin bài học thành công",
      data: rows[0],
    });
  } catch (error) {
    return sendServerError(res, "Lỗi lấy thông tin bài học", error);
  }
}

/**
 * ------------------------------------------------------------
 * CREATE LESSON
 * ------------------------------------------------------------
 *
 * POST /lessons
 *
 * Body:
 * {
 *   "title": "Bài học 1",
 *   "program_id": 1
 * }
 * ------------------------------------------------------------
 */

async function create(req, res) {
  try {
    const churchId = getChurchId(req);
    const title = cleanText(req.body?.title);
    const programId = parseId(req.body?.program_id);

    logInfo("Bắt đầu thêm bài học", {
      churchId,
      title,
      programId,
      userId: req.user?.id ?? req.admin?.id ?? null,
    });

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ của tài khoản",
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên bài học",
      });
    }

    if (title.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Tên bài học không được vượt quá 255 ký tự",
      });
    }

    if (!programId) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn chương trình giáo lý",
      });
    }

    // Không dùng this.validateProgram.
    const validation = await validateProgram(programId);

    if (!validation.valid) {
      return res.status(validation.status).json({
        success: false,
        message: validation.message,
      });
    }

    // Không cho tạo bài trùng tên trong cùng giáo xứ và chương trình.
    const [duplicates] = await db.query(
      `
        SELECT id
        FROM lessons
        WHERE church_id = ?
          AND program_id = ?
          AND LOWER(TRIM(title)) = LOWER(TRIM(?))
        LIMIT 1
      `,
      [churchId, programId, title],
    );

    if (duplicates.length) {
      return res.status(409).json({
        success: false,
        message: "Bài học này đã tồn tại trong chương trình giáo lý đã chọn",
        duplicate_id: duplicates[0].id,
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO lessons (
          church_id,
          program_id,
          title
        )
        VALUES (?, ?, ?)
      `,
      [churchId, programId, title],
    );

    const lessonId = result.insertId;

    const [rows] = await db.query(
      `
        SELECT
          l.id,
          l.church_id,
          l.program_id,
          l.title,
          l.created_at,
          l.updated_at,
          p.code AS program_code,
          p.name AS program_name,
          p.target_type AS program_target_type
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        WHERE l.id = ?
          AND l.church_id = ?
        LIMIT 1
      `,
      [lessonId, churchId],
    );

    logInfo("Thêm bài học thành công", {
      lessonId,
      churchId,
      programId,
    });

    return res.status(201).json({
      success: true,
      message: "Thêm bài học thành công",
      data: rows[0] || {
        id: lessonId,
        church_id: churchId,
        program_id: programId,
        title,
      },
    });
  } catch (error) {
    // Trường hợp có unique index trong DB và hai request đồng thời.
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Bài học đã tồn tại hoặc bị trùng dữ liệu",
      });
    }

    return sendServerError(res, "Lỗi thêm bài học", error);
  }
}

/**
 * ------------------------------------------------------------
 * UPDATE LESSON
 * ------------------------------------------------------------
 *
 * PUT /lessons/:id
 *
 * Body:
 * {
 *   "title": "Tên bài học mới",
 *   "program_id": 1
 * }
 *
 * Hỗ trợ cập nhật một phần: nếu không gửi program_id,
 * chương trình hiện tại sẽ được giữ nguyên.
 * ------------------------------------------------------------
 */

async function update(req, res) {
  try {
    const churchId = getChurchId(req);
    const lessonId = parseId(req.params.id);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ của tài khoản",
      });
    }

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "ID bài học không hợp lệ",
      });
    }

    const [currentRows] = await db.query(
      `
        SELECT id, church_id, program_id, title
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [lessonId, churchId],
    );

    if (!currentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài học trong giáo xứ của bạn",
      });
    }

    const current = currentRows[0];

    const titleProvided = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "title",
    );

    const programProvided = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "program_id",
    );

    const title = titleProvided ? cleanText(req.body.title) : current.title;

    const programId = programProvided
      ? parseId(req.body.program_id)
      : parseId(current.program_id);

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Tên bài học không được để trống",
      });
    }

    if (title.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Tên bài học không được vượt quá 255 ký tự",
      });
    }

    if (!programId) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn chương trình giáo lý hợp lệ",
      });
    }

    const validation = await validateProgram(programId);

    if (!validation.valid) {
      return res.status(validation.status).json({
        success: false,
        message: validation.message,
      });
    }

    const [duplicates] = await db.query(
      `
        SELECT id
        FROM lessons
        WHERE church_id = ?
          AND program_id = ?
          AND LOWER(TRIM(title)) = LOWER(TRIM(?))
          AND id <> ?
        LIMIT 1
      `,
      [churchId, programId, title, lessonId],
    );

    if (duplicates.length) {
      return res.status(409).json({
        success: false,
        message: "Tên bài học đã được sử dụng trong chương trình này",
        duplicate_id: duplicates[0].id,
      });
    }

    await db.query(
      `
        UPDATE lessons
        SET
          title = ?,
          program_id = ?
        WHERE id = ?
          AND church_id = ?
      `,
      [title, programId, lessonId, churchId],
    );

    const [updatedRows] = await db.query(
      `
        SELECT
          l.id,
          l.church_id,
          l.program_id,
          l.title,
          l.created_at,
          l.updated_at,
          p.code AS program_code,
          p.name AS program_name,
          p.target_type AS program_target_type
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        WHERE l.id = ?
          AND l.church_id = ?
        LIMIT 1
      `,
      [lessonId, churchId],
    );

    logInfo("Cập nhật bài học thành công", {
      lessonId,
      churchId,
      programId,
    });

    return res.status(200).json({
      success: true,
      message: "Cập nhật bài học thành công",
      data: updatedRows[0],
    });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Bài học đã tồn tại hoặc bị trùng dữ liệu",
      });
    }

    return sendServerError(res, "Lỗi cập nhật bài học", error);
  }
}

/**
 * ------------------------------------------------------------
 * DELETE LESSON
 * ------------------------------------------------------------
 *
 * DELETE /lessons/:id
 *
 * Chỉ xóa bài học của đúng giáo xứ.
 * ------------------------------------------------------------
 */

async function deleteLesson(req, res) {
  try {
    const churchId = getChurchId(req);
    const lessonId = parseId(req.params.id);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ của tài khoản",
      });
    }

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "ID bài học không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
        SELECT id, title
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [lessonId, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài học trong giáo xứ của bạn",
      });
    }

    await db.query(
      `
        DELETE FROM lessons
        WHERE id = ?
          AND church_id = ?
      `,
      [lessonId, churchId],
    );

    logInfo("Xóa bài học thành công", {
      lessonId,
      churchId,
      title: rows[0].title,
    });

    return res.status(200).json({
      success: true,
      message: "Xóa bài học thành công",
      data: {
        id: lessonId,
      },
    });
  } catch (error) {
    if (
      error?.code === "ER_ROW_IS_REFERENCED_2" ||
      error?.code === "ER_ROW_IS_REFERENCED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Không thể xóa bài học vì đang được dữ liệu khác tham chiếu. Hãy kiểm tra các bảng liên quan trước khi xóa.",
      });
    }

    return sendServerError(res, "Lỗi xóa bài học", error);
  }
}

/**
 * ------------------------------------------------------------
 * GET PROGRAMS
 * ------------------------------------------------------------
 *
 * GET /lessons/programs
 *
 * Lấy chương trình giáo lý đang hoạt động.
 * Bảng catechism_programs không có church_id.
 * ------------------------------------------------------------
 */

async function getPrograms(req, res) {
  try {
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
        WHERE status = 'active'
        ORDER BY sort_order ASC, id ASC
      `,
    );

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách chương trình giáo lý thành công",
      data: rows,
    });
  } catch (error) {
    return sendServerError(
      res,
      "Lỗi lấy danh sách chương trình giáo lý",
      error,
    );
  }
}

/**
 * ------------------------------------------------------------
 * BACKWARD COMPATIBILITY
 * ------------------------------------------------------------
 *
 * Giữ tên getTypes để route cũ không bị lỗi nếu vẫn tham chiếu.
 * Dữ liệu trả về là chương trình giáo lý, không phải catechism_type.
 * ------------------------------------------------------------
 */

async function getTypes(req, res) {
  return getPrograms(req, res);
}

/**
 * ------------------------------------------------------------
 * EXPORT
 * ------------------------------------------------------------
 *
 * Các hàm độc lập không phụ thuộc this nên có thể truyền trực tiếp
 * cho Express mà không bị lỗi mất ngữ cảnh.
 * ------------------------------------------------------------
 */

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteLesson,
  deleteLesson,
  getPrograms,
  getTypes,
};

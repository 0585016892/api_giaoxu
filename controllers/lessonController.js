const db = require("../config/db");

// =========================================================
// HELPERS
// =========================================================

const getChurchId = (req) => {
  const rawChurchId = req.user?.church_id ?? req.user?.parish_id;
  const churchId = Number(rawChurchId);

  if (
    rawChurchId === undefined ||
    rawChurchId === null ||
    rawChurchId === "" ||
    !Number.isSafeInteger(churchId) ||
    churchId <= 0
  ) {
    return null;
  }

  return churchId;
};

const isValidId = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return false;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0;
};

const cleanText = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const parsePagination = (query = {}) => {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);

  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const limit =
    Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 10;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

const sendServerError = (res, message, error) => {
  console.error(`[LESSON API] ${message}:`, error);

  return res.status(500).json({
    success: false,
    message,
    error: error.message,
  });
};

// =========================================================
// LESSON CONTROLLER
// =========================================================

class LessonController {
  // =======================================================
  // HELPER: LẤY CHƯƠNG TRÌNH GIÁO LÝ
  //
  // catechism_programs là bảng dùng chung.
  // Không lọc church_id ở bảng này vì bảng không có cột đó.
  // =======================================================

  async findProgram(programId) {
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
      [programId],
    );

    return rows[0] || null;
  }

  // =======================================================
  // HELPER: KIỂM TRA CHƯƠNG TRÌNH CÓ THỂ SỬ DỤNG
  // =======================================================

  async validateProgram(programId) {
    if (!isValidId(programId)) {
      return {
        valid: false,
        status: 400,
        message: "Vui lòng chọn chương trình giáo lý hợp lệ",
      };
    }

    const program = await this.findProgram(Number(programId));

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

  // =======================================================
  // GET /lessons
  //
  // Query:
  // ?page=1&limit=10
  // ?search=Khai tâm
  // ?program_id=1
  // =======================================================

  async getAll(req, res) {
    try {
      const churchId = getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      const { page, limit, offset } = parsePagination(req.query);
      const search = cleanText(req.query.search);
      const programId = req.query.program_id;

      const conditions = ["l.church_id = ?"];
      const params = [churchId];

      if (search) {
        conditions.push("l.title LIKE ?");
        params.push(`%${search}%`);
      }

      if (programId !== undefined && programId !== "") {
        if (!isValidId(programId)) {
          return res.status(400).json({
            success: false,
            message: "ID chương trình giáo lý không hợp lệ",
          });
        }

        conditions.push("l.program_id = ?");
        params.push(Number(programId));
      }

      const whereClause = `WHERE ${conditions.join(" AND ")}`;

      // Tổng số bài học
      const [countRows] = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM lessons l
        ${whereClause}
        `,
        params,
      );

      const total = Number(countRows[0]?.total || 0);

      // Danh sách bài học
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
          p.name AS program_name
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        ${whereClause}
        ORDER BY l.id DESC
        LIMIT ?
        OFFSET ?
        `,
        [...params, limit, offset],
      );

      return res.json({
        success: true,
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

  // =======================================================
  // GET /lessons/:id
  // =======================================================

  async getById(req, res) {
    try {
      const churchId = getChurchId(req);
      const lessonId = req.params.id;

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      if (!isValidId(lessonId)) {
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
          p.name AS program_name
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        WHERE l.id = ?
          AND l.church_id = ?
        LIMIT 1
        `,
        [Number(lessonId), churchId],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học trong giáo xứ của bạn",
        });
      }

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      return sendServerError(res, "Lỗi lấy chi tiết bài học", error);
    }
  }

  // =======================================================
  // POST /lessons
  //
  // Body:
  // {
  //   "title": "Bài học 1",
  //   "program_id": 1
  // }
  // =======================================================

  async create(req, res) {
    try {
      const churchId = getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      const title = cleanText(req.body?.title);
      const programId = req.body?.program_id;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Tên bài học không được bỏ trống",
        });
      }

      if (title.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Tên bài học không được vượt quá 255 ký tự",
        });
      }

      const validation = await this.validateProgram(programId);

      if (!validation.valid) {
        return res.status(validation.status).json({
          success: false,
          message: validation.message,
        });
      }

      const normalizedProgramId = Number(programId);

      console.log("[CREATE LESSON]", {
        churchId,
        programId: normalizedProgramId,
        title,
      });

      // Kiểm tra trùng trong cùng giáo xứ và chương trình.
      const [existingRows] = await db.query(
        `
        SELECT id, title
        FROM lessons
        WHERE church_id = ?
          AND program_id = ?
          AND LOWER(TRIM(title)) = LOWER(TRIM(?))
        LIMIT 1
        `,
        [churchId, normalizedProgramId, title],
      );

      if (existingRows.length) {
        return res.status(409).json({
          success: false,
          message: "Bài học này đã tồn tại trong chương trình đã chọn",
          existingId: existingRows[0].id,
        });
      }

      // Không ghi catechism_type vào luồng tạo mới.
      // Cột cũ được giữ nguyên để bảo toàn dữ liệu hiện tại.
      const [result] = await db.query(
        `
        INSERT INTO lessons (
          church_id,
          program_id,
          title
        )
        VALUES (?, ?, ?)
        `,
        [churchId, normalizedProgramId, title],
      );

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
          p.name AS program_name
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        WHERE l.id = ?
          AND l.church_id = ?
        LIMIT 1
        `,
        [result.insertId, churchId],
      );

      console.log("[CREATE LESSON SUCCESS]", {
        lessonId: result.insertId,
        churchId,
        programId: normalizedProgramId,
      });

      return res.status(201).json({
        success: true,
        message: "Thêm bài học thành công",
        data: rows[0],
      });
    } catch (error) {
      return sendServerError(res, "Lỗi thêm bài học", error);
    }
  }

  // =======================================================
  // PUT /lessons/:id
  //
  // Body:
  // {
  //   "title": "Tên bài học mới",
  //   "program_id": 1
  // }
  // =======================================================

  async update(req, res) {
    try {
      const churchId = getChurchId(req);
      const lessonId = req.params.id;

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      if (!isValidId(lessonId)) {
        return res.status(400).json({
          success: false,
          message: "ID bài học không hợp lệ",
        });
      }

      const title = cleanText(req.body?.title);
      const programId = req.body?.program_id;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Tên bài học không được bỏ trống",
        });
      }

      if (title.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Tên bài học không được vượt quá 255 ký tự",
        });
      }

      // Xác nhận bài học thuộc giáo xứ hiện tại.
      const [lessonRows] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [Number(lessonId), churchId],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học trong giáo xứ của bạn",
        });
      }

      const validation = await this.validateProgram(programId);

      if (!validation.valid) {
        return res.status(validation.status).json({
          success: false,
          message: validation.message,
        });
      }

      const normalizedProgramId = Number(programId);

      // Không cho trùng tên trong cùng chương trình.
      const [duplicateRows] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE church_id = ?
          AND program_id = ?
          AND LOWER(TRIM(title)) = LOWER(TRIM(?))
          AND id <> ?
        LIMIT 1
        `,
        [churchId, normalizedProgramId, title, Number(lessonId)],
      );

      if (duplicateRows.length) {
        return res.status(409).json({
          success: false,
          message: "Tên bài học đã tồn tại trong chương trình này",
          existingId: duplicateRows[0].id,
        });
      }

      await db.query(
        `
        UPDATE lessons
        SET
          program_id = ?,
          title = ?
        WHERE id = ?
          AND church_id = ?
        `,
        [normalizedProgramId, title, Number(lessonId), churchId],
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
          p.name AS program_name
        FROM lessons l
        LEFT JOIN catechism_programs p
          ON p.id = l.program_id
        WHERE l.id = ?
          AND l.church_id = ?
        LIMIT 1
        `,
        [Number(lessonId), churchId],
      );

      console.log("[UPDATE LESSON SUCCESS]", {
        lessonId: Number(lessonId),
        churchId,
        programId: normalizedProgramId,
      });

      return res.json({
        success: true,
        message: "Cập nhật bài học thành công",
        data: updatedRows[0],
      });
    } catch (error) {
      return sendServerError(res, "Lỗi cập nhật bài học", error);
    }
  }

  // =======================================================
  // DELETE /lessons/:id
  // =======================================================

  async delete(req, res) {
    try {
      const churchId = getChurchId(req);
      const lessonId = req.params.id;

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      if (!isValidId(lessonId)) {
        return res.status(400).json({
          success: false,
          message: "ID bài học không hợp lệ",
        });
      }

      const [lessonRows] = await db.query(
        `
        SELECT id, title
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [Number(lessonId), churchId],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học trong giáo xứ của bạn",
        });
      }

      // Nếu có khóa ngoại từ questions, MySQL sẽ từ chối xóa.
      const [result] = await db.query(
        `
        DELETE FROM lessons
        WHERE id = ?
          AND church_id = ?
        `,
        [Number(lessonId), churchId],
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Bài học không còn tồn tại hoặc không thể xóa",
        });
      }

      console.log("[DELETE LESSON SUCCESS]", {
        lessonId: Number(lessonId),
        churchId,
      });

      return res.json({
        success: true,
        message: "Xóa bài học thành công",
        id: Number(lessonId),
      });
    } catch (error) {
      console.error("[DELETE LESSON ERROR]", error);

      if (
        error.code === "ER_ROW_IS_REFERENCED_2" ||
        error.code === "ER_ROW_IS_REFERENCED"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Không thể xóa bài học vì vẫn còn câu hỏi hoặc dữ liệu khác đang tham chiếu bài học này",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Lỗi xóa bài học",
        error: error.message,
      });
    }
  }

  // =======================================================
  // GET /lessons/programs
  // Danh sách chương trình dùng cho Select ở frontend.
  // =======================================================

  async getPrograms(req, res) {
    try {
      const churchId = getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
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
        WHERE status = 'active'
        ORDER BY sort_order ASC, id ASC
        `,
      );

      return res.json({
        success: true,
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

  // =======================================================
  // COMPATIBILITY
  //
  // Giữ handler này nếu routes cũ vẫn gọi getTypes.
  // Trả về danh sách chương trình thay cho các loại cũ.
  // Nên chuyển frontend sang getPrograms rồi bỏ route /types.
  // =======================================================

  async getTypes(req, res) {
    try {
      const churchId = getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      const [rows] = await db.query(
        `
        SELECT id, code, name
        FROM catechism_programs
        WHERE status = 'active'
        ORDER BY sort_order ASC, id ASC
        `,
      );

      return res.json({
        success: true,
        data: rows.map((program) => ({
          id: program.id,
          code: program.code,
          name: program.name,
          value: program.id,
          label: program.name,
        })),
      });
    } catch (error) {
      return sendServerError(
        res,
        "Lỗi lấy danh sách chương trình giáo lý",
        error,
      );
    }
  }
}

module.exports = new LessonController();

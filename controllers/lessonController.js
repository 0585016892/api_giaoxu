const db = require("../config/db");

// =========================================================
// HELPERS
// =========================================================

const getChurchId = (req) => {
  const churchId = Number(req.user?.church_id || req.user?.parish_id);

  return Number.isInteger(churchId) && churchId > 0 ? churchId : null;
};

const isValidId = (id) => {
  const number = Number(id);
  return Number.isInteger(number) && number > 0;
};

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 10),
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

// =========================================================
// CONTROLLER
// =========================================================

class LessonController {
  // =======================================================
  // GET /lessons
  // Hỗ trợ:
  // ?page=1&limit=10&search=...&program_id=1
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
        conditions.push(`
          (
            l.title LIKE ?
            OR CAST(l.id AS CHAR) LIKE ?
            OR CAST(l.program_id AS CHAR) LIKE ?
          )
        `);

        const keyword = `%${search}%`;
        params.push(keyword, keyword, keyword);
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

      const [countRows] = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM lessons l
        ${whereClause}
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
          l.updated_at
        FROM lessons l
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
      console.error("GET LESSONS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi lấy danh sách bài học",
        error: error.message,
      });
    }
  }

  // =======================================================
  // GET /lessons/:id
  // =======================================================

  async getById(req, res) {
    try {
      const churchId = getChurchId(req);
      const lessonId = Number(req.params.id);

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
          l.updated_at
        FROM lessons l
        WHERE l.id = ?
          AND l.church_id = ?
        LIMIT 1
        `,
        [lessonId, churchId],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      console.error("GET LESSON DETAIL ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi lấy thông tin bài học",
        error: error.message,
      });
    }
  }

  // =======================================================
  // POST /lessons
  // Body: { title, program_id }
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
      const programId = Number(req.body?.program_id);

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Tên bài học không được bỏ trống",
        });
      }

      if (!isValidId(programId)) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn chương trình giáo lý",
        });
      }

      // Kiểm tra chương trình thuộc đúng giáo xứ.
      const [programRows] = await db.query(
        `
        SELECT id
        FROM catechism_programs
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [programId, churchId],
      );

      if (!programRows.length) {
        return res.status(400).json({
          success: false,
          message:
            "Chương trình giáo lý không tồn tại hoặc không thuộc giáo xứ của bạn",
        });
      }

      // Chống trùng tên bài học trong cùng chương trình.
      const [existingRows] = await db.query(
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

      if (existingRows.length) {
        return res.status(409).json({
          success: false,
          message: "Bài học này đã tồn tại trong chương trình đã chọn",
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

      const [rows] = await db.query(
        `
        SELECT id, church_id, program_id, title, created_at, updated_at
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [result.insertId, churchId],
      );

      return res.status(201).json({
        success: true,
        message: "Thêm bài học thành công",
        data: rows[0],
      });
    } catch (error) {
      console.error("CREATE LESSON ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi thêm bài học",
        error: error.message,
      });
    }
  }

  // =======================================================
  // PUT /lessons/:id
  // Body: { title, program_id }
  // =======================================================

  async update(req, res) {
    try {
      const churchId = getChurchId(req);
      const lessonId = Number(req.params.id);

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
      const programId = Number(req.body?.program_id);

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Tên bài học không được bỏ trống",
        });
      }

      if (!isValidId(programId)) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn chương trình giáo lý",
        });
      }

      const [lessonRows] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [lessonId, churchId],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học trong giáo xứ của bạn",
        });
      }

      const [programRows] = await db.query(
        `
        SELECT id
        FROM catechism_programs
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [programId, churchId],
      );

      if (!programRows.length) {
        return res.status(400).json({
          success: false,
          message: "Chương trình giáo lý không hợp lệ",
        });
      }

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
        [churchId, programId, title, lessonId],
      );

      if (duplicateRows.length) {
        return res.status(409).json({
          success: false,
          message: "Tên bài học đã tồn tại trong chương trình này",
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
        [programId, title, lessonId, churchId],
      );

      const [rows] = await db.query(
        `
        SELECT id, church_id, program_id, title, created_at, updated_at
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [lessonId, churchId],
      );

      return res.json({
        success: true,
        message: "Cập nhật bài học thành công",
        data: rows[0],
      });
    } catch (error) {
      console.error("UPDATE LESSON ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi cập nhật bài học",
        error: error.message,
      });
    }
  }

  // =======================================================
  // DELETE /lessons/:id
  // =======================================================

  async delete(req, res) {
    try {
      const churchId = getChurchId(req);
      const lessonId = Number(req.params.id);

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
        SELECT id
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [lessonId, churchId],
      );

      if (!lessonRows.length) {
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

      return res.json({
        success: true,
        message: "Xóa bài học thành công",
        id: lessonId,
      });
    } catch (error) {
      console.error("DELETE LESSON ERROR:", error);

      if (
        error.code === "ER_ROW_IS_REFERENCED_2" ||
        error.code === "ER_ROW_IS_REFERENCED"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Không thể xóa bài học vì vẫn còn câu hỏi hoặc dữ liệu khác tham chiếu bài học này",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Lỗi xóa bài học",
        error: error.message,
      });
    }
  }
}

module.exports = new LessonController();

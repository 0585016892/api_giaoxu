const db = require("../config/db");

// =========================================================
// DANH SÁCH LOẠI GIÁO LÝ
// =========================================================

const ALLOWED_CATECHISM_TYPES = [
  "khai_tam",
  "den_ban_tiec_thanh",
  "lon_len_trong_chua_thanh",
  "song_dao",
  "vao_doi",
  "huynh_truong",
  "hon_nhan",
  "du_tong",
  "nguoi_lon",
  "kinh_thanh",
  "mua_chay",
  "mua_he",
];

const CATECHISM_TYPE_LABELS = {
  khai_tam: "Giáo lý Khai Tâm",
  den_ban_tiec_thanh: "Giáo lý Đến Bàn Tiệc Thánh",
  lon_len_trong_chua_thanh: "Giáo lý Lớn Lên Trong Chúa Thánh Thần",
  song_dao: "Giáo lý Sống Đạo",
  vao_doi: "Giáo lý Vào Đời",
  huynh_truong: "Giáo lý Huynh Trưởng",
  hon_nhan: "Giáo lý Hôn Nhân",
  du_tong: "Giáo lý Dự Tòng",
  nguoi_lon: "Giáo lý Người Lớn",
  kinh_thanh: "Lớp Kinh Thánh",
  mua_chay: "Giáo lý Mùa Chay",
  mua_he: "Giáo lý Mùa Hè",
};

// =========================================================
// HELPER
// =========================================================

const getChurchId = (req) => {
  const churchId = Number(req.user?.church_id || req.user?.parish_id);

  if (!churchId || Number.isNaN(churchId)) {
    return null;
  }

  return churchId;
};

const getCatechismLabel = (type) => {
  return CATECHISM_TYPE_LABELS[type] || type;
};

const isValidId = (id) => {
  const number = Number(id);

  return Number.isInteger(number) && number > 0;
};

// =========================================================
// CONTROLLER
// =========================================================

class LessonController {
  // =======================================================
  // GET /lessons
  // Chỉ lấy lesson của giáo xứ hiện tại
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

      const page = Math.max(1, Number(req.query.page) || 1);

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

      const offset = (page - 1) * limit;

      const search = String(req.query.search || "").trim();

      const catechismType = String(req.query.catechism_type || "").trim();

      // ===================================================
      // CONDITIONS
      // ===================================================

      const conditions = ["l.church_id = ?"];

      const queryParams = [churchId];

      // ===================================================
      // SEARCH
      // ===================================================

      if (search) {
        conditions.push(`
          (
            l.title LIKE ?
            OR c.name LIKE ?
          )
        `);

        queryParams.push(`%${search}%`, `%${search}%`);
      }

      // ===================================================
      // CATECHISM TYPE
      // ===================================================

      if (catechismType) {
        if (!ALLOWED_CATECHISM_TYPES.includes(catechismType)) {
          return res.status(400).json({
            success: false,
            message: "Loại giáo lý không hợp lệ",
            allowedTypes: ALLOWED_CATECHISM_TYPES,
          });
        }

        conditions.push("l.catechism_type = ?");

        queryParams.push(catechismType);
      }

      const whereClause = `
        WHERE ${conditions.join(" AND ")}
      `;

      // ===================================================
      // TOTAL
      // ===================================================

      const [countRows] = await db.query(
        `
        SELECT COUNT(*) AS total

        FROM lessons l

        LEFT JOIN churches c
          ON c.id = l.church_id

        ${whereClause}
        `,
        queryParams,
      );

      const total = Number(countRows[0]?.total || 0);

      // ===================================================
      // DATA
      // ===================================================

      const [rows] = await db.query(
        `
        SELECT
          l.id,
          l.church_id,
          l.title,
          l.catechism_type,
          l.created_at,
          l.updated_at,

          c.name AS church_name

        FROM lessons l

        LEFT JOIN churches c
          ON c.id = l.church_id

        ${whereClause}

        ORDER BY l.id ASC

        LIMIT ?
        OFFSET ?
        `,
        [...queryParams, limit, offset],
      );

      const data = rows.map((lesson) => ({
        ...lesson,

        catechism_type_label: getCatechismLabel(lesson.catechism_type),

        can_edit: true,
        can_delete: true,
      }));

      return res.json({
        success: true,

        data,

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
          l.title,
          l.catechism_type,
          l.created_at,
          l.updated_at,

          c.name AS church_name

        FROM lessons l

        LEFT JOIN churches c
          ON c.id = l.church_id

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

      const lesson = rows[0];

      return res.json({
        success: true,

        data: {
          ...lesson,

          catechism_type_label: getCatechismLabel(lesson.catechism_type),

          can_edit: true,
          can_delete: true,
        },
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

      const { title, catechism_type } = req.body;
      console.log(title, catechism_type);

      // ===================================================
      // VALIDATE TITLE
      // ===================================================

      const cleanTitle = title;

      if (!cleanTitle) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không được bỏ trống",
        });
      }

      // ===================================================
      // TYPE
      // ===================================================

      const type = String(catechism_type || "").trim() || "du_tong";

      if (!ALLOWED_CATECHISM_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Loại giáo lý không hợp lệ",

          allowedTypes: ALLOWED_CATECHISM_TYPES.map((value) => ({
            value,
            label: CATECHISM_TYPE_LABELS[value],
          })),
        });
      }

      // ===================================================
      // CHECK DUPLICATE
      // Chỉ kiểm tra trong giáo xứ hiện tại
      // ===================================================

      const [exist] = await db.query(
        `
        SELECT id

        FROM lessons

        WHERE church_id = ?
          AND title = ?
          AND catechism_type = ?

        LIMIT 1
        `,
        [churchId, cleanTitle, type],
      );

      if (exist.length) {
        return res.status(409).json({
          success: false,
          message: "Giáo xứ đã có bài học này trong bộ giáo lý này",
        });
      }

      // ===================================================
      // INSERT
      // ===================================================

      const [result] = await db.query(
        `
        INSERT INTO lessons (
          church_id,
          title,
          catechism_type
        )

        VALUES (?, ?, ?)
        `,
        [churchId, cleanTitle, type],
      );

      return res.status(201).json({
        success: true,

        id: result.insertId,

        message: "Thêm bài học thành công",

        data: {
          id: result.insertId,
          church_id: churchId,
          title: cleanTitle,
          catechism_type: type,

          catechism_type_label: getCatechismLabel(type),

          can_edit: true,
          can_delete: true,
        },
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

      const { title, catechism_type } = req.body;

      // ===================================================
      // CHECK OWNERSHIP
      // ===================================================

      const [lessonRows] = await db.query(
        `
          SELECT
            id,
            church_id,
            title,
            catechism_type

          FROM lessons

          WHERE id = ?

          LIMIT 1
          `,
        [lessonId],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      const currentLesson = lessonRows[0];

      if (Number(currentLesson.church_id) !== Number(churchId)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa bài học này",
        });
      }

      // ===================================================
      // VALIDATE
      // ===================================================

      const cleanTitle = String(title || "").trim();

      if (!cleanTitle) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không được bỏ trống",
        });
      }

      const type =
        String(catechism_type || "").trim() ||
        currentLesson.catechism_type ||
        "du_tong";

      if (!ALLOWED_CATECHISM_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Loại giáo lý không hợp lệ",

          allowedTypes: ALLOWED_CATECHISM_TYPES,
        });
      }

      // ===================================================
      // DUPLICATE
      // ===================================================

      const [exist] = await db.query(
        `
        SELECT id

        FROM lessons

        WHERE church_id = ?
          AND title = ?
          AND catechism_type = ?
          AND id != ?

        LIMIT 1
        `,
        [churchId, cleanTitle, type, lessonId],
      );

      if (exist.length) {
        return res.status(409).json({
          success: false,
          message: "Giáo xứ đã có bài học này trong bộ giáo lý này",
        });
      }

      // ===================================================
      // UPDATE
      // ===================================================

      const [result] = await db.query(
        `
        UPDATE lessons

        SET
          title = ?,
          catechism_type = ?

        WHERE id = ?
          AND church_id = ?
        `,
        [cleanTitle, type, lessonId, churchId],
      );

      if (!result.affectedRows) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa bài học này",
        });
      }

      return res.json({
        success: true,

        message: "Cập nhật bài học thành công",

        data: {
          id: lessonId,
          church_id: churchId,
          title: cleanTitle,
          catechism_type: type,

          catechism_type_label: getCatechismLabel(type),

          can_edit: true,
          can_delete: true,
        },
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

      // ===================================================
      // CHECK OWNERSHIP
      // ===================================================

      const [lessonRows] = await db.query(
        `
          SELECT
            id,
            church_id,
            title

          FROM lessons

          WHERE id = ?

          LIMIT 1
          `,
        [lessonId],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      if (Number(lessonRows[0].church_id) !== Number(churchId)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xóa bài học này",
        });
      }

      // ===================================================
      // DELETE
      // ===================================================

      const [result] = await db.query(
        `
        DELETE FROM lessons

        WHERE id = ?
          AND church_id = ?
        `,
        [lessonId, churchId],
      );

      if (!result.affectedRows) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xóa bài học này",
        });
      }

      return res.json({
        success: true,

        message: "Xóa bài học thành công",

        id: lessonId,
      });
    } catch (error) {
      console.error("DELETE LESSON ERROR:", error);

      // Có question đang tham chiếu
      if (
        error.code === "ER_ROW_IS_REFERENCED_2" ||
        error.code === "ER_ROW_IS_REFERENCED"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Không thể xóa bài học vì đang có câu hỏi liên kết với bài học này",
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
  // GET /lessons/types
  // =======================================================

  async getTypes(req, res) {
    try {
      const types = ALLOWED_CATECHISM_TYPES.map((value) => ({
        value,
        label: CATECHISM_TYPE_LABELS[value],
      }));

      return res.json({
        success: true,
        data: types,
      });
    } catch (error) {
      console.error("GET LESSON TYPES ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi lấy danh sách loại giáo lý",
        error: error.message,
      });
    }
  }
}

module.exports = new LessonController();

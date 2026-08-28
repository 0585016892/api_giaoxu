const db = require("../config/db");

// =====================================================
// CÁC LOẠI GIÁO LÝ ĐƯỢC PHÉP
// =====================================================
const ALLOWED_CATECHISM_TYPES = [
  "du_tong",
  "hon_nhan",
  "thanh_them_suc",
  "ruoc_le",
  "vao_dao",
];

// =====================================================
// LABEL HIỂN THỊ
// =====================================================
const CATECHISM_TYPE_LABELS = {
  du_tong: "Giáo lý Dự Tòng",
  hon_nhan: "Giáo lý Hôn Nhân",
  thanh_them_suc: "Giáo lý Thêm Sức",
  ruoc_le: "Giáo lý Rước Lễ",
  vao_dao: "Giáo lý Vào Đạo",
};

class LessonController {
  // =====================================================
  // GET ALL
  // GET /api/lessons
  //
  // Query:
  // ?page=1
  // ?limit=10
  // ?search=thiên chúa
  // ?catechism_type=du_tong
  // =====================================================
  async getAll(req, res) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.max(1, Number(req.query.limit) || 10);
      const offset = (page - 1) * limit;

      const search = req.query.search?.trim() || "";
      const catechismType = req.query.catechism_type?.trim() || "";

      // -------------------------------------------------
      // BUILD WHERE
      // -------------------------------------------------
      const conditions = [];
      const queryParams = [];

      if (search) {
        conditions.push("title LIKE ?");
        queryParams.push(`%${search}%`);
      }

      if (catechismType) {
        if (!ALLOWED_CATECHISM_TYPES.includes(catechismType)) {
          return res.status(400).json({
            success: false,
            message: "Loại giáo lý không hợp lệ",
            allowedTypes: ALLOWED_CATECHISM_TYPES,
          });
        }

        conditions.push("catechism_type = ?");
        queryParams.push(catechismType);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // -------------------------------------------------
      // COUNT
      // -------------------------------------------------
      const [countResult] = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM lessons
        ${whereClause}
        `,
        queryParams,
      );

      const total = Number(countResult[0]?.total || 0);

      // -------------------------------------------------
      // GET DATA
      // -------------------------------------------------
      const [rows] = await db.query(
        `
        SELECT
          id,
          title,
          catechism_type,
          created_at,
          updated_at
        FROM lessons
        ${whereClause}
        ORDER BY id ASC
        LIMIT ? OFFSET ?
        `,
        [...queryParams, limit, offset],
      );

      // -------------------------------------------------
      // FORMAT DATA
      // -------------------------------------------------
      const data = rows.map((lesson) => ({
        ...lesson,
        catechism_type_label:
          CATECHISM_TYPE_LABELS[lesson.catechism_type] || lesson.catechism_type,
      }));

      res.json({
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

      res.status(500).json({
        success: false,
        message: "Lỗi lấy danh sách bài học",
        error: error.message,
      });
    }
  }

  // =====================================================
  // GET DETAIL
  // GET /api/lessons/:id
  // =====================================================
  async getById(req, res) {
    try {
      const { id } = req.params;

      const [rows] = await db.query(
        `
        SELECT
          id,
          title,
          catechism_type,
          created_at,
          updated_at
        FROM lessons
        WHERE id = ?
        `,
        [id],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      const lesson = rows[0];

      res.json({
        success: true,
        data: {
          ...lesson,
          catechism_type_label:
            CATECHISM_TYPE_LABELS[lesson.catechism_type] ||
            lesson.catechism_type,
        },
      });
    } catch (error) {
      console.error("GET LESSON DETAIL ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Lỗi lấy thông tin bài học",
        error: error.message,
      });
    }
  }

  // =====================================================
  // CREATE
  // POST /api/lessons
  //
  // Body:
  // {
  //   "title": "Bài 1: Thiên Chúa là Cha",
  //   "catechism_type": "du_tong"
  // }
  // =====================================================
  async create(req, res) {
    try {
      const { title, catechism_type } = req.body;

      // -------------------------------------------------
      // VALIDATE TITLE
      // -------------------------------------------------
      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không được bỏ trống",
        });
      }

      const cleanTitle = title.trim();

      // -------------------------------------------------
      // TYPE
      // -------------------------------------------------
      const type = catechism_type?.trim() || "du_tong";

      if (!ALLOWED_CATECHISM_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Loại giáo lý không hợp lệ",
          allowedTypes: ALLOWED_CATECHISM_TYPES,
        });
      }

      // -------------------------------------------------
      // CHECK DUPLICATE
      // -------------------------------------------------
      const [exist] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE title = ?
          AND catechism_type = ?
        LIMIT 1
        `,
        [cleanTitle, type],
      );

      if (exist.length) {
        return res.status(400).json({
          success: false,
          message: "Bài học đã tồn tại trong loại giáo lý này",
        });
      }

      // -------------------------------------------------
      // INSERT
      // -------------------------------------------------
      const [result] = await db.query(
        `
        INSERT INTO lessons (
          title,
          catechism_type
        )
        VALUES (?, ?)
        `,
        [cleanTitle, type],
      );

      res.status(201).json({
        success: true,
        id: result.insertId,
        message: "Thêm bài học thành công",
        data: {
          id: result.insertId,
          title: cleanTitle,
          catechism_type: type,
          catechism_type_label: CATECHISM_TYPE_LABELS[type],
        },
      });
    } catch (error) {
      console.error("CREATE LESSON ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Lỗi thêm bài học",
        error: error.message,
      });
    }
  }

  // =====================================================
  // UPDATE
  // PUT /api/lessons/:id
  //
  // Body:
  // {
  //   "title": "Bài 1: Thiên Chúa là Cha",
  //   "catechism_type": "du_tong"
  // }
  // =====================================================
  async update(req, res) {
    try {
      const { id } = req.params;
      const { title, catechism_type } = req.body;

      // -------------------------------------------------
      // CHECK ID
      // -------------------------------------------------
      if (!id || isNaN(Number(id))) {
        return res.status(400).json({
          success: false,
          message: "ID bài học không hợp lệ",
        });
      }

      // -------------------------------------------------
      // CHECK LESSON EXIST
      // -------------------------------------------------
      const [lessonRows] = await db.query(
        `
        SELECT
          id,
          title,
          catechism_type
        FROM lessons
        WHERE id = ?
        LIMIT 1
        `,
        [id],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      const currentLesson = lessonRows[0];

      // -------------------------------------------------
      // VALIDATE TITLE
      // -------------------------------------------------
      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không được bỏ trống",
        });
      }

      const cleanTitle = title.trim();

      // -------------------------------------------------
      // TYPE
      // Nếu không gửi type => giữ type cũ
      // -------------------------------------------------
      const type =
        catechism_type?.trim() || currentLesson.catechism_type || "du_tong";

      if (!ALLOWED_CATECHISM_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Loại giáo lý không hợp lệ",
          allowedTypes: ALLOWED_CATECHISM_TYPES,
        });
      }

      // -------------------------------------------------
      // CHECK DUPLICATE
      // -------------------------------------------------
      const [exist] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE title = ?
          AND catechism_type = ?
          AND id != ?
        LIMIT 1
        `,
        [cleanTitle, type, id],
      );

      if (exist.length) {
        return res.status(400).json({
          success: false,
          message: "Bài học đã tồn tại trong loại giáo lý này",
        });
      }

      // -------------------------------------------------
      // UPDATE
      // -------------------------------------------------
      await db.query(
        `
        UPDATE lessons
        SET
          title = ?,
          catechism_type = ?
        WHERE id = ?
        `,
        [cleanTitle, type, id],
      );

      res.json({
        success: true,
        message: "Cập nhật bài học thành công",
        data: {
          id: Number(id),
          title: cleanTitle,
          catechism_type: type,
          catechism_type_label: CATECHISM_TYPE_LABELS[type],
        },
      });
    } catch (error) {
      console.error("UPDATE LESSON ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Lỗi cập nhật bài học",
        error: error.message,
      });
    }
  }

  // =====================================================
  // DELETE
  // DELETE /api/lessons/:id
  // =====================================================
  async delete(req, res) {
    try {
      const { id } = req.params;

      // -------------------------------------------------
      // CHECK LESSON EXIST
      // -------------------------------------------------
      const [lesson] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE id = ?
        `,
        [id],
      );

      if (!lesson.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      // -------------------------------------------------
      // DELETE
      // -------------------------------------------------
      const [result] = await db.query(
        `
        DELETE FROM lessons
        WHERE id = ?
        `,
        [id],
      );

      if (!result.affectedRows) {
        return res.status(400).json({
          success: false,
          message: "Không thể xóa bài học",
        });
      }

      res.json({
        success: true,
        message: "Xóa bài học thành công",
        id: Number(id),
      });
    } catch (error) {
      console.error("DELETE LESSON ERROR:", error);

      // Nếu lesson đang được question tham chiếu
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

      res.status(500).json({
        success: false,
        message: "Lỗi xóa bài học",
        error: error.message,
      });
    }
  }

  // =====================================================
  // GET CATECHISM TYPES
  // GET /api/lessons/types
  // =====================================================
  async getTypes(req, res) {
    try {
      const types = ALLOWED_CATECHISM_TYPES.map((value) => ({
        value,
        label: CATECHISM_TYPE_LABELS[value],
      }));

      res.json({
        success: true,
        data: types,
      });
    } catch (error) {
      console.error("GET LESSON TYPES ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Lỗi lấy danh sách loại giáo lý",
        error: error.message,
      });
    }
  }
}

module.exports = new LessonController();

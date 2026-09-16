const db = require("../config/db");

// =====================================================
// CÁC BỘ GIÁO LÝ ĐƯỢC PHÉP
// =====================================================

const ALLOWED_CATECHISM_TYPES = [
  "khai_tam",
  "den_ban_tiec_thanh",
  "lon_len_trong_chua_thanh_than",
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

// =====================================================
// LABEL HIỂN THỊ
// =====================================================

const CATECHISM_TYPE_LABELS = {
  khai_tam: "Giáo lý Khai Tâm",

  den_ban_tiec_thanh: "Giáo lý Đến Bàn Tiệc Thánh",

  lon_len_trong_chua_thanh_than: "Giáo lý Lớn Lên Trong Chúa Thánh Thần",

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

// =====================================================
// HELPER
// =====================================================

const getChurchId = (req) => {
  const churchId = Number(req.user?.church_id);

  if (!churchId || Number.isNaN(churchId)) {
    return null;
  }

  return churchId;
};

const getCatechismLabel = (type) => {
  return CATECHISM_TYPE_LABELS[type] || type;
};

// =====================================================
// CONTROLLER
// =====================================================

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
  //
  // TẤT CẢ GIÁO XỨ ĐỀU NHÌN THẤY KHO CHUNG
  // =====================================================

  async getAll(req, res) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

      const offset = (page - 1) * limit;

      const search = String(req.query.search || "").trim();

      const catechismType = String(req.query.catechism_type || "").trim();

      // -------------------------------------------------
      // BUILD WHERE
      // -------------------------------------------------

      const conditions = [];
      const queryParams = [];

      if (search) {
        conditions.push(`
          (
            l.title LIKE ?
            OR c.name LIKE ?
          )
        `);

        queryParams.push(`%${search}%`, `%${search}%`);
      }

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

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // -------------------------------------------------
      // COUNT
      // -------------------------------------------------

      const [countResult] = await db.query(
        `
          SELECT COUNT(*) AS total
          FROM lessons l
          LEFT JOIN churches c
            ON c.id = l.church_id
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

          LIMIT ? OFFSET ?
          `,
        [...queryParams, limit, offset],
      );

      // -------------------------------------------------
      // FORMAT
      // -------------------------------------------------

      const currentChurchId = getChurchId(req);

      const data = rows.map((lesson) => ({
        ...lesson,

        catechism_type_label: getCatechismLabel(lesson.catechism_type),

        // Giáo xứ hiện tại có phải
        // chủ bài học không?
        can_edit: Number(lesson.church_id) === Number(currentChurchId),

        can_delete: Number(lesson.church_id) === Number(currentChurchId),
      }));

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

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

  // =====================================================
  // GET DETAIL
  // GET /api/lessons/:id
  //
  // TẤT CẢ GIÁO XỨ ĐỀU CÓ THỂ XEM
  // =====================================================

  async getById(req, res) {
    try {
      const { id } = req.params;

      if (!id || Number.isNaN(Number(id))) {
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

          LIMIT 1
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

      const currentChurchId = getChurchId(req);

      return res.json({
        success: true,

        data: {
          ...lesson,

          catechism_type_label: getCatechismLabel(lesson.catechism_type),

          can_edit: Number(lesson.church_id) === Number(currentChurchId),

          can_delete: Number(lesson.church_id) === Number(currentChurchId),
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

  // =====================================================
  // CREATE
  // POST /api/lessons
  //
  // Body:
  // {
  //   "title": "Bài 1: Thiên Chúa là Cha",
  //   "catechism_type": "du_tong"
  // }
  //
  // church_id LẤY TỪ TOKEN
  // KHÔNG LẤY TỪ BODY
  // =====================================================

  async create(req, res) {
    try {
      const churchId = getChurchId(req);

      // -------------------------------------------------
      // CHECK CHURCH
      // -------------------------------------------------

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      const { title, catechism_type } = req.body;

      // -------------------------------------------------
      // VALIDATE TITLE
      // -------------------------------------------------

      if (!title || !String(title).trim()) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không được bỏ trống",
        });
      }

      const cleanTitle = String(title).trim();

      // -------------------------------------------------
      // TYPE
      // -------------------------------------------------

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

      // -------------------------------------------------
      // CHECK DUPLICATE
      //
      // Cho phép 2 giáo xứ có cùng tên bài.
      //
      // Ví dụ:
      // Giáo xứ A: Bài 1 - Thiên Chúa
      // Giáo xứ B: Bài 1 - Thiên Chúa
      //
      // Đây vẫn là 2 bài do 2 giáo xứ sở hữu.
      // -------------------------------------------------

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
        return res.status(400).json({
          success: false,
          message: "Giáo xứ đã có bài học này trong bộ giáo lý này",
        });
      }

      // -------------------------------------------------
      // INSERT
      // -------------------------------------------------

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

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

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

  // =====================================================
  // UPDATE
  // PUT /api/lessons/:id
  //
  // CHỈ GIÁO XỨ TẠO BÀI MỚI ĐƯỢC SỬA
  // =====================================================

  async update(req, res) {
    try {
      const { id } = req.params;

      const churchId = getChurchId(req);

      // -------------------------------------------------
      // CHECK CHURCH
      // -------------------------------------------------

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      // -------------------------------------------------
      // CHECK ID
      // -------------------------------------------------

      if (!id || Number.isNaN(Number(id))) {
        return res.status(400).json({
          success: false,
          message: "ID bài học không hợp lệ",
        });
      }

      const { title, catechism_type } = req.body;

      // -------------------------------------------------
      // GET LESSON
      // -------------------------------------------------

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
      // CHECK OWNERSHIP
      // -------------------------------------------------

      if (Number(currentLesson.church_id) !== Number(churchId)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa bài học này",
        });
      }

      // -------------------------------------------------
      // VALIDATE TITLE
      // -------------------------------------------------

      if (!title || !String(title).trim()) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không được bỏ trống",
        });
      }

      const cleanTitle = String(title).trim();

      // -------------------------------------------------
      // TYPE
      // -------------------------------------------------

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

      // -------------------------------------------------
      // CHECK DUPLICATE
      // CHỈ CHECK TRONG GIÁO XỨ HIỆN TẠI
      // -------------------------------------------------

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
        [churchId, cleanTitle, type, id],
      );

      if (exist.length) {
        return res.status(400).json({
          success: false,
          message: "Giáo xứ đã có bài học này trong bộ giáo lý này",
        });
      }

      // -------------------------------------------------
      // UPDATE
      //
      // QUAN TRỌNG:
      // vẫn thêm church_id vào WHERE
      // để chống sửa bài của giáo xứ khác.
      // -------------------------------------------------

      const [result] = await db.query(
        `
          UPDATE lessons

          SET
            title = ?,
            catechism_type = ?

          WHERE id = ?
            AND church_id = ?
          `,
        [cleanTitle, type, id, churchId],
      );

      if (!result.affectedRows) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa bài học này",
        });
      }

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

      return res.json({
        success: true,

        message: "Cập nhật bài học thành công",

        data: {
          id: Number(id),
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

  // =====================================================
  // DELETE
  // DELETE /api/lessons/:id
  //
  // CHỈ GIÁO XỨ TẠO BÀI MỚI ĐƯỢC XÓA
  // =====================================================

  async delete(req, res) {
    try {
      const { id } = req.params;

      const churchId = getChurchId(req);

      // -------------------------------------------------
      // CHECK CHURCH
      // -------------------------------------------------

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ của tài khoản",
        });
      }

      // -------------------------------------------------
      // CHECK ID
      // -------------------------------------------------

      if (!id || Number.isNaN(Number(id))) {
        return res.status(400).json({
          success: false,
          message: "ID bài học không hợp lệ",
        });
      }

      // -------------------------------------------------
      // CHECK LESSON
      // -------------------------------------------------

      const [lesson] = await db.query(
        `
          SELECT
            id,
            church_id,
            title

          FROM lessons

          WHERE id = ?

          LIMIT 1
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
      // CHECK OWNERSHIP
      // -------------------------------------------------

      if (Number(lesson[0].church_id) !== Number(churchId)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xóa bài học này",
        });
      }

      // -------------------------------------------------
      // DELETE
      // -------------------------------------------------

      const [result] = await db.query(
        `
          DELETE FROM lessons

          WHERE id = ?
            AND church_id = ?
          `,
        [id, churchId],
      );

      if (!result.affectedRows) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền xóa bài học này",
        });
      }

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

      return res.json({
        success: true,

        message: "Xóa bài học thành công",

        id: Number(id),
      });
    } catch (error) {
      console.error("DELETE LESSON ERROR:", error);

      // -------------------------------------------------
      // FOREIGN KEY
      // -------------------------------------------------

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

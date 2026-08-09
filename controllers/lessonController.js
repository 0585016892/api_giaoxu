const db = require("../config/db");

class LessonController {
  // ==========================
  // GET ALL + SEARCH + PAGINATION
  // ==========================
  async getAll(req, res) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.max(1, Number(req.query.limit) || 10);
      const search = req.query.search?.trim() || "";
      const offset = (page - 1) * limit;

      let whereClause = "";
      let queryParams = [];

      if (search) {
        whereClause = "WHERE title LIKE ?";
        queryParams.push(`%${search}%`);
      }

      const [countResult] = await db.query(
        `SELECT COUNT(*) as total FROM lessons ${whereClause}`,
        queryParams,
      );
      const total = countResult[0].total;

      const [rows] = await db.query(
        `
      SELECT *
      FROM lessons
      ${whereClause}
      ORDER BY id ASC 
      LIMIT ? OFFSET ?
      `,
        [...queryParams, limit, offset],
      );

      res.json({
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
      res.status(500).json({
        success: false,
        message: "Lỗi: " + error.message,
      });
    }
  }
  // ==========================
  // GET DETAIL
  // ==========================
  async getById(req, res) {
    try {
      const [rows] = await db.query("SELECT * FROM lessons WHERE id=?", [
        req.params.id,
      ]);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ==========================
  // CREATE
  // ==========================
  async create(req, res) {
    try {
      const { title } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Tiêu đề không được bỏ trống",
        });
      }

      const [exist] = await db.query("SELECT id FROM lessons WHERE title=?", [
        title,
      ]);

      if (exist.length) {
        return res.status(400).json({
          success: false,
          message: "Bài học đã tồn tại",
        });
      }

      const [result] = await db.query("INSERT INTO lessons(title) VALUES(?)", [
        title,
      ]);

      res.status(201).json({
        success: true,
        id: result.insertId,
        message: "Thêm bài học thành công",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ==========================
  // UPDATE
  // ==========================
  async update(req, res) {
    try {
      const { title } = req.body;

      const [lesson] = await db.query("SELECT * FROM lessons WHERE id=?", [
        req.params.id,
      ]);

      if (!lesson.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      await db.query(
        `
        UPDATE lessons
        SET title=?
        WHERE id=?
        `,
        [title, req.params.id],
      );

      res.json({
        success: true,
        message: "Cập nhật thành công",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ==========================
  // DELETE
  // ==========================
  async delete(req, res) {
    try {
      const [result] = await db.query("DELETE FROM lessons WHERE id=?", [
        req.params.id,
      ]);

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học",
        });
      }

      res.json({
        success: true,
        message: "Xóa thành công",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new LessonController();

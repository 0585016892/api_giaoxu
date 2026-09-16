const db = require("../config/db");

class QuestionController {
  // =========================================================
  // HELPER
  // =========================================================

  getChurchId(req) {
    return req.user?.church_id || req.user?.parish_id || null;
  }

  // =========================================================
  // LIST
  // GET /questions
  // =========================================================

  async getAll(req, res) {
    console.log("Fetching questions:", req.query);

    try {
      const church_id = this.getChurchId(req);

      if (!church_id) {
        return res.status(403).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

      const lesson_id = req.query.lesson_id;
      const search = String(req.query.search || "").trim();

      const offset = (page - 1) * limit;

      let where = `
        WHERE l.church_id = ?
      `;

      const params = [church_id];

      // Lọc theo bài học
      if (lesson_id) {
        where += ` AND q.lesson_id = ?`;
        params.push(lesson_id);
      }

      // Tìm kiếm
      if (search) {
        where += ` AND q.question LIKE ?`;
        params.push(`%${search}%`);
      }

      // =====================================================
      // TOTAL
      // =====================================================

      const [totalRows] = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM questions q
        INNER JOIN lessons l
          ON l.id = q.lesson_id
        ${where}
        `,
        params,
      );

      const total = Number(totalRows[0]?.total || 0);

      // =====================================================
      // DATA
      // =====================================================

      const [rows] = await db.query(
        `
        SELECT
          q.id,
          q.lesson_id,
          q.question,
          q.answer_a,
          q.answer_b,
          q.answer_c,
          q.answer_d,
          q.correct_answer,

          l.title AS lesson_title

        FROM questions q

        INNER JOIN lessons l
          ON l.id = q.lesson_id

        ${where}

        ORDER BY q.id ASC

        LIMIT ?
        OFFSET ?
        `,
        [...params, limit, offset],
      );

      return res.json({
        success: true,
        data: rows,

        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get questions error:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể lấy danh sách câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // DETAIL
  // GET /questions/:id
  // =========================================================

  async getById(req, res) {
    try {
      const church_id = this.getChurchId(req);
      const questionId = Number(req.params.id);

      if (!church_id) {
        return res.status(403).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!Number.isInteger(questionId) || questionId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID câu hỏi không hợp lệ",
        });
      }

      const [rows] = await db.query(
        `
        SELECT
          q.id,
          q.lesson_id,
          q.question,
          q.answer_a,
          q.answer_b,
          q.answer_c,
          q.answer_d,
          q.correct_answer,

          l.title AS lesson_title

        FROM questions q

        INNER JOIN lessons l
          ON l.id = q.lesson_id

        WHERE q.id = ?
          AND l.church_id = ?

        LIMIT 1
        `,
        [questionId, church_id],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy câu hỏi",
        });
      }

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      console.error("Get question detail error:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể lấy câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // CREATE
  // POST /questions
  // =========================================================

  async create(req, res) {
    try {
      const church_id = this.getChurchId(req);

      if (!church_id) {
        return res.status(403).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const {
        lesson_id,
        question,
        answer_a,
        answer_b,
        answer_c,
        answer_d,
        correct_answer,
      } = req.body;

      // =====================================================
      // VALIDATE
      // =====================================================

      if (
        !lesson_id ||
        !question?.trim() ||
        !answer_a?.trim() ||
        !answer_b?.trim() ||
        !answer_c?.trim() ||
        !answer_d?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ dữ liệu",
        });
      }

      if (!["A", "B", "C", "D"].includes(correct_answer)) {
        return res.status(400).json({
          success: false,
          message: "Đáp án đúng phải là A, B, C hoặc D",
        });
      }

      // =====================================================
      // KIỂM TRA LESSON THUỘC GIÁO XỨ
      // =====================================================

      const [lessonRows] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [lesson_id, church_id],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Bài học không tồn tại hoặc không thuộc giáo xứ này",
        });
      }

      // =====================================================
      // INSERT
      // =====================================================

      const [result] = await db.query(
        `
        INSERT INTO questions (
          lesson_id,
          question,
          answer_a,
          answer_b,
          answer_c,
          answer_d,
          correct_answer
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          lesson_id,
          question.trim(),
          answer_a.trim(),
          answer_b.trim(),
          answer_c.trim(),
          answer_d.trim(),
          correct_answer,
        ],
      );

      return res.status(201).json({
        success: true,
        id: result.insertId,
        message: "Thêm câu hỏi thành công",
      });
    } catch (error) {
      console.error("Create question error:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể thêm câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // UPDATE
  // PUT /questions/:id
  // =========================================================

  async update(req, res) {
    try {
      const church_id = this.getChurchId(req);
      const questionId = Number(req.params.id);

      if (!church_id) {
        return res.status(403).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!Number.isInteger(questionId) || questionId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID câu hỏi không hợp lệ",
        });
      }

      const {
        lesson_id,
        question,
        answer_a,
        answer_b,
        answer_c,
        answer_d,
        correct_answer,
      } = req.body;

      // =====================================================
      // VALIDATE
      // =====================================================

      if (
        !lesson_id ||
        !question?.trim() ||
        !answer_a?.trim() ||
        !answer_b?.trim() ||
        !answer_c?.trim() ||
        !answer_d?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ dữ liệu",
        });
      }

      if (!["A", "B", "C", "D"].includes(correct_answer)) {
        return res.status(400).json({
          success: false,
          message: "Đáp án đúng phải là A, B, C hoặc D",
        });
      }

      // =====================================================
      // KIỂM TRA QUESTION THUỘC GIÁO XỨ
      // =====================================================

      const [questionRows] = await db.query(
        `
        SELECT q.id
        FROM questions q

        INNER JOIN lessons l
          ON l.id = q.lesson_id

        WHERE q.id = ?
          AND l.church_id = ?

        LIMIT 1
        `,
        [questionId, church_id],
      );

      if (!questionRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy câu hỏi",
        });
      }

      // =====================================================
      // KIỂM TRA LESSON MỚI
      // =====================================================

      const [lessonRows] = await db.query(
        `
        SELECT id
        FROM lessons
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [lesson_id, church_id],
      );

      if (!lessonRows.length) {
        return res.status(404).json({
          success: false,
          message: "Bài học không tồn tại hoặc không thuộc giáo xứ này",
        });
      }

      // =====================================================
      // UPDATE
      // =====================================================

      await db.query(
        `
        UPDATE questions
        SET
          lesson_id = ?,
          question = ?,
          answer_a = ?,
          answer_b = ?,
          answer_c = ?,
          answer_d = ?,
          correct_answer = ?
        WHERE id = ?
        `,
        [
          lesson_id,
          question.trim(),
          answer_a.trim(),
          answer_b.trim(),
          answer_c.trim(),
          answer_d.trim(),
          correct_answer,
          questionId,
        ],
      );

      return res.json({
        success: true,
        message: "Cập nhật câu hỏi thành công",
      });
    } catch (error) {
      console.error("Update question error:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể cập nhật câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // DELETE
  // DELETE /questions/:id
  // =========================================================

  async delete(req, res) {
    try {
      const church_id = this.getChurchId(req);
      const questionId = Number(req.params.id);

      if (!church_id) {
        return res.status(403).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!Number.isInteger(questionId) || questionId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID câu hỏi không hợp lệ",
        });
      }

      // Chỉ xóa nếu question thuộc lesson của giáo xứ hiện tại
      const [result] = await db.query(
        `
        DELETE q
        FROM questions q

        INNER JOIN lessons l
          ON l.id = q.lesson_id

        WHERE q.id = ?
          AND l.church_id = ?
        `,
        [questionId, church_id],
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy câu hỏi",
        });
      }

      return res.json({
        success: true,
        message: "Xóa câu hỏi thành công",
      });
    } catch (error) {
      console.error("Delete question error:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể xóa câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // GENERATE EXAM
  // GET /questions/exam/generate?batch=1&limit=30
  // =========================================================

  async generateExam(req, res) {
    console.log("Generating exam questions...");

    try {
      const church_id = this.getChurchId(req);

      if (!church_id) {
        return res.status(403).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

      const batch = Number(req.query.batch);

      const batchRanges = {
        1: {
          from: 1,
          to: 19,
        },

        2: {
          from: 20,
          to: 37,
        },
      };

      const range = batchRanges[batch];

      if (!range) {
        return res.status(400).json({
          success: false,
          message: "Đợt thi không hợp lệ. Chỉ hỗ trợ đợt 1 hoặc đợt 2.",
        });
      }

      // =====================================================
      // LẤY CÂU HỎI THUỘC LESSON CỦA GIÁO XỨ
      // =====================================================

      const [questions] = await db.query(
        `
        SELECT
          q.id,
          q.lesson_id,
          q.question,
          q.answer_a,
          q.answer_b,
          q.answer_c,
          q.answer_d

        FROM questions q

        INNER JOIN lessons l
          ON l.id = q.lesson_id

        WHERE l.church_id = ?
          AND q.lesson_id BETWEEN ? AND ?

        ORDER BY RAND()

        LIMIT ?
        `,
        [church_id, range.from, range.to, limit],
      );

      return res.json({
        success: true,

        batch,

        lessonRange: {
          from: range.from,
          to: range.to,
        },

        total: questions.length,

        questions,
      });
    } catch (error) {
      console.error("Generate exam error:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể tạo đề thi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // SUBMIT EXAM
  // POST /questions/exam/submit
  // =========================================================

  async submitExam(req, res) {
    try {
      const church_id = this.getChurchId(req);

      if (!church_id) {
        return res.status(403).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const { batch, answers } = req.body;

      const batchNumber = Number(batch);

      const batchRanges = {
        1: {
          from: 1,
          to: 19,
        },

        2: {
          from: 20,
          to: 37,
        },
      };

      const range = batchRanges[batchNumber];

      if (!range) {
        return res.status(400).json({
          success: false,
          message: "Đợt thi không hợp lệ",
        });
      }

      // =====================================================
      // VALIDATE ANSWERS
      // =====================================================

      if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Danh sách đáp án không hợp lệ",
        });
      }

      // =====================================================
      // LẤY QUESTION IDS
      // =====================================================

      const questionIds = [
        ...new Set(
          answers
            .map((item) => Number(item.question_id))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ];

      if (!questionIds.length) {
        return res.status(400).json({
          success: false,
          message: "Không có question_id hợp lệ",
        });
      }

      // =====================================================
      // LẤY QUESTIONS
      // =====================================================

      const [questions] = await db.query(
        `
        SELECT
          q.id,
          q.lesson_id,
          q.question,
          q.answer_a,
          q.answer_b,
          q.answer_c,
          q.answer_d,
          q.correct_answer

        FROM questions q

        INNER JOIN lessons l
          ON l.id = q.lesson_id

        WHERE q.id IN (?)

          AND l.church_id = ?

          AND q.lesson_id BETWEEN ? AND ?
        `,
        [questionIds, church_id, range.from, range.to],
      );

      // =====================================================
      // MAP QUESTION
      // =====================================================

      const questionMap = new Map(
        questions.map((question) => [Number(question.id), question]),
      );

      // =====================================================
      // CHẤM ĐIỂM
      // =====================================================

      let correctCount = 0;

      const results = answers.map((userAnswer) => {
        const questionId = Number(userAnswer.question_id);

        const question = questionMap.get(questionId);

        if (!question) {
          return {
            question_id: questionId,

            question: "",

            answer_a: "",
            answer_b: "",
            answer_c: "",
            answer_d: "",

            selected: userAnswer.selected || "",

            correct_answer: null,

            isCorrect: false,

            invalid: true,
          };
        }

        const selected = String(userAnswer.selected || "").toUpperCase();

        const isCorrect = selected === question.correct_answer;

        if (isCorrect) {
          correctCount++;
        }

        return {
          question_id: question.id,

          lesson_id: question.lesson_id,

          question: question.question,

          answer_a: question.answer_a,
          answer_b: question.answer_b,
          answer_c: question.answer_c,
          answer_d: question.answer_d,

          selected,

          correct_answer: question.correct_answer,

          isCorrect,

          invalid: false,
        };
      });

      // =====================================================
      // SCORE
      // =====================================================

      const total = results.length;

      const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

      // =====================================================
      // RESPONSE
      // =====================================================

      return res.json({
        success: true,

        batch: batchNumber,

        lessonRange: {
          from: range.from,
          to: range.to,
        },

        score,

        correctCount,

        total,

        results,
      });
    } catch (error) {
      console.error("Submit exam error:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể chấm bài thi",
        error: error.message,
      });
    }
  }
}

module.exports = new QuestionController();

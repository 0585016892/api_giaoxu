const db = require("../config/db");

class QuestionController {
  // =========================================================
  // HELPER
  // =========================================================

  getChurchId(req) {
    const churchId = Number(req.user?.church_id || req.user?.parish_id);

    if (!churchId || Number.isNaN(churchId)) {
      return null;
    }

    return churchId;
  }

  isValidId(id) {
    const number = Number(id);

    return Number.isInteger(number) && number > 0;
  }

  isValidCorrectAnswer(answer) {
    return ["A", "B", "C", "D"].includes(String(answer || "").toUpperCase());
  }

  // =========================================================
  // GET /questions
  //
  // CHỈ CÂU HỎI CỦA GIÁO XỨ HIỆN TẠI
  // =========================================================

  async getAll(req, res) {
    try {
      const churchId = this.getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const page = Math.max(1, Number(req.query.page) || 1);

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

      const offset = (page - 1) * limit;

      const lessonId = req.query.lesson_id;

      const search = String(req.query.search || "").trim();

      // =====================================================
      // WHERE
      // =====================================================

      const conditions = ["l.church_id = ?"];

      const params = [churchId];

      // =====================================================
      // LESSON FILTER
      // =====================================================

      if (lessonId) {
        const lessonIdNumber = Number(lessonId);

        if (!this.isValidId(lessonIdNumber)) {
          return res.status(400).json({
            success: false,
            message: "lesson_id không hợp lệ",
          });
        }

        conditions.push("q.lesson_id = ?");

        params.push(lessonIdNumber);
      }

      // =====================================================
      // SEARCH
      // =====================================================

      if (search) {
        conditions.push(`
          (
            q.question LIKE ?
            OR l.title LIKE ?
          )
        `);

        params.push(`%${search}%`, `%${search}%`);
      }

      const whereClause = `
        WHERE ${conditions.join(" AND ")}
      `;

      // =====================================================
      // TOTAL
      // =====================================================

      const [totalRows] = await db.query(
        `
          SELECT COUNT(*) AS total

          FROM questions q

          INNER JOIN lessons l
            ON l.id = q.lesson_id

          ${whereClause}
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

            l.title AS lesson_title,
            l.catechism_type

          FROM questions q

          INNER JOIN lessons l
            ON l.id = q.lesson_id

          ${whereClause}

          ORDER BY q.id ASC

          LIMIT ?
          OFFSET ?
          `,
        [...params, limit, offset],
      );

      const data = rows.map((row) => ({
        ...row,

        can_edit: true,
        can_delete: true,
      }));

      return res.json({
        success: true,

        data,

        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("GET QUESTIONS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể lấy danh sách câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // GET /questions/:id
  // =========================================================

  async getById(req, res) {
    try {
      const churchId = this.getChurchId(req);

      const questionId = Number(req.params.id);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!this.isValidId(questionId)) {
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

            l.title AS lesson_title,
            l.catechism_type

          FROM questions q

          INNER JOIN lessons l
            ON l.id = q.lesson_id

          WHERE q.id = ?
            AND l.church_id = ?

          LIMIT 1
          `,
        [questionId, churchId],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy câu hỏi",
        });
      }

      return res.json({
        success: true,

        data: {
          ...rows[0],

          can_edit: true,
          can_delete: true,
        },
      });
    } catch (error) {
      console.error("GET QUESTION DETAIL ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể lấy câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // POST /questions
  // =========================================================

  async create(req, res) {
    try {
      const churchId = this.getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
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

      const lessonId = Number(lesson_id);

      if (!this.isValidId(lessonId)) {
        return res.status(400).json({
          success: false,
          message: "Bài học không hợp lệ",
        });
      }

      const cleanQuestion = String(question || "").trim();

      const answerA = String(answer_a || "").trim();

      const answerB = String(answer_b || "").trim();

      const answerC = String(answer_c || "").trim();

      const answerD = String(answer_d || "").trim();

      const correctAnswer = String(correct_answer || "").toUpperCase();

      if (!cleanQuestion || !answerA || !answerB || !answerC || !answerD) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ dữ liệu",
        });
      }

      if (!this.isValidCorrectAnswer(correctAnswer)) {
        return res.status(400).json({
          success: false,
          message: "Đáp án đúng phải là A, B, C hoặc D",
        });
      }

      // =====================================================
      // CHECK LESSON OWNERSHIP
      // =====================================================

      const [lessonRows] = await db.query(
        `
          SELECT
            id,
            church_id,
            title

          FROM lessons

          WHERE id = ?
            AND church_id = ?

          LIMIT 1
          `,
        [lessonId, churchId],
      );

      if (!lessonRows.length) {
        return res.status(403).json({
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
          lessonId,
          cleanQuestion,
          answerA,
          answerB,
          answerC,
          answerD,
          correctAnswer,
        ],
      );

      return res.status(201).json({
        success: true,

        id: result.insertId,

        message: "Thêm câu hỏi thành công",
      });
    } catch (error) {
      console.error("CREATE QUESTION ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể thêm câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // PUT /questions/:id
  // =========================================================

  async update(req, res) {
    try {
      const churchId = this.getChurchId(req);

      const questionId = Number(req.params.id);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!this.isValidId(questionId)) {
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

      const lessonId = Number(lesson_id);

      const cleanQuestion = String(question || "").trim();

      const answerA = String(answer_a || "").trim();

      const answerB = String(answer_b || "").trim();

      const answerC = String(answer_c || "").trim();

      const answerD = String(answer_d || "").trim();

      const correctAnswer = String(correct_answer || "").toUpperCase();

      // =====================================================
      // VALIDATE
      // =====================================================

      if (!this.isValidId(lessonId)) {
        return res.status(400).json({
          success: false,
          message: "Bài học không hợp lệ",
        });
      }

      if (!cleanQuestion || !answerA || !answerB || !answerC || !answerD) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập đầy đủ dữ liệu",
        });
      }

      if (!this.isValidCorrectAnswer(correctAnswer)) {
        return res.status(400).json({
          success: false,
          message: "Đáp án đúng phải là A, B, C hoặc D",
        });
      }

      // =====================================================
      // CHECK QUESTION OWNER
      // =====================================================

      const [questionRows] = await db.query(
        `
          SELECT
            q.id,
            q.lesson_id,
            l.church_id

          FROM questions q

          INNER JOIN lessons l
            ON l.id = q.lesson_id

          WHERE q.id = ?

          LIMIT 1
          `,
        [questionId],
      );

      if (!questionRows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy câu hỏi",
        });
      }

      if (Number(questionRows[0].church_id) !== Number(churchId)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa câu hỏi này",
        });
      }

      // =====================================================
      // CHECK LESSON MỚI
      // =====================================================

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
        return res.status(403).json({
          success: false,
          message: "Bài học không tồn tại hoặc không thuộc giáo xứ này",
        });
      }

      // =====================================================
      // UPDATE
      // =====================================================

      const [result] = await db.query(
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
          lessonId,
          cleanQuestion,
          answerA,
          answerB,
          answerC,
          answerD,
          correctAnswer,
          questionId,
        ],
      );

      if (!result.affectedRows) {
        return res.status(400).json({
          success: false,
          message: "Không có thay đổi",
        });
      }

      return res.json({
        success: true,

        message: "Cập nhật câu hỏi thành công",
      });
    } catch (error) {
      console.error("UPDATE QUESTION ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể cập nhật câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // DELETE /questions/:id
  // =========================================================

  async delete(req, res) {
    try {
      const churchId = this.getChurchId(req);

      const questionId = Number(req.params.id);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!this.isValidId(questionId)) {
        return res.status(400).json({
          success: false,
          message: "ID câu hỏi không hợp lệ",
        });
      }

      // =====================================================
      // DELETE + OWNERSHIP
      // =====================================================

      const [result] = await db.query(
        `
          DELETE q

          FROM questions q

          INNER JOIN lessons l
            ON l.id = q.lesson_id

          WHERE q.id = ?
            AND l.church_id = ?
          `,
        [questionId, churchId],
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message:
            "Không tìm thấy câu hỏi hoặc câu hỏi không thuộc giáo xứ này",
        });
      }

      return res.json({
        success: true,

        message: "Xóa câu hỏi thành công",

        id: questionId,
      });
    } catch (error) {
      console.error("DELETE QUESTION ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể xóa câu hỏi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // GET /questions/exam?batch=1&limit=30
  //
  // CHỈ TẠO ĐỀ TỪ CÂU HỎI CỦA GIÁO XỨ HIỆN TẠI
  // =========================================================

  async generateExam(req, res) {
    try {
      const churchId = this.getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

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
      // CHỈ LẤY CÂU HỎI CỦA GIÁO XỨ
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

            l.title AS lesson_title,
            l.catechism_type

          FROM questions q

          INNER JOIN lessons l
            ON l.id = q.lesson_id

          WHERE l.church_id = ?

            AND q.lesson_id BETWEEN ?
            AND ?

          ORDER BY RAND()

          LIMIT ?
          `,
        [churchId, range.from, range.to, limit],
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
      console.error("GENERATE EXAM ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể tạo đề thi",
        error: error.message,
      });
    }
  }

  // =========================================================
  // POST /questions/submit-exam
  //
  // CHỈ CHẤM CÂU HỎI CỦA GIÁO XỨ HIỆN TẠI
  // =========================================================

  async submitExam(req, res) {
    try {
      const churchId = this.getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
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
      // QUESTION IDS
      // =====================================================

      const questionIds = [
        ...new Set(
          answers
            .map((item) => Number(item?.question_id))
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
      // GET QUESTIONS
      //
      // RẤT QUAN TRỌNG:
      // phải kiểm tra church_id ở đây
      // để không thể gửi ID câu hỏi của
      // giáo xứ khác lên để chấm.
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

            AND q.lesson_id BETWEEN ?
            AND ?
          `,
        [questionIds, churchId, range.from, range.to],
      );

      // =====================================================
      // MAP
      // =====================================================

      const questionMap = new Map(
        questions.map((question) => [Number(question.id), question]),
      );

      // =====================================================
      // CHẤM
      // =====================================================

      let correctCount = 0;

      const results = answers.map((userAnswer) => {
        const questionId = Number(userAnswer?.question_id);

        const question = questionMap.get(questionId);

        const selected = String(userAnswer?.selected || "").toUpperCase();

        // ---------------------------------------------
        // QUESTION KHÔNG HỢP LỆ
        // ---------------------------------------------

        if (!question) {
          return {
            question_id: questionId,

            question: "",

            answer_a: "",
            answer_b: "",
            answer_c: "",
            answer_d: "",

            selected,

            correct_answer: null,

            isCorrect: false,

            invalid: true,
          };
        }

        // ---------------------------------------------
        // CHECK
        // ---------------------------------------------

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
      console.error("SUBMIT EXAM ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể chấm bài thi",
        error: error.message,
      });
    }
  }
}

module.exports = new QuestionController();

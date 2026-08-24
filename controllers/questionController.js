const db = require("../config/db");

class QuestionController {
  // ==========================
  // LIST
  // ==========================
  async getAll(req, res) {
    console.log("Fetching questions with params:", req.query);
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const lesson_id = req.query.lesson_id;
      const search = req.query.search || "";

      const offset = (page - 1) * limit;

      let where = "WHERE 1=1";
      let params = [];

      if (lesson_id) {
        where += " AND q.lesson_id = ?";
        params.push(lesson_id);
      }

      if (search) {
        where += " AND q.question LIKE ?";
        params.push(`%${search}%`);
      }

      const [total] = await db.query(
        `
        SELECT COUNT(*) total
        FROM questions q
        ${where}
        `,
        params,
      );

      const [rows] = await db.query(
        `
        SELECT
          q.*,
          l.title lesson_title
        FROM questions q
        LEFT JOIN lessons l
          ON l.id = q.lesson_id
        ${where}
        ORDER BY q.id ASC -- Thay DESC bằng ASC để cũ lên trước, mới về sau
        LIMIT ?
        OFFSET ?
        `,
        [...params, limit, offset],
      );

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: total[0].total,
          page,
          limit,
          totalPages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ==========================
  // DETAIL
  // ==========================
  async getById(req, res) {
    try {
      const [rows] = await db.query("SELECT * FROM questions WHERE id=?", [
        req.params.id,
      ]);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy câu hỏi",
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
      const {
        lesson_id,
        question,
        answer_a,
        answer_b,
        answer_c,
        answer_d,
        correct_answer,
      } = req.body;

      if (
        !lesson_id ||
        !question ||
        !answer_a ||
        !answer_b ||
        !answer_c ||
        !answer_d
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

      const [lesson] = await db.query("SELECT id FROM lessons WHERE id=?", [
        lesson_id,
      ]);

      if (!lesson.length) {
        return res.status(404).json({
          success: false,
          message: "Bài học không tồn tại",
        });
      }

      const [result] = await db.query(
        `
        INSERT INTO questions(
          lesson_id,
          question,
          answer_a,
          answer_b,
          answer_c,
          answer_d,
          correct_answer
        )
        VALUES(?,?,?,?,?,?,?)
        `,
        [
          lesson_id,
          question,
          answer_a,
          answer_b,
          answer_c,
          answer_d,
          correct_answer,
        ],
      );

      res.status(201).json({
        success: true,
        id: result.insertId,
        message: "Thêm câu hỏi thành công",
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
      const {
        lesson_id,
        question,
        answer_a,
        answer_b,
        answer_c,
        answer_d,
        correct_answer,
      } = req.body;

      await db.query(
        `
        UPDATE questions
        SET
          lesson_id=?,
          question=?,
          answer_a=?,
          answer_b=?,
          answer_c=?,
          answer_d=?,
          correct_answer=?
        WHERE id=?
        `,
        [
          lesson_id,
          question,
          answer_a,
          answer_b,
          answer_c,
          answer_d,
          correct_answer,
          req.params.id,
        ],
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
      const [result] = await db.query("DELETE FROM questions WHERE id=?", [
        req.params.id,
      ]);

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy câu hỏi",
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

  // ==========================
  // RANDOM EXAM 20 QUESTIONS
  // ==========================
  async generateExam(req, res) {
    console.log("Generating exam questions...");

    try {
      const limit = Number(req.query.limit) || 20;
      const batch = Number(req.query.batch);

      let lessonStart;
      let lessonEnd;

      switch (batch) {
        case 1:
          lessonStart = 1;
          lessonEnd = 19;
          break;

        case 2:
          lessonStart = 20;
          lessonEnd = 37;
          break;

        default:
          return res.status(400).json({
            success: false,
            message: "Đợt thi không hợp lệ. Chỉ hỗ trợ đợt 1 hoặc đợt 2.",
          });
      }

      const [questions] = await db.query(
        `
      SELECT *
      FROM questions
      WHERE lesson_id BETWEEN ? AND ?
      ORDER BY RAND()
      LIMIT ?
      `,
        [lessonStart, lessonEnd, limit],
      );

      res.json({
        success: true,
        batch,
        lessonRange: {
          from: lessonStart,
          to: lessonEnd,
        },
        total: questions.length,
        questions,
      });
    } catch (error) {
      console.error("Generate exam error:", error);

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ==========================
  // SUBMIT EXAM
  // ==========================
  async submitExam(req, res) {
    try {
      const { batch, answers } = req.body;

      if (![1, 2].includes(Number(batch))) {
        return res.status(400).json({
          success: false,
          message: "Đợt thi không hợp lệ",
        });
      }

      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Danh sách đáp án không hợp lệ",
        });
      }

      const batchRanges = {
        1: {
          start: 1,
          end: 19,
        },
        2: {
          start: 20,
          end: 37,
        },
      };

      const range = batchRanges[Number(batch)];

      const ids = answers.map((x) => x.question_id);

      const [questions] = await db.query(
        `
      SELECT
        id,
        question,
        answer_a,
        answer_b,
        answer_c,
        answer_d,
        correct_answer,
        lesson_id
      FROM questions
      WHERE id IN (?)
        AND lesson_id BETWEEN ? AND ?
      `,
        [ids, range.start, range.end],
      );

      if (questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Không tìm thấy câu hỏi hợp lệ trong đợt thi",
        });
      }

      let correctCount = 0;

      const results = questions.map((q) => {
        const userAnswer = answers.find(
          (a) => Number(a.question_id) === Number(q.id),
        );

        const selected = userAnswer?.selected || "";

        const isCorrect = selected === q.correct_answer;

        if (isCorrect) {
          correctCount++;
        }

        return {
          question_id: q.id,
          question: q.question,

          answer_a: q.answer_a,
          answer_b: q.answer_b,
          answer_c: q.answer_c,
          answer_d: q.answer_d,

          selected,
          correct_answer: q.correct_answer,
          isCorrect,
        };
      });

      const total = questions.length;

      const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

      return res.json({
        success: true,
        batch: Number(batch),
        score,
        correctCount,
        total,
        results,
      });
    } catch (error) {
      console.error("Submit exam error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new QuestionController();

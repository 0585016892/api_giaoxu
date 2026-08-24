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

      // ==============================
      // 1. KIỂM TRA BATCH
      // ==============================

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

      if (!batchRanges[batchNumber]) {
        return res.status(400).json({
          success: false,
          message: "Đợt thi không hợp lệ",
        });
      }

      // ==============================
      // 2. KIỂM TRA ANSWERS
      // ==============================

      if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Danh sách đáp án không hợp lệ",
        });
      }

      // ==============================
      // 3. LẤY ID THEO ĐÚNG THỨ TỰ FE
      // ==============================

      const questionIds = answers
        .map((item) => Number(item.question_id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (questionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Không có question_id hợp lệ",
        });
      }

      // ==============================
      // 4. LẤY CÂU HỎI TỪ DATABASE
      // ==============================

      const [questions] = await db.query(
        `
      SELECT
        id,
        lesson_id,
        question,
        answer_a,
        answer_b,
        answer_c,
        answer_d,
        correct_answer
      FROM questions
      WHERE id IN (?)
        AND lesson_id BETWEEN ? AND ?
      `,
        [
          questionIds,
          batchRanges[batchNumber].from,
          batchRanges[batchNumber].to,
        ],
      );

      // ==============================
      // 5. MAP DATABASE THEO ID
      // ==============================

      const questionMap = new Map(
        questions.map((question) => [Number(question.id), question]),
      );

      // ==============================
      // 6. CHẤM THEO ĐÚNG THỨ TỰ FE
      // ==============================

      let correctCount = 0;

      const results = answers.map((userAnswer) => {
        const questionId = Number(userAnswer.question_id);

        const question = questionMap.get(questionId);

        // Nếu câu không tồn tại / không thuộc batch
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

        const selected = userAnswer.selected || "";

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

      // ==============================
      // 7. TÍNH ĐIỂM
      // ==============================

      const total = results.length;

      const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

      // ==============================
      // 8. RESPONSE
      // ==============================

      return res.json({
        success: true,

        batch: batchNumber,

        lessonRange: {
          from: batchRanges[batchNumber].from,
          to: batchRanges[batchNumber].to,
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
        message: error.message,
      });
    }
  }
}

module.exports = new QuestionController();

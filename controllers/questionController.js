const db = require("../config/db");

// =========================================================
// HELPERS
// =========================================================

/**
 * Lấy church_id từ JWT
 *
 * KHÔNG lấy church_id từ:
 * - req.query
 * - req.body
 * - req.params
 */
const getChurchId = (req) => {
  const churchId = Number(req.user?.church_id || req.user?.parish_id);

  if (!churchId || Number.isNaN(churchId)) {
    return null;
  }

  return churchId;
};

/**
 * Kiểm tra ID
 */
const isValidId = (id) => {
  const number = Number(id);

  return Number.isInteger(number) && number > 0;
};

/**
 * Kiểm tra đáp án
 */
const isValidCorrectAnswer = (answer) => {
  return ["A", "B", "C", "D"].includes(
    String(answer || "")
      .trim()
      .toUpperCase(),
  );
};

/**
 * Chuẩn hóa đáp án
 */
const normalizeAnswer = (answer) => {
  return String(answer || "")
    .trim()
    .toUpperCase();
};

/**
 * Lấy range đợt thi
 */
const getBatchRange = (batch) => {
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

  return batchRanges[Number(batch)] || null;
};

// =========================================================
// CONTROLLER
// =========================================================

class QuestionController {
  // =======================================================
  // GET /questions
  //
  // Danh sách câu hỏi của giáo xứ hiện tại
  // =======================================================

  async getAll(req, res) {
    try {
      const churchId = getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      // ---------------------------------------------------
      // PAGINATION
      // ---------------------------------------------------

      const page = Math.max(1, Number(req.query.page) || 1);

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

      const offset = (page - 1) * limit;

      // ---------------------------------------------------
      // FILTER
      // ---------------------------------------------------

      const lessonId = req.query.lesson_id;

      const search = String(req.query.search || "").trim();

      // ---------------------------------------------------
      // WHERE
      // ---------------------------------------------------

      const conditions = ["l.church_id = ?"];

      const params = [churchId];

      // ---------------------------------------------------
      // FILTER LESSON
      // ---------------------------------------------------

      if (lessonId) {
        const lessonIdNumber = Number(lessonId);

        if (!isValidId(lessonIdNumber)) {
          return res.status(400).json({
            success: false,
            message: "lesson_id không hợp lệ",
          });
        }

        conditions.push("q.lesson_id = ?");

        params.push(lessonIdNumber);
      }

      // ---------------------------------------------------
      // SEARCH
      // ---------------------------------------------------

      if (search) {
        conditions.push(`
          (
            q.question LIKE ?
            OR l.title LIKE ?
          )
        `);

        const keyword = `%${search}%`;

        params.push(keyword, keyword);
      }

      const whereClause = `
        WHERE ${conditions.join(" AND ")}
      `;

      // ---------------------------------------------------
      // TOTAL
      // ---------------------------------------------------

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

      // ---------------------------------------------------
      // DATA
      // ---------------------------------------------------

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

  // =======================================================
  // GET /questions/lesson/:lessonId
  //
  // Lấy toàn bộ câu hỏi của một bài học
  //
  // Dùng cho:
  // - Quản lý câu hỏi
  // - Hiển thị số lượng câu hỏi
  //
  // API này CÓ correct_answer
  // vì đây là API quản trị.
  // =======================================================

  async getByLesson(req, res) {
    try {
      const churchId = getChurchId(req);

      const lessonId = Number(req.params.lessonId);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!isValidId(lessonId)) {
        return res.status(400).json({
          success: false,
          message: "lessonId không hợp lệ",
        });
      }

      // ---------------------------------------------------
      // CHECK LESSON
      // ---------------------------------------------------

      const [lessonRows] = await db.query(
        `
        SELECT
          id,
          title,
          catechism_type,
          church_id

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
          message: "Không tìm thấy bài học",
        });
      }

      const lesson = lessonRows[0];

      // ---------------------------------------------------
      // QUESTIONS
      // ---------------------------------------------------

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

          q.correct_answer,

          q.created_at,
          q.updated_at

        FROM questions q

        WHERE q.lesson_id = ?

        ORDER BY q.id ASC
        `,
        [lessonId],
      );

      return res.json({
        success: true,

        lesson: {
          id: lesson.id,
          title: lesson.title,
          catechism_type: lesson.catechism_type,
        },

        total: questions.length,

        questions,
      });
    } catch (error) {
      console.error("GET QUESTIONS BY LESSON ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể lấy câu hỏi của bài học",
        error: error.message,
      });
    }
  }

  // =======================================================
  // GET /questions/play/:lessonId
  //
  // Lấy dữ liệu để LÀM BÀI
  //
  // QUAN TRỌNG:
  // KHÔNG trả correct_answer
  // =======================================================

  async getQuizByLesson(req, res) {
    try {
      const churchId = getChurchId(req);

      const lessonId = Number(req.params.lessonId);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!isValidId(lessonId)) {
        return res.status(400).json({
          success: false,
          message: "lessonId không hợp lệ",
        });
      }

      // ---------------------------------------------------
      // CHECK LESSON OWNERSHIP
      // ---------------------------------------------------

      const [lessonRows] = await db.query(
        `
        SELECT
          id,
          title,
          catechism_type,
          church_id

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
          message: "Không tìm thấy bài học",
        });
      }

      const lesson = lessonRows[0];

      // ---------------------------------------------------
      // GET QUESTIONS
      //
      // KHÔNG SELECT correct_answer
      // ---------------------------------------------------

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

        WHERE q.lesson_id = ?

        ORDER BY q.id ASC
        `,
        [lessonId],
      );

      // ---------------------------------------------------
      // RESPONSE
      // ---------------------------------------------------

      return res.json({
        success: true,

        lesson: {
          id: lesson.id,
          title: lesson.title,
          catechism_type: lesson.catechism_type,
        },

        total: questions.length,

        questions,
      });
    } catch (error) {
      console.error("GET QUIZ BY LESSON ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể tải câu hỏi bài học",
        error: error.message,
      });
    }
  }

  // =======================================================
  // POST /questions/play/:lessonId/submit
  //
  // Chấm bài câu hỏi của bài học
  //
  // BODY:
  //
  // {
  //   answers: [
  //     {
  //       question_id: 1,
  //       selected: "A"
  //     }
  //   ]
  // }
  // =======================================================

  async submitQuiz(req, res) {
    try {
      const churchId = getChurchId(req);

      const lessonId = Number(req.params.lessonId);

      const { answers } = req.body;

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!isValidId(lessonId)) {
        return res.status(400).json({
          success: false,
          message: "lessonId không hợp lệ",
        });
      }

      if (!Array.isArray(answers)) {
        return res.status(400).json({
          success: false,
          message: "Danh sách đáp án không hợp lệ",
        });
      }

      // ---------------------------------------------------
      // CHECK LESSON
      // ---------------------------------------------------

      const [lessonRows] = await db.query(
        `
        SELECT
          id,
          title,
          catechism_type,
          church_id

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
          message: "Không tìm thấy bài học",
        });
      }

      const lesson = lessonRows[0];

      // ---------------------------------------------------
      // GET QUESTIONS
      //
      // Lấy đáp án đúng từ DB
      // ---------------------------------------------------

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

        WHERE q.lesson_id = ?

        ORDER BY q.id ASC
        `,
        [lessonId],
      );

      if (!questions.length) {
        return res.status(400).json({
          success: false,
          message: "Bài học chưa có câu hỏi",
        });
      }

      // ---------------------------------------------------
      // MAP QUESTION
      // ---------------------------------------------------

      const questionMap = new Map(
        questions.map((question) => [Number(question.id), question]),
      );

      // ---------------------------------------------------
      // MAP ANSWERS
      //
      // Nếu frontend gửi trùng question_id
      // thì lấy câu trả lời cuối cùng.
      // ---------------------------------------------------

      const answerMap = new Map();

      answers.forEach((item) => {
        const questionId = Number(item?.question_id);

        const selected = normalizeAnswer(item?.selected);

        if (isValidId(questionId) && ["A", "B", "C", "D"].includes(selected)) {
          answerMap.set(questionId, selected);
        }
      });

      // ---------------------------------------------------
      // CHẤM TOÀN BỘ CÂU HỎI
      // ---------------------------------------------------

      let correctCount = 0;

      let answeredCount = 0;

      const results = questions.map((question, index) => {
        const selected = answerMap.get(Number(question.id)) || null;

        const isAnswered = Boolean(selected);

        const isCorrect =
          isAnswered && selected === normalizeAnswer(question.correct_answer);

        if (isAnswered) {
          answeredCount++;
        }

        if (isCorrect) {
          correctCount++;
        }

        return {
          question_id: question.id,

          lesson_id: question.lesson_id,

          question_number: index + 1,

          question: question.question,

          answer_a: question.answer_a,
          answer_b: question.answer_b,
          answer_c: question.answer_c,
          answer_d: question.answer_d,

          selected,

          correct_answer: question.correct_answer,

          isCorrect: Boolean(isCorrect),
        };
      });

      // ---------------------------------------------------
      // SCORE
      // ---------------------------------------------------

      const total = questions.length;

      const wrongCount = total - correctCount - (total - answeredCount);

      const unansweredCount = total - answeredCount;

      const percentage =
        total > 0 ? Number(((correctCount / total) * 100).toFixed(2)) : 0;

      const score =
        total > 0 ? Number(((correctCount / total) * 10).toFixed(2)) : 0;

      // ---------------------------------------------------
      // RESPONSE
      // ---------------------------------------------------

      return res.json({
        success: true,

        lesson: {
          id: lesson.id,
          title: lesson.title,
          catechism_type: lesson.catechism_type,
        },

        summary: {
          total,

          answered: answeredCount,

          unanswered: unansweredCount,

          correct: correctCount,

          wrong: Math.max(0, wrongCount),

          percentage,

          score,
        },

        results,
      });
    } catch (error) {
      console.error("SUBMIT QUIZ ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Không thể chấm bài",
        error: error.message,
      });
    }
  }

  // =======================================================
  // GET /questions/:id
  //
  // Chi tiết câu hỏi
  // =======================================================

  async getById(req, res) {
    try {
      const churchId = getChurchId(req);

      const questionId = Number(req.params.id);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!isValidId(questionId)) {
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

  // =======================================================
  // POST /questions
  //
  // Tạo câu hỏi
  // =======================================================

  async create(req, res) {
    try {
      const churchId = getChurchId(req);

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

      // ---------------------------------------------------
      // NORMALIZE
      // ---------------------------------------------------

      const lessonId = Number(lesson_id);

      const cleanQuestion = String(question || "").trim();

      const answerA = String(answer_a || "").trim();
      const answerB = String(answer_b || "").trim();
      const answerC = String(answer_c || "").trim();
      const answerD = String(answer_d || "").trim();

      const correctAnswer = normalizeAnswer(correct_answer);

      // ---------------------------------------------------
      // VALIDATE
      // ---------------------------------------------------

      if (!isValidId(lessonId)) {
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

      if (!isValidCorrectAnswer(correctAnswer)) {
        return res.status(400).json({
          success: false,
          message: "Đáp án đúng phải là A, B, C hoặc D",
        });
      }

      // ---------------------------------------------------
      // CHECK LESSON OWNERSHIP
      // ---------------------------------------------------

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

      // ---------------------------------------------------
      // INSERT
      // ---------------------------------------------------

      const [result] = await db.query(
        `
        INSERT INTO questions (
          lesson_id,
          church_id,
          question,
          answer_a,
          answer_b,
          answer_c,
          answer_d,
          correct_answer
        )

        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          lessonId,
          churchId,
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

  // =======================================================
  // PUT /questions/:id
  //
  // Cập nhật câu hỏi
  // =======================================================

  async update(req, res) {
    try {
      const churchId = getChurchId(req);

      const questionId = Number(req.params.id);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!isValidId(questionId)) {
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

      // ---------------------------------------------------
      // NORMALIZE
      // ---------------------------------------------------

      const lessonId = Number(lesson_id);

      const cleanQuestion = String(question || "").trim();

      const answerA = String(answer_a || "").trim();
      const answerB = String(answer_b || "").trim();
      const answerC = String(answer_c || "").trim();
      const answerD = String(answer_d || "").trim();

      const correctAnswer = normalizeAnswer(correct_answer);

      // ---------------------------------------------------
      // VALIDATE
      // ---------------------------------------------------

      if (!isValidId(lessonId)) {
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

      if (!isValidCorrectAnswer(correctAnswer)) {
        return res.status(400).json({
          success: false,
          message: "Đáp án đúng phải là A, B, C hoặc D",
        });
      }

      // ---------------------------------------------------
      // CHECK QUESTION OWNER
      // ---------------------------------------------------

      const [questionRows] = await db.query(
        `
        SELECT
          q.id,
          q.lesson_id,
          q.church_id,
          l.church_id AS lesson_church_id

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

      const questionOwner =
        questionRows[0].church_id ?? questionRows[0].lesson_church_id;

      if (Number(questionOwner) !== Number(churchId)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền sửa câu hỏi này",
        });
      }

      // ---------------------------------------------------
      // CHECK LESSON MỚI
      // ---------------------------------------------------

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

      // ---------------------------------------------------
      // UPDATE
      // ---------------------------------------------------

      const [result] = await db.query(
        `
        UPDATE questions

        SET
          lesson_id = ?,
          church_id = ?,
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
          churchId,
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

  // =======================================================
  // DELETE /questions/:id
  //
  // Xóa câu hỏi
  // =======================================================

  async delete(req, res) {
    try {
      const churchId = getChurchId(req);

      const questionId = Number(req.params.id);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      if (!isValidId(questionId)) {
        return res.status(400).json({
          success: false,
          message: "ID câu hỏi không hợp lệ",
        });
      }

      // ---------------------------------------------------
      // DELETE + OWNERSHIP
      // ---------------------------------------------------

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

  // =======================================================
  // GET /questions/exam/generate
  //
  // Tạo đề thi
  // =======================================================

  async generateExam(req, res) {
    try {
      const churchId = getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

      const batch = Number(req.query.batch);

      const range = getBatchRange(batch);

      if (!range) {
        return res.status(400).json({
          success: false,
          message: "Đợt thi không hợp lệ. Chỉ hỗ trợ đợt 1 hoặc đợt 2.",
        });
      }

      // ---------------------------------------------------
      // GET QUESTIONS
      // ---------------------------------------------------

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

  // =======================================================
  // POST /questions/exam/submit
  //
  // Chấm bài thi
  // =======================================================

  async submitExam(req, res) {
    try {
      const churchId = getChurchId(req);

      if (!churchId) {
        return res.status(401).json({
          success: false,
          message: "Không xác định được giáo xứ",
        });
      }

      const { batch, answers } = req.body;

      const batchNumber = Number(batch);

      const range = getBatchRange(batchNumber);

      if (!range) {
        return res.status(400).json({
          success: false,
          message: "Đợt thi không hợp lệ",
        });
      }

      // ---------------------------------------------------
      // VALIDATE ANSWERS
      // ---------------------------------------------------

      if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Danh sách đáp án không hợp lệ",
        });
      }

      // ---------------------------------------------------
      // QUESTION IDS
      // ---------------------------------------------------

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

      // ---------------------------------------------------
      // GET QUESTIONS
      // ---------------------------------------------------

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

      // ---------------------------------------------------
      // MAP
      // ---------------------------------------------------

      const questionMap = new Map(
        questions.map((question) => [Number(question.id), question]),
      );

      // ---------------------------------------------------
      // CHẤM
      // ---------------------------------------------------

      let correctCount = 0;

      const results = answers.map((userAnswer) => {
        const questionId = Number(userAnswer?.question_id);

        const question = questionMap.get(questionId);

        const selected = normalizeAnswer(userAnswer?.selected);

        // -------------------------------------------
        // CÂU KHÔNG HỢP LỆ
        // -------------------------------------------

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

        // -------------------------------------------
        // CHECK
        // -------------------------------------------

        const isCorrect = selected === normalizeAnswer(question.correct_answer);

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

      // ---------------------------------------------------
      // SCORE
      // ---------------------------------------------------

      const total = results.length;

      const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

      // ---------------------------------------------------
      // RESPONSE
      // ---------------------------------------------------

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

// =========================================================
// EXPORT
// =========================================================

module.exports = new QuestionController();

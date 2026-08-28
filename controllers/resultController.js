const db = require("../config/db");

// =========================================================
// GET ALL RESULTS
// GET /api/results
//
// Có thể lọc:
// GET /api/results?class_id=1
//
// Trả về mỗi học viên 1 dòng, kèm thông tin lớp
// =========================================================
const getResults = async (req, res) => {
  try {
    const { class_id } = req.query;

    let sql = `
      SELECT
        s.id AS student_id,
        s.name AS student_name,

        c.id AS class_id,
        c.name AS class_name,

        COUNT(r.id) AS total_results,

        ROUND(AVG(r.score), 2) AS average_score,

        MAX(r.score) AS highest_score,

        MIN(r.score) AS lowest_score,

        MAX(r.exam_date) AS latest_exam_date

      FROM results r

      INNER JOIN students s
        ON r.student_id = s.id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id
    `;

    const params = [];

    // =====================================================
    // FILTER CLASS
    // =====================================================

    if (class_id) {
      sql += `
        WHERE c.id = ?
      `;

      params.push(class_id);
    }

    sql += `
      GROUP BY
        s.id,
        s.name,
        c.id,
        c.name

      ORDER BY
        c.name ASC,
        average_score DESC,
        s.name ASC
    `;

    const [results] = await db.query(sql, params);

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("GET RESULTS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách bảng điểm",
      error: error.message,
    });
  }
};

// =========================================================
// GET RESULT BY ID
// GET /api/results/:id
// =========================================================
const getResultById = async (req, res) => {
  try {
    const { id } = req.params;

    const [results] = await db.query(
      `
      SELECT
        r.*,

        s.name AS student_name,

        c.id AS class_id,
        c.name AS class_name

      FROM results r

      LEFT JOIN students s
        ON r.student_id = s.id

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id

      WHERE r.id = ?

      LIMIT 1
      `,
      [id],
    );

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả",
      });
    }

    res.status(200).json({
      success: true,
      data: results[0],
    });
  } catch (error) {
    console.error("GET RESULT BY ID ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy kết quả",
      error: error.message,
    });
  }
};

// =========================================================
// GET RESULTS BY STUDENT
// GET /api/results/student/:studentId
//
// Lấy toàn bộ điểm của 1 học viên
// =========================================================
const getResultsByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [results] = await db.query(
      `
      SELECT
        r.id,
        r.student_id,
        r.score,
        r.exam_type,
        r.exam_date,
        r.note,
        r.created_at,

        s.name AS student_name,

        c.id AS class_id,
        c.name AS class_name

      FROM results r

      INNER JOIN students s
        ON r.student_id = s.id

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id

      WHERE r.student_id = ?

      ORDER BY
        r.exam_date DESC,
        r.created_at DESC
      `,
      [studentId],
    );

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("GET RESULTS BY STUDENT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy kết quả của học viên",
      error: error.message,
    });
  }
};

// =========================================================
// GET RESULTS BY CLASS
// GET /api/results/class/:classId
//
// Bảng điểm của toàn bộ học viên trong lớp
// Mỗi học viên 1 dòng
// =========================================================
const getResultsByClass = async (req, res) => {
  try {
    const { classId } = req.params;

    // =====================================================
    // CHECK CLASS
    // =====================================================

    const [classes] = await db.query(
      `
      SELECT
        id,
        name
      FROM classes
      WHERE id = ?
      LIMIT 1
      `,
      [classId],
    );

    if (classes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp",
      });
    }

    // =====================================================
    // GET RESULTS
    // =====================================================

    const [results] = await db.query(
      `
      SELECT
        s.id AS student_id,
        s.name AS student_name,

        c.id AS class_id,
        c.name AS class_name,

        COUNT(r.id) AS total_results,

        COALESCE(
          ROUND(AVG(r.score), 2),
          0
        ) AS average_score,

        COALESCE(
          MAX(r.score),
          0
        ) AS highest_score,

        COALESCE(
          MIN(r.score),
          0
        ) AS lowest_score,

        MAX(r.exam_date) AS latest_exam_date

      FROM class_students cs

      INNER JOIN students s
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON cs.class_id = c.id

      LEFT JOIN results r
        ON r.student_id = s.id

      WHERE cs.class_id = ?

      GROUP BY
        s.id,
        s.name,
        c.id,
        c.name

      ORDER BY
        average_score DESC,
        s.name ASC
      `,
      [classId],
    );

    res.status(200).json({
      success: true,

      class: classes[0],

      data: results,
    });
  } catch (error) {
    console.error("GET RESULTS BY CLASS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy bảng điểm của lớp",
      error: error.message,
    });
  }
};

// =========================================================
// CREATE RESULT
// POST /api/results
// =========================================================
const createResult = async (req, res) => {
  try {
    const { student_id, score, exam_type, exam_date, note } = req.body;

    // =====================================================
    // VALIDATE STUDENT
    // =====================================================

    if (student_id === undefined || student_id === null || student_id === "") {
      return res.status(400).json({
        success: false,
        message: "student_id là bắt buộc",
      });
    }

    // =====================================================
    // VALIDATE SCORE
    // =====================================================

    if (score === undefined || score === null || score === "") {
      return res.status(400).json({
        success: false,
        message: "Điểm số là bắt buộc",
      });
    }

    const numericScore = Number(score);

    if (Number.isNaN(numericScore)) {
      return res.status(400).json({
        success: false,
        message: "Điểm phải là số",
      });
    }

    if (numericScore < 0 || numericScore > 10) {
      return res.status(400).json({
        success: false,
        message: "Điểm phải nằm trong khoảng 0 - 10",
      });
    }

    // =====================================================
    // VALIDATE EXAM TYPE
    // =====================================================

    const validExamType = exam_type || "online";

    if (!["online", "paper"].includes(validExamType)) {
      return res.status(400).json({
        success: false,
        message: "exam_type chỉ được là online hoặc paper",
      });
    }

    // =====================================================
    // CHECK STUDENT
    // =====================================================

    const [students] = await db.query(
      `
      SELECT id
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [student_id],
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học viên",
      });
    }

    // =====================================================
    // CREATE RESULT
    // =====================================================

    const [result] = await db.query(
      `
      INSERT INTO results (
        student_id,
        score,
        exam_type,
        exam_date,
        note
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        student_id,
        numericScore,
        validExamType,
        exam_date || null,
        note || null,
      ],
    );

    // =====================================================
    // GET CREATED RESULT
    // =====================================================

    const [createdResult] = await db.query(
      `
      SELECT
        r.*,

        s.name AS student_name,

        c.id AS class_id,
        c.name AS class_name

      FROM results r

      LEFT JOIN students s
        ON r.student_id = s.id

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id

      WHERE r.id = ?

      LIMIT 1
      `,
      [result.insertId],
    );

    res.status(201).json({
      success: true,
      message: "Thêm kết quả thành công",
      data: createdResult[0],
    });
  } catch (error) {
    console.error("CREATE RESULT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể thêm kết quả",
      error: error.message,
    });
  }
};

// =========================================================
// UPDATE RESULT
// PUT /api/results/:id
// =========================================================
const updateResult = async (req, res) => {
  try {
    const { id } = req.params;

    const { student_id, score, exam_type, exam_date, note } = req.body;

    // =====================================================
    // CHECK RESULT
    // =====================================================

    const [existingResults] = await db.query(
      `
      SELECT *
      FROM results
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (existingResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả",
      });
    }

    const existingResult = existingResults[0];

    // =====================================================
    // STUDENT
    // =====================================================

    const finalStudentId =
      student_id !== undefined && student_id !== null && student_id !== ""
        ? student_id
        : existingResult.student_id;

    // =====================================================
    // SCORE
    // =====================================================

    const finalScore =
      score !== undefined && score !== null && score !== ""
        ? Number(score)
        : Number(existingResult.score);

    if (Number.isNaN(finalScore)) {
      return res.status(400).json({
        success: false,
        message: "Điểm phải là số",
      });
    }

    if (finalScore < 0 || finalScore > 10) {
      return res.status(400).json({
        success: false,
        message: "Điểm phải nằm trong khoảng 0 - 10",
      });
    }

    // =====================================================
    // EXAM TYPE
    // =====================================================

    const finalExamType = exam_type || existingResult.exam_type;

    if (!["online", "paper"].includes(finalExamType)) {
      return res.status(400).json({
        success: false,
        message: "exam_type chỉ được là online hoặc paper",
      });
    }

    // =====================================================
    // CHECK STUDENT
    // =====================================================

    const [students] = await db.query(
      `
      SELECT id
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [finalStudentId],
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học viên",
      });
    }

    // =====================================================
    // UPDATE
    // =====================================================

    await db.query(
      `
      UPDATE results
      SET
        student_id = ?,
        score = ?,
        exam_type = ?,
        exam_date = ?,
        note = ?

      WHERE id = ?
      `,
      [
        finalStudentId,
        finalScore,
        finalExamType,

        exam_date !== undefined ? exam_date : existingResult.exam_date,

        note !== undefined ? note : existingResult.note,

        id,
      ],
    );

    // =====================================================
    // GET UPDATED
    // =====================================================

    const [updatedResults] = await db.query(
      `
        SELECT
          r.*,

          s.name AS student_name,

          c.id AS class_id,
          c.name AS class_name

        FROM results r

        LEFT JOIN students s
          ON r.student_id = s.id

        LEFT JOIN class_students cs
          ON cs.student_id = s.id

        LEFT JOIN classes c
          ON c.id = cs.class_id

        WHERE r.id = ?

        LIMIT 1
        `,
      [id],
    );

    res.status(200).json({
      success: true,
      message: "Cập nhật kết quả thành công",
      data: updatedResults[0],
    });
  } catch (error) {
    console.error("UPDATE RESULT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật kết quả",
      error: error.message,
    });
  }
};

// =========================================================
// DELETE RESULT
// DELETE /api/results/:id
// =========================================================
const deleteResult = async (req, res) => {
  try {
    const { id } = req.params;

    // =====================================================
    // CHECK
    // =====================================================

    const [results] = await db.query(
      `
      SELECT id
      FROM results
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả",
      });
    }

    // =====================================================
    // DELETE
    // =====================================================

    await db.query(
      `
      DELETE FROM results
      WHERE id = ?
      `,
      [id],
    );

    res.status(200).json({
      success: true,
      message: "Xóa kết quả thành công",
    });
  } catch (error) {
    console.error("DELETE RESULT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể xóa kết quả",
      error: error.message,
    });
  }
};

// =========================================================
// GET STATISTICS
// GET /api/results/statistics
// =========================================================
const getResultStatistics = async (req, res) => {
  try {
    const [statistics] = await db.query(`
      SELECT
        COUNT(*) AS total_results,

        COUNT(
          DISTINCT student_id
        ) AS total_students,

        ROUND(
          AVG(score),
          2
        ) AS average_score,

        MAX(score) AS highest_score,

        MIN(score) AS lowest_score,

        SUM(
          CASE
            WHEN score >= 5
            THEN 1
            ELSE 0
          END
        ) AS passed,

        SUM(
          CASE
            WHEN score < 5
            THEN 1
            ELSE 0
          END
        ) AS failed,

        SUM(
          CASE
            WHEN exam_type = 'online'
            THEN 1
            ELSE 0
          END
        ) AS online_results,

        SUM(
          CASE
            WHEN exam_type = 'paper'
            THEN 1
            ELSE 0
          END
        ) AS paper_results

      FROM results
    `);

    res.status(200).json({
      success: true,
      data: statistics[0],
    });
  } catch (error) {
    console.error("GET RESULT STATISTICS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thống kê kết quả",
      error: error.message,
    });
  }
};

// =========================================================
// GET CLASS STATISTICS
// GET /api/results/class/:classId/statistics
// =========================================================
const getClassStatistics = async (req, res) => {
  try {
    const { classId } = req.params;

    // =====================================================
    // CHECK CLASS
    // =====================================================

    const [classes] = await db.query(
      `
      SELECT
        id,
        name
      FROM classes
      WHERE id = ?
      LIMIT 1
      `,
      [classId],
    );

    if (classes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp",
      });
    }

    // =====================================================
    // STATISTICS
    // =====================================================

    const [statistics] = await db.query(
      `
      SELECT

        COUNT(DISTINCT cs.student_id)
          AS total_students,

        COUNT(r.id)
          AS total_results,

        ROUND(
          AVG(r.score),
          2
        ) AS average_score,

        COALESCE(
          MAX(r.score),
          0
        ) AS highest_score,

        COALESCE(
          MIN(r.score),
          0
        ) AS lowest_score,

        COUNT(
          DISTINCT CASE
            WHEN r.score >= 5
            THEN r.student_id
          END
        ) AS passed_students,

        COUNT(
          DISTINCT CASE
            WHEN r.score < 5
            THEN r.student_id
          END
        ) AS failed_students

      FROM class_students cs

      LEFT JOIN results r
        ON r.student_id = cs.student_id

      WHERE cs.class_id = ?
      `,
      [classId],
    );

    res.status(200).json({
      success: true,

      class: classes[0],

      data: statistics[0],
    });
  } catch (error) {
    console.error("GET CLASS STATISTICS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thống kê của lớp",
      error: error.message,
    });
  }
};

// =========================================================
// GET STUDENT STATISTICS
// GET /api/results/student/:studentId/statistics
// =========================================================
const getStudentStatistics = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [statistics] = await db.query(
      `
      SELECT

        COUNT(*) AS total_results,

        COALESCE(
          ROUND(AVG(score), 2),
          0
        ) AS average_score,

        COALESCE(
          MAX(score),
          0
        ) AS highest_score,

        COALESCE(
          MIN(score),
          0
        ) AS lowest_score,

        SUM(
          CASE
            WHEN score >= 5
            THEN 1
            ELSE 0
          END
        ) AS passed,

        SUM(
          CASE
            WHEN score < 5
            THEN 1
            ELSE 0
          END
        ) AS failed

      FROM results

      WHERE student_id = ?
      `,
      [studentId],
    );

    res.status(200).json({
      success: true,
      data: statistics[0],
    });
  } catch (error) {
    console.error("GET STUDENT RESULT STATISTICS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thống kê của học viên",
      error: error.message,
    });
  }
};

// =========================================================
// GET TOP 3 ALL STUDENTS
// GET /api/results/leaderboard
// =========================================================
const getLeaderboard = async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT

        s.id AS student_id,

        s.name AS student_name,

        c.id AS class_id,

        c.name AS class_name,

        COUNT(r.id) AS total_results,

        ROUND(
          AVG(r.score),
          2
        ) AS average_score,

        MAX(r.score) AS highest_score

      FROM results r

      INNER JOIN students s
        ON r.student_id = s.id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      GROUP BY
        s.id,
        s.name,
        c.id,
        c.name

      ORDER BY
        average_score DESC,
        highest_score DESC

      LIMIT 3
    `);

    const leaderboard = results.map((item, index) => ({
      rank: index + 1,

      student_id: item.student_id,

      student_name: item.student_name,

      class_id: item.class_id,

      class_name: item.class_name,

      average_score: Number(item.average_score),

      highest_score: Number(item.highest_score),

      total_results: Number(item.total_results),
    }));

    res.status(200).json({
      success: true,
      data: leaderboard,
    });
  } catch (error) {
    console.error("GET LEADERBOARD ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy bảng thành tích",
      error: error.message,
    });
  }
};

// =========================================================
// GET TOP 3 BY CLASS
// GET /api/results/class/:classId/leaderboard
// =========================================================
const getClassLeaderboard = async (req, res) => {
  try {
    const { classId } = req.params;

    // =====================================================
    // CHECK CLASS
    // =====================================================

    const [classes] = await db.query(
      `
      SELECT
        id,
        name
      FROM classes
      WHERE id = ?
      LIMIT 1
      `,
      [classId],
    );

    if (classes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp",
      });
    }

    // =====================================================
    // TOP 3
    // =====================================================

    const [results] = await db.query(
      `
      SELECT

        s.id AS student_id,

        s.name AS student_name,

        c.id AS class_id,

        c.name AS class_name,

        COUNT(r.id) AS total_results,

        ROUND(
          AVG(r.score),
          2
        ) AS average_score,

        MAX(r.score) AS highest_score

      FROM class_students cs

      INNER JOIN students s
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON cs.class_id = c.id

      INNER JOIN results r
        ON r.student_id = s.id

      WHERE cs.class_id = ?

      GROUP BY
        s.id,
        s.name,
        c.id,
        c.name

      ORDER BY
        average_score DESC,
        highest_score DESC

      LIMIT 3
      `,
      [classId],
    );

    const leaderboard = results.map((item, index) => ({
      rank: index + 1,

      student_id: item.student_id,

      student_name: item.student_name,

      class_id: item.class_id,

      class_name: item.class_name,

      average_score: Number(item.average_score),

      highest_score: Number(item.highest_score),

      total_results: Number(item.total_results),
    }));

    res.status(200).json({
      success: true,

      class: classes[0],

      data: leaderboard,
    });
  } catch (error) {
    console.error("GET CLASS LEADERBOARD ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy bảng thành tích của lớp",
      error: error.message,
    });
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getResults,
  getResultById,
  getResultsByStudent,
  getResultsByClass,

  createResult,
  updateResult,
  deleteResult,

  getResultStatistics,
  getClassStatistics,
  getStudentStatistics,

  getLeaderboard,
  getClassLeaderboard,
};

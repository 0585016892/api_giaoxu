const db = require("../config/db");

// =========================================================
// HELPER
// =========================================================

const getChurchId = (req) => {
  return req.user?.church_id;
};

const validateChurch = (req, res) => {
  const churchId = getChurchId(req);

  if (!churchId) {
    res.status(403).json({
      success: false,
      message: "Tài khoản chưa được gán giáo xứ",
    });

    return null;
  }

  return churchId;
};

// =========================================================
// GET ALL RESULTS
// GET /api/results
//
// GET /api/results?class_id=1
//
// Chỉ lấy dữ liệu của giáo xứ đang đăng nhập
// =========================================================
const getResults = async (req, res) => {
  try {
    console.log("\n");
    console.log("====================================================");
    console.log("📊 GET RESULTS - DEBUG");
    console.log("====================================================");

    // =====================================================
    // 1. USER ĐĂNG NHẬP
    // =====================================================

    console.log("👤 req.user =", req.user);

    const churchId = validateChurch(req, res);

    console.log("⛪ churchId =", churchId);

    if (!churchId) return;

    const { class_id } = req.query;

    console.log("🏫 class_id query =", class_id);

    const username = req.user?.username;

    console.log("🔑 username =", username);

    if (!username) {
      console.log("❌ KHÔNG CÓ USERNAME");

      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản giáo viên",
      });
    }

    // =====================================================
    // 2. TÌM GIÁO LÝ VIÊN
    // =====================================================

    const [catechists] = await db.query(
      `
      SELECT
        id,
        catechist_code,
        full_name,
        church_id
      FROM catechists
      WHERE catechist_code = ?
        AND church_id = ?
      LIMIT 1
      `,
      [username, churchId],
    );

    console.log("👨‍🏫 catechists =", catechists);

    if (!catechists.length) {
      console.log("❌ KHÔNG TÌM THẤY GIÁO LÝ VIÊN");

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo lý viên",
      });
    }

    const catechistId = catechists[0].id;

    console.log("🆔 catechistId =", catechistId);

    // =====================================================
    // 3. KIỂM TRA GIÁO LÝ VIÊN ĐƯỢC PHÂN NHỮNG LỚP NÀO
    // =====================================================

    const [assignedClasses] = await db.query(
      `
      SELECT
        ctc.catechist_id,
        ctc.class_id,
        c.id AS real_class_id,
        c.name AS class_name,
        c.church_id
      FROM catechist_classes ctc
      INNER JOIN classes c
        ON c.id = ctc.class_id
      WHERE ctc.catechist_id = ?
        AND c.church_id = ?
      ORDER BY c.id
      `,
      [catechistId, churchId],
    );

    console.log("🏫 LỚP GIÁO VIÊN ĐƯỢC PHÂN:");

    console.table(assignedClasses);

    // =====================================================
    // 4. KIỂM TRA TẤT CẢ STUDENT TRONG CÁC LỚP
    // =====================================================

    const [assignedStudents] = await db.query(
      `
      SELECT
        s.id AS student_id,
        s.name AS student_name,
        c.id AS class_id,
        c.name AS class_name,
        ctc.catechist_id
      FROM catechist_classes ctc

      INNER JOIN classes c
        ON c.id = ctc.class_id
       AND c.church_id = ?

      INNER JOIN class_students cs
        ON cs.class_id = c.id

      INNER JOIN students s
        ON s.id = cs.student_id

      WHERE ctc.catechist_id = ?

      ORDER BY c.id, s.name
      `,
      [churchId, catechistId],
    );

    console.log("👨‍🎓 HỌC SINH CỦA GIÁO VIÊN:");

    console.table(assignedStudents);

    // =====================================================
    // 5. SQL RESULTS
    // =====================================================

    let sql = `
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

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = r.church_id

      INNER JOIN catechist_classes ctc
        ON ctc.class_id = c.id
       AND ctc.catechist_id = ?

      WHERE r.church_id = ?
    `;

    const params = [catechistId, churchId];

    if (class_id) {
      sql += `
        AND c.id = ?
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

    // =====================================================
    // 6. LOG SQL
    // =====================================================

    console.log("\n================ SQL =================");

    console.log(sql);

    console.log("\n================ PARAMS =================");

    console.log(params);

    // =====================================================
    // 7. CHẠY SQL
    // =====================================================

    const [results] = await db.query(sql, params);

    console.log("\n================ RESULT =================");

    console.log("📊 Tổng số dòng:", results.length);

    console.table(results);

    console.log("====================================================");
    console.log("✅ GET RESULTS DONE");
    console.log("====================================================\n");

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("❌ GET RESULTS ERROR:", error);

    return res.status(500).json({
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const { id } = req.params;

    const [results] = await db.query(
      `
      SELECT
        r.id,
        r.church_id,
        r.student_id,
        r.score,
        r.exam_type,
        r.exam_date,
        r.note,
        r.created_at,
        r.updated_at,

        s.name AS student_name,

        c.id AS class_id,
        c.name AS class_name

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = r.church_id

      WHERE r.id = ?
        AND r.church_id = ?

      LIMIT 1
      `,
      [id, churchId],
    );

    if (!results.length) {
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
// =========================================================

const getResultsByStudent = async (req, res) => {
  try {
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const { studentId } = req.params;

    const [results] = await db.query(
      `
      SELECT
        r.id,
        r.church_id,
        r.student_id,
        r.score,
        r.exam_type,
        r.exam_date,
        r.note,
        r.created_at,
        r.updated_at,

        s.name AS student_name,

        c.id AS class_id,
        c.name AS class_name

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = r.church_id

      WHERE r.student_id = ?
        AND r.church_id = ?

      ORDER BY
        r.exam_date DESC,
        r.created_at DESC
      `,
      [studentId, churchId],
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
// =========================================================

const getResultsByClass = async (req, res) => {
  try {
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const { classId } = req.params;

    // =====================================================
    // CHECK CLASS THUỘC GIÁO XỨ
    // =====================================================

    const [classes] = await db.query(
      `
      SELECT
        id,
        name,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classes.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp trong giáo xứ",
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
        ON s.id = cs.student_id

      INNER JOIN classes c
        ON c.id = cs.class_id

      LEFT JOIN results r
        ON r.student_id = s.id
       AND r.church_id = ?

      WHERE cs.class_id = ?
        AND c.church_id = ?

      GROUP BY
        s.id,
        s.name,
        c.id,
        c.name

      ORDER BY
        average_score DESC,
        s.name ASC
      `,
      [churchId, classId, churchId],
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

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
    // EXAM TYPE
    // =====================================================

    const validExamType = exam_type || "online";

    if (!["online", "paper"].includes(validExamType)) {
      return res.status(400).json({
        success: false,
        message: "exam_type chỉ được là online hoặc paper",
      });
    }

    // =====================================================
    // CHECK STUDENT THUỘC GIÁO XỨ
    //
    // students -> class_students -> classes
    // =====================================================

    const [students] = await db.query(
      `
      SELECT DISTINCT
        s.id
      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE s.id = ?
        AND c.church_id = ?

      LIMIT 1
      `,
      [student_id, churchId],
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Học viên không thuộc giáo xứ này",
      });
    }

    // =====================================================
    // CREATE RESULT
    // =====================================================

    const [result] = await db.query(
      `
      INSERT INTO results (
        church_id,
        student_id,
        score,
        exam_type,
        exam_date,
        note
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        churchId,
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

      INNER JOIN students s
        ON s.id = r.student_id

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = r.church_id

      WHERE r.id = ?
        AND r.church_id = ?

      LIMIT 1
      `,
      [result.insertId, churchId],
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const { id } = req.params;

    const { student_id, score, exam_type, exam_date, note } = req.body;

    // =====================================================
    // CHECK RESULT THUỘC GIÁO XỨ
    // =====================================================

    const [existingResults] = await db.query(
      `
      SELECT *
      FROM results
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [id, churchId],
    );

    if (!existingResults.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả trong giáo xứ",
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
    // CHECK STUDENT THUỘC GIÁO XỨ
    // =====================================================

    const [students] = await db.query(
      `
      SELECT DISTINCT
        s.id
      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE s.id = ?
        AND c.church_id = ?

      LIMIT 1
      `,
      [finalStudentId, churchId],
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Học viên không thuộc giáo xứ này",
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
        note = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
        AND church_id = ?
      `,
      [
        finalStudentId,
        finalScore,
        finalExamType,
        exam_date !== undefined ? exam_date : existingResult.exam_date,
        note !== undefined ? note : existingResult.note,
        id,
        churchId,
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

      INNER JOIN students s
        ON s.id = r.student_id

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = r.church_id

      WHERE r.id = ?
        AND r.church_id = ?

      LIMIT 1
      `,
      [id, churchId],
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const { id } = req.params;

    const [results] = await db.query(
      `
      SELECT id
      FROM results
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [id, churchId],
    );

    if (!results.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả",
      });
    }

    await db.query(
      `
      DELETE FROM results
      WHERE id = ?
        AND church_id = ?
      `,
      [id, churchId],
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const [statistics] = await db.query(
      `
      SELECT
        COUNT(*) AS total_results,

        COUNT(
          DISTINCT student_id
        ) AS total_students,

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
            WHEN score >= 5 THEN 1
            ELSE 0
          END
        ) AS passed,

        SUM(
          CASE
            WHEN score < 5 THEN 1
            ELSE 0
          END
        ) AS failed,

        SUM(
          CASE
            WHEN exam_type = 'online' THEN 1
            ELSE 0
          END
        ) AS online_results,

        SUM(
          CASE
            WHEN exam_type = 'paper' THEN 1
            ELSE 0
          END
        ) AS paper_results

      FROM results

      WHERE church_id = ?
      `,
      [churchId],
    );

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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const { classId } = req.params;

    const [classes] = await db.query(
      `
      SELECT
        id,
        name,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classes.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp",
      });
    }

    const [statistics] = await db.query(
      `
      SELECT

        COUNT(DISTINCT cs.student_id)
          AS total_students,

        COUNT(r.id)
          AS total_results,

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

      INNER JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = ?

      LEFT JOIN results r
        ON r.student_id = cs.student_id
       AND r.church_id = ?

      WHERE cs.class_id = ?
      `,
      [churchId, churchId, classId],
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

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
            WHEN score >= 5 THEN 1
            ELSE 0
          END
        ) AS passed,

        SUM(
          CASE
            WHEN score < 5 THEN 1
            ELSE 0
          END
        ) AS failed

      FROM results

      WHERE student_id = ?
        AND church_id = ?
      `,
      [studentId, churchId],
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

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

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = r.church_id

      WHERE r.church_id = ?

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
      [churchId],
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
    const churchId = validateChurch(req, res);

    if (!churchId) return;

    const { classId } = req.params;

    // =====================================================
    // CHECK CLASS
    // =====================================================

    const [classes] = await db.query(
      `
      SELECT
        id,
        name,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classes.length) {
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
        ON s.id = cs.student_id

      INNER JOIN classes c
        ON c.id = cs.class_id

      INNER JOIN results r
        ON r.student_id = s.id
       AND r.church_id = ?

      WHERE cs.class_id = ?
        AND c.church_id = ?

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
      [churchId, classId, churchId],
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

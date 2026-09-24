const db = require("../config/db");

// =========================================================
// HELPERS
// =========================================================

const getChurchId = (req) => {
  const churchId = req.user?.church_id;

  if (!churchId) {
    const error = new Error("Tài khoản chưa được gán giáo xứ");
    error.statusCode = 403;
    throw error;
  }

  return Number(churchId);
};

const getPagination = (req) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
  };
};

const isValidId = (value) => {
  return Number.isInteger(Number(value)) && Number(value) > 0;
};

const normalizeNullable = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
};

// =========================================================
// STATISTICS
// =========================================================

/**
 * GET /api/results/statistics
 *
 * Thống kê kết quả của toàn giáo xứ
 */
exports.getResultStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS total_results,

        COUNT(DISTINCT student_id) AS total_students,

        COUNT(DISTINCT grading_rule_item_id) AS total_rule_items,

        ROUND(AVG(score), 2) AS average_score,

        MAX(score) AS highest_score,

        MIN(score) AS lowest_score,

        SUM(
          CASE
            WHEN score >= 5 THEN 1
            ELSE 0
          END
        ) AS passed_results,

        SUM(
          CASE
            WHEN score < 5 THEN 1
            ELSE 0
          END
        ) AS failed_results

      FROM results

      WHERE church_id = ?
      `,
      [churchId],
    );

    const statistics = rows[0] || {
      total_results: 0,
      total_students: 0,
      total_rule_items: 0,
      average_score: 0,
      highest_score: null,
      lowest_score: null,
      passed_results: 0,
      failed_results: 0,
    };

    const totalResults = Number(statistics.total_results || 0);

    statistics.pass_rate =
      totalResults > 0
        ? Number(
            (
              (Number(statistics.passed_results || 0) / totalResults) *
              100
            ).toFixed(2),
          )
        : 0;

    statistics.fail_rate =
      totalResults > 0
        ? Number(
            (
              (Number(statistics.failed_results || 0) / totalResults) *
              100
            ).toFixed(2),
          )
        : 0;

    return res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    console.error("❌ getResultStatistics:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy thống kê kết quả",
    });
  }
};

// =========================================================
// CLASS
// =========================================================

/**
 * GET /api/results/class/:classId
 *
 * Bảng điểm của lớp
 */
exports.getResultsByClass = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { classId } = req.params;

    if (!isValidId(classId)) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
      });
    }

    const { page, limit, offset } = getPagination(req);

    const [rows] = await db.query(
      `
      SELECT
        r.id,

        r.church_id,

        r.student_id,

        s.code AS student_code,

        s.name AS student_name,

        s.gender,

        r.grading_rule_id,

        r.grading_rule_item_id,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        r.score,

        r.exam_type,

        r.exam_date,

        r.note,

        r.created_at,

        r.updated_at

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = r.church_id

      INNER JOIN class_students cs
        ON cs.student_id = r.student_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
        AND gri.grading_rule_id = r.grading_rule_id

      WHERE r.church_id = ?
        AND cs.class_id = ?

      ORDER BY
        s.name ASC,
        gri.sort_order ASC,
        r.exam_date DESC,
        r.id DESC

      LIMIT ? OFFSET ?
      `,
      [churchId, Number(classId), limit, offset],
    );

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total

      FROM results r

      INNER JOIN class_students cs
        ON cs.student_id = r.student_id

      WHERE r.church_id = ?
        AND cs.class_id = ?
      `,
      [churchId, Number(classId)],
    );

    const total = Number(countRows[0]?.total || 0);

    return res.json({
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
    console.error("❌ getResultsByClass:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy bảng điểm của lớp",
    });
  }
};

/**
 * GET /api/results/class/:classId/statistics
 *
 * Thống kê điểm của lớp
 */
exports.getClassStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { classId } = req.params;

    if (!isValidId(classId)) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        COUNT(r.id) AS total_results,

        COUNT(DISTINCT r.student_id)
          AS total_students,

        ROUND(AVG(r.score), 2)
          AS average_score,

        MAX(r.score)
          AS highest_score,

        MIN(r.score)
          AS lowest_score,

        SUM(
          CASE
            WHEN r.score >= 5 THEN 1
            ELSE 0
          END
        ) AS passed_results,

        SUM(
          CASE
            WHEN r.score < 5 THEN 1
            ELSE 0
          END
        ) AS failed_results

      FROM results r

      INNER JOIN class_students cs
        ON cs.student_id = r.student_id

      WHERE r.church_id = ?
        AND cs.class_id = ?
      `,
      [churchId, Number(classId)],
    );

    const data = rows[0] || {};

    const total = Number(data.total_results || 0);

    data.pass_rate =
      total > 0
        ? Number(((Number(data.passed_results || 0) / total) * 100).toFixed(2))
        : 0;

    data.fail_rate =
      total > 0
        ? Number(((Number(data.failed_results || 0) / total) * 100).toFixed(2))
        : 0;

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("❌ getClassStatistics:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy thống kê lớp",
    });
  }
};

// =========================================================
// STUDENT
// =========================================================

/**
 * GET /api/results/student/:studentId
 *
 * Toàn bộ điểm của học sinh
 */
exports.getResultsByStudent = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { studentId } = req.params;

    if (!isValidId(studentId)) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        r.id,

        r.church_id,

        r.student_id,

        s.code AS student_code,

        s.name AS student_name,

        r.grading_rule_id,

        r.grading_rule_item_id,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        gri.sort_order,

        gri.allow_multiple,

        gri.aggregation_method,

        r.score,

        r.exam_type,

        r.exam_date,

        r.note,

        r.created_at,

        r.updated_at

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = r.church_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
        AND gri.grading_rule_id = r.grading_rule_id

      WHERE r.church_id = ?
        AND r.student_id = ?

      ORDER BY
        gri.sort_order ASC,
        r.exam_date DESC,
        r.id DESC
      `,
      [churchId, Number(studentId)],
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("❌ getResultsByStudent:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy điểm của học sinh",
    });
  }
};

/**
 * GET /api/results/student/:studentId/statistics
 *
 * Thống kê điểm học sinh
 */
exports.getStudentStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { studentId } = req.params;

    if (!isValidId(studentId)) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS total_results,

        COUNT(DISTINCT grading_rule_item_id)
          AS total_items,

        ROUND(AVG(score), 2)
          AS average_score,

        MAX(score)
          AS highest_score,

        MIN(score)
          AS lowest_score,

        SUM(
          CASE
            WHEN score >= 5 THEN 1
            ELSE 0
          END
        ) AS passed_results,

        SUM(
          CASE
            WHEN score < 5 THEN 1
            ELSE 0
          END
        ) AS failed_results

      FROM results

      WHERE church_id = ?
        AND student_id = ?
      `,
      [churchId, Number(studentId)],
    );

    const data = rows[0] || {};

    const total = Number(data.total_results || 0);

    data.pass_rate =
      total > 0
        ? Number(((Number(data.passed_results || 0) / total) * 100).toFixed(2))
        : 0;

    data.fail_rate =
      total > 0
        ? Number(((Number(data.failed_results || 0) / total) * 100).toFixed(2))
        : 0;

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("❌ getStudentStatistics:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy thống kê học sinh",
    });
  }
};

// =========================================================
// GRADING RULE
// =========================================================

/**
 * GET /api/results/rule/:ruleId
 *
 * Lấy các kết quả thuộc một grading rule
 */
exports.getResultsByRule = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { ruleId } = req.params;

    if (!isValidId(ruleId)) {
      return res.status(400).json({
        success: false,
        message: "ruleId không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        r.id,

        r.student_id,

        s.code AS student_code,

        s.name AS student_name,

        r.grading_rule_id,

        r.grading_rule_item_id,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        gri.sort_order,

        r.score,

        r.exam_type,

        r.exam_date,

        r.note,

        r.created_at,

        r.updated_at

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = r.church_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
        AND gri.grading_rule_id = r.grading_rule_id

      WHERE r.church_id = ?
        AND r.grading_rule_id = ?

      ORDER BY
        s.name ASC,
        gri.sort_order ASC,
        r.exam_date DESC,
        r.id DESC
      `,
      [churchId, Number(ruleId)],
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("❌ getResultsByRule:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy kết quả theo bộ quy tắc",
    });
  }
};

/**
 * GET /api/results/rule-item/:ruleItemId
 *
 * Lấy kết quả của một đầu điểm
 */
exports.getResultsByRuleItem = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { ruleItemId } = req.params;

    if (!isValidId(ruleItemId)) {
      return res.status(400).json({
        success: false,
        message: "ruleItemId không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        r.id,

        r.student_id,

        s.code AS student_code,

        s.name AS student_name,

        r.grading_rule_id,

        r.grading_rule_item_id,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        r.score,

        r.exam_type,

        r.exam_date,

        r.note,

        r.created_at,

        r.updated_at

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = r.church_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id

      WHERE r.church_id = ?
        AND r.grading_rule_item_id = ?

      ORDER BY
        s.name ASC,
        r.exam_date DESC,
        r.id DESC
      `,
      [churchId, Number(ruleItemId)],
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("❌ getResultsByRuleItem:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy kết quả theo đầu điểm",
    });
  }
};

// =========================================================
// GET ALL
// =========================================================

/**
 * GET /api/results
 *
 * Danh sách kết quả
 *
 * Query:
 * ?page=1
 * &limit=20
 * &student_id=1
 * &grading_rule_id=1
 * &grading_rule_item_id=2
 * &class_id=3
 * &exam_type=paper
 */
exports.getResults = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { page, limit, offset } = getPagination(req);

    const {
      student_id,
      grading_rule_id,
      grading_rule_item_id,
      class_id,
      exam_type,
    } = req.query;

    const conditions = ["r.church_id = ?"];

    const params = [churchId];

    if (student_id) {
      if (!isValidId(student_id)) {
        return res.status(400).json({
          success: false,
          message: "student_id không hợp lệ",
        });
      }

      conditions.push("r.student_id = ?");

      params.push(Number(student_id));
    }

    if (grading_rule_id) {
      if (!isValidId(grading_rule_id)) {
        return res.status(400).json({
          success: false,
          message: "grading_rule_id không hợp lệ",
        });
      }

      conditions.push("r.grading_rule_id = ?");

      params.push(Number(grading_rule_id));
    }

    if (grading_rule_item_id) {
      if (!isValidId(grading_rule_item_id)) {
        return res.status(400).json({
          success: false,
          message: "grading_rule_item_id không hợp lệ",
        });
      }

      conditions.push("r.grading_rule_item_id = ?");

      params.push(Number(grading_rule_item_id));
    }

    if (class_id) {
      if (!isValidId(class_id)) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ",
        });
      }

      conditions.push(`
        EXISTS (
          SELECT 1
          FROM class_students cs
          WHERE cs.student_id = r.student_id
            AND cs.class_id = ?
        )
      `);

      params.push(Number(class_id));
    }

    if (exam_type) {
      if (!["online", "paper"].includes(exam_type)) {
        return res.status(400).json({
          success: false,
          message: "exam_type phải là online hoặc paper",
        });
      }

      conditions.push("r.exam_type = ?");

      params.push(exam_type);
    }

    const whereClause = conditions.join(" AND ");

    const [rows] = await db.query(
      `
      SELECT
        r.id,

        r.church_id,

        r.student_id,

        s.code AS student_code,

        s.name AS student_name,

        r.grading_rule_id,

        r.grading_rule_item_id,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        gri.sort_order,

        gri.allow_multiple,

        gri.aggregation_method,

        r.score,

        r.exam_type,

        r.exam_date,

        r.note,

        r.created_at,

        r.updated_at

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = r.church_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
        AND gri.grading_rule_id = r.grading_rule_id

      WHERE ${whereClause}

      ORDER BY
        r.created_at DESC,
        r.id DESC

      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    const countParams = [...params];

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = r.church_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
        AND gri.grading_rule_id = r.grading_rule_id

      WHERE ${whereClause}
      `,
      countParams,
    );

    const total = Number(countRows[0]?.total || 0);

    return res.json({
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
    console.error("❌ getResults:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy danh sách kết quả",
    });
  }
};

// =========================================================
// GET BY ID
// =========================================================

/**
 * GET /api/results/:id
 */
exports.getResultById = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID kết quả không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        r.id,

        r.church_id,

        r.student_id,

        s.code AS student_code,

        s.name AS student_name,

        r.grading_rule_id,

        r.grading_rule_item_id,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        gri.sort_order,

        gri.allow_multiple,

        gri.aggregation_method,

        r.score,

        r.exam_type,

        r.exam_date,

        r.note,

        r.created_at,

        r.updated_at

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = r.church_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
        AND gri.grading_rule_id = r.grading_rule_id

      WHERE r.id = ?
        AND r.church_id = ?

      LIMIT 1
      `,
      [Number(id), churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ getResultById:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể lấy chi tiết kết quả",
    });
  }
};

// =========================================================
// CREATE
// =========================================================

/**
 * POST /api/results
 */
exports.createResult = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const {
      student_id,
      grading_rule_id,
      grading_rule_item_id,
      score,
      exam_type = "online",
      exam_date,
      note,
    } = req.body;

    // -----------------------------------------------------
    // VALIDATION
    // -----------------------------------------------------

    if (!isValidId(student_id)) {
      return res.status(400).json({
        success: false,
        message: "student_id không hợp lệ",
      });
    }

    if (!isValidId(grading_rule_id)) {
      return res.status(400).json({
        success: false,
        message: "grading_rule_id không hợp lệ",
      });
    }

    if (!isValidId(grading_rule_item_id)) {
      return res.status(400).json({
        success: false,
        message: "grading_rule_item_id không hợp lệ",
      });
    }

    if (score === undefined || score === null || score === "") {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập điểm",
      });
    }

    const numericScore = Number(score);

    if (!Number.isFinite(numericScore)) {
      return res.status(400).json({
        success: false,
        message: "Điểm không hợp lệ",
      });
    }

    if (!["online", "paper"].includes(exam_type)) {
      return res.status(400).json({
        success: false,
        message: "exam_type phải là online hoặc paper",
      });
    }

    // -----------------------------------------------------
    // CHECK STUDENT
    // -----------------------------------------------------

    const [studentRows] = await db.query(
      `
      SELECT
        id,
        name,
        church_id

      FROM students

      WHERE id = ?
        AND church_id = ?

      LIMIT 1
      `,
      [Number(student_id), churchId],
    );

    if (!studentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ",
      });
    }

    // -----------------------------------------------------
    // CHECK RULE + ITEM
    // -----------------------------------------------------

    const [ruleRows] = await db.query(
      `
      SELECT
        gr.id AS grading_rule_id,

        gr.church_id,

        gr.status,

        gri.id AS grading_rule_item_id,

        gri.name,

        gri.code,

        gri.max_score,

        gri.allow_multiple,

        gri.aggregation_method

      FROM grading_rules gr

      INNER JOIN grading_rule_items gri
        ON gri.grading_rule_id = gr.id

      WHERE gr.id = ?
        AND gr.church_id = ?
        AND gri.id = ?

      LIMIT 1
      `,
      [Number(grading_rule_id), churchId, Number(grading_rule_item_id)],
    );

    if (!ruleRows.length) {
      return res.status(404).json({
        success: false,
        message: "Bộ quy tắc hoặc đầu điểm không tồn tại",
      });
    }

    const ruleItem = ruleRows[0];

    if (ruleItem.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Bộ quy tắc tính điểm hiện không hoạt động",
      });
    }

    const maxScore = Number(ruleItem.max_score);

    if (numericScore < 0 || numericScore > maxScore) {
      return res.status(400).json({
        success: false,
        message: `Điểm phải từ 0 đến ${maxScore}`,
      });
    }

    // -----------------------------------------------------
    // CHECK MULTIPLE
    // -----------------------------------------------------

    if (Number(ruleItem.allow_multiple) === 0) {
      const [existingRows] = await db.query(
        `
        SELECT id

        FROM results

        WHERE church_id = ?
          AND student_id = ?
          AND grading_rule_id = ?
          AND grading_rule_item_id = ?

        LIMIT 1
        `,
        [
          churchId,
          Number(student_id),
          Number(grading_rule_id),
          Number(grading_rule_item_id),
        ],
      );

      if (existingRows.length) {
        return res.status(409).json({
          success: false,
          message: "Học sinh đã có điểm ở đầu điểm này",
        });
      }
    }

    // -----------------------------------------------------
    // INSERT
    // -----------------------------------------------------

    const [result] = await db.query(
      `
      INSERT INTO results (
        church_id,
        student_id,
        grading_rule_id,
        grading_rule_item_id,
        score,
        exam_type,
        exam_date,
        note
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        churchId,
        Number(student_id),
        Number(grading_rule_id),
        Number(grading_rule_item_id),
        numericScore,
        exam_type,
        normalizeNullable(exam_date),
        normalizeNullable(note),
      ],
    );

    // -----------------------------------------------------
    // GET CREATED RESULT
    // -----------------------------------------------------

    const [rows] = await db.query(
      `
      SELECT
        r.*,

        s.code AS student_code,

        s.name AS student_name,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        gri.sort_order,

        gri.allow_multiple,

        gri.aggregation_method

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id

      WHERE r.id = ?
        AND r.church_id = ?

      LIMIT 1
      `,
      [result.insertId, churchId],
    );

    return res.status(201).json({
      success: true,
      message: "Thêm kết quả thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ createResult:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể thêm kết quả",
    });
  }
};

// =========================================================
// UPDATE
// =========================================================

/**
 * PUT /api/results/:id
 */
exports.updateResult = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID kết quả không hợp lệ",
      });
    }

    // -----------------------------------------------------
    // CHECK RESULT
    // -----------------------------------------------------

    const [existingRows] = await db.query(
      `
      SELECT *

      FROM results

      WHERE id = ?
        AND church_id = ?

      LIMIT 1
      `,
      [Number(id), churchId],
    );

    if (!existingRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả",
      });
    }

    const existing = existingRows[0];

    const {
      score,
      exam_type,
      exam_date,
      note,
      grading_rule_id,
      grading_rule_item_id,
    } = req.body;

    // -----------------------------------------------------
    // UPDATE SCORE
    // -----------------------------------------------------

    let finalScore = existing.score;

    if (score !== undefined && score !== null && score !== "") {
      const numericScore = Number(score);

      if (!Number.isFinite(numericScore)) {
        return res.status(400).json({
          success: false,
          message: "Điểm không hợp lệ",
        });
      }

      finalScore = numericScore;
    }

    // -----------------------------------------------------
    // FINAL RULE / ITEM
    // -----------------------------------------------------

    const finalRuleId =
      grading_rule_id !== undefined
        ? Number(grading_rule_id)
        : Number(existing.grading_rule_id);

    const finalRuleItemId =
      grading_rule_item_id !== undefined
        ? Number(grading_rule_item_id)
        : Number(existing.grading_rule_item_id);

    if (!isValidId(finalRuleId)) {
      return res.status(400).json({
        success: false,
        message: "grading_rule_id không hợp lệ",
      });
    }

    if (!isValidId(finalRuleItemId)) {
      return res.status(400).json({
        success: false,
        message: "grading_rule_item_id không hợp lệ",
      });
    }

    // -----------------------------------------------------
    // CHECK RULE + ITEM
    // -----------------------------------------------------

    const [ruleRows] = await db.query(
      `
      SELECT
        gr.id AS grading_rule_id,

        gr.church_id,

        gr.status,

        gri.id AS grading_rule_item_id,

        gri.max_score,

        gri.allow_multiple

      FROM grading_rules gr

      INNER JOIN grading_rule_items gri
        ON gri.grading_rule_id = gr.id

      WHERE gr.id = ?
        AND gr.church_id = ?
        AND gri.id = ?

      LIMIT 1
      `,
      [finalRuleId, churchId, finalRuleItemId],
    );

    if (!ruleRows.length) {
      return res.status(404).json({
        success: false,
        message: "Bộ quy tắc hoặc đầu điểm không tồn tại",
      });
    }

    const ruleItem = ruleRows[0];

    if (ruleItem.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Bộ quy tắc tính điểm hiện không hoạt động",
      });
    }

    const maxScore = Number(ruleItem.max_score);

    if (finalScore < 0 || finalScore > maxScore) {
      return res.status(400).json({
        success: false,
        message: `Điểm phải từ 0 đến ${maxScore}`,
      });
    }

    // -----------------------------------------------------
    // CHECK DUPLICATE
    // -----------------------------------------------------

    if (Number(ruleItem.allow_multiple) === 0) {
      const [duplicateRows] = await db.query(
        `
          SELECT id

          FROM results

          WHERE church_id = ?
            AND student_id = ?
            AND grading_rule_id = ?
            AND grading_rule_item_id = ?
            AND id <> ?

          LIMIT 1
          `,
        [
          churchId,
          existing.student_id,
          finalRuleId,
          finalRuleItemId,
          Number(id),
        ],
      );

      if (duplicateRows.length) {
        return res.status(409).json({
          success: false,
          message: "Học sinh đã có kết quả ở đầu điểm này",
        });
      }
    }

    // -----------------------------------------------------
    // EXAM TYPE
    // -----------------------------------------------------

    const finalExamType =
      exam_type !== undefined ? exam_type : existing.exam_type;

    if (
      finalExamType !== null &&
      !["online", "paper"].includes(finalExamType)
    ) {
      return res.status(400).json({
        success: false,
        message: "exam_type phải là online hoặc paper",
      });
    }

    // -----------------------------------------------------
    // UPDATE
    // -----------------------------------------------------

    await db.query(
      `
      UPDATE results

      SET
        grading_rule_id = ?,
        grading_rule_item_id = ?,
        score = ?,
        exam_type = ?,
        exam_date = ?,
        note = ?

      WHERE id = ?
        AND church_id = ?
      `,
      [
        finalRuleId,
        finalRuleItemId,
        finalScore,
        finalExamType,
        normalizeNullable(
          exam_date !== undefined ? exam_date : existing.exam_date,
        ),
        normalizeNullable(note !== undefined ? note : existing.note),
        Number(id),
        churchId,
      ],
    );

    // -----------------------------------------------------
    // RETURN UPDATED
    // -----------------------------------------------------

    const [rows] = await db.query(
      `
      SELECT
        r.*,

        s.code AS student_code,

        s.name AS student_name,

        gri.code AS item_code,

        gri.name AS item_name,

        gri.weight,

        gri.max_score,

        gri.sort_order,

        gri.allow_multiple,

        gri.aggregation_method

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id

      WHERE r.id = ?
        AND r.church_id = ?

      LIMIT 1
      `,
      [Number(id), churchId],
    );

    return res.json({
      success: true,
      message: "Cập nhật kết quả thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ updateResult:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể cập nhật kết quả",
    });
  }
};

// =========================================================
// DELETE
// =========================================================

/**
 * DELETE /api/results/:id
 */
exports.deleteResult = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID kết quả không hợp lệ",
      });
    }

    const [existingRows] = await db.query(
      `
      SELECT id

      FROM results

      WHERE id = ?
        AND church_id = ?

      LIMIT 1
      `,
      [Number(id), churchId],
    );

    if (!existingRows.length) {
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
      [Number(id), churchId],
    );

    return res.json({
      success: true,
      message: "Xóa kết quả thành công",
    });
  } catch (error) {
    console.error("❌ deleteResult:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Không thể xóa kết quả",
    });
  }
};

exports.getLeaderboard = async (req, res) => {
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

exports.getClassLeaderboard = async (req, res) => {
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

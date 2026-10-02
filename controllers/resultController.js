const db = require("../config/db");
const ExcelJS = require("exceljs");

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
    const churchId = req.user?.church_id;

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
    const churchId = req.user?.church_id;

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

// =====================================================
// EXPORT BẢNG ĐIỂM EXCEL - FAITHEDU
// GET /api/results/export-excel/:classId
// =====================================================
exports.exportResultsExcel = async (req, res) => {
  const startedAt = Date.now();
  const logPrefix = "[EXPORT RESULTS EXCEL]";

  // Log có cấu trúc để dễ tìm trong PM2
  const log = (step, data = {}) => {
    console.log(`${logPrefix} ${step}`, {
      time: new Date().toISOString(),
      ...data,
    });
  };

  try {
    log("BẮT ĐẦU", {
      params: req.params,
      userId: req.user?.id,
      churchId: req.user?.church_id,
    });

    // -------------------------------------------------
    // 1. KIỂM TRA ĐẦU VÀO
    // -------------------------------------------------
    const churchId = Number(getChurchId(req));
    const classId = Number(req.params.classId);

    if (!Number.isInteger(classId) || classId <= 0) {
      log("LỖI: CLASS_ID KHÔNG HỢP LỆ", {
        receivedClassId: req.params.classId,
      });

      return res.status(400).json({
        success: false,
        message: "Mã lớp không hợp lệ.",
        code: "INVALID_CLASS_ID",
      });
    }

    if (!Number.isInteger(churchId) || churchId <= 0) {
      log("LỖI: CHURCH_ID KHÔNG HỢP LỆ", { churchId });

      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ.",
        code: "INVALID_CHURCH_ID",
      });
    }

    log("ĐẦU VÀO HỢP LỆ", { churchId, classId });

    // -------------------------------------------------
    // 2. LẤY THÔNG TIN GIÁO XỨ
    // -------------------------------------------------
    log("BƯỚC 1: TRUY VẤN GIÁO XỨ");

    const [churchRows] = await db.query(
      `
        SELECT id, name
        FROM churches
        WHERE id = ?
        LIMIT 1
      `,
      [churchId],
    );

    if (!churchRows.length) {
      log("KHÔNG TÌM THẤY GIÁO XỨ", { churchId });

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin giáo xứ.",
        code: "CHURCH_NOT_FOUND",
      });
    }

    const church = churchRows[0];

    log("ĐÃ LẤY GIÁO XỨ", {
      churchId: church.id,
      churchName: church.name,
    });

    // -------------------------------------------------
    // 3. LẤY THÔNG TIN LỚP
    // -------------------------------------------------
    log("BƯỚC 2: TRUY VẤN LỚP");

    const [classRows] = await db.query(
      `
        SELECT id, name
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classRows.length) {
      log("KHÔNG TÌM THẤY LỚP HOẶC KHÔNG THUỘC GIÁO XỨ", {
        churchId,
        classId,
      });

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học hoặc lớp không thuộc giáo xứ.",
        code: "CLASS_NOT_FOUND",
      });
    }

    const classInfo = classRows[0];

    log("ĐÃ LẤY LỚP", {
      classId: classInfo.id,
      className: classInfo.name,
    });

    // -------------------------------------------------
    // 4. LẤY QUY TẮC CHẤM ĐIỂM
    // -------------------------------------------------
    log("BƯỚC 3: TRUY VẤN QUY TẮC CHẤM ĐIỂM");

    const [gradingRuleRows] = await db.query(
      `
    SELECT id, status
    FROM grading_rules
    WHERE church_id = ?
    ORDER BY
      CASE WHEN status = 'active' THEN 0 ELSE 1 END,
      id DESC
    LIMIT 1
  `,
      [churchId],
    );
    const gradingRule = gradingRuleRows[0] || null;

    log("KẾT QUẢ QUY TẮC CHẤM ĐIỂM", {
      found: Boolean(gradingRule),
      gradingRuleId: gradingRule?.id || null,
      status: gradingRule?.status || null,
    });
    // -------------------------------------------------
    // 5. LẤY CÁC ĐẦU ĐIỂM
    // -------------------------------------------------
    let gradingItems = [];

    if (gradingRule) {
      log("BƯỚC 4: TRUY VẤN CÁC ĐẦU ĐIỂM", {
        gradingRuleId: gradingRule.id,
      });

      const [gradingItemRows] = await db.query(
        `
          SELECT
            id,
            code,
            name,
            weight,
            max_score,
            sort_order,
            allow_multiple,
            aggregation_method
          FROM grading_rule_items
          WHERE grading_rule_id = ?
          ORDER BY sort_order ASC, id ASC
        `,
        [gradingRule.id],
      );

      gradingItems = gradingItemRows;

      log("ĐÃ LẤY CÁC ĐẦU ĐIỂM", {
        count: gradingItems.length,
        itemIds: gradingItems.map((item) => item.id),
      });
    } else {
      log("BỎ QUA ĐẦU ĐIỂM", {
        reason: "Giáo xứ chưa có quy tắc chấm điểm.",
      });
    }

    // -------------------------------------------------
    // 6. LẤY DANH SÁCH HỌC SINH CỦA LỚP
    // -------------------------------------------------
    log("BƯỚC 5: TRUY VẤN HỌC SINH");

    const [students] = await db.query(
      `
        SELECT DISTINCT
          s.id,
          s.code,
          s.name,
          s.gender
        FROM class_students cs
        INNER JOIN students s
          ON s.id = cs.student_id
         AND s.church_id = ?
        WHERE cs.class_id = ?
        ORDER BY s.name ASC, s.id ASC
      `,
      [churchId, classId],
    );

    log("ĐÃ LẤY DANH SÁCH HỌC SINH", {
      count: students.length,
      sample: students.slice(0, 3).map((student) => ({
        id: student.id,
        code: student.code,
        name: student.name,
      })),
    });

    // -------------------------------------------------
    // 7. LẤY TOÀN BỘ KẾT QUẢ CỦA LỚP
    // Không lấy theo phân trang của API danh sách.
    // -------------------------------------------------
    log("BƯỚC 6: TRUY VẤN KẾT QUẢ");

    const [results] = await db.query(
      `
        SELECT
          r.id,
          r.student_id,
          r.grading_rule_id,
          r.grading_rule_item_id,
          r.score,
          r.exam_type,
          r.exam_date,
          r.note,
          gri.name AS item_name,
          gri.code AS item_code
        FROM results r
        INNER JOIN class_students cs
          ON cs.student_id = r.student_id
         AND cs.class_id = ?
        INNER JOIN students s
          ON s.id = r.student_id
         AND s.church_id = r.church_id
        LEFT JOIN grading_rule_items gri
          ON gri.id = r.grading_rule_item_id
        WHERE r.church_id = ?
          AND r.student_id IN (
            SELECT cs2.student_id
            FROM class_students cs2
            WHERE cs2.class_id = ?
          )
        ORDER BY
          s.name ASC,
          r.exam_date ASC,
          r.id ASC
      `,
      [classId, churchId, classId],
    );

    log("ĐÃ LẤY KẾT QUẢ", {
      count: results.length,
      sample: results.slice(0, 5).map((result) => ({
        id: result.id,
        studentId: result.student_id,
        itemId: result.grading_rule_item_id,
        itemName: result.item_name,
        score: result.score,
      })),
    });

    // -------------------------------------------------
    // 8. TẠO WORKBOOK
    // -------------------------------------------------
    log("BƯỚC 7: KHỞI TẠO EXCEL");

    const COLORS = {
      navy: "173B5E",
      navyLight: "24476B",
      gold: "D9A441",
      goldLight: "FBF5E7",
      bluePale: "F2F7FC",
      green: "548235",
      greenLight: "E2F0D9",
      white: "FFFFFF",
      text: "243247",
      muted: "667085",
      border: "D6DEE8",
      grayLight: "F2F4F7",
    };

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "FaithEdu";
    workbook.lastModifiedBy = "FaithEdu";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Bảng điểm học sinh";
    workbook.title = `Bảng điểm ${classInfo.name || ""}`;
    workbook.company = "FaithEdu";

    // Map học sinh để tránh find() lặp lại nhiều lần
    const studentMap = new Map(
      students.map((student) => [String(student.id), student]),
    );

    // Map kết quả theo học sinh
    const resultsByStudent = new Map();

    results.forEach((result) => {
      const studentKey = String(result.student_id);

      if (!resultsByStudent.has(studentKey)) {
        resultsByStudent.set(studentKey, []);
      }

      resultsByStudent.get(studentKey).push(result);
    });

    // Map đầu điểm
    const gradingItemMap = new Map(
      gradingItems.map((item) => [String(item.id), item]),
    );

    // -------------------------------------------------
    // 9. SHEET TỔNG HỢP
    // Mỗi đầu điểm là một cột.
    // Nếu học sinh có nhiều lần kiểm tra cùng đầu điểm,
    // các điểm được hiển thị dạng: 8 / 9 / 10.
    // -------------------------------------------------
    log("BƯỚC 8: TẠO SHEET TỔNG HỢP");

    const summarySheet = workbook.addWorksheet("Bang diem", {
      properties: {
        tabColor: { argb: COLORS.gold },
        defaultRowHeight: 24,
      },
      views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
    });

    const summaryColumns = [
      { header: "STT", key: "stt", width: 8 },
      { header: "Mã học sinh", key: "code", width: 18 },
      { header: "Họ và tên", key: "name", width: 30 },
      { header: "Giới tính", key: "gender", width: 14 },
      ...gradingItems.map((item, index) => ({
        header: item.name || item.code || `Đầu điểm ${index + 1}`,
        key: `item_${item.id}`,
        width: 18,
      })),
      { header: "Tổng số lượt điểm", key: "totalAttempts", width: 18 },
    ];

    summarySheet.columns = summaryColumns;

    const lastSummaryColumn = summaryColumns.length;
    const lastSummaryLetter = summarySheet.getColumn(lastSummaryColumn).letter;

    summarySheet.mergeCells(`A1:${lastSummaryLetter}1`);
    summarySheet.getCell("A1").value = "BẢNG TỔNG HỢP KẾT QUẢ HỌC TẬP";

    summarySheet.getCell("A1").font = {
      name: "Arial",
      size: 18,
      bold: true,
      color: { argb: COLORS.white },
    };

    summarySheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.navy },
    };

    summarySheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    summarySheet.getRow(1).height = 42;

    summarySheet.mergeCells(`A2:${lastSummaryLetter}2`);
    summarySheet.getCell("A2").value = `Giáo xứ: ${church.name || ""}`;

    summarySheet.mergeCells(`A3:${lastSummaryLetter}3`);
    summarySheet.getCell("A3").value = `Lớp: ${classInfo.name || ""}`;

    summarySheet.mergeCells(`A4:${lastSummaryLetter}4`);
    summarySheet.getCell("A4").value =
      `Ngày xuất báo cáo: ${new Date().toLocaleDateString("vi-VN")}`;

    [2, 3, 4].forEach((rowNumber) => {
      const row = summarySheet.getRow(rowNumber);
      row.height = 25;

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = {
          name: "Arial",
          size: 11,
          bold: rowNumber !== 4,
          color: { argb: COLORS.text },
        };

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: rowNumber === 4 ? COLORS.grayLight : COLORS.goldLight,
          },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          indent: 1,
        };
      });
    });

    // Header ở hàng 5
    const summaryHeader = summarySheet.getRow(5);
    summaryHeader.values = summaryColumns.map((column) => column.header);
    summaryHeader.height = 36;

    summaryHeader.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isScoreColumn =
        colNumber >= 5 && colNumber <= 4 + gradingItems.length;

      cell.font = {
        name: "Arial",
        size: 10,
        bold: true,
        color: {
          argb: isScoreColumn ? COLORS.navy : COLORS.white,
        },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: isScoreColumn ? COLORS.gold : COLORS.navyLight,
        },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.border = {
        top: { style: "medium", color: COLORS.gold },
        bottom: { style: "medium", color: COLORS.gold },
        left: { style: "thin", color: COLORS.border },
        right: { style: "thin", color: COLORS.border },
      };
    });

    // Dữ liệu tổng hợp
    students.forEach((student, index) => {
      const studentResults = resultsByStudent.get(String(student.id)) || [];

      const rowData = {
        stt: index + 1,
        code: student.code || "",
        name: student.name || "",
        gender: student.gender || "",
        totalAttempts: studentResults.length,
      };

      gradingItems.forEach((item) => {
        const itemResults = studentResults.filter(
          (result) => String(result.grading_rule_item_id) === String(item.id),
        );

        rowData[`item_${item.id}`] = itemResults
          .map((result) => result.score)
          .filter(
            (score) => score !== null && score !== undefined && score !== "",
          )
          .join(" / ");
      });

      const row = summarySheet.addRow(rowData);
      row.height = 27;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = {
          name: "Arial",
          size: 10,
          color: { argb: COLORS.text },
        };

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: index % 2 === 0 ? COLORS.white : COLORS.bluePale,
          },
        };

        cell.border = {
          top: { style: "thin", color: COLORS.border },
          bottom: { style: "thin", color: COLORS.border },
          left: { style: "thin", color: COLORS.border },
          right: { style: "thin", color: COLORS.border },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: [1, 2, 4].includes(colNumber) ? "center" : "left",
          wrapText: true,
        };
      });

      // Tô màu các cột điểm
      gradingItems.forEach((item, itemIndex) => {
        const cell = row.getCell(5 + itemIndex);

        if (cell.value !== "" && cell.value != null) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLORS.greenLight },
          };

          cell.font = {
            name: "Arial",
            size: 10,
            bold: true,
            color: { argb: COLORS.green },
          };
        } else {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLORS.goldLight },
          };
        }
      });
    });

    log("ĐÃ TẠO SHEET TỔNG HỢP", {
      studentCount: students.length,
      gradingItemCount: gradingItems.length,
      rowCount: summarySheet.rowCount,
    });

    // -------------------------------------------------
    // 10. SHEET CHI TIẾT ĐIỂM
    // -------------------------------------------------
    log("BƯỚC 9: TẠO SHEET CHI TIẾT");

    const detailSheet = workbook.addWorksheet("Chi tiet diem", {
      properties: {
        tabColor: { argb: COLORS.green },
        defaultRowHeight: 24,
      },
      views: [{ state: "frozen", ySplit: 2 }],
    });

    detailSheet.columns = [
      { header: "STT", key: "stt", width: 8 },
      { header: "Mã học sinh", key: "code", width: 18 },
      { header: "Họ và tên", key: "name", width: 30 },
      { header: "Nội dung", key: "itemName", width: 32 },
      { header: "Điểm", key: "score", width: 14 },
      { header: "Hình thức", key: "examType", width: 16 },
      { header: "Ngày kiểm tra", key: "examDate", width: 18 },
      { header: "Ghi chú", key: "note", width: 32 },
    ];

    detailSheet.mergeCells("A1:H1");
    detailSheet.getCell("A1").value = "CHI TIẾT KẾT QUẢ HỌC TẬP";

    detailSheet.getCell("A1").font = {
      name: "Arial",
      size: 16,
      bold: true,
      color: { argb: COLORS.white },
    };

    detailSheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.green },
    };

    detailSheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    detailSheet.getRow(1).height = 38;

    const detailHeader = detailSheet.getRow(2);
    detailHeader.values = [
      "STT",
      "Mã học sinh",
      "Họ và tên",
      "Nội dung",
      "Điểm",
      "Hình thức",
      "Ngày kiểm tra",
      "Ghi chú",
    ];

    detailHeader.height = 34;

    detailHeader.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        name: "Arial",
        size: 10,
        bold: true,
        color: { argb: COLORS.white },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.green },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.border = {
        top: { style: "medium", color: COLORS.gold },
        bottom: { style: "medium", color: COLORS.gold },
        left: { style: "thin", color: COLORS.border },
        right: { style: "thin", color: COLORS.border },
      };
    });

    results.forEach((result, index) => {
      const student = studentMap.get(String(result.student_id));

      const gradingItem = gradingItemMap.get(
        String(result.grading_rule_item_id),
      );

      const row = detailSheet.addRow({
        stt: index + 1,
        code: student?.code || "",
        name: student?.name || "",
        itemName:
          result.item_name ||
          gradingItem?.name ||
          result.item_code ||
          "Kết quả học tập",
        score: result.score ?? "",
        examType:
          result.exam_type === "online"
            ? "Trực tuyến"
            : result.exam_type === "paper"
              ? "Giấy"
              : result.exam_type || "",
        examDate: result.exam_date ? new Date(result.exam_date) : "",
        note: result.note || "",
      });

      row.height = 25;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = {
          name: "Arial",
          size: 10,
          color: { argb: COLORS.text },
        };

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: index % 2 === 0 ? COLORS.white : COLORS.greenLight,
          },
        };

        cell.border = {
          top: { style: "thin", color: COLORS.border },
          bottom: { style: "thin", color: COLORS.border },
          left: { style: "thin", color: COLORS.border },
          right: { style: "thin", color: COLORS.border },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: [1, 2, 5, 6, 7].includes(colNumber) ? "center" : "left",
          wrapText: true,
        };
      });

      const scoreCell = row.getCell(5);

      if (scoreCell.value !== "" && scoreCell.value != null) {
        scoreCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.goldLight },
        };

        scoreCell.font = {
          name: "Arial",
          size: 11,
          bold: true,
          color: { argb: COLORS.navy },
        };
      }

      if (row.getCell(7).value instanceof Date) {
        row.getCell(7).numFmt = "dd/mm/yyyy";
      }
    });

    log("ĐÃ TẠO SHEET CHI TIẾT", {
      resultCount: results.length,
      rowCount: detailSheet.rowCount,
    });

    // -------------------------------------------------
    // 11. CẤU HÌNH IN VÀ LỌC
    // -------------------------------------------------
    log("BƯỚC 10: CẤU HÌNH IN");

    [summarySheet, detailSheet].forEach((sheet) => {
      sheet.pageSetup = {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.5,
          bottom: 0.5,
          header: 0.2,
          footer: 0.2,
        },
      };

      sheet.headerFooter.oddFooter = "&LFaithEdu&CTrang &P / &N&RNgày in: &D";

      sheet.properties.defaultRowHeight = 24;
    });

    summarySheet.pageSetup.printTitlesRow = "1:5";
    detailSheet.pageSetup.printTitlesRow = "1:2";

    if (summarySheet.columnCount > 0) {
      summarySheet.autoFilter = {
        from: "A5",
        to: `${lastSummaryLetter}5`,
      };
    }

    detailSheet.autoFilter = {
      from: "A2",
      to: "H2",
    };

    // -------------------------------------------------
    // 12. GHI FILE VÀ TRẢ VỀ CLIENT
    // -------------------------------------------------
    log("BƯỚC 11: TẠO BUFFER EXCEL");

    const buffer = await workbook.xlsx.writeBuffer();

    if (!buffer || buffer.length === 0) {
      throw new Error("ExcelJS tạo file rỗng.");
    }

    const fileName = `Bang_diem_FaithEdu_Lop_${classId}_${Date.now()}.xlsx`;

    log("ĐÃ TẠO BUFFER", {
      fileName,
      bufferLength: buffer.length,
      durationMs: Date.now() - startedAt,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");

    log("XUẤT FILE THÀNH CÔNG", {
      fileName,
      studentCount: students.length,
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
    });

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    // Log đầy đủ để xem trong PM2
    console.error(`${logPrefix} LỖI 500`, {
      time: new Date().toISOString(),
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      sql: error.sql,
      stack: error.stack,
      params: req.params,
      userId: req.user?.id,
      churchId: req.user?.church_id,
      durationMs: Date.now() - startedAt,
    });

    if (res.headersSent) {
      return res.end();
    }

    return res.status(500).json({
      success: false,
      message: "Không thể xuất file Excel.",
      code: error.code || "EXPORT_RESULTS_EXCEL_ERROR",
      error:
        process.env.NODE_ENV === "development"
          ? {
              message: error.message,
              sqlMessage: error.sqlMessage,
              sql: error.sql,
              stack: error.stack,
            }
          : undefined,
    });
  }
};

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
  const LOG = "[EXPORT_RESULTS_EXCEL]";

  try {
    // =====================================================
    // 1. KIỂM TRA QUYỀN VÀ THAM SỐ
    // =====================================================
    const churchId = getChurchId(req);
    const classId = Number(req.params.classId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Mã lớp không hợp lệ.",
      });
    }

    // =====================================================
    // 2. LẤY THÔNG TIN GIÁO XỨ VÀ LỚP
    // =====================================================
    const [[churchRows], [classRows]] = await Promise.all([
      db.query(
        `SELECT id, name
         FROM churches
         WHERE id = ?
         LIMIT 1`,
        [churchId],
      ),
      db.query(
        `SELECT id, name
         FROM classes
         WHERE id = ? AND church_id = ?
         LIMIT 1`,
        [classId, churchId],
      ),
    ]);

    if (!churchRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ.",
      });
    }

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học.",
      });
    }

    const church = churchRows[0];
    const classInfo = classRows[0];

    // =====================================================
    // 3. LẤY QUY TẮC CHẤM ĐIỂM
    // =====================================================
    const [ruleRows] = await db.query(
      `SELECT id, status
       FROM grading_rules
       WHERE church_id = ?
       ORDER BY
         CASE WHEN status = 'active' THEN 0 ELSE 1 END,
         id DESC
       LIMIT 1`,
      [churchId],
    );

    const gradingRule = ruleRows[0] || null;
    let gradingItems = [];

    if (gradingRule) {
      const [itemRows] = await db.query(
        `SELECT
           id,
           grading_rule_id,
           code,
           name,
           weight,
           max_score,
           sort_order,
           allow_multiple,
           aggregation_method
         FROM grading_rule_items
         WHERE grading_rule_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [gradingRule.id],
      );

      gradingItems = itemRows || [];
    }

    // =====================================================
    // 4. LẤY DANH SÁCH HỌC SINH
    // =====================================================
    const [studentRows] = await db.query(
      `SELECT DISTINCT
         s.id,
         s.code,
         s.name,
         s.gender
       FROM class_students cs
       INNER JOIN students s
         ON s.id = cs.student_id
        AND s.church_id = ?
       WHERE cs.class_id = ?
       ORDER BY s.name ASC, s.id ASC`,
      [churchId, classId],
    );

    // =====================================================
    // 5. LẤY TOÀN BỘ ĐIỂM TRONG LỚP
    // =====================================================
    const [resultRows] = await db.query(
      `SELECT
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
       INNER JOIN students s
         ON s.id = r.student_id
        AND s.church_id = ?
       LEFT JOIN grading_rule_items gri
         ON gri.id = r.grading_rule_item_id
       WHERE EXISTS (
         SELECT 1
         FROM class_students cs
         WHERE cs.student_id = r.student_id
           AND cs.class_id = ?
       )
       ORDER BY
         r.student_id ASC,
         r.exam_date ASC,
         r.id ASC`,
      [churchId, classId],
    );

    const resultsByStudent = new Map();

    for (const result of resultRows) {
      const studentId = Number(result.student_id);

      if (!resultsByStudent.has(studentId)) {
        resultsByStudent.set(studentId, []);
      }

      resultsByStudent.get(studentId).push(result);
    }

    const itemById = new Map(
      gradingItems.map((item) => [Number(item.id), item]),
    );

    // =====================================================
    // 6. CÁC HÀM TIỆN ÍCH
    // =====================================================
    const toNumber = (value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    const roundScore = (value) => {
      if (value === null || !Number.isFinite(value)) {
        return null;
      }

      return Math.round((value + Number.EPSILON) * 100) / 100;
    };

    const normalizeText = (value) =>
      String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/\s+/g, " ")
        .trim();

    const formatGender = (gender) => {
      if (gender === "male") return "Nam";
      if (gender === "female") return "Nữ";
      return gender || "";
    };

    const formatDate = (value) => {
      if (!value) return "";

      const date = new Date(value);

      return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString("vi-VN");
    };

    const getColumnLetter = (columnNumber) => {
      let result = "";
      let number = columnNumber;

      while (number > 0) {
        const remainder = (number - 1) % 26;

        result = String.fromCharCode(65 + remainder) + result;

        number = Math.floor((number - 1) / 26);
      }

      return result;
    };

    // =====================================================
    // 7. XÁC ĐỊNH HỌC KỲ
    // =====================================================
    // Hỗ trợ:
    // Học kỳ 1, Học kì 1, HK1, HK 1
    // Học kỳ 2, Học kì 2, HK2, HK 2
    const getSemester = (note) => {
      const text = normalizeText(note);

      if (
        /\bhk\s*1\b/.test(text) ||
        /\bhoc\s*ky\s*1\b/.test(text) ||
        /\bhoc\s*ki\s*1\b/.test(text)
      ) {
        return 1;
      }

      if (
        /\bhk\s*2\b/.test(text) ||
        /\bhoc\s*ky\s*2\b/.test(text) ||
        /\bhoc\s*ki\s*2\b/.test(text)
      ) {
        return 2;
      }

      return null;
    };

    // =====================================================
    // 8. SẮP XẾP CÁC LẦN KIỂM TRA
    // =====================================================
    const sortResults = (results) => {
      return [...results].sort((a, b) => {
        const rawA = a.exam_date ? new Date(a.exam_date).getTime() : 0;

        const rawB = b.exam_date ? new Date(b.exam_date).getTime() : 0;

        const dateA = Number.isFinite(rawA) ? rawA : 0;

        const dateB = Number.isFinite(rawB) ? rawB : 0;

        if (dateA !== dateB) {
          return dateA - dateB;
        }

        return Number(a.id) - Number(b.id);
      });
    };

    const getSemesterResults = (results, semester) => {
      return results.filter((result) => getSemester(result.note) === semester);
    };

    const getItemResults = (results, itemId) => {
      return sortResults(
        results.filter(
          (result) => Number(result.grading_rule_item_id) === Number(itemId),
        ),
      );
    };

    // =====================================================
    // 9. HIỂN THỊ NHIỀU ĐIỂM TRONG MỘT Ô
    // =====================================================
    // Ví dụ:
    // 8.00
    // 7.00
    // 9.00
    const getDisplayScores = (results) => {
      const scores = sortResults(results)
        .map((result) => toNumber(result.score))
        .filter((score) => score !== null);

      if (!scores.length) return "";

      return scores.map((score) => score.toFixed(2)).join("\n");
    };

    // =====================================================
    // 10. TÍNH ĐIỂM GỘP CHO MỘT ĐẦU ĐIỂM
    // =====================================================
    const aggregateItemScore = (item, results) => {
      const valid = results
        .map((result) => ({
          ...result,
          numericScore: toNumber(result.score),
        }))
        .filter((result) => result.numericScore !== null);

      if (!valid.length) return null;

      const method = normalizeText(item.aggregation_method || "average");

      const scores = valid.map((result) => result.numericScore);

      if (method === "latest") {
        const sorted = sortResults(valid);

        return sorted[sorted.length - 1].numericScore;
      }

      if (method === "highest" || method === "max") {
        return Math.max(...scores);
      }

      if (method === "lowest" || method === "min") {
        return Math.min(...scores);
      }

      return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    };

    // =====================================================
    // 11. TÍNH ĐIỂM TRUNG BÌNH HỌC KỲ
    // =====================================================
    // - Tính riêng học kỳ 1 và 2
    // - Giữ trọng số trong grading_rule_items
    // - Quy đổi từng đầu điểm về thang 10
    // - Bỏ qua đầu điểm không có kết quả
    const calculateSemesterAverage = (studentResults, semester) => {
      const semesterResults = getSemesterResults(studentResults, semester);

      let weightedTotal = 0;
      let totalWeight = 0;

      for (const item of gradingItems) {
        const itemResults = getItemResults(semesterResults, item.id);

        const score = aggregateItemScore(item, itemResults);

        if (score === null) continue;

        const configuredMax = toNumber(item.max_score);

        const configuredWeight = toNumber(item.weight);

        const maxScore =
          configuredMax !== null && configuredMax > 0 ? configuredMax : 10;

        const weight =
          configuredWeight !== null && configuredWeight > 0
            ? configuredWeight
            : 1;

        const normalizedScore = (score / maxScore) * 10;

        weightedTotal += normalizedScore * weight;

        totalWeight += weight;
      }

      if (totalWeight <= 0) {
        return null;
      }

      return roundScore(weightedTotal / totalWeight);
    };

    // =====================================================
    // 12. TÍNH TRUNG BÌNH CẢ NĂM
    // =====================================================
    // Công thức: (HK1 + HK2) / 2
    // Chỉ tính nếu có đủ cả hai học kỳ.
    const calculateYearlyAverage = (hk1Average, hk2Average) => {
      if (hk1Average === null || hk2Average === null) {
        return null;
      }

      return roundScore((hk1Average + hk2Average) / 2);
    };

    // =====================================================
    // 13. TẠO WORKBOOK
    // =====================================================
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "FaithEdu";
    workbook.subject = "Bảng điểm giáo lý";
    workbook.title = `Bảng điểm ${classInfo.name}`;
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Bang diem", {
      views: [
        {
          state: "frozen",
          xSplit: 4,
          ySplit: 5,
        },
      ],
    });

    const detailWorksheet = workbook.addWorksheet("Chi tiet diem", {
      views: [
        {
          state: "frozen",
          xSplit: 4,
          ySplit: 1,
        },
      ],
    });

    // =====================================================
    // 14. MÀU SẮC
    // =====================================================
    const COLORS = {
      navy: "FF173B5E",
      gold: "FFD9A441",
      goldLight: "FFFFF3D2",
      white: "FFFFFFFF",
      text: "FF243447",
      muted: "FF64748B",
      border: "FFD7DEE8",
      stripe: "FFF7FAFD",
      yearly: "FFE8F4EA",
      yearlyHeader: "FF2E7D5B",
    };

    const thinBorder = {
      top: {
        style: "thin",
        color: { argb: COLORS.border },
      },
      bottom: {
        style: "thin",
        color: { argb: COLORS.border },
      },
      left: {
        style: "thin",
        color: { argb: COLORS.border },
      },
      right: {
        style: "thin",
        color: { argb: COLORS.border },
      },
    };

    const setFill = (cell, color) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
    };

    const styleHeader = (
      cell,
      background = COLORS.navy,
      color = COLORS.white,
    ) => {
      setFill(cell, background);

      cell.font = {
        name: "Arial",
        bold: true,
        size: 10,
        color: { argb: color },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.border = thinBorder;
    };

    // =====================================================
    // 15. TẠO CỘT ĐỘNG
    // =====================================================
    // A-D: Thông tin học sinh
    // HK1: N đầu điểm + trung bình
    // HK2: N đầu điểm + trung bình
    // Cuối: Số lần KT + TB cả năm

    const itemCount = gradingItems.length;

    const hk1Start = 5;
    const hk1AverageCol = hk1Start + itemCount;

    const hk2Start = hk1AverageCol + 1;

    const hk2AverageCol = hk2Start + itemCount;

    const totalAttemptsCol = hk2AverageCol + 1;

    const yearlyAverageCol = totalAttemptsCol + 1;

    const lastCol = yearlyAverageCol;

    worksheet.getColumn(1).width = 9;
    worksheet.getColumn(2).width = 18;
    worksheet.getColumn(3).width = 32;
    worksheet.getColumn(4).width = 14;

    for (let i = 0; i < itemCount; i++) {
      worksheet.getColumn(hk1Start + i).width = 19;

      worksheet.getColumn(hk2Start + i).width = 19;
    }

    worksheet.getColumn(hk1AverageCol).width = 20;

    worksheet.getColumn(hk2AverageCol).width = 20;

    worksheet.getColumn(totalAttemptsCol).width = 18;

    worksheet.getColumn(yearlyAverageCol).width = 25;

    // =====================================================
    // 16. TIÊU ĐỀ SHEET
    // =====================================================
    worksheet.mergeCells(1, 1, 1, lastCol);

    worksheet.mergeCells(2, 1, 2, lastCol);

    worksheet.mergeCells(3, 1, 3, lastCol);

    const title1 = worksheet.getCell(1, 1);
    const title2 = worksheet.getCell(2, 1);
    const title3 = worksheet.getCell(3, 1);

    title1.value = String(church.name || "").toUpperCase();

    title2.value = `BẢNG ĐIỂM GIÁO LÝ - ${String(
      classInfo.name || "",
    ).toUpperCase()}`;

    title3.value = `Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`;

    title1.font = {
      name: "Arial",
      size: 15,
      bold: true,
      color: { argb: COLORS.navy },
    };

    title2.font = {
      name: "Arial",
      size: 17,
      bold: true,
      color: { argb: COLORS.navy },
    };

    title3.font = {
      name: "Arial",
      size: 11,
      italic: true,
      color: { argb: COLORS.muted },
    };

    for (const cell of [title1, title2, title3]) {
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    }

    worksheet.getRow(1).height = 27;
    worksheet.getRow(2).height = 35;
    worksheet.getRow(3).height = 24;

    // =====================================================
    // 17. HEADER HỌC KỲ
    // =====================================================
    const staticHeaders = ["STT", "Mã học sinh", "Họ và tên", "Giới tính"];

    // Thông tin học sinh gộp 2 hàng.
    for (let col = 1; col <= 4; col++) {
      worksheet.mergeCells(4, col, 5, col);

      worksheet.getCell(4, col).value = staticHeaders[col - 1];
    }

    // Nhóm Học kỳ 1.
    worksheet.mergeCells(4, hk1Start, 4, hk1AverageCol);

    worksheet.getCell(4, hk1Start).value = "HỌC KỲ 1";

    // Nhóm Học kỳ 2.
    worksheet.mergeCells(4, hk2Start, 4, hk2AverageCol);

    worksheet.getCell(4, hk2Start).value = "HỌC KỲ 2";

    // Cột số lần kiểm tra.
    worksheet.mergeCells(4, totalAttemptsCol, 5, totalAttemptsCol);

    worksheet.getCell(4, totalAttemptsCol).value = "Số lần kiểm tra";

    // Cột trung bình cả năm.
    worksheet.mergeCells(4, yearlyAverageCol, 5, yearlyAverageCol);

    worksheet.getCell(4, yearlyAverageCol).value = "Điểm trung bình cả năm";

    // =====================================================
    // 18. HEADER TÊN TỪNG ĐẦU ĐIỂM
    // =====================================================
    gradingItems.forEach((item, index) => {
      const itemName = item.name || item.code || `Đầu điểm ${index + 1}`;

      worksheet.getCell(5, hk1Start + index).value = itemName;

      worksheet.getCell(5, hk2Start + index).value = itemName;
    });

    worksheet.getCell(5, hk1AverageCol).value = "Điểm trung bình";

    worksheet.getCell(5, hk2AverageCol).value = "Điểm trung bình";

    // Style header.
    for (let row = 4; row <= 5; row++) {
      for (let col = 1; col <= lastCol; col++) {
        const cell = worksheet.getRow(row).getCell(col);

        if (row === 5 && (col === hk1AverageCol || col === hk2AverageCol)) {
          styleHeader(cell, COLORS.gold, COLORS.navy);
        } else if (col === yearlyAverageCol) {
          styleHeader(cell, COLORS.yearlyHeader, COLORS.white);
        } else {
          styleHeader(cell);
        }
      }
    }

    worksheet.getRow(4).height = 40;
    worksheet.getRow(5).height = 58;

    // =====================================================
    // 19. GHI DỮ LIỆU HỌC SINH
    // =====================================================
    studentRows.forEach((student, index) => {
      const studentResults = resultsByStudent.get(Number(student.id)) || [];

      const hk1Results = getSemesterResults(studentResults, 1);

      const hk2Results = getSemesterResults(studentResults, 2);

      const hk1Average = calculateSemesterAverage(studentResults, 1);

      const hk2Average = calculateSemesterAverage(studentResults, 2);

      const yearlyAverage = calculateYearlyAverage(hk1Average, hk2Average);

      const rowNumber = index + 6;
      const row = worksheet.getRow(rowNumber);

      // ---------------------------------------------
      // Thông tin học sinh
      // ---------------------------------------------
      row.getCell(1).value = index + 1;

      row.getCell(2).value = student.code || "";

      row.getCell(3).value = student.name || "";

      row.getCell(4).value = formatGender(student.gender);

      // ---------------------------------------------
      // Điểm học kỳ 1
      // ---------------------------------------------
      gradingItems.forEach((item, itemIndex) => {
        const itemResults = getItemResults(hk1Results, item.id);

        row.getCell(hk1Start + itemIndex).value = getDisplayScores(itemResults);
      });

      row.getCell(hk1AverageCol).value = hk1Average;

      // ---------------------------------------------
      // Điểm học kỳ 2
      // ---------------------------------------------
      gradingItems.forEach((item, itemIndex) => {
        const itemResults = getItemResults(hk2Results, item.id);

        row.getCell(hk2Start + itemIndex).value = getDisplayScores(itemResults);
      });

      row.getCell(hk2AverageCol).value = hk2Average;

      // ---------------------------------------------
      // Tổng số lần kiểm tra
      // ---------------------------------------------
      row.getCell(totalAttemptsCol).value = studentResults.length;

      // ---------------------------------------------
      // Điểm trung bình cả năm
      // ---------------------------------------------
      row.getCell(yearlyAverageCol).value = yearlyAverage;

      // ==================================================
      // 20. TỰ ĐỘNG TĂNG CHIỀU CAO DÒNG
      // ==================================================
      let maxLines = 1;

      for (let col = 5; col <= lastCol; col++) {
        const value = row.getCell(col).value;

        if (typeof value === "string" && value) {
          maxLines = Math.max(maxLines, value.split("\n").length);
        }
      }

      const nameLines = Math.max(
        1,
        Math.ceil(String(student.name || "").length / 27),
      );

      maxLines = Math.max(maxLines, nameLines);

      row.height = Math.min(400, Math.max(35, maxLines * 20 + 12));

      // ==================================================
      // 21. STYLE TẤT CẢ Ô
      // ==================================================
      for (let col = 1; col <= lastCol; col++) {
        const cell = row.getCell(col);

        cell.font = {
          name: "Arial",
          size: 11,
          color: {
            argb: COLORS.text,
          },
        };

        cell.alignment = {
          horizontal: col === 3 ? "left" : "center",
          vertical: "middle",
          wrapText: true,
        };

        cell.border = thinBorder;

        if (index % 2 !== 0) {
          setFill(cell, COLORS.stripe);
        }
      }

      // Điểm TB học kỳ nền vàng.
      for (const col of [hk1AverageCol, hk2AverageCol]) {
        const cell = row.getCell(col);

        setFill(cell, COLORS.goldLight);

        cell.font = {
          name: "Arial",
          size: 11,
          bold: true,
          color: {
            argb: COLORS.navy,
          },
        };

        cell.numFmt = "0.00";
      }

      // Số lần kiểm tra in đậm.
      row.getCell(totalAttemptsCol).font = {
        name: "Arial",
        size: 11,
        bold: true,
        color: {
          argb: COLORS.navy,
        },
      };

      // ==================================================
      // 22. STYLE ĐIỂM TRUNG BÌNH CẢ NĂM
      // ==================================================
      const yearlyCell = row.getCell(yearlyAverageCol);

      setFill(yearlyCell, COLORS.yearly);

      yearlyCell.font = {
        name: "Arial",
        size: 12,
        bold: true,
        color: {
          argb: COLORS.yearlyHeader,
        },
      };

      yearlyCell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      yearlyCell.border = thinBorder;
      yearlyCell.numFmt = "0.00";
    });

    // =====================================================
    // 23. SHEET CHI TIẾT ĐIỂM
    // =====================================================
    detailWorksheet.columns = [
      {
        header: "STT",
        key: "stt",
        width: 9,
      },
      {
        header: "Mã học sinh",
        key: "code",
        width: 18,
      },
      {
        header: "Họ và tên",
        key: "name",
        width: 32,
      },
      {
        header: "Giới tính",
        key: "gender",
        width: 14,
      },
      {
        header: "Học kỳ",
        key: "semester",
        width: 16,
      },
      {
        header: "Đầu điểm",
        key: "item",
        width: 30,
      },
      {
        header: "Điểm",
        key: "score",
        width: 14,
      },
      {
        header: "Ngày kiểm tra",
        key: "date",
        width: 20,
      },
      {
        header: "Ghi chú",
        key: "note",
        width: 35,
      },
    ];

    const detailHeader = detailWorksheet.getRow(1);

    detailHeader.height = 42;

    for (let col = 1; col <= 9; col++) {
      styleHeader(detailHeader.getCell(col));
    }

    let detailIndex = 0;

    for (const student of studentRows) {
      const studentResults = resultsByStudent.get(Number(student.id)) || [];

      for (const result of sortResults(studentResults)) {
        detailIndex++;

        const item = itemById.get(Number(result.grading_rule_item_id));

        const semester = getSemester(result.note);

        const row = detailWorksheet.addRow({
          stt: detailIndex,
          code: student.code || "",
          name: student.name || "",
          gender: formatGender(student.gender),
          semester: semester ? `Học kỳ ${semester}` : "Chưa xác định",
          item:
            item?.name ||
            result.item_name ||
            result.item_code ||
            result.exam_type ||
            "Chưa xác định",
          score: toNumber(result.score),
          date: formatDate(result.exam_date),
          note: result.note || "",
        });

        row.height = 34;

        for (let col = 1; col <= 9; col++) {
          const cell = row.getCell(col);

          cell.font = {
            name: "Arial",
            size: 10,
            color: {
              argb: COLORS.text,
            },
          };

          cell.alignment = {
            horizontal: col === 3 || col === 9 ? "left" : "center",
            vertical: "middle",
            wrapText: true,
          };

          cell.border = thinBorder;

          if (detailIndex % 2 === 0) {
            setFill(cell, COLORS.stripe);
          }
        }

        row.getCell(7).numFmt = "0.00";
      }
    }

    // =====================================================
    // 24. THIẾT LẬP IN ẤN
    // =====================================================
    const configurePage = (sheet) => {
      sheet.properties.defaultRowHeight = 25;

      sheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.5,
          bottom: 0.5,
          header: 0.2,
          footer: 0.2,
        },
      };
    };

    configurePage(worksheet);
    configurePage(detailWorksheet);

    worksheet.pageSetup.printTitlesRow = "1:5";

    worksheet.headerFooter.oddFooter =
      "&LFaithEdu&CTrang &P / &N&RBảng điểm giáo lý";

    detailWorksheet.headerFooter.oddFooter =
      "&LFaithEdu&CTrang &P / &N&RChi tiết điểm";

    if (detailWorksheet.rowCount > 1) {
      detailWorksheet.autoFilter = {
        from: "A1",
        to: `I${detailWorksheet.rowCount}`,
      };
    }

    // =====================================================
    // 25. XUẤT FILE EXCEL
    // =====================================================
    const safeClassName = String(classInfo.name || "lop")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .replace(/[^a-zA-Z0-9-_]/g, "_");

    const fileName = `Bang_diem_${safeClassName}_${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );

    await workbook.xlsx.write(res);
    res.end();

    console.log(`${LOG} Xuất Excel thành công`, {
      churchId,
      classId,
      className: classInfo.name,
      studentCount: studentRows.length,
      gradingItemCount: gradingItems.length,
      resultCount: resultRows.length,
      totalColumns: lastCol,
      lastColumn: getColumnLetter(lastCol),
    });
  } catch (error) {
    console.error(`${LOG} Lỗi xuất Excel:`, error);

    if (res.headersSent) {
      return res.end();
    }

    return res.status(500).json({
      success: false,
      message: "Không thể xuất bảng điểm Excel.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// =====================================================
// EXPORT EXCEL ĐIỂM RIÊNG TỪNG HỌC SINH
// GET /api/results/export-student-excel/:classId/:studentId
// =====================================================
exports.exportStudentResultExcel = async (req, res) => {
  const LOG = "[EXPORT_STUDENT_RESULT_EXCEL]";

  try {
    const churchId = getChurchId(req);
    const classId = Number(req.params.classId);
    const studentId = Number(req.params.studentId);

    console.log(`${LOG} Bắt đầu xuất Excel`, {
      churchId,
      classId,
      studentId,
    });

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    if (
      !Number.isInteger(classId) ||
      classId <= 0 ||
      !Number.isInteger(studentId) ||
      studentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Thông tin lớp hoặc học sinh không hợp lệ.",
      });
    }

    // =====================================================
    // 1. LẤY THÔNG TIN GIÁO XỨ
    // =====================================================
    const [churchRows] = await db.query(
      `SELECT id, name FROM churches WHERE id = ? LIMIT 1`,
      [churchId],
    );

    if (!churchRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ.",
      });
    }

    // =====================================================
    // 2. LẤY THÔNG TIN LỚP
    // =====================================================
    const [classRows] = await db.query(
      `
      SELECT id, name, church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học.",
      });
    }

    const classInfo = classRows[0];

    // =====================================================
    // 3. KIỂM TRA HỌC SINH CÓ THUỘC LỚP KHÔNG
    // =====================================================
    const [studentRows] = await db.query(
      `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender
      FROM class_students cs
      INNER JOIN students s
        ON s.id = cs.student_id
        AND s.church_id = ?
      WHERE cs.class_id = ?
        AND cs.student_id = ?
      LIMIT 1
      `,
      [churchId, classId, studentId],
    );

    if (!studentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp này.",
      });
    }

    const student = studentRows[0];

    // =====================================================
    // 4. LẤY QUY ĐỊNH CHẤM ĐIỂM
    // =====================================================
    const [ruleRows] = await db.query(
      `
      SELECT *
      FROM grading_rules
      WHERE church_id = ?
        AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
      `,
      [churchId],
    );

    if (!ruleRows.length) {
      return res.status(404).json({
        success: false,
        message: "Giáo xứ chưa có quy định chấm điểm.",
      });
    }

    const gradingRule = ruleRows[0];

    // =====================================================
    // 5. LẤY CÁC ĐẦU ĐIỂM
    // =====================================================
    const [gradingItems] = await db.query(
      `
      SELECT
        id,
        grading_rule_id,
        name,
        code,
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

    if (!gradingItems.length) {
      return res.status(404).json({
        success: false,
        message: "Quy định chấm điểm chưa có đầu điểm.",
      });
    }

    // =====================================================
    // 6. LẤY KẾT QUẢ RIÊNG HỌC SINH
    // =====================================================
    const [resultRows] = await db.query(
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
        gri.code AS item_code,
        gri.weight AS item_weight,
        gri.max_score AS item_max_score,
        gri.sort_order,
        gri.allow_multiple,
        gri.aggregation_method
      FROM results r
      INNER JOIN students s
        ON s.id = r.student_id
        AND s.church_id = ?
      LEFT JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
      WHERE r.church_id = ?
        AND r.student_id = ?
        AND EXISTS (
          SELECT 1
          FROM class_students cs
          WHERE cs.student_id = r.student_id
            AND cs.class_id = ?
        )
      ORDER BY
        r.exam_date ASC,
        r.id ASC
      `,
      [churchId, churchId, studentId, classId],
    );

    console.log(`${LOG} Đã lấy dữ liệu`, {
      student: student.name,
      gradingItemCount: gradingItems.length,
      resultCount: resultRows.length,
    });

    // =====================================================
    // 7. HÀM HỖ TRỢ
    // =====================================================
    const toNumber = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };

    const round = (value, digits = 2) => {
      const factor = 10 ** digits;
      return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
    };

    const normalizeText = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const formatDate = (value) => {
      if (!value) return "";

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      return date.toLocaleDateString("vi-VN");
    };

    const getSemester = (note) => {
      const text = normalizeText(note).replace(/\s+/g, "");

      if (
        text.includes("hk1") ||
        text.includes("hocky1") ||
        text.includes("hocki1")
      ) {
        return "HK1";
      }

      if (
        text.includes("hk2") ||
        text.includes("hocky2") ||
        text.includes("hocki2")
      ) {
        return "HK2";
      }

      return "Chưa xác định";
    };

    const getAggregationMethod = (item) => {
      const method = normalizeText(item.aggregation_method);

      if (
        method.includes("highest") ||
        method.includes("max") ||
        method.includes("cao")
      ) {
        return "highest";
      }

      if (
        method.includes("lowest") ||
        method.includes("min") ||
        method.includes("thap")
      ) {
        return "lowest";
      }

      if (
        method.includes("average") ||
        method.includes("avg") ||
        method.includes("trung")
      ) {
        return "average";
      }

      return "latest";
    };

    // =====================================================
    // 8. NHÓM KẾT QUẢ THEO ĐẦU ĐIỂM
    // =====================================================
    const resultsByItem = {};

    gradingItems.forEach((item) => {
      resultsByItem[item.id] = {
        HK1: [],
        HK2: [],
        "Chưa xác định": [],
      };
    });

    resultRows.forEach((result) => {
      const itemId = result.grading_rule_item_id;

      if (!resultsByItem[itemId]) {
        resultsByItem[itemId] = {
          HK1: [],
          HK2: [],
          "Chưa xác định": [],
        };
      }

      const semester = getSemester(result.note);

      resultsByItem[itemId][semester].push({
        ...result,
        score: toNumber(result.score),
      });
    });

    // =====================================================
    // 9. TÍNH ĐIỂM THEO PHƯƠNG PHÁP TỔNG HỢP
    // =====================================================
    const getAggregatedScore = (scores, item) => {
      if (!scores || !scores.length) return null;

      const sorted = [...scores].sort((a, b) => {
        const dateA = new Date(a.exam_date || 0).getTime();
        const dateB = new Date(b.exam_date || 0).getTime();

        if (dateA !== dateB) return dateA - dateB;

        return toNumber(a.id) - toNumber(b.id);
      });

      const method = getAggregationMethod(item);

      if (method === "highest") {
        return Math.max(...sorted.map((x) => x.score));
      }

      if (method === "lowest") {
        return Math.min(...sorted.map((x) => x.score));
      }

      if (method === "average") {
        return sorted.reduce((sum, x) => sum + x.score, 0) / sorted.length;
      }

      return sorted[sorted.length - 1].score;
    };

    // =====================================================
    // 10. TÍNH ĐIỂM TRUNG BÌNH HỌC KỲ
    // =====================================================
    const calculateSemesterAverage = (semester) => {
      let totalWeightedScore = 0;
      let totalWeight = 0;

      gradingItems.forEach((item) => {
        const itemResults = resultsByItem[item.id]?.[semester] || [];

        const score = getAggregatedScore(itemResults, item);

        if (score === null) return;

        const maxScore = toNumber(item.max_score, 10);
        const weight = toNumber(item.weight, 1);

        if (maxScore <= 0 || weight <= 0) return;

        const normalizedScore = (score / maxScore) * 10;

        totalWeightedScore += normalizedScore * weight;
        totalWeight += weight;
      });

      if (!totalWeight) return null;

      return round(totalWeightedScore / totalWeight, 2);
    };

    const averageHK1 = calculateSemesterAverage("HK1");
    const averageHK2 = calculateSemesterAverage("HK2");

    const averages = [averageHK1, averageHK2].filter((value) => value !== null);

    const overallAverage = averages.length
      ? round(
          averages.reduce((sum, value) => sum + value, 0) / averages.length,
          2,
        )
      : null;

    // =====================================================
    // 11. TẠO EXCEL
    // =====================================================
    const ExcelJS = require("exceljs");

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "FaithEdu";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = `Bảng điểm ${student.name} - ${classInfo.name}`;

    const navy = "173B5E";
    const gold = "D9A441";
    const white = "FFFFFF";
    const lightBlue = "EEF3F7";
    const borderColor = "D9E2EC";
    const green = "E8F5EE";
    const yellow = "FFF7E0";

    // =====================================================
    // 12. SHEET 1 - BẢNG ĐIỂM
    // =====================================================
    const ws = workbook.addWorksheet("Bang diem", {
      views: [{ state: "frozen", ySplit: 5 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    ws.columns = [
      { width: 7 },
      { width: 28 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
    ];

    ws.mergeCells("A1:I1");
    ws.getCell("A1").value = "BẢNG ĐIỂM GIÁO LÝ";
    ws.getCell("A1").font = {
      name: "Arial",
      size: 18,
      bold: true,
      color: { argb: navy },
    };
    ws.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    ws.getRow(1).height = 35;

    ws.mergeCells("A2:I2");
    ws.getCell("A2").value = String(student.name || "").toUpperCase();
    ws.getCell("A2").font = {
      name: "Arial",
      size: 15,
      bold: true,
      color: { argb: gold },
    };
    ws.getCell("A2").alignment = { horizontal: "center" };
    ws.getRow(2).height = 28;

    ws.mergeCells("A3:I3");
    ws.getCell("A3").value =
      `Lớp: ${classInfo.name} | Mã học sinh: ${student.code || student.id}`;

    ws.getCell("A3").font = {
      name: "Arial",
      size: 11,
      color: { argb: "555555" },
    };
    ws.getCell("A3").alignment = { horizontal: "center" };

    ws.mergeCells("A4:I4");
    ws.getCell("A4").value =
      `Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`;

    ws.getCell("A4").font = {
      name: "Arial",
      size: 10,
      italic: true,
      color: { argb: "777777" },
    };
    ws.getCell("A4").alignment = { horizontal: "center" };

    const headers = [
      "STT",
      "Nội dung đánh giá",
      "Hệ số",
      "Điểm tối đa",
      "Điểm HK1",
      "Điểm HK2",
      "Số lần HK1",
      "Số lần HK2",
      "Phương pháp tính",
    ];

    const headerRow = ws.getRow(5);

    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);

      cell.value = header;
      cell.font = {
        name: "Arial",
        bold: true,
        color: { argb: white },
        size: 10,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: navy },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: borderColor } },
        bottom: { style: "thin", color: { argb: borderColor } },
        left: { style: "thin", color: { argb: borderColor } },
        right: { style: "thin", color: { argb: borderColor } },
      };
    });

    headerRow.height = 35;

    // =====================================================
    // 13. ĐỔ DỮ LIỆU ĐẦU ĐIỂM
    // =====================================================
    gradingItems.forEach((item, index) => {
      const hk1Results = resultsByItem[item.id]?.HK1 || [];
      const hk2Results = resultsByItem[item.id]?.HK2 || [];

      const hk1Score = getAggregatedScore(hk1Results, item);
      const hk2Score = getAggregatedScore(hk2Results, item);

      const row = ws.addRow([
        index + 1,
        item.name,
        toNumber(item.weight, 1),
        toNumber(item.max_score, 10),
        hk1Score,
        hk2Score,
        hk1Results.length,
        hk2Results.length,
        getAggregationMethod(item),
      ]);

      row.eachCell((cell, colNumber) => {
        cell.font = {
          name: "Arial",
          size: 10,
          color: { argb: "243447" },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: colNumber === 2 ? "left" : "center",
          wrapText: true,
        };

        cell.border = {
          top: { style: "thin", color: { argb: borderColor } },
          bottom: { style: "thin", color: { argb: borderColor } },
          left: { style: "thin", color: { argb: borderColor } },
          right: { style: "thin", color: { argb: borderColor } },
        };

        if (index % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: lightBlue },
          };
        }
      });

      row.height = 24;

      [5, 6].forEach((col) => {
        const cell = row.getCell(col);

        if (cell.value !== null && cell.value !== undefined) {
          cell.numFmt = "0.00";
          cell.font = {
            name: "Arial",
            size: 10,
            bold: true,
            color: { argb: navy },
          };
        }
      });
    });

    // =====================================================
    // 14. TỔNG KẾT ĐIỂM
    // =====================================================
    const summaryStartRow = ws.rowCount + 2;

    const summaryRows = [
      ["ĐIỂM TRUNG BÌNH HỌC KỲ 1", averageHK1],
      ["ĐIỂM TRUNG BÌNH HỌC KỲ 2", averageHK2],
      ["ĐIỂM TRUNG BÌNH CHUNG", overallAverage],
    ];

    summaryRows.forEach(([label, value], index) => {
      const rowNumber = summaryStartRow + index;

      ws.mergeCells(`A${rowNumber}:D${rowNumber}`);

      const labelCell = ws.getCell(`A${rowNumber}`);
      labelCell.value = label;
      labelCell.font = {
        name: "Arial",
        bold: true,
        size: 11,
        color: { argb: navy },
      };

      labelCell.alignment = {
        horizontal: "left",
        vertical: "middle",
      };

      ws.mergeCells(`E${rowNumber}:F${rowNumber}`);

      const valueCell = ws.getCell(`E${rowNumber}`);
      valueCell.value = value;
      valueCell.numFmt = "0.00";
      valueCell.font = {
        name: "Arial",
        bold: true,
        size: 12,
        color: { argb: index === 2 ? "2E7D5B" : navy },
      };

      valueCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index === 2 ? green : yellow },
      };

      valueCell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      rowNumber && (ws.getRow(rowNumber).height = 26);
    });

    // =====================================================
    // 15. SHEET 2 - CHI TIẾT ĐIỂM
    // =====================================================
    const detailWs = workbook.addWorksheet("Chi tiet diem", {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    detailWs.columns = [
      { width: 8 },
      { width: 16 },
      { width: 28 },
      { width: 18 },
      { width: 16 },
      { width: 15 },
      { width: 16 },
      { width: 35 },
    ];

    const detailHeaders = [
      "STT",
      "Ngày kiểm tra",
      "Nội dung đánh giá",
      "Học kỳ",
      "Loại kiểm tra",
      "Điểm",
      "Điểm tối đa",
      "Ghi chú",
    ];

    const detailHeader = detailWs.addRow(detailHeaders);

    detailHeader.eachCell((cell) => {
      cell.font = {
        name: "Arial",
        bold: true,
        color: { argb: white },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: navy },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.border = {
        top: { style: "thin", color: { argb: borderColor } },
        bottom: { style: "thin", color: { argb: borderColor } },
        left: { style: "thin", color: { argb: borderColor } },
        right: { style: "thin", color: { argb: borderColor } },
      };
    });

    detailHeader.height = 30;

    // =====================================================
    // 16. ĐỔ CHI TIẾT TỪNG LẦN KIỂM TRA
    // =====================================================
    resultRows.forEach((result, index) => {
      const item = gradingItems.find(
        (x) => Number(x.id) === Number(result.grading_rule_item_id),
      );

      const row = detailWs.addRow([
        index + 1,
        formatDate(result.exam_date),
        result.item_name || item?.name || "",
        getSemester(result.note),
        result.exam_type || "",
        toNumber(result.score),
        toNumber(result.item_max_score || item?.max_score, 10),
        result.note || "",
      ]);

      row.eachCell((cell, colNumber) => {
        cell.font = {
          name: "Arial",
          size: 10,
          color: { argb: "243447" },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: [3, 8].includes(colNumber) ? "left" : "center",
          wrapText: true,
        };

        cell.border = {
          top: { style: "thin", color: { argb: borderColor } },
          bottom: { style: "thin", color: { argb: borderColor } },
          left: { style: "thin", color: { argb: borderColor } },
          right: { style: "thin", color: { argb: borderColor } },
        };

        if (index % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: lightBlue },
          };
        }
      });

      row.height = 24;

      row.getCell(6).numFmt = "0.00";
      row.getCell(7).numFmt = "0.00";
    });

    // =====================================================
    // 17. BẢO VỆ VÀ ĐỊNH DẠNG TRANG IN
    // =====================================================
    ws.autoFilter = {
      from: "A5",
      to: `I${Math.max(5, ws.rowCount)}`,
    };

    detailWs.autoFilter = {
      from: "A1",
      to: `H${Math.max(1, detailWs.rowCount)}`,
    };

    ws.pageSetup.printArea = `A1:I${ws.rowCount}`;
    detailWs.pageSetup.printArea = `A1:H${detailWs.rowCount}`;

    // =====================================================
    // 18. TRẢ FILE
    // =====================================================
    const normalizeFileName = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");

    const fileName =
      `Bang_diem_${normalizeFileName(classInfo.name)}_` +
      `${normalizeFileName(student.name)}_${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );

    await workbook.xlsx.write(res);
    res.end();

    console.log(`${LOG} Xuất thành công`, {
      churchId,
      classId,
      studentId,
      studentName: student.name,
      resultCount: resultRows.length,
    });
  } catch (error) {
    console.error(`${LOG} Lỗi:`, error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Không thể xuất bảng điểm học sinh.",
        error: error.message,
      });
    }

    res.end();
  }
};

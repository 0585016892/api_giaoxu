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
  const logPrefix = "[EXPORT_RESULTS_EXCEL]";

  try {
    console.log(`${logPrefix} Bắt đầu xuất bảng điểm`);

    // =====================================================
    // 1. LẤY THÔNG TIN PHÂN QUYỀN
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

    console.log(`${logPrefix} churchId=${churchId}, classId=${classId}`);

    // =====================================================
    // 2. LẤY THÔNG TIN GIÁO XỨ
    // =====================================================
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
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ.",
      });
    }

    const church = churchRows[0];

    // =====================================================
    // 3. LẤY THÔNG TIN LỚP
    // =====================================================
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
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học.",
      });
    }

    const classInfo = classRows[0];

    // =====================================================
    // 4. LẤY QUY TẮC TÍNH ĐIỂM CỦA GIÁO XỨ
    // =====================================================
    const [ruleRows] = await db.query(
      `
      SELECT
        id,
        church_id,
        status,
        calculation_type,
        multiplier,
        divisor,
        rounding_digits,
        pass_score
      FROM grading_rules
      WHERE church_id = ?
      ORDER BY
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        id DESC
      LIMIT 1
      `,
      [churchId],
    );

    const gradingRule = ruleRows[0] || null;

    console.log(
      `${logPrefix} Quy tắc tính điểm:`,
      gradingRule
        ? {
            id: gradingRule.id,
            calculation_type: gradingRule.calculation_type,
            multiplier: gradingRule.multiplier,
            divisor: gradingRule.divisor,
            rounding_digits: gradingRule.rounding_digits,
            pass_score: gradingRule.pass_score,
          }
        : "Không có quy tắc",
    );

    // =====================================================
    // 5. LẤY CÁC ĐẦU ĐIỂM TRONG QUY TẮC
    // =====================================================
    let gradingItems = [];

    if (gradingRule) {
      const [itemRows] = await db.query(
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

      gradingItems = itemRows || [];
    }

    console.log(
      `${logPrefix} Số đầu điểm trong quy tắc: ${gradingItems.length}`,
    );

    const gradingItemMap = new Map(
      gradingItems.map((item) => [Number(item.id), item]),
    );

    // =====================================================
    // 6. LẤY DANH SÁCH HỌC SINH TRONG LỚP
    // =====================================================
    const [studentRows] = await db.query(
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

    console.log(`${logPrefix} Số học sinh: ${studentRows.length}`);

    // =====================================================
    // 7. LẤY TOÀN BỘ KẾT QUẢ CỦA LỚP
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
        gri.code AS item_code
      FROM results r
      INNER JOIN students s
        ON s.id = r.student_id
       AND s.church_id = ?
      INNER JOIN class_students cs
        ON cs.student_id = s.id
       AND cs.class_id = ?
      LEFT JOIN grading_rule_items gri
        ON gri.id = r.grading_rule_item_id
      WHERE r.student_id IN (
        SELECT cs2.student_id
        FROM class_students cs2
        WHERE cs2.class_id = ?
      )
      ORDER BY
        r.student_id ASC,
        r.exam_date ASC,
        r.id ASC
      `,
      [churchId, classId, classId],
    );

    console.log(`${logPrefix} Số bản ghi điểm: ${resultRows.length}`);

    // =====================================================
    // 8. GOM ĐIỂM THEO HỌC SINH
    // =====================================================
    const resultsByStudent = new Map();

    for (const result of resultRows) {
      const studentId = Number(result.student_id);

      if (!resultsByStudent.has(studentId)) {
        resultsByStudent.set(studentId, []);
      }

      resultsByStudent.get(studentId).push(result);
    }

    // =====================================================
    // 9. HÀM LÀM TRÒN ĐIỂM
    // =====================================================
    const getRoundingDigits = () => {
      const digits = Number(gradingRule?.rounding_digits);

      if (!Number.isInteger(digits) || digits < 0 || digits > 6) {
        return 2;
      }

      return digits;
    };

    const roundScore = (value) => {
      if (!Number.isFinite(Number(value))) return null;

      const digits = getRoundingDigits();
      const factor = Math.pow(10, digits);

      return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
    };

    // =====================================================
    // 10. GỘP NHIỀU LẦN KIỂM TRA CỦA MỘT ĐẦU ĐIỂM
    // =====================================================
    const aggregateItemScore = (item, itemResults) => {
      const validScores = itemResults
        .map((result) => Number(result.score))
        .filter((score) => Number.isFinite(score));

      if (!validScores.length) return null;

      const method = String(item?.aggregation_method || "average")
        .trim()
        .toLowerCase();

      if (method === "latest") {
        const latestResult = [...itemResults]
          .filter((result) => Number.isFinite(Number(result.score)))
          .sort((a, b) => {
            const dateA = a.exam_date ? new Date(a.exam_date).getTime() : 0;
            const dateB = b.exam_date ? new Date(b.exam_date).getTime() : 0;

            if (dateA !== dateB) return dateB - dateA;
            return Number(b.id) - Number(a.id);
          })[0];

        return Number(latestResult.score);
      }

      if (method === "highest" || method === "max") {
        return Math.max(...validScores);
      }

      if (method === "lowest" || method === "min") {
        return Math.min(...validScores);
      }

      // Mặc định: average
      const total = validScores.reduce((sum, score) => sum + score, 0);
      return total / validScores.length;
    };

    // =====================================================
    // 11. TÍNH ĐIỂM TRUNG BÌNH THEO QUY TẮC
    // =====================================================
    const calculateWeightedAverage = (studentResults) => {
      if (!gradingRule || !gradingItems.length) return null;

      const itemScores = [];

      for (const item of gradingItems) {
        const itemResults = studentResults.filter(
          (result) => Number(result.grading_rule_item_id) === Number(item.id),
        );

        const aggregatedScore = aggregateItemScore(item, itemResults);

        if (aggregatedScore === null) continue;

        const maxScore = Number(item.max_score);
        const weight = Number(item.weight);

        const safeMaxScore =
          Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 10;

        const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;

        // Quy đổi về thang điểm 10 trước khi tính trung bình có trọng số.
        const normalizedScore = (aggregatedScore / safeMaxScore) * 10;

        itemScores.push({
          item,
          score: normalizedScore,
          weight: safeWeight,
        });
      }

      if (!itemScores.length) return null;

      const calculationType = String(
        gradingRule.calculation_type || "weighted_average",
      )
        .trim()
        .toLowerCase();

      let finalScore = null;

      if (calculationType === "sum") {
        finalScore = itemScores.reduce((sum, item) => sum + item.score, 0);
      } else if (
        calculationType === "sum_multiplier" ||
        calculationType === "sum-multiplier"
      ) {
        const total = itemScores.reduce((sum, item) => sum + item.score, 0);

        const multiplier = Number(gradingRule.multiplier) || 1;
        const divisor = Number(gradingRule.divisor) || 1;

        finalScore = (total * multiplier) / divisor;
      } else if (calculationType === "pass_fail") {
        const totalWeight = itemScores.reduce(
          (sum, item) => sum + item.weight,
          0,
        );

        const weightedTotal = itemScores.reduce(
          (sum, item) => sum + item.score * item.weight,
          0,
        );

        const average = totalWeight > 0 ? weightedTotal / totalWeight : null;

        if (average === null) return null;

        const passScore = Number(gradingRule.pass_score) || 5;

        return average >= passScore ? "Đạt" : "Chưa đạt";
      } else if (calculationType === "average") {
        const total = itemScores.reduce((sum, item) => sum + item.score, 0);

        finalScore = total / itemScores.length;
      } else {
        // weighted_average hoặc mặc định
        const totalWeight = itemScores.reduce(
          (sum, item) => sum + item.weight,
          0,
        );

        const weightedTotal = itemScores.reduce(
          (sum, item) => sum + item.score * item.weight,
          0,
        );

        finalScore = totalWeight > 0 ? weightedTotal / totalWeight : null;
      }

      return finalScore === null ? null : roundScore(finalScore);
    };

    // =====================================================
    // 12. TẠO WORKBOOK
    // =====================================================
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "FaithEdu";
    workbook.subject = "Bảng điểm giáo lý";
    workbook.title = `Bảng điểm ${classInfo.name}`;
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Bang diem", {
      views: [{ state: "frozen", ySplit: 4 }],
    });

    const detailWorksheet = workbook.addWorksheet("Chi tiet diem", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // =====================================================
    // 13. TẠO CỘT BẢNG ĐIỂM
    // =====================================================
    const summaryColumns = [
      { header: "STT", key: "stt", width: 8 },
      { header: "Mã học sinh", key: "code", width: 18 },
      { header: "Họ và tên", key: "name", width: 30 },
      { header: "Giới tính", key: "gender", width: 14 },
      ...gradingItems.map((item) => ({
        header: item.name || item.code || `Đầu điểm ${item.id}`,
        key: `item_${item.id}`,
        width: 20,
      })),
      {
        header: "Điểm trung bình",
        key: "averageScore",
        width: 20,
      },
      {
        header: "Số lần kiểm tra",
        key: "totalAttempts",
        width: 18,
      },
    ];

    worksheet.columns = summaryColumns;

    // =====================================================
    // 14. TIÊU ĐỀ BẢNG
    // =====================================================
    const lastColumn = summaryColumns.length;

    worksheet.mergeCells(1, 1, 1, lastColumn);
    worksheet.getCell(1, 1).value = church.name.toUpperCase();
    worksheet.getCell(1, 1).font = {
      bold: true,
      size: 14,
      color: { argb: "FF173B5E" },
    };
    worksheet.getCell(1, 1).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.mergeCells(2, 1, 2, lastColumn);
    worksheet.getCell(2, 1).value =
      `BẢNG ĐIỂM GIÁO LÝ - ${classInfo.name.toUpperCase()}`;
    worksheet.getCell(2, 1).font = {
      bold: true,
      size: 16,
      color: { argb: "FF173B5E" },
    };
    worksheet.getCell(2, 1).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.mergeCells(3, 1, 3, lastColumn);
    worksheet.getCell(3, 1).value =
      `Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`;
    worksheet.getCell(3, 1).font = {
      italic: true,
      color: { argb: "FF64748B" },
    };
    worksheet.getCell(3, 1).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getRow(1).height = 24;
    worksheet.getRow(2).height = 30;
    worksheet.getRow(3).height = 22;

    // =====================================================
    // 15. HEADER BẢNG ĐIỂM
    // =====================================================
    const headerRow = worksheet.getRow(4);

    headerRow.values = summaryColumns.map((column) => column.header);
    headerRow.height = 38;

    headerRow.eachCell((cell) => {
      cell.font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF173B5E" },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9A441" } },
        bottom: { style: "thin", color: { argb: "FFD9A441" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    // Cột điểm trung bình: làm nổi bật bằng màu vàng.
    const averageColumnIndex = 5 + gradingItems.length;
    const averageHeaderCell = headerRow.getCell(averageColumnIndex);

    averageHeaderCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9A441" },
    };
    averageHeaderCell.font = {
      bold: true,
      color: { argb: "FF173B5E" },
    };

    // =====================================================
    // 16. ĐƯA DỮ LIỆU HỌC SINH VÀO BẢNG
    // =====================================================
    studentRows.forEach((student, index) => {
      const studentResults = resultsByStudent.get(Number(student.id)) || [];

      const rowData = {
        stt: index + 1,
        code: student.code || "",
        name: student.name || "",
        gender:
          student.gender === "male"
            ? "Nam"
            : student.gender === "female"
              ? "Nữ"
              : student.gender || "",
        totalAttempts: studentResults.length,
      };

      for (const item of gradingItems) {
        const itemResults = studentResults.filter(
          (result) => Number(result.grading_rule_item_id) === Number(item.id),
        );

        const scores = itemResults
          .map((result) => Number(result.score))
          .filter((score) => Number.isFinite(score));

        // Giữ hiển thị tất cả lần kiểm tra của đầu điểm.
        rowData[`item_${item.id}`] = scores.length ? scores.join(" / ") : "";
      }

      rowData.averageScore = calculateWeightedAverage(studentResults);

      const row = worksheet.addRow(rowData);

      row.height = 25;

      row.eachCell((cell) => {
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          bottom: {
            style: "thin",
            color: { argb: "FFE2E8F0" },
          },
          left: {
            style: "thin",
            color: { argb: "FFE2E8F0" },
          },
          right: {
            style: "thin",
            color: { argb: "FFE2E8F0" },
          },
        };
      });

      row.getCell(3).alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };

      const averageCell = row.getCell(averageColumnIndex);

      averageCell.font = {
        bold: true,
        color: { argb: "FF173B5E" },
      };
      averageCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF5D6" },
      };

      if (typeof rowData.averageScore === "number") {
        averageCell.numFmt = "0.00";
      }
    });

    // =====================================================
    // 17. SHEET CHI TIẾT ĐIỂM
    // =====================================================
    detailWorksheet.columns = [
      { header: "STT", key: "stt", width: 8 },
      { header: "Mã học sinh", key: "code", width: 18 },
      { header: "Họ và tên", key: "name", width: 30 },
      { header: "Đầu điểm", key: "itemName", width: 25 },
      { header: "Mã đầu điểm", key: "itemCode", width: 18 },
      { header: "Điểm", key: "score", width: 12 },
      { header: "Hình thức", key: "examType", width: 18 },
      { header: "Ngày kiểm tra", key: "examDate", width: 18 },
      { header: "Ghi chú", key: "note", width: 35 },
    ];

    const detailHeader = detailWorksheet.getRow(1);
    detailHeader.height = 32;

    detailHeader.eachCell((cell) => {
      cell.font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF173B5E" },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    });

    const studentMap = new Map(
      studentRows.map((student) => [Number(student.id), student]),
    );

    resultRows.forEach((result, index) => {
      const student = studentMap.get(Number(result.student_id));

      detailWorksheet.addRow({
        stt: index + 1,
        code: student?.code || "",
        name: student?.name || "",
        itemName: result.item_name || "",
        itemCode: result.item_code || "",
        score: Number.isFinite(Number(result.score))
          ? Number(result.score)
          : "",
        examType:
          result.exam_type === "online"
            ? "Trực tuyến"
            : result.exam_type === "paper"
              ? "Giấy"
              : result.exam_type || "",
        examDate: result.exam_date
          ? new Date(result.exam_date).toLocaleDateString("vi-VN")
          : "",
        note: result.note || "",
      });
    });

    detailWorksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      row.eachCell((cell) => {
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
        };
        cell.border = {
          bottom: {
            style: "thin",
            color: { argb: "FFE2E8F0" },
          },
        };
      });
    });

    // =====================================================
    // 18. THIẾT LẬP IN ẤN
    // =====================================================
    worksheet.pageSetup = {
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

    detailWorksheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    };

    // =====================================================
    // 19. TRẢ FILE EXCEL
    // =====================================================
    const safeClassName = String(classInfo.name || "lop")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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

    console.log(`${logPrefix} Bắt đầu ghi file: ${fileName}`);

    await workbook.xlsx.write(res);
    res.end();

    console.log(
      `${logPrefix} Xuất Excel thành công. Lớp=${classInfo.name}, học sinh=${studentRows.length}, kết quả=${resultRows.length}`,
    );
  } catch (error) {
    console.error(`${logPrefix} LỖI XUẤT EXCEL:`, error);
    console.error(`${logPrefix} SQL code:`, error.code);
    console.error(`${logPrefix} SQL message:`, error.sqlMessage);
    console.error(`${logPrefix} Stack:`, error.stack);

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

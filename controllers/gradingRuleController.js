const db = require("../config/db");

// ============================================================
// HELPERS
// ============================================================

const getChurchId = (req) => {
  const churchId = req.user?.church_id;

  if (!churchId) {
    const error = new Error("Tài khoản chưa được gán giáo xứ");

    error.statusCode = 403;

    throw error;
  }

  return Number(churchId);
};

const sendError = (res, error, defaultMessage) => {
  console.error("GRADING RULE ERROR:", error);

  return res.status(error?.statusCode || 500).json({
    success: false,
    message: error?.response?.data?.message || error?.message || defaultMessage,
  });
};

const normalizeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

// ============================================================
// GET GRADING RULE
// ============================================================

exports.getGradingRule = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const [rules] = await db.query(
      `
      SELECT
        id,
        church_id,
        calculation_type,
        multiplier,
        divisor,
        rounding_digits,
        pass_score,
        status,
        created_at,
        updated_at
      FROM grading_rules
      WHERE church_id = ?
      LIMIT 1
      `,
      [churchId],
    );

    if (!rules.length) {
      return res.json({
        success: true,
        data: null,
        message: "Giáo xứ chưa có quy tắc tính điểm",
      });
    }

    const rule = rules[0];

    const [items] = await db.query(
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
        aggregation_method,
        created_at,
        updated_at
      FROM grading_rule_items
      WHERE grading_rule_id = ?
      ORDER BY sort_order ASC, id ASC
      `,
      [rule.id],
    );

    return res.json({
      success: true,
      data: {
        ...rule,
        items,
      },
    });
  } catch (error) {
    return sendError(res, error, "Không thể lấy quy tắc tính điểm");
  }
};

// ============================================================
// CREATE GRADING RULE
// ============================================================

exports.createGradingRule = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);

    const {
      calculation_type = "weighted_average",
      multiplier = 1,
      divisor = null,
      rounding_digits = 1,
      pass_score = 5,
      status = "active",
      items = [],
    } = req.body || {};

    const allowedCalculationTypes = [
      "average",
      "weighted_average",
      "sum",
      "sum_multiplier",
      "pass_fail",
    ];

    if (!allowedCalculationTypes.includes(calculation_type)) {
      return res.status(400).json({
        success: false,
        message: "Kiểu tính điểm không hợp lệ",
      });
    }

    if (
      !Number.isInteger(Number(rounding_digits)) ||
      Number(rounding_digits) < 0 ||
      Number(rounding_digits) > 4
    ) {
      return res.status(400).json({
        success: false,
        message: "Số chữ số làm tròn không hợp lệ",
      });
    }

    if (Number(pass_score) < 0) {
      return res.status(400).json({
        success: false,
        message: "Điểm đạt không hợp lệ",
      });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Danh sách đầu điểm phải là một mảng",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    // ----------------------------------------------------------
    // Kiểm tra giáo xứ đã có rule chưa
    // ----------------------------------------------------------

    const [existing] = await connection.query(
      `
      SELECT id
      FROM grading_rules
      WHERE church_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [churchId],
    );

    if (existing.length) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Giáo xứ đã có quy tắc tính điểm. Mỗi giáo xứ chỉ được có một quy tắc.",
      });
    }

    // ----------------------------------------------------------
    // Tạo rule
    // ----------------------------------------------------------

    const [ruleResult] = await connection.query(
      `
      INSERT INTO grading_rules (
        church_id,
        calculation_type,
        multiplier,
        divisor,
        rounding_digits,
        pass_score,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        churchId,
        calculation_type,
        normalizeNumber(multiplier, 1),
        divisor === null || divisor === "" ? null : normalizeNumber(divisor, 1),
        Number(rounding_digits),
        normalizeNumber(pass_score, 5),
        status === "inactive" ? "inactive" : "active",
      ],
    );

    const ruleId = ruleResult.insertId;

    // ----------------------------------------------------------
    // Tạo items
    // ----------------------------------------------------------

    for (let index = 0; index < items.length; index++) {
      const item = items[index];

      if (!item?.name || !String(item.name).trim()) {
        throw new Error(`Đầu điểm thứ ${index + 1} chưa có tên`);
      }

      if (!item?.code || !String(item.code).trim()) {
        throw new Error(`Đầu điểm thứ ${index + 1} chưa có mã`);
      }

      const maxScore = normalizeNumber(item.max_score, 10);

      if (maxScore <= 0) {
        throw new Error(`Điểm tối đa của đầu điểm "${item.name}" không hợp lệ`);
      }

      const weight = normalizeNumber(item.weight, 1);

      if (weight < 0) {
        throw new Error(`Trọng số của đầu điểm "${item.name}" không hợp lệ`);
      }

      const allowedAggregation = ["latest", "average", "highest", "lowest"];

      const aggregationMethod = allowedAggregation.includes(
        item.aggregation_method,
      )
        ? item.aggregation_method
        : "latest";

      await connection.query(
        `
        INSERT INTO grading_rule_items (
          grading_rule_id,
          name,
          code,
          weight,
          max_score,
          sort_order,
          allow_multiple,
          aggregation_method
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          ruleId,
          String(item.name).trim(),
          String(item.code).trim(),
          weight,
          maxScore,
          Number(item.sort_order ?? index),
          item.allow_multiple ? 1 : 0,
          aggregationMethod,
        ],
      );
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Tạo quy tắc tính điểm thành công",
      data: {
        id: ruleId,
        church_id: churchId,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    return sendError(res, error, "Không thể tạo quy tắc tính điểm");
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ============================================================
// UPDATE GRADING RULE
// ============================================================

exports.updateGradingRule = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const ruleId = Number(req.params.id);

    if (!ruleId) {
      return res.status(400).json({
        success: false,
        message: "rule id không hợp lệ",
      });
    }

    const {
      calculation_type,
      multiplier,
      divisor,
      rounding_digits,
      pass_score,
      status,
    } = req.body || {};

    const [rules] = await db.query(
      `
      SELECT id
      FROM grading_rules
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [ruleId, churchId],
    );

    if (!rules.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy quy tắc tính điểm",
      });
    }

    const allowedCalculationTypes = [
      "average",
      "weighted_average",
      "sum",
      "sum_multiplier",
      "pass_fail",
    ];

    if (
      calculation_type !== undefined &&
      !allowedCalculationTypes.includes(calculation_type)
    ) {
      return res.status(400).json({
        success: false,
        message: "Kiểu tính điểm không hợp lệ",
      });
    }

    if (
      rounding_digits !== undefined &&
      (!Number.isInteger(Number(rounding_digits)) ||
        Number(rounding_digits) < 0 ||
        Number(rounding_digits) > 4)
    ) {
      return res.status(400).json({
        success: false,
        message: "Số chữ số làm tròn không hợp lệ",
      });
    }

    const fields = [];
    const values = [];

    if (calculation_type !== undefined) {
      fields.push("calculation_type = ?");
      values.push(calculation_type);
    }

    if (multiplier !== undefined) {
      fields.push("multiplier = ?");
      values.push(normalizeNumber(multiplier, 1));
    }

    if (divisor !== undefined) {
      fields.push("divisor = ?");
      values.push(
        divisor === null || divisor === "" ? null : normalizeNumber(divisor, 1),
      );
    }

    if (rounding_digits !== undefined) {
      fields.push("rounding_digits = ?");
      values.push(Number(rounding_digits));
    }

    if (pass_score !== undefined) {
      fields.push("pass_score = ?");
      values.push(normalizeNumber(pass_score, 5));
    }

    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Trạng thái quy tắc không hợp lệ",
        });
      }

      fields.push("status = ?");
      values.push(status);
    }

    if (!fields.length) {
      return res.json({
        success: true,
        message: "Không có dữ liệu cần cập nhật",
      });
    }

    values.push(ruleId);
    values.push(churchId);

    await db.query(
      `
      UPDATE grading_rules
      SET ${fields.join(", ")}
      WHERE id = ?
        AND church_id = ?
      `,
      values,
    );

    return res.json({
      success: true,
      message: "Cập nhật quy tắc tính điểm thành công",
    });
  } catch (error) {
    return sendError(res, error, "Không thể cập nhật quy tắc tính điểm");
  }
};

// ============================================================
// DELETE GRADING RULE
// ============================================================

exports.deleteGradingRule = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const ruleId = Number(req.params.id);

    if (!ruleId) {
      return res.status(400).json({
        success: false,
        message: "rule id không hợp lệ",
      });
    }

    const [results] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM results
      WHERE grading_rule_id = ?
        AND church_id = ?
      `,
      [ruleId, churchId],
    );

    if (Number(results[0]?.total) > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Không thể xóa quy tắc vì đã có kết quả điểm sử dụng quy tắc này.",
      });
    }

    const [result] = await db.query(
      `
      DELETE FROM grading_rules
      WHERE id = ?
        AND church_id = ?
      `,
      [ruleId, churchId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy quy tắc tính điểm",
      });
    }

    return res.json({
      success: true,
      message: "Xóa quy tắc tính điểm thành công",
    });
  } catch (error) {
    return sendError(res, error, "Không thể xóa quy tắc tính điểm");
  }
};

// ============================================================
// GET ITEMS
// ============================================================

exports.getGradingRuleItems = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const ruleId = Number(req.params.id);

    if (!ruleId) {
      return res.status(400).json({
        success: false,
        message: "rule id không hợp lệ",
      });
    }

    const [items] = await db.query(
      `
      SELECT
        gri.id,
        gri.grading_rule_id,
        gri.name,
        gri.code,
        gri.weight,
        gri.max_score,
        gri.sort_order,
        gri.allow_multiple,
        gri.aggregation_method,
        gri.created_at,
        gri.updated_at
      FROM grading_rule_items gri
      INNER JOIN grading_rules gr
        ON gr.id = gri.grading_rule_id
      WHERE gri.grading_rule_id = ?
        AND gr.church_id = ?
      ORDER BY gri.sort_order ASC, gri.id ASC
      `,
      [ruleId, churchId],
    );

    return res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    return sendError(res, error, "Không thể lấy danh sách đầu điểm");
  }
};

// ============================================================
// CREATE ITEM
// ============================================================

exports.createGradingRuleItem = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const ruleId = Number(req.params.id);

    const {
      name,
      code,
      weight = 1,
      max_score = 10,
      sort_order = 0,
      allow_multiple = false,
      aggregation_method = "latest",
    } = req.body || {};

    if (!ruleId) {
      return res.status(400).json({
        success: false,
        message: "rule id không hợp lệ",
      });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên đầu điểm là bắt buộc",
      });
    }

    if (!code || !String(code).trim()) {
      return res.status(400).json({
        success: false,
        message: "Mã đầu điểm là bắt buộc",
      });
    }

    const allowedAggregation = ["latest", "average", "highest", "lowest"];

    if (!allowedAggregation.includes(aggregation_method)) {
      return res.status(400).json({
        success: false,
        message: "Cách tổng hợp điểm không hợp lệ",
      });
    }

    const [rules] = await db.query(
      `
      SELECT id
      FROM grading_rules
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [ruleId, churchId],
    );

    if (!rules.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy quy tắc tính điểm",
      });
    }

    const [duplicate] = await db.query(
      `
      SELECT id
      FROM grading_rule_items
      WHERE grading_rule_id = ?
        AND code = ?
      LIMIT 1
      `,
      [ruleId, String(code).trim()],
    );

    if (duplicate.length) {
      return res.status(409).json({
        success: false,
        message: "Mã đầu điểm đã tồn tại",
      });
    }

    const maxScore = normalizeNumber(max_score, 10);
    const itemWeight = normalizeNumber(weight, 1);

    if (maxScore <= 0) {
      return res.status(400).json({
        success: false,
        message: "Điểm tối đa phải lớn hơn 0",
      });
    }

    if (itemWeight < 0) {
      return res.status(400).json({
        success: false,
        message: "Trọng số không được âm",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO grading_rule_items (
        grading_rule_id,
        name,
        code,
        weight,
        max_score,
        sort_order,
        allow_multiple,
        aggregation_method
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        ruleId,
        String(name).trim(),
        String(code).trim(),
        itemWeight,
        maxScore,
        Number(sort_order),
        allow_multiple ? 1 : 0,
        aggregation_method,
      ],
    );

    const [items] = await db.query(
      `
      SELECT *
      FROM grading_rule_items
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Thêm đầu điểm thành công",
      data: items[0],
    });
  } catch (error) {
    return sendError(res, error, "Không thể thêm đầu điểm");
  }
};

// ============================================================
// UPDATE ITEM
// ============================================================

exports.updateGradingRuleItem = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const ruleId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    if (!ruleId || !itemId) {
      return res.status(400).json({
        success: false,
        message: "rule id hoặc item id không hợp lệ",
      });
    }

    const {
      name,
      code,
      weight,
      max_score,
      sort_order,
      allow_multiple,
      aggregation_method,
    } = req.body || {};

    const [items] = await db.query(
      `
      SELECT
        gri.*
      FROM grading_rule_items gri
      INNER JOIN grading_rules gr
        ON gr.id = gri.grading_rule_id
      WHERE gri.id = ?
        AND gri.grading_rule_id = ?
        AND gr.church_id = ?
      LIMIT 1
      `,
      [itemId, ruleId, churchId],
    );

    if (!items.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đầu điểm",
      });
    }

    if (code !== undefined && String(code).trim() !== items[0].code) {
      const [duplicate] = await db.query(
        `
        SELECT id
        FROM grading_rule_items
        WHERE grading_rule_id = ?
          AND code = ?
          AND id <> ?
        LIMIT 1
        `,
        [ruleId, String(code).trim(), itemId],
      );

      if (duplicate.length) {
        return res.status(409).json({
          success: false,
          message: "Mã đầu điểm đã tồn tại",
        });
      }
    }

    if (
      aggregation_method !== undefined &&
      !["latest", "average", "highest", "lowest"].includes(aggregation_method)
    ) {
      return res.status(400).json({
        success: false,
        message: "Cách tổng hợp điểm không hợp lệ",
      });
    }

    const fields = [];
    const values = [];

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          message: "Tên đầu điểm không được để trống",
        });
      }

      fields.push("name = ?");
      values.push(String(name).trim());
    }

    if (code !== undefined) {
      if (!String(code).trim()) {
        return res.status(400).json({
          success: false,
          message: "Mã đầu điểm không được để trống",
        });
      }

      fields.push("code = ?");
      values.push(String(code).trim());
    }

    if (weight !== undefined) {
      const value = normalizeNumber(weight, 1);

      if (value < 0) {
        return res.status(400).json({
          success: false,
          message: "Trọng số không được âm",
        });
      }

      fields.push("weight = ?");
      values.push(value);
    }

    if (max_score !== undefined) {
      const value = normalizeNumber(max_score, 10);

      if (value <= 0) {
        return res.status(400).json({
          success: false,
          message: "Điểm tối đa phải lớn hơn 0",
        });
      }

      fields.push("max_score = ?");
      values.push(value);
    }

    if (sort_order !== undefined) {
      fields.push("sort_order = ?");
      values.push(Number(sort_order));
    }

    if (allow_multiple !== undefined) {
      fields.push("allow_multiple = ?");
      values.push(allow_multiple ? 1 : 0);
    }

    if (aggregation_method !== undefined) {
      fields.push("aggregation_method = ?");
      values.push(aggregation_method);
    }

    if (!fields.length) {
      return res.json({
        success: true,
        message: "Không có dữ liệu cần cập nhật",
      });
    }

    values.push(itemId);

    await db.query(
      `
      UPDATE grading_rule_items
      SET ${fields.join(", ")}
      WHERE id = ?
      `,
      values,
    );

    return res.json({
      success: true,
      message: "Cập nhật đầu điểm thành công",
    });
  } catch (error) {
    return sendError(res, error, "Không thể cập nhật đầu điểm");
  }
};

// ============================================================
// DELETE ITEM
// ============================================================

exports.deleteGradingRuleItem = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const ruleId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    if (!ruleId || !itemId) {
      return res.status(400).json({
        success: false,
        message: "rule id hoặc item id không hợp lệ",
      });
    }

    const [results] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM results r
      INNER JOIN grading_rules gr
        ON gr.id = r.grading_rule_id
      WHERE r.grading_rule_item_id = ?
        AND r.grading_rule_id = ?
        AND gr.church_id = ?
      `,
      [itemId, ruleId, churchId],
    );

    if (Number(results[0]?.total) > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Không thể xóa đầu điểm vì đã có kết quả điểm sử dụng đầu điểm này.",
      });
    }

    const [result] = await db.query(
      `
      DELETE gri
      FROM grading_rule_items gri
      INNER JOIN grading_rules gr
        ON gr.id = gri.grading_rule_id
      WHERE gri.id = ?
        AND gri.grading_rule_id = ?
        AND gr.church_id = ?
      `,
      [itemId, ruleId, churchId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đầu điểm",
      });
    }

    return res.json({
      success: true,
      message: "Xóa đầu điểm thành công",
    });
  } catch (error) {
    return sendError(res, error, "Không thể xóa đầu điểm");
  }
};

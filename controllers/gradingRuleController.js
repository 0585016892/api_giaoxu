const db = require("../config/db");

/* =========================================================
   CONSTANTS
========================================================= */

const CALCULATION_TYPES = [
  "average",
  "weighted_average",
  "sum",
  "sum_multiplier",
  "pass_fail",
];

const AGGREGATION_METHODS = ["latest", "average", "highest", "lowest"];

/* =========================================================
   COMMON HELPERS
========================================================= */

const getChurchId = (req) => {
  const churchId = Number(req.user?.church_id);

  if (!Number.isInteger(churchId) || churchId <= 0) {
    const error = new Error("Không xác định được giáo xứ.");
    error.statusCode = 403;
    throw error;
  }

  return churchId;
};

const sendError = (res, error, defaultMessage = "Có lỗi xảy ra.") => {
  console.error("[GRADING_RULE_API_ERROR]", error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || defaultMessage,
  });
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback ? 1 : 0;
  }

  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }

  return 0;
};

const normalizeCode = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
};

const normalizeText = (value) => {
  return String(value || "").trim();
};

const normalizeAggregationMethod = (value) => {
  const method = String(value || "average")
    .trim()
    .toLowerCase();

  return AGGREGATION_METHODS.includes(method) ? method : null;
};

const normalizeCalculationType = (value) => {
  const type = String(value || "weighted_average")
    .trim()
    .toLowerCase();

  return CALCULATION_TYPES.includes(type) ? type : null;
};

const beginTransaction = async () => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  return connection;
};

const rollbackAndRelease = async (connection) => {
  if (!connection) return;

  try {
    await connection.rollback();
  } catch (error) {
    console.error("[GRADING_RULE_ROLLBACK_ERROR]", error);
  }

  connection.release();
};

const commitAndRelease = async (connection) => {
  await connection.commit();
  connection.release();
};

const getRuleByChurch = async (executor, churchId, ruleId = null) => {
  let sql = `
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
  `;

  const params = [churchId];

  if (ruleId !== null) {
    sql += " AND id = ?";
    params.push(ruleId);
  }

  sql += " LIMIT 1";

  const [rows] = await executor.query(sql, params);

  return rows[0] || null;
};

const getItemsByRule = async (executor, ruleId) => {
  const [rows] = await executor.query(
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
    [ruleId],
  );

  return rows;
};

const getRuleWithItems = async (executor, churchId, ruleId = null) => {
  const rule = await getRuleByChurch(executor, churchId, ruleId);

  if (!rule) return null;

  const items = await getItemsByRule(executor, rule.id);

  return {
    ...rule,
    status: "active",
    items,
  };
};

/* =========================================================
   VALIDATE RULE ITEMS
========================================================= */

const validateRuleItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("Quy tắc phải có ít nhất một đầu điểm.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedItems = [];
  const usedCodes = new Set();

  items.forEach((item, index) => {
    const name = normalizeText(item.name);
    const code = normalizeCode(item.code);

    const weight = toNumber(item.weight, 1);
    const maxScore = toNumber(item.max_score, 10);
    const sortOrder = toNumber(item.sort_order, index + 1);

    const aggregationMethod = normalizeAggregationMethod(
      item.aggregation_method,
    );

    if (!name) {
      const error = new Error(`Đầu điểm thứ ${index + 1} chưa có tên.`);
      error.statusCode = 400;
      throw error;
    }

    if (!code) {
      const error = new Error(`Đầu điểm "${name}" chưa có mã.`);
      error.statusCode = 400;
      throw error;
    }

    if (code.length > 50) {
      const error = new Error(
        `Mã đầu điểm "${code}" không được vượt quá 50 ký tự.`,
      );
      error.statusCode = 400;
      throw error;
    }

    if (usedCodes.has(code)) {
      const error = new Error(`Mã đầu điểm "${code}" đang bị trùng.`);
      error.statusCode = 400;
      throw error;
    }

    usedCodes.add(code);

    if (!Number.isFinite(weight) || weight <= 0) {
      const error = new Error(`Trọng số của "${name}" phải lớn hơn 0.`);
      error.statusCode = 400;
      throw error;
    }

    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      const error = new Error(`Điểm tối đa của "${name}" phải lớn hơn 0.`);
      error.statusCode = 400;
      throw error;
    }

    if (!aggregationMethod) {
      const error = new Error(
        `Phương pháp tổng hợp của "${name}" không hợp lệ.`,
      );
      error.statusCode = 400;
      throw error;
    }

    normalizedItems.push({
      id: item.id ? Number(item.id) : null,
      name,
      code,
      weight,
      max_score: maxScore,
      sort_order: sortOrder,
      allow_multiple: normalizeBoolean(item.allow_multiple, false),
      aggregation_method: aggregationMethod,
    });
  });

  return normalizedItems;
};

/* =========================================================
   VALIDATE RULE FIELDS
========================================================= */

const validateRuleFields = (body = {}, currentRule = {}) => {
  const calculationType = normalizeCalculationType(
    body.calculation_type ?? currentRule.calculation_type,
  );

  if (!calculationType) {
    const error = new Error("Loại công thức tính điểm không hợp lệ.");
    error.statusCode = 400;
    throw error;
  }

  const multiplier = toNumber(body.multiplier ?? currentRule.multiplier, 1);

  const divisorValue = body.divisor ?? currentRule.divisor;
  const divisor =
    divisorValue === null || divisorValue === undefined || divisorValue === ""
      ? null
      : toNumber(divisorValue, 0);

  const roundingDigits = toNumber(
    body.rounding_digits ?? currentRule.rounding_digits,
    1,
  );

  const passScore = toNumber(body.pass_score ?? currentRule.pass_score, 5);

  if (multiplier <= 0) {
    const error = new Error("Hệ số nhân phải lớn hơn 0.");
    error.statusCode = 400;
    throw error;
  }

  if (divisor !== null && divisor <= 0) {
    const error = new Error("Số chia phải lớn hơn 0.");
    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(roundingDigits) ||
    roundingDigits < 0 ||
    roundingDigits > 4
  ) {
    const error = new Error("Số chữ số làm tròn phải từ 0 đến 4.");
    error.statusCode = 400;
    throw error;
  }

  if (passScore < 0 || passScore > 10) {
    const error = new Error("Điểm đạt phải nằm trong khoảng từ 0 đến 10.");
    error.statusCode = 400;
    throw error;
  }

  return {
    calculation_type: calculationType,
    multiplier,
    divisor,
    rounding_digits: roundingDigits,
    pass_score: passScore,
    status: "active",
  };
};

/* =========================================================
   CHECK RESULT REFERENCES
========================================================= */

const getItemResultCount = async (executor, itemId, ruleId) => {
  const [rows] = await executor.query(
    `
      SELECT COUNT(*) AS total
      FROM results
      WHERE grading_rule_id = ?
        AND grading_rule_item_id = ?
    `,
    [ruleId, itemId],
  );

  return Number(rows[0]?.total || 0);
};

const ensureItemCanBeDeleted = async (executor, itemId, ruleId) => {
  const total = await getItemResultCount(executor, itemId, ruleId);

  if (total > 0) {
    const error = new Error(
      `Không thể xóa đầu điểm này vì đã có ${total} kết quả được ghi nhận.`,
    );
    error.statusCode = 409;
    throw error;
  }
};

/* =========================================================
   1. GET GRADING RULE
   GET /grading-rules/:id
========================================================= */

exports.getGradingRule = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const ruleId = req.params.id ? Number(req.params.id) : null;

    if (req.params.id && (!Number.isInteger(ruleId) || ruleId <= 0)) {
      return res.status(400).json({
        success: false,
        message: "ID quy tắc không hợp lệ.",
      });
    }

    const rule = await getRuleWithItems(db, churchId, ruleId);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy quy tắc tính điểm.",
      });
    }

    return res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    return sendError(res, error, "Không thể lấy quy tắc tính điểm.");
  }
};

/* =========================================================
   2. CREATE GRADING RULE
   POST /grading-rules
========================================================= */

exports.createGradingRule = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);
    const body = req.body || {};

    const ruleFields = validateRuleFields(body);
    const items = validateRuleItems(body.items);

    connection = await beginTransaction();

    // Mỗi giáo xứ chỉ có một quy tắc tính điểm.
    const [existingRules] = await connection.query(
      `
        SELECT id
        FROM grading_rules
        WHERE church_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [churchId],
    );

    if (existingRules.length > 0) {
      const error = new Error(
        "Giáo xứ đã có quy tắc tính điểm. Vui lòng cập nhật quy tắc hiện tại.",
      );
      error.statusCode = 409;
      throw error;
    }

    const [insertRule] = await connection.query(
      `
        INSERT INTO grading_rules (
          church_id,
          calculation_type,
          multiplier,
          divisor,
          rounding_digits,
          pass_score,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
      `,
      [
        churchId,
        ruleFields.calculation_type,
        ruleFields.multiplier,
        ruleFields.divisor,
        ruleFields.rounding_digits,
        ruleFields.pass_score,
      ],
    );

    const ruleId = insertRule.insertId;

    for (const item of items) {
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
            aggregation_method,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          ruleId,
          item.name,
          item.code,
          item.weight,
          item.max_score,
          item.sort_order,
          item.allow_multiple,
          item.aggregation_method,
        ],
      );
    }

    const data = await getRuleWithItems(connection, churchId, ruleId);

    await commitAndRelease(connection);
    connection = null;

    return res.status(201).json({
      success: true,
      message: "Tạo quy tắc tính điểm thành công.",
      data,
    });
  } catch (error) {
    if (connection) {
      await rollbackAndRelease(connection);
      connection = null;
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Quy tắc hoặc mã đầu điểm đã tồn tại.",
      });
    }

    return sendError(res, error, "Không thể tạo quy tắc tính điểm.");
  }
};

/* =========================================================
   3. UPDATE GRADING RULE + ALL ITEMS
   PUT /grading-rules/:id

   Đây là API quan trọng:
   - Cập nhật thông tin quy tắc.
   - Cập nhật trọng số từng đầu điểm.
   - Thêm đầu điểm mới.
   - Xóa đầu điểm bị bỏ khỏi payload nếu chưa có kết quả.
========================================================= */

exports.updateGradingRule = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);
    const ruleId = Number(req.params.id);
    const body = req.body || {};

    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID quy tắc không hợp lệ.",
      });
    }

    connection = await beginTransaction();

    const [ruleRows] = await connection.query(
      `
        SELECT *
        FROM grading_rules
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [ruleId, churchId],
    );

    if (!ruleRows.length) {
      const error = new Error("Không tìm thấy quy tắc tính điểm.");
      error.statusCode = 404;
      throw error;
    }

    const currentRule = ruleRows[0];

    const ruleFields = validateRuleFields(body, currentRule);

    const [currentItemRows] = await connection.query(
      `
        SELECT *
        FROM grading_rule_items
        WHERE grading_rule_id = ?
        ORDER BY sort_order ASC, id ASC
        FOR UPDATE
      `,
      [ruleId],
    );

    // Chỉ đồng bộ danh sách đầu điểm khi request có gửi items.
    const shouldSyncItems = Object.prototype.hasOwnProperty.call(body, "items");

    let normalizedItems = null;

    if (shouldSyncItems) {
      normalizedItems = validateRuleItems(body.items);

      const currentIds = new Set(
        currentItemRows.map((item) => Number(item.id)),
      );

      for (const item of normalizedItems) {
        if (item.id && !currentIds.has(item.id)) {
          const error = new Error(
            `Đầu điểm ID ${item.id} không thuộc quy tắc này.`,
          );
          error.statusCode = 400;
          throw error;
        }
      }
    }

    // Cập nhật thông tin quy tắc. Status luôn active.
    await connection.query(
      `
        UPDATE grading_rules
        SET
          calculation_type = ?,
          multiplier = ?,
          divisor = ?,
          rounding_digits = ?,
          pass_score = ?,
          status = 'active',
          updated_at = NOW()
        WHERE id = ?
          AND church_id = ?
      `,
      [
        ruleFields.calculation_type,
        ruleFields.multiplier,
        ruleFields.divisor,
        ruleFields.rounding_digits,
        ruleFields.pass_score,
        ruleId,
        churchId,
      ],
    );

    if (shouldSyncItems) {
      const submittedIds = new Set(
        normalizedItems.filter((item) => item.id).map((item) => item.id),
      );

      // Cập nhật đầu điểm cũ hoặc thêm đầu điểm mới.
      for (const item of normalizedItems) {
        if (item.id) {
          await connection.query(
            `
              UPDATE grading_rule_items
              SET
                name = ?,
                code = ?,
                weight = ?,
                max_score = ?,
                sort_order = ?,
                allow_multiple = ?,
                aggregation_method = ?,
                updated_at = NOW()
              WHERE id = ?
                AND grading_rule_id = ?
            `,
            [
              item.name,
              item.code,
              item.weight,
              item.max_score,
              item.sort_order,
              item.allow_multiple,
              item.aggregation_method,
              item.id,
              ruleId,
            ],
          );
        } else {
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
                aggregation_method,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
              ruleId,
              item.name,
              item.code,
              item.weight,
              item.max_score,
              item.sort_order,
              item.allow_multiple,
              item.aggregation_method,
            ],
          );
        }
      }

      // Xóa các đầu điểm đã bị loại khỏi danh sách gửi lên.
      const removedItems = currentItemRows.filter(
        (item) => !submittedIds.has(Number(item.id)),
      );

      for (const item of removedItems) {
        await ensureItemCanBeDeleted(connection, Number(item.id), ruleId);

        await connection.query(
          `
            DELETE FROM grading_rule_items
            WHERE id = ?
              AND grading_rule_id = ?
          `,
          [item.id, ruleId],
        );
      }
    }

    const data = await getRuleWithItems(connection, churchId, ruleId);

    await commitAndRelease(connection);
    connection = null;

    return res.json({
      success: true,
      message: "Cập nhật quy tắc tính điểm thành công.",
      data,
    });
  } catch (error) {
    if (connection) {
      await rollbackAndRelease(connection);
      connection = null;
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Mã đầu điểm đã tồn tại trong quy tắc này.",
      });
    }

    return sendError(res, error, "Không thể cập nhật quy tắc tính điểm.");
  }
};

/* =========================================================
   4. DELETE GRADING RULE
   DELETE /grading-rules/:id
========================================================= */

exports.deleteGradingRule = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);
    const ruleId = Number(req.params.id);

    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID quy tắc không hợp lệ.",
      });
    }

    connection = await beginTransaction();

    const [ruleRows] = await connection.query(
      `
        SELECT id
        FROM grading_rules
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [ruleId, churchId],
    );

    if (!ruleRows.length) {
      const error = new Error("Không tìm thấy quy tắc tính điểm.");
      error.statusCode = 404;
      throw error;
    }

    const [resultRows] = await connection.query(
      `
        SELECT COUNT(*) AS total
        FROM results
        WHERE grading_rule_id = ?
      `,
      [ruleId],
    );

    const totalResults = Number(resultRows[0]?.total || 0);

    if (totalResults > 0) {
      const error = new Error(
        `Không thể xóa quy tắc vì đã có ${totalResults} kết quả được ghi nhận.`,
      );
      error.statusCode = 409;
      throw error;
    }

    await connection.query(
      `
        DELETE FROM grading_rules
        WHERE id = ?
          AND church_id = ?
      `,
      [ruleId, churchId],
    );

    await commitAndRelease(connection);
    connection = null;

    return res.json({
      success: true,
      message: "Xóa quy tắc tính điểm thành công.",
    });
  } catch (error) {
    if (connection) {
      await rollbackAndRelease(connection);
      connection = null;
    }

    return sendError(res, error, "Không thể xóa quy tắc tính điểm.");
  }
};

/* =========================================================
   5. GET GRADING RULE ITEMS
   GET /grading-rules/:id/items
========================================================= */

exports.getGradingRuleItems = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const ruleId = Number(req.params.id);

    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID quy tắc không hợp lệ.",
      });
    }

    const rule = await getRuleByChurch(db, churchId, ruleId);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy quy tắc tính điểm.",
      });
    }

    const items = await getItemsByRule(db, ruleId);

    return res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    return sendError(res, error, "Không thể lấy danh sách đầu điểm.");
  }
};

/* =========================================================
   6. CREATE GRADING RULE ITEM
   POST /grading-rules/:id/items
========================================================= */

exports.createGradingRuleItem = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);
    const ruleId = Number(req.params.id);

    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID quy tắc không hợp lệ.",
      });
    }

    const normalizedItems = validateRuleItems([req.body || {}]);
    const item = normalizedItems[0];

    connection = await beginTransaction();

    const rule = await getRuleByChurch(connection, churchId, ruleId);

    if (!rule) {
      const error = new Error("Không tìm thấy quy tắc tính điểm.");
      error.statusCode = 404;
      throw error;
    }

    const [insertResult] = await connection.query(
      `
        INSERT INTO grading_rule_items (
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
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        ruleId,
        item.name,
        item.code,
        item.weight,
        item.max_score,
        item.sort_order,
        item.allow_multiple,
        item.aggregation_method,
      ],
    );

    const [rows] = await connection.query(
      `
        SELECT *
        FROM grading_rule_items
        WHERE id = ?
          AND grading_rule_id = ?
        LIMIT 1
      `,
      [insertResult.insertId, ruleId],
    );

    await commitAndRelease(connection);
    connection = null;

    return res.status(201).json({
      success: true,
      message: "Thêm đầu điểm thành công.",
      data: rows[0],
    });
  } catch (error) {
    if (connection) {
      await rollbackAndRelease(connection);
      connection = null;
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Mã đầu điểm đã tồn tại trong quy tắc này.",
      });
    }

    return sendError(res, error, "Không thể thêm đầu điểm.");
  }
};

/* =========================================================
   7. UPDATE GRADING RULE ITEM
   PUT /grading-rules/:id/items/:itemId
========================================================= */

exports.updateGradingRuleItem = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);
    const ruleId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    if (
      !Number.isInteger(ruleId) ||
      ruleId <= 0 ||
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "ID quy tắc hoặc đầu điểm không hợp lệ.",
      });
    }

    const body = req.body || {};

    connection = await beginTransaction();

    const rule = await getRuleByChurch(connection, churchId, ruleId);

    if (!rule) {
      const error = new Error("Không tìm thấy quy tắc tính điểm.");
      error.statusCode = 404;
      throw error;
    }

    const [itemRows] = await connection.query(
      `
        SELECT *
        FROM grading_rule_items
        WHERE id = ?
          AND grading_rule_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [itemId, ruleId],
    );

    if (!itemRows.length) {
      const error = new Error("Không tìm thấy đầu điểm.");
      error.statusCode = 404;
      throw error;
    }

    const currentItem = itemRows[0];

    const mergedItem = {
      ...currentItem,
      ...body,
    };

    const item = validateRuleItems([mergedItem])[0];

    await connection.query(
      `
        UPDATE grading_rule_items
        SET
          name = ?,
          code = ?,
          weight = ?,
          max_score = ?,
          sort_order = ?,
          allow_multiple = ?,
          aggregation_method = ?,
          updated_at = NOW()
        WHERE id = ?
          AND grading_rule_id = ?
      `,
      [
        item.name,
        item.code,
        item.weight,
        item.max_score,
        item.sort_order,
        item.allow_multiple,
        item.aggregation_method,
        itemId,
        ruleId,
      ],
    );

    const [updatedRows] = await connection.query(
      `
        SELECT *
        FROM grading_rule_items
        WHERE id = ?
          AND grading_rule_id = ?
        LIMIT 1
      `,
      [itemId, ruleId],
    );

    await commitAndRelease(connection);
    connection = null;

    return res.json({
      success: true,
      message: "Cập nhật đầu điểm thành công.",
      data: updatedRows[0],
    });
  } catch (error) {
    if (connection) {
      await rollbackAndRelease(connection);
      connection = null;
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Mã đầu điểm đã tồn tại trong quy tắc này.",
      });
    }

    return sendError(res, error, "Không thể cập nhật đầu điểm.");
  }
};

/* =========================================================
   8. DELETE GRADING RULE ITEM
   DELETE /grading-rules/:id/items/:itemId
========================================================= */

exports.deleteGradingRuleItem = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);
    const ruleId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    if (
      !Number.isInteger(ruleId) ||
      ruleId <= 0 ||
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "ID quy tắc hoặc đầu điểm không hợp lệ.",
      });
    }

    connection = await beginTransaction();

    const rule = await getRuleByChurch(connection, churchId, ruleId);

    if (!rule) {
      const error = new Error("Không tìm thấy quy tắc tính điểm.");
      error.statusCode = 404;
      throw error;
    }

    const [itemRows] = await connection.query(
      `
        SELECT id
        FROM grading_rule_items
        WHERE id = ?
          AND grading_rule_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [itemId, ruleId],
    );

    if (!itemRows.length) {
      const error = new Error("Không tìm thấy đầu điểm.");
      error.statusCode = 404;
      throw error;
    }

    await ensureItemCanBeDeleted(connection, itemId, ruleId);

    await connection.query(
      `
        DELETE FROM grading_rule_items
        WHERE id = ?
          AND grading_rule_id = ?
      `,
      [itemId, ruleId],
    );

    await commitAndRelease(connection);
    connection = null;

    return res.json({
      success: true,
      message: "Xóa đầu điểm thành công.",
    });
  } catch (error) {
    if (connection) {
      await rollbackAndRelease(connection);
      connection = null;
    }

    return sendError(res, error, "Không thể xóa đầu điểm.");
  }
};

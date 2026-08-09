const db = require("../config/db");
const { parseValue, stringifyValue } = require("../utils/settings.helper");

// =====================
// GET ALL
// =====================
exports.getAll = async (req, res) => {
  try {
    const { group } = req.query;

    let sql = "SELECT * FROM settings";
    let params = [];

    if (group) {
      sql += " WHERE `group` = ?";
      params.push(group);
    }

    sql += " ORDER BY `group`, `key` ASC";

    const [rows] = await db.query(sql, params);

    const result = rows.map((item) => ({
      ...item,
      value: parseValue(item.value, item.type),
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

// =====================
// GET BY KEY
// =====================
exports.getByKey = async (req, res) => {
  try {
    const { key } = req.params;

    const [rows] = await db.query(
      "SELECT * FROM settings WHERE `key`=? LIMIT 1",
      [key],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Setting not found" });
    }

    const setting = rows[0];

    res.json({
      ...setting,
      value: parseValue(setting.value, setting.type),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =====================
// CREATE SETTING
// =====================
exports.create = async (req, res) => {
  console.log("CREATE SETTING BODY:", req.body);
  try {
    const {
      key,
      value,
      type = "string",
      group = "general",
      description,
      is_public,
    } = req.body;

    if (!key) {
      return res.status(400).json({ message: "Key is required" });
    }

    const [exist] = await db.query("SELECT id FROM settings WHERE `key`=?", [
      key,
    ]);

    if (exist.length > 0) {
      return res.status(400).json({ message: "Key already exists" });
    }
    await db.query(
      `INSERT INTO settings 
  (\`key\`, value, type, \`group\`, description, is_public)
  VALUES (?, ?, ?, ?, ?, ?)`,
      [
        key,
        stringifyValue(value, type),
        type,
        group,
        description || null,
        is_public,
      ],
    );

    res.json({
      success: true,
      message: "Setting created",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// =====================
// UPDATE SETTING BY KEY
// =====================
exports.update = async (req, res) => {
  try {
    const { key } = req.params;

    const { value, type, group, description, is_public } = req.body;

    const [rows] = await db.query("SELECT * FROM settings WHERE `key`=?", [
      key,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Setting not found" });
    }

    const old = rows[0];

    await db.query(
      `UPDATE settings SET
        value=?,
        type=?,
        \`group\`=?,
        description=?,
        is_public=?
       WHERE \`key\`=?`,
      [
        stringifyValue(value ?? old.value, type || old.type),
        type || old.type,
        group || old.group,
        description || old.description,
        typeof is_public !== "undefined" ? is_public : old.is_public,
        key,
      ],
    );

    res.json({
      success: true,
      message: "Setting updated",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// =====================
// DELETE SETTING
// =====================
exports.remove = async (req, res) => {
  try {
    const { key } = req.params;

    const [result] = await db.query("DELETE FROM settings WHERE `key`=?", [
      key,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Setting not found" });
    }

    res.json({
      success: true,
      message: "Setting deleted",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =====================
// PUBLIC SETTINGS (frontend)
// =====================
exports.getPublic = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT `key`, value, type FROM settings WHERE is_public=1",
    );

    const result = {};

    rows.forEach((item) => {
      result[item.key] = parseValue(item.value, item.type);
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

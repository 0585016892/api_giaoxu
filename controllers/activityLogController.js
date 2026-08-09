const db = require("../config/db");

// GET ALL LOGS
exports.getLogs = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        l.id,
        l.admin_id,
        l.action,
        l.target_type,
        l.target_id,
        l.description,
        l.ip_address,
        l.created_at,

        a.full_name,
        a.role,
        a.avatar

      FROM activity_logs l

      LEFT JOIN admins a
      ON l.admin_id = a.id

      ORDER BY l.id DESC
    `);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("GET LOGS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// GET LOG DETAIL
exports.getLogById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        l.*,
        a.full_name,
        a.role,
        a.avatar

      FROM activity_logs l

      LEFT JOIN admins a
      ON l.admin_id = a.id

      WHERE l.id=?
      `,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy log",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("GET LOG DETAIL ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

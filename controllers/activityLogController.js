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
// =====================================================
// DELETE MULTIPLE LOGS
// DELETE /api/activity-logs
//
// Body:
// {
//   "ids": [1, 2, 3]
// }
//
// Hoặc:
// {
//   "ids": [15]
// }
// =====================================================

exports.deleteLogs = async (req, res) => {
  try {
    const { ids } = req.body;

    // =================================================
    // VALIDATE
    // =================================================

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn ít nhất một log để xóa",
      });
    }

    // =================================================
    // CHUẨN HÓA ID
    // =================================================

    const logIds = [
      ...new Set(
        ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (logIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách ID log không hợp lệ",
      });
    }

    // =================================================
    // CHECK LOG EXISTS
    // =================================================

    const placeholders = logIds.map(() => "?").join(",");

    const [existingLogs] = await db.query(
      `
        SELECT
          id,
          action,
          target_type,
          target_id,
          description
        FROM activity_logs
        WHERE id IN (${placeholders})
      `,
      logIds,
    );

    if (existingLogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy log nào để xóa",
      });
    }

    // =================================================
    // DELETE
    // =================================================

    const [result] = await db.query(
      `
        DELETE FROM activity_logs
        WHERE id IN (${placeholders})
      `,
      logIds,
    );

    // =================================================
    // RESPONSE
    // =================================================

    console.log("✅ DELETE ACTIVITY LOGS SUCCESS:", {
      requested: logIds.length,
      deleted: result.affectedRows,
      ids: logIds,
    });

    return res.json({
      success: true,

      message: `Đã xóa ${result.affectedRows} log`,

      deleted_count: result.affectedRows,

      requested_count: logIds.length,

      data: existingLogs,
    });
  } catch (err) {
    console.error("DELETE MULTIPLE LOGS ERROR:", err);

    return res.status(500).json({
      success: false,

      message: "Không thể xóa log",

      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

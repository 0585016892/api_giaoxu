const db = require("../config/db");

exports.writeLog = async ({
  admin_id,
  action,
  target_type = null,
  target_id = null,
  description = null,
  ip_address = null,
}) => {
  try {
    await db.query(
      `
      INSERT INTO activity_logs
      (
        admin_id,
        action,
        target_type,
        target_id,
        description,
        ip_address
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [admin_id, action, target_type, target_id, description, ip_address],
    );
  } catch (err) {
    console.error("WRITE LOG ERROR:", err.message);
  }
};

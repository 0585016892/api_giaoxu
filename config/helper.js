const db = require("./db");

exports.writeLog = async ({
  admin_id,
  action,
  target_type,
  target_id,
  description,
  ip_address,
}) => {
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
};

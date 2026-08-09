const db = require("../config/db");
const { getIO } = require("../socket/socket");

const createNotification = async ({
  type,
  title,
  content,
  target_role = null,
  created_by = null,
  related_type = null,
  related_id = null,
  is_read = false,
}) => {
  try {
    // lưu DB
    const [result] = await db.query(
      `
      INSERT INTO notifications
      (
        type,
        title,
        content,
        target_role,
        created_by,
        related_type,
        related_id,
        is_read
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        type,
        title,
        content,
        target_role,
        created_by,
        related_type,
        related_id,
        is_read,
      ],
    );

    const notificationData = {
      id: result.insertId,
      type,
      title,
      content,
      target_role,
      created_by,
      related_type,
      related_id,
      created_at: new Date(),
      is_read,
    };

    // realtime socket
    const io = getIO();

    io.emit("notification", notificationData);

    console.log("📢 Notification emitted");

    return notificationData;
  } catch (err) {
    console.error("❌ createNotification error:", err);
  }
};

module.exports = {
  createNotification,
};

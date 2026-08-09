const db = require("../config/db");
const { getIO } = require("../socket/socket");

const createNotification = async ({
  type,
  title,
  content,
  target_role = null,
  related_id = null,
  related_type = null,
}) => {
  try {
    // 1. lưu DB
    const [result] = await db.query(
      `
      INSERT INTO notifications
      (
        type,
        title,
        content,
        target_role,
        related_id,
        related_type
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [type, title, content, target_role, related_id, related_type],
    );

    // 2. object notification
    const notificationData = {
      id: result.insertId,
      type,
      title,
      content,
      target_role,
      related_id,
      related_type,
      created_at: new Date(),
    };

    // 3. realtime socket
    const io = getIO();

    io.emit("notification", notificationData);

    console.log("📢 Notification emitted:", notificationData);

    return notificationData;
  } catch (err) {
    console.error("❌ createNotification error:", err);
  }
};

module.exports = {
  createNotification,
};

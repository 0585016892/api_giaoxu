const db = require("../config/db");

exports.getNotificationsToDay = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM notifications
      WHERE DATE(created_at) = CURDATE()
      ORDER BY created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await db.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE is_read = 0`,
      [userId],
    );

    return res.json({
      success: true,
      message: "Đã đánh dấu tất cả thông báo là đã đọc",
    });
  } catch (err) {
    console.error("MARK ALL READ ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.createNotification = async (req, res) => {
  try {
    const {
      type,
      title,
      content,
      target_role,
      created_by,
      related_type,
      related_id,
    } = req.body;

    const [result] = await db.query(
      `
      INSERT INTO notifications (
        type,
        title,
        content,
        target_role,
        created_by,
        related_type,
        related_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [type, title, content, target_role, created_by, related_type, related_id],
    );

    res.json({
      success: true,
      id: result.insertId,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};
exports.getNotifications = async (req, res) => {
  try {
    const { role } = req.query;

    let query = `
      SELECT *
      FROM notifications
    `;

    const params = [];

    if (role) {
      query += `
        WHERE target_role = ?
      `;

      params.push(role);
    }

    query += `
      ORDER BY created_at DESC
    `;

    const [rows] = await db.query(query, params);

    res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT *
      FROM notifications
      WHERE id = ?
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ?
      `,
      [id],
    );

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      DELETE
      FROM notifications
      WHERE id = ?
      `,
      [id],
    );

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};
exports.getNotificationStats = async (req, res) => {
  try {
    const [total] = await db.query(`
      SELECT COUNT(*) total
      FROM notifications
    `);

    const [read] = await db.query(`
      SELECT COUNT(*) total
      FROM notifications
      WHERE is_read = 1
    `);

    const [unread] = await db.query(`
      SELECT COUNT(*) total
      FROM notifications
      WHERE is_read = 0
    `);

    res.json({
      success: true,
      data: {
        total: total[0].total,
        read: read[0].total,
        unread: unread[0].total,
      },
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

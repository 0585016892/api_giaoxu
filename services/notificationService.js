const db = require("../config/db");
const { getIO } = require("../socket/socket");

const VALID_TYPES = [
  "system",
  "attendance",
  "class",
  "student",
  "exam",
  "game",
  "achievement",
  "catechist",
  "schedule",
  "announcement",
  "security",
];

const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

/**
 * ============================================================
 * HELPER
 * ============================================================
 */

const normalizeIds = (ids = []) => {
  if (!Array.isArray(ids)) return [];

  return [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
};

/**
 * ============================================================
 * CREATE NOTIFICATION
 *
 * Có thể:
 *
 * 1. Gửi cho user cụ thể:
 *    user_ids: [1, 2, 3]
 *
 * 2. Gửi theo role:
 *    target_role: "teacher"
 *
 * 3. Gửi tất cả user trong giáo xứ:
 *    target_role: "all"
 *
 * target_role KHÔNG lưu vào notifications.
 * Nó chỉ được dùng để tìm người nhận.
 * ============================================================
 */

const createNotification = async ({
  church_id,
  type = "system",
  title,
  content = null,
  priority = "normal",
  related_type = null,
  related_id = null,
  action_url = null,
  created_by = null,

  user_ids = [],
  target_role = null,
}) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  try {
    // ========================================================
    // VALIDATE
    // ========================================================

    church_id = Number(church_id);
    created_by = created_by ? Number(created_by) : null;

    if (!Number.isInteger(church_id) || church_id <= 0) {
      throw new Error("church_id không hợp lệ");
    }

    if (!title || !String(title).trim()) {
      throw new Error("Tiêu đề thông báo không được để trống");
    }

    if (!VALID_TYPES.includes(type)) {
      throw new Error(`Loại thông báo không hợp lệ: ${type}`);
    }

    if (!VALID_PRIORITIES.includes(priority)) {
      throw new Error(`Độ ưu tiên không hợp lệ: ${priority}`);
    }

    // ========================================================
    // NORMALIZE USER IDS
    // ========================================================

    let recipientIds = normalizeIds(user_ids);

    // ========================================================
    // START TRANSACTION
    // ========================================================

    await connection.beginTransaction();
    transactionStarted = true;

    // ========================================================
    // TÌM USER THEO ROLE
    // ========================================================

    if (target_role) {
      let roleSql = `
        SELECT id
        FROM admins
        WHERE church_id = ?
          AND is_active = 1
      `;

      const roleParams = [church_id];

      if (target_role !== "all") {
        roleSql += ` AND role = ?`;
        roleParams.push(target_role);
      }

      const [roleUsers] = await connection.query(roleSql, roleParams);

      const roleUserIds = roleUsers.map((user) => Number(user.id));

      recipientIds = [...new Set([...recipientIds, ...roleUserIds])];
    }

    // ========================================================
    // PHẢI CÓ NGƯỜI NHẬN
    // ========================================================

    if (recipientIds.length === 0) {
      throw new Error("Không có người nhận thông báo");
    }

    // ========================================================
    // KIỂM TRA USER THUỘC ĐÚNG CHURCH
    // ========================================================

    const placeholders = recipientIds.map(() => "?").join(",");

    const [users] = await connection.query(
      `
      SELECT id
      FROM admins
      WHERE id IN (${placeholders})
        AND church_id = ?
        AND is_active = 1
      `,
      [...recipientIds, church_id],
    );

    const validRecipientIds = users.map((user) => Number(user.id));

    if (validRecipientIds.length === 0) {
      throw new Error("Không tìm thấy người nhận hợp lệ");
    }

    // ========================================================
    // INSERT NOTIFICATION
    // ========================================================

    const [notificationResult] = await connection.query(
      `
        INSERT INTO notifications
        (
          church_id,
          type,
          title,
          content,
          priority,
          related_type,
          related_id,
          action_url,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      [
        church_id,
        type,
        String(title).trim(),
        content,
        priority,
        related_type,
        related_id,
        action_url,
        created_by,
      ],
    );

    const notificationId = notificationResult.insertId;

    // ========================================================
    // INSERT NOTIFICATION USERS
    // ========================================================

    const values = validRecipientIds.map((userId) => [
      notificationId,
      userId,
      0,
      null,
      0,
      null,
    ]);

    await connection.query(
      `
      INSERT INTO notification_users
      (
        notification_id,
        user_id,
        is_read,
        read_at,
        is_deleted,
        deleted_at
      )
      VALUES ?
      `,
      [values],
    );

    // ========================================================
    // COMMIT
    // ========================================================

    await connection.commit();
    transactionStarted = false;

    // ========================================================
    // DATA TRẢ VỀ
    // ========================================================

    const notificationData = {
      id: notificationId,
      church_id,
      type,
      title: String(title).trim(),
      content,
      priority,
      related_type,
      related_id,
      action_url,
      created_by,
      created_at: new Date(),

      is_read: 0,
      is_deleted: 0,
    };

    // ========================================================
    // SOCKET.IO
    // ========================================================

    try {
      const io = getIO();

      validRecipientIds.forEach((userId) => {
        io.to(`user:${userId}`).emit("notification", notificationData);
      });

      console.log(
        `📢 Notification #${notificationId} sent to:`,
        validRecipientIds,
      );
    } catch (socketError) {
      console.error("⚠️ Socket notification error:", socketError);
    }

    return {
      ...notificationData,
      recipient_count: validRecipientIds.length,
      user_ids: validRecipientIds,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ Rollback error:", rollbackError);
      }
    }

    console.error("❌ createNotification:", error);

    throw error;
  } finally {
    connection.release();
  }
};

/**
 * ============================================================
 * GET MY NOTIFICATIONS
 * ============================================================
 */

const getMyNotifications = async ({
  user_id,
  church_id,
  page = 1,
  limit = 20,
  unread_only = false,
}) => {
  user_id = Number(user_id);
  church_id = Number(church_id);

  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const offset = (page - 1) * limit;

  let where = `
    WHERE nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
  `;

  const params = [user_id, church_id];

  if (
    unread_only === true ||
    unread_only === "true" ||
    unread_only === 1 ||
    unread_only === "1"
  ) {
    where += `
      AND nu.is_read = 0
    `;
  }

  const [rows] = await db.query(
    `
    SELECT
      n.id,
      n.church_id,
      n.type,
      n.title,
      n.content,
      n.priority,
      n.related_type,
      n.related_id,
      n.action_url,
      n.created_by,
      n.created_at,
      n.updated_at,

      nu.is_read,
      nu.read_at

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    ${where}

    ORDER BY n.created_at DESC

    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  const [[count]] = await db.query(
    `
    SELECT COUNT(*) AS total

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    ${where}
    `,
    params,
  );

  const total = Number(count.total || 0);

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    },
  };
};

/**
 * ============================================================
 * GET TODAY NOTIFICATIONS
 * ============================================================
 */

const getMyNotificationsToday = async ({ user_id, church_id }) => {
  const [rows] = await db.query(
    `
    SELECT
      n.id,
      n.church_id,
      n.type,
      n.title,
      n.content,
      n.priority,
      n.related_type,
      n.related_id,
      n.action_url,
      n.created_by,
      n.created_at,
      n.updated_at,

      nu.is_read,
      nu.read_at

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    WHERE nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
      AND DATE(n.created_at) = CURDATE()

    ORDER BY n.created_at DESC
    `,
    [Number(user_id), Number(church_id)],
  );

  return rows;
};

/**
 * ============================================================
 * GET ONE
 * ============================================================
 */

const getMyNotificationById = async ({
  notification_id,
  user_id,
  church_id,
}) => {
  const [rows] = await db.query(
    `
    SELECT
      n.id,
      n.church_id,
      n.type,
      n.title,
      n.content,
      n.priority,
      n.related_type,
      n.related_id,
      n.action_url,
      n.created_by,
      n.created_at,
      n.updated_at,

      nu.is_read,
      nu.read_at

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    WHERE n.id = ?
      AND nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?

    LIMIT 1
    `,
    [Number(notification_id), Number(user_id), Number(church_id)],
  );

  return rows[0] || null;
};

/**
 * ============================================================
 * MARK ONE AS READ
 * ============================================================
 */

const markAsRead = async ({ notification_id, user_id, church_id }) => {
  const [result] = await db.query(
    `
    UPDATE notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    SET
      nu.is_read = 1,
      nu.read_at = NOW()

    WHERE nu.notification_id = ?
      AND nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
    `,
    [Number(notification_id), Number(user_id), Number(church_id)],
  );

  return result.affectedRows > 0;
};

/**
 * ============================================================
 * MARK ALL AS READ
 * ============================================================
 */

const markAllAsRead = async ({ user_id, church_id }) => {
  const [result] = await db.query(
    `
    UPDATE notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    SET
      nu.is_read = 1,
      nu.read_at = NOW()

    WHERE nu.user_id = ?
      AND nu.is_read = 0
      AND nu.is_deleted = 0
      AND n.church_id = ?
    `,
    [Number(user_id), Number(church_id)],
  );

  return result.affectedRows;
};

/**
 * ============================================================
 * DELETE ONE
 *
 * Chỉ xóa với user hiện tại.
 * Không xóa notification gốc.
 * ============================================================
 */

const deleteMyNotification = async ({
  notification_id,
  user_id,
  church_id,
}) => {
  const [result] = await db.query(
    `
    UPDATE notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    SET
      nu.is_deleted = 1,
      nu.deleted_at = NOW()

    WHERE nu.notification_id = ?
      AND nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
    `,
    [Number(notification_id), Number(user_id), Number(church_id)],
  );

  return result.affectedRows > 0;
};

/**
 * ============================================================
 * DELETE ALL MY NOTIFICATIONS
 * ============================================================
 */

const deleteAllMyNotifications = async ({ user_id, church_id }) => {
  const [result] = await db.query(
    `
    UPDATE notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    SET
      nu.is_deleted = 1,
      nu.deleted_at = NOW()

    WHERE nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
    `,
    [Number(user_id), Number(church_id)],
  );

  return result.affectedRows;
};

/**
 * ============================================================
 * STATS
 * ============================================================
 */

const getMyNotificationStats = async ({ user_id, church_id }) => {
  const [[stats]] = await db.query(
    `
    SELECT
      COUNT(*) AS total,

      COALESCE(
        SUM(
          CASE
            WHEN nu.is_read = 0 THEN 1
            ELSE 0
          END
        ),
        0
      ) AS unread,

      COALESCE(
        SUM(
          CASE
            WHEN nu.is_read = 1 THEN 1
            ELSE 0
          END
        ),
        0
      ) AS read_count

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    WHERE nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
    `,
    [Number(user_id), Number(church_id)],
  );

  return {
    total: Number(stats.total || 0),
    unread: Number(stats.unread || 0),
    read: Number(stats.read_count || 0),
  };
};

/**
 * ============================================================
 * UNREAD COUNT
 * ============================================================
 */

const getUnreadCount = async ({ user_id, church_id }) => {
  const [[result]] = await db.query(
    `
    SELECT COUNT(*) AS unread

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    WHERE nu.user_id = ?
      AND nu.is_read = 0
      AND nu.is_deleted = 0
      AND n.church_id = ?
    `,
    [Number(user_id), Number(church_id)],
  );

  return Number(result.unread || 0);
};

module.exports = {
  createNotification,

  getMyNotifications,
  getMyNotificationsToday,
  getMyNotificationById,

  markAsRead,
  markAllAsRead,

  deleteMyNotification,
  deleteAllMyNotifications,

  getMyNotificationStats,
  getUnreadCount,
};

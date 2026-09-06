const db = require("../config/db");
const { getIO } = require("../socket/socket");

// ============================================================
// CONSTANTS
// ============================================================

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

// ============================================================
// HELPERS
// ============================================================

const normalizeIds = (ids = []) => {
  if (!Array.isArray(ids)) {
    return [];
  }

  return [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
};

// ============================================================
// NOTIFICATION STATS SELECT
// ============================================================

const NOTIFICATION_STATS_SELECT = `
  (
    SELECT COUNT(*)
    FROM notification_users nus
    WHERE nus.notification_id = n.id
      AND nus.is_deleted = 0
  ) AS recipient_count,

  (
    SELECT COUNT(*)
    FROM notification_users nus
    WHERE nus.notification_id = n.id
      AND nus.is_deleted = 0
      AND nus.is_read = 1
  ) AS read_count,

  (
    SELECT COUNT(*)
    FROM notification_users nus
    WHERE nus.notification_id = n.id
      AND nus.is_deleted = 0
      AND nus.is_read = 0
  ) AS unread_count,

  (
    SELECT COALESCE(
      ROUND(
        (
          SUM(
            CASE
              WHEN nus.is_read = 1 THEN 1
              ELSE 0
            END
          ) / NULLIF(COUNT(*), 0)
        ) * 100,
        0
      ),
      0
    )
    FROM notification_users nus
    WHERE nus.notification_id = n.id
      AND nus.is_deleted = 0
  ) AS read_percent
`;

// ============================================================
// CREATE NOTIFICATION
// ============================================================

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
    // NORMALIZE
    // ========================================================

    church_id = Number(church_id);

    created_by = created_by ? Number(created_by) : null;

    // ========================================================
    // VALIDATE
    // ========================================================

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
    // START RECIPIENT IDS
    // ========================================================

    let recipientIds = normalizeIds(user_ids);

    // ========================================================
    // START TRANSACTION
    // ========================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // ========================================================
    // TARGET ROLE
    // ========================================================

    if (target_role) {
      let sql = `
        SELECT id
        FROM admins
        WHERE church_id = ?
          AND is_active = 1
      `;

      const params = [church_id];

      if (target_role !== "all") {
        sql += `
          AND role = ?
        `;

        params.push(target_role);
      }

      const [users] = await connection.query(sql, params);

      const roleUserIds = users.map((user) => Number(user.id));

      recipientIds = [...new Set([...recipientIds, ...roleUserIds])];
    }

    // ========================================================
    // DEFAULT ALL USERS
    // ========================================================

    if (recipientIds.length === 0) {
      const [allUsers] = await connection.query(
        `
        SELECT id
        FROM admins
        WHERE church_id = ?
          AND is_active = 1
        `,
        [church_id],
      );

      recipientIds = allUsers.map((user) => Number(user.id));
    }

    // ========================================================
    // NO RECIPIENT
    // ========================================================

    if (recipientIds.length === 0) {
      throw new Error("Giáo xứ chưa có người dùng để nhận thông báo");
    }

    // ========================================================
    // VALIDATE RECIPIENTS
    // ========================================================

    const placeholders = recipientIds.map(() => "?").join(",");

    const [validUsers] = await connection.query(
      `
      SELECT id
      FROM admins
      WHERE id IN (${placeholders})
        AND church_id = ?
        AND is_active = 1
      `,
      [...recipientIds, church_id],
    );

    const validRecipientIds = validUsers.map((user) => Number(user.id));

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
        content ? String(content).trim() : null,
        priority,
        related_type,
        related_id,
        action_url,
        created_by,
      ],
    );

    const notificationId = notificationResult.insertId;

    // ========================================================
    // INSERT USER NOTIFICATIONS
    // ========================================================

    const notificationUserValues = validRecipientIds.map((userId) => [
      notificationId,
      userId,
      0,
      null,
      0,
      null,
    ]);

    if (notificationUserValues.length > 0) {
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
        [notificationUserValues],
      );
    }

    // ========================================================
    // GET CREATOR NAME
    // ========================================================

    let createdByName = null;

    if (created_by) {
      const [[creator]] = await connection.query(
        `
        SELECT full_name
        FROM admins
        WHERE id = ?
        LIMIT 1
        `,
        [created_by],
      );

      createdByName = creator?.full_name || null;
    }

    // ========================================================
    // COMMIT
    // ========================================================

    await connection.commit();

    transactionStarted = false;

    // ========================================================
    // BUILD RESPONSE DATA
    // ========================================================

    const notificationData = {
      id: notificationId,

      church_id,

      type,

      title: String(title).trim(),

      content: content ? String(content).trim() : null,

      priority,

      related_type,

      related_id,

      action_url,

      created_by,

      created_by_name: createdByName,

      created_at: new Date(),

      is_read: 0,

      is_deleted: 0,

      recipient_count: validRecipientIds.length,

      read_count: 0,

      unread_count: validRecipientIds.length,

      read_percent: 0,
    };

    // ========================================================
    // SOCKET.IO
    // ========================================================

    try {
      const io = getIO();

      const churchRoom = `church:${church_id}`;

      io.to(churchRoom).emit("notification", notificationData);

      console.log("📢 ====================================");

      console.log(`📢 Notification #${notificationId}`);

      console.log(`⛪ Church Room: ${churchRoom}`);

      console.log(`👥 Total Recipients: ${validRecipientIds.length}`);

      console.log("📢 ====================================");
    } catch (socketError) {
      console.error("⚠️ SOCKET NOTIFICATION ERROR:", socketError.message);
    }

    // ========================================================
    // RETURN
    // ========================================================

    return {
      ...notificationData,

      user_ids: validRecipientIds,
    };
  } catch (error) {
    // ========================================================
    // ROLLBACK
    // ========================================================

    if (transactionStarted) {
      try {
        await connection.rollback();

        console.log("↩️ Notification transaction rolled back");
      } catch (rollbackError) {
        console.error("❌ Rollback error:", rollbackError);
      }
    }

    console.error("❌ CREATE NOTIFICATION SERVICE ERROR:", error);

    throw error;
  } finally {
    connection.release();
  }
};

// ============================================================
// GET MY NOTIFICATIONS
// ============================================================

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

      creator.full_name AS created_by_name,

      nu.is_read,
      nu.read_at,

      ${NOTIFICATION_STATS_SELECT}

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    LEFT JOIN admins creator
      ON creator.id = n.created_by

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
    data: rows.map((item) => ({
      ...item,

      recipient_count: Number(item.recipient_count || 0),

      read_count: Number(item.read_count || 0),

      unread_count: Number(item.unread_count || 0),

      read_percent: Number(item.read_percent || 0),
    })),

    pagination: {
      page,

      limit,

      total,

      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    },
  };
};

// ============================================================
// GET TODAY NOTIFICATIONS
// ============================================================

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

      creator.full_name AS created_by_name,

      nu.is_read,
      nu.read_at,

      ${NOTIFICATION_STATS_SELECT}

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    LEFT JOIN admins creator
      ON creator.id = n.created_by

    WHERE nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
      AND DATE(n.created_at) = CURDATE()

    ORDER BY n.created_at DESC
    `,
    [Number(user_id), Number(church_id)],
  );

  return rows.map((item) => ({
    ...item,

    recipient_count: Number(item.recipient_count || 0),

    read_count: Number(item.read_count || 0),

    unread_count: Number(item.unread_count || 0),

    read_percent: Number(item.read_percent || 0),
  }));
};

// ============================================================
// GET ONE NOTIFICATION
// ============================================================

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

      creator.full_name AS created_by_name,

      nu.is_read,
      nu.read_at,

      ${NOTIFICATION_STATS_SELECT}

    FROM notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    LEFT JOIN admins creator
      ON creator.id = n.created_by

    WHERE n.id = ?
      AND nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?

    LIMIT 1
    `,
    [Number(notification_id), Number(user_id), Number(church_id)],
  );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],

    recipient_count: Number(rows[0].recipient_count || 0),

    read_count: Number(rows[0].read_count || 0),

    unread_count: Number(rows[0].unread_count || 0),

    read_percent: Number(rows[0].read_percent || 0),
  };
};

// ============================================================
// MARK ONE AS READ
// ============================================================

const markAsRead = async ({ notification_id, user_id, church_id }) => {
  const [result] = await db.query(
    `
    UPDATE notification_users nu

    INNER JOIN notifications n
      ON n.id = nu.notification_id

    SET
      nu.is_read = 1,

      nu.read_at =
        CASE
          WHEN nu.is_read = 0
          THEN NOW()
          ELSE nu.read_at
        END

    WHERE nu.notification_id = ?
      AND nu.user_id = ?
      AND nu.is_deleted = 0
      AND n.church_id = ?
    `,
    [Number(notification_id), Number(user_id), Number(church_id)],
  );

  return result.affectedRows > 0;
};

// ============================================================
// MARK ALL AS READ
// ============================================================

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

// ============================================================
// DELETE ONE
// ============================================================

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

// ============================================================
// DELETE ALL
// ============================================================

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

// ============================================================
// STATS
// ============================================================

const getMyNotificationStats = async ({ user_id, church_id }) => {
  const [[stats]] = await db.query(
    `
    SELECT

      COUNT(*) AS total,

      COALESCE(
        SUM(
          CASE
            WHEN nu.is_read = 0
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS unread,

      COALESCE(
        SUM(
          CASE
            WHEN nu.is_read = 1
            THEN 1
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

// ============================================================
// UNREAD COUNT
// ============================================================

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

// ============================================================
// EXPORT
// ============================================================

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

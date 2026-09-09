const db = require("../config/db");
const { getIO } = require("../socket/socket");
const { sendNotificationEmails } = require("../utils/emailService");

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
//
// church_id:
//   - number => gửi trong 1 giáo xứ
//   - null   => gửi toàn hệ thống
//
// LƯU Ý:
// Quyền admin_catechist được kiểm tra ở CONTROLLER.
// Service chỉ xử lý dữ liệu.
// ============================================================
const createNotification = async ({
  church_id = null,
  type = "system",
  title,
  content = null,
  priority = "normal",
  related_type = null,
  related_id = null,
  action_url = null,
  created_by = null,
  user_ids = [],
  target_role = "all",
  send_email = false,
}) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  try {
    // ========================================================
    // 1. NORMALIZE
    // ========================================================

    // NULL = TOÀN HỆ THỐNG
    if (church_id === null || church_id === undefined || church_id === "") {
      church_id = null;
    } else {
      church_id = Number(church_id);
    }

    // CREATED BY
    if (created_by === null || created_by === undefined || created_by === "") {
      created_by = null;
    } else {
      created_by = Number(created_by);
    }

    // TARGET ROLE
    target_role =
      target_role === null || target_role === undefined || target_role === ""
        ? "all"
        : String(target_role).trim();

    // EMAIL
    send_email = Boolean(send_email);

    // ========================================================
    // 2. VALIDATE
    // ========================================================

    // --------------------------------------------------------
    // CHURCH ID
    // NULL = GLOBAL
    // --------------------------------------------------------

    if (
      church_id !== null &&
      (!Number.isInteger(church_id) || church_id <= 0)
    ) {
      throw new Error("church_id không hợp lệ");
    }

    // --------------------------------------------------------
    // CREATED BY
    // --------------------------------------------------------

    if (
      created_by !== null &&
      (!Number.isInteger(created_by) || created_by <= 0)
    ) {
      throw new Error("created_by không hợp lệ");
    }

    // --------------------------------------------------------
    // TITLE
    // --------------------------------------------------------

    if (!title || !String(title).trim()) {
      throw new Error("Tiêu đề thông báo không được để trống");
    }

    // --------------------------------------------------------
    // TYPE
    // --------------------------------------------------------

    if (!VALID_TYPES.includes(type)) {
      throw new Error(`Loại thông báo không hợp lệ: ${type}`);
    }

    // --------------------------------------------------------
    // PRIORITY
    // --------------------------------------------------------

    if (!VALID_PRIORITIES.includes(priority)) {
      throw new Error(`Độ ưu tiên không hợp lệ: ${priority}`);
    }

    // --------------------------------------------------------
    // TARGET ROLE
    // --------------------------------------------------------

    const allowedRoles = ["all", "admin_catechist", "catechist", "teacher"];

    if (!allowedRoles.includes(target_role)) {
      throw new Error(`target_role không hợp lệ: ${target_role}`);
    }

    // ========================================================
    // 3. NORMALIZE USER IDS
    // ========================================================

    let recipientIds = normalizeIds(user_ids);

    // ========================================================
    // 4. START TRANSACTION
    // ========================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // ========================================================
    // 5. FIND USERS BY TARGET ROLE
    // ========================================================
    //
    // GLOBAL:
    // church_id = NULL
    // => toàn bộ hệ thống
    //
    // CHURCH:
    // church_id = 16
    // => chỉ giáo xứ 16
    //
    // ========================================================

    let roleSql = `
      SELECT
        id
      FROM admins
      WHERE is_active = 1
    `;

    const roleParams = [];

    // --------------------------------------------------------
    // CHỈ FILTER CHURCH KHI CÓ CHURCH_ID
    // --------------------------------------------------------

    if (church_id !== null) {
      roleSql += `
        AND church_id = ?
      `;

      roleParams.push(church_id);
    }

    // --------------------------------------------------------
    // FILTER ROLE
    // --------------------------------------------------------

    if (target_role !== "all") {
      roleSql += `
        AND role = ?
      `;

      roleParams.push(target_role);
    }

    const [roleUsers] = await connection.query(roleSql, roleParams);

    const roleUserIds = roleUsers.map((user) => Number(user.id));

    // --------------------------------------------------------
    // MERGE USER IDS
    // --------------------------------------------------------

    recipientIds = [...new Set([...recipientIds, ...roleUserIds])];

    // ========================================================
    // 6. NẾU CHƯA CÓ RECIPIENT
    // ========================================================
    //
    // Trường hợp target_role = all nhưng query trên không ra
    // thì query này vẫn đảm bảo lấy tất cả active users.
    //
    // ========================================================

    if (recipientIds.length === 0) {
      let allUsersSql = `
        SELECT
          id
        FROM admins
        WHERE is_active = 1
      `;

      const allUsersParams = [];

      // ------------------------------------------------------
      // GLOBAL
      // => KHÔNG FILTER CHURCH
      // ------------------------------------------------------

      if (church_id !== null) {
        allUsersSql += `
          AND church_id = ?
        `;

        allUsersParams.push(church_id);
      }

      const [allUsers] = await connection.query(allUsersSql, allUsersParams);

      recipientIds = allUsers.map((user) => Number(user.id));
    }

    // ========================================================
    // 7. CHECK RECIPIENT
    // ========================================================

    if (recipientIds.length === 0) {
      throw new Error(
        church_id === null
          ? "Hệ thống chưa có người dùng để nhận thông báo"
          : "Giáo xứ chưa có người dùng để nhận thông báo",
      );
    }

    // ========================================================
    // 8. VALIDATE RECIPIENTS
    // ========================================================
    //
    // GLOBAL:
    // => user thuộc giáo xứ nào cũng được
    //
    // CHURCH:
    // => user bắt buộc thuộc church_id
    //
    // ========================================================

    const placeholders = recipientIds.map(() => "?").join(",");

    let validateSql = `
      SELECT
        id,
        full_name,
        email,
        church_id,
        role
      FROM admins
      WHERE id IN (${placeholders})
        AND is_active = 1
    `;

    const validateParams = [...recipientIds];

    // --------------------------------------------------------
    // CHURCH SCOPE
    // --------------------------------------------------------

    if (church_id !== null) {
      validateSql += `
        AND church_id = ?
      `;

      validateParams.push(church_id);
    }

    const [validUsers] = await connection.query(validateSql, validateParams);

    const validRecipientIds = validUsers.map((user) => Number(user.id));

    // ========================================================
    // 9. NO VALID RECIPIENT
    // ========================================================

    if (validRecipientIds.length === 0) {
      throw new Error(
        church_id === null
          ? "Không tìm thấy người dùng hợp lệ để nhận thông báo toàn hệ thống"
          : "Không tìm thấy người dùng hợp lệ để nhận thông báo",
      );
    }

    // ========================================================
    // 10. EMAIL RECIPIENTS
    // ========================================================

    const emailRecipients = send_email
      ? validUsers
          .filter((user) => user.email && String(user.email).trim())
          .map((user) => ({
            id: Number(user.id),
            full_name: user.full_name,
            email: String(user.email).trim(),
          }))
      : [];

    // ========================================================
    // 11. INSERT NOTIFICATION
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

        content === null || content === undefined || content === ""
          ? null
          : String(content).trim(),

        priority,

        related_type,

        related_id,

        action_url,

        created_by,
      ],
    );

    const notificationId = notificationResult.insertId;

    // ========================================================
    // 12. INSERT NOTIFICATION USERS
    // ========================================================

    const notificationUserValues = validRecipientIds.map((userId) => [
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
      [notificationUserValues],
    );

    // ========================================================
    // 13. GET CREATOR
    // ========================================================

    let createdByName = null;

    if (created_by) {
      const [[creator]] = await connection.query(
        `
            SELECT
              full_name
            FROM admins
            WHERE id = ?
            LIMIT 1
          `,
        [created_by],
      );

      createdByName = creator?.full_name || null;
    }

    // ========================================================
    // 14. COMMIT
    // ========================================================

    await connection.commit();

    transactionStarted = false;

    // ========================================================
    // 15. BUILD NOTIFICATION DATA
    // ========================================================

    const notificationData = {
      id: notificationId,

      // NULL = TOÀN HỆ THỐNG
      church_id,

      // GLOBAL / CHURCH
      scope: church_id === null ? "global" : "church",

      type,

      title: String(title).trim(),

      content:
        content === null || content === undefined || content === ""
          ? null
          : String(content).trim(),

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
    // 16. SOCKET.IO
    // ========================================================

    try {
      const io = getIO();

      // ------------------------------------------------------
      // GLOBAL
      // ------------------------------------------------------

      if (church_id === null) {
        io.emit("notification", notificationData);

        console.log("🌍 Notification GLOBAL");
      }

      // ------------------------------------------------------
      // CHURCH
      // ------------------------------------------------------
      else {
        const churchRoom = `church:${church_id}`;

        io.to(churchRoom).emit("notification", notificationData);

        console.log(`⛪ Notification ${churchRoom}`);
      }

      console.log("📢 ====================================");

      console.log(`📢 Notification #${notificationId}`);

      console.log(
        `🏷️ Scope: ${church_id === null ? "GLOBAL" : `CHURCH ${church_id}`}`,
      );

      console.log(`🎯 Target Role: ${target_role}`);

      console.log(`👥 Recipients: ${validRecipientIds.length}`);

      console.log("📢 ====================================");
    } catch (socketError) {
      console.error("⚠️ SOCKET NOTIFICATION ERROR:", socketError.message);
    }

    // ========================================================
    // 17. SEND EMAIL
    // ========================================================

    const emailResult = {
      total: 0,
      success: 0,
      failed: 0,
      results: [],
    };

    if (send_email && emailRecipients.length > 0) {
      console.log(
        `📧 Bắt đầu gửi Email cho ${emailRecipients.length} người...`,
      );

      // Không await
      // Email chạy background
      sendNotificationEmails({
        recipients: emailRecipients,

        title: String(title).trim(),

        content:
          content === null || content === undefined
            ? ""
            : String(content).trim(),

        priority,
      })
        .then((result) => {
          console.log("📧 ====================================");

          console.log(`📧 Email Total: ${result.total}`);

          console.log(`📧 Email Success: ${result.success}`);

          console.log(`📧 Email Failed: ${result.failed}`);

          console.log("📧 ====================================");

          if (result.invalid > 0) {
            console.log(`⚠️ Email không hợp lệ: ${result.invalid}`);
          }
        })
        .catch((error) => {
          console.error("❌ EMAIL BACKGROUND ERROR:", error?.message || error);
        });
    }

    // ========================================================
    // 18. EMAIL REQUESTED BUT NO EMAIL
    // ========================================================

    if (send_email && emailRecipients.length === 0) {
      console.log("⚠️ Không có người nhận nào có Email hợp lệ.");
    }

    // ========================================================
    // 19. RETURN
    // ========================================================

    return {
      ...notificationData,

      user_ids: validRecipientIds,

      email_enabled: send_email,

      // Email đang chạy background
      email_recipient_count: emailRecipients.length,

      email_success_count: emailResult.success,

      email_failed_count: emailResult.failed,
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
//
// User sẽ nhận:
// 1. Notification của giáo xứ mình
// 2. Notification toàn hệ thống (church_id IS NULL)
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

  const where = `
    WHERE nu.user_id = ?
      AND nu.is_deleted = 0
      AND (
        n.church_id = ?
        OR n.church_id IS NULL
      )
  `;

  const params = [user_id, church_id];

  const finalWhere =
    unread_only === true ||
    unread_only === "true" ||
    unread_only === 1 ||
    unread_only === "1"
      ? `
        ${where}
        AND nu.is_read = 0
      `
      : where;

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

    ${finalWhere}

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

      ${finalWhere}
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
      AND (
        n.church_id = ?
        OR n.church_id IS NULL
      )
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
      AND (
        n.church_id = ?
        OR n.church_id IS NULL
      )

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
      AND (
        n.church_id = ?
        OR n.church_id IS NULL
      )
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
      AND (
        n.church_id = ?
        OR n.church_id IS NULL
      )
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
      AND (
        n.church_id = ?
        OR n.church_id IS NULL
      )
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
      AND (
        n.church_id = ?
        OR n.church_id IS NULL
      )
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
        AND (
          n.church_id = ?
          OR n.church_id IS NULL
        )
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
        AND (
          n.church_id = ?
          OR n.church_id IS NULL
        )
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

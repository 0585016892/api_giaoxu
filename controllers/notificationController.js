const notificationService = require("../services/notificationService");

// ============================================================
// HELPERS
// ============================================================

const getChurchId = (req) => {
  const churchId = req.user?.church_id ?? req.user?.parish_id ?? null;

  if (
    churchId === null ||
    churchId === undefined ||
    churchId === "" ||
    Number.isNaN(Number(churchId))
  ) {
    return null;
  }

  const value = Number(churchId);

  return Number.isInteger(value) && value > 0 ? value : null;
};

const getUserId = (req) => {
  const userId = Number(req.user?.id || 0);

  return Number.isInteger(userId) && userId > 0 ? userId : 0;
};

const isValidId = (id) => {
  const value = Number(id);

  return Number.isInteger(value) && value > 0;
};

const isAdminCatechist = (req) => {
  return req.user?.role === "admin_catechist";
};

const normalizeBoolean = (value) => {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }

  return false;
};

const normalizeArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
};

// ============================================================
// GET NOTIFICATIONS
// GET /api/notifications
// ============================================================

exports.getNotifications = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const { page = 1, limit = 20, unread_only = false } = req.query;

    const result = await notificationService.getMyNotifications({
      user_id: userId,
      church_id: churchId,
      page,
      limit,
      unread_only: normalizeBoolean(unread_only),
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("GET NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tải thông báo",
    });
  }
};

// ============================================================
// GET TODAY
// GET /api/notifications/today
// ============================================================

exports.getNotificationsToday = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const data = await notificationService.getMyNotificationsToday({
      user_id: userId,
      church_id: churchId,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET TODAY NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tải thông báo hôm nay",
    });
  }
};

// ============================================================
// GET DETAIL
// GET /api/notifications/:id
// ============================================================

exports.getNotificationById = async (req, res) => {
  try {
    const notificationId = Number(req.params.id);

    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!isValidId(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "ID thông báo không hợp lệ",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const data = await notificationService.getMyNotificationById({
      notification_id: notificationId,
      user_id: userId,
      church_id: churchId,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET NOTIFICATION DETAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tải thông báo",
    });
  }
};

// ============================================================
// CREATE NOTIFICATION
// POST /api/notifications
// ============================================================

exports.createNotification = async (req, res) => {
  try {
    const currentChurchId = getChurchId(req);
    const createdBy = getUserId(req);

    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const adminCatechist = isAdminCatechist(req);

    // ========================================================
    // BODY
    // ========================================================

    const {
      type = "announcement",
      title,
      content = null,
      priority = "normal",
      related_type = null,
      related_id = null,
      action_url = null,
      target_role = "all",
      send_email = false,
      user_ids = [],
    } = req.body || {};

    // ========================================================
    // VALIDATE TITLE
    // ========================================================

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tiêu đề thông báo",
      });
    }

    // ========================================================
    // CHURCH ID
    //
    // Không truyền church_id:
    // => gửi trong giáo xứ hiện tại
    //
    // church_id = null:
    // => gửi toàn hệ thống
    //
    // church_id = số:
    // => gửi cho giáo xứ đó
    // ========================================================

    let churchId;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "church_id")) {
      const rawChurchId = req.body.church_id;

      // ------------------------------------------------------
      // GLOBAL NOTIFICATION
      // church_id = null
      // ------------------------------------------------------

      if (
        rawChurchId === null ||
        rawChurchId === undefined ||
        rawChurchId === ""
      ) {
        churchId = null;
      } else {
        const parsedChurchId = Number(rawChurchId);

        if (!isValidId(parsedChurchId)) {
          return res.status(400).json({
            success: false,
            message: "church_id không hợp lệ",
          });
        }

        churchId = parsedChurchId;
      }
    } else {
      // Không truyền => giáo xứ hiện tại
      churchId = currentChurchId;
    }

    // ========================================================
    // GLOBAL NOTIFICATION
    // ========================================================

    if (churchId === null && !adminCatechist) {
      return res.status(403).json({
        success: false,
        message:
          "Chỉ Quản trị viên Giáo lý mới có quyền gửi thông báo toàn hệ thống.",
      });
    }

    // ========================================================
    // NẾU GỬI CHO GIÁO XỨ CỤ THỂ
    // ========================================================

    if (churchId !== null) {
      // Không có giáo xứ hiện tại
      if (!currentChurchId) {
        return res.status(403).json({
          success: false,
          message: "Tài khoản chưa được liên kết với giáo xứ.",
        });
      }

      // User thường chỉ được gửi cho giáo xứ của mình
      if (Number(churchId) !== Number(currentChurchId) && !adminCatechist) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền gửi thông báo cho giáo xứ này.",
        });
      }
    }

    // ========================================================
    // EMAIL
    //
    // CHỈ admin_catechist
    // ========================================================

    const shouldSendEmail = normalizeBoolean(send_email);

    if (shouldSendEmail && !adminCatechist) {
      return res.status(403).json({
        success: false,
        message:
          "Chỉ Quản trị viên Giáo lý mới có quyền gửi thông báo qua Email.",
      });
    }

    // ========================================================
    // USER IDS
    // ========================================================

    const normalizedUserIds = normalizeArray(user_ids);

    // ========================================================
    // TARGET ROLE
    // ========================================================

    const normalizedTargetRole =
      target_role === null || target_role === undefined || target_role === ""
        ? "all"
        : String(target_role).trim();

    const allowedRoles = ["all", "admin_catechist", "catechist", "teacher"];

    if (!allowedRoles.includes(normalizedTargetRole)) {
      return res.status(400).json({
        success: false,
        message: "target_role không hợp lệ.",
      });
    }

    // ========================================================
    // TẠO THÔNG BÁO
    // ========================================================

    const data = await notificationService.createNotification({
      church_id: churchId,

      type: String(type || "announcement").trim(),

      title: String(title).trim(),

      content:
        content === null || content === undefined ? null : String(content),

      priority: String(priority || "normal").trim(),

      related_type:
        related_type === null || related_type === undefined
          ? null
          : String(related_type).trim(),

      related_id:
        related_id === null || related_id === undefined || related_id === ""
          ? null
          : Number(related_id),

      action_url:
        action_url === null || action_url === undefined
          ? null
          : String(action_url).trim(),

      created_by: createdBy,

      user_ids: normalizedUserIds,

      target_role: normalizedTargetRole,

      send_email: adminCatechist ? shouldSendEmail : false,
    });

    // ========================================================
    // MESSAGE
    // ========================================================

    let message;

    if (churchId === null) {
      message = shouldSendEmail
        ? "Gửi thông báo và Email toàn hệ thống thành công"
        : "Gửi thông báo toàn hệ thống thành công";
    } else {
      message = shouldSendEmail
        ? "Gửi thông báo và Email thành công"
        : "Gửi thông báo thành công";
    }

    return res.status(201).json({
      success: true,
      message,
      data,
    });
  } catch (error) {
    console.error("CREATE NOTIFICATION ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Không thể gửi thông báo",
    });
  }
};

// ============================================================
// MARK AS READ
// PUT /api/notifications/:id/read
// ============================================================

exports.markAsRead = async (req, res) => {
  try {
    const notificationId = Number(req.params.id);

    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!isValidId(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "ID thông báo không hợp lệ",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const updated = await notificationService.markAsRead({
      notification_id: notificationId,
      user_id: userId,
      church_id: churchId,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo",
      });
    }

    return res.json({
      success: true,
      message: "Đã đánh dấu thông báo là đã đọc",
    });
  } catch (error) {
    console.error("MARK NOTIFICATION READ ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể cập nhật thông báo",
    });
  }
};

// ============================================================
// MARK ALL READ
// PUT /api/notifications/read-all
// ============================================================

exports.markAllAsRead = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const affectedRows = await notificationService.markAllAsRead({
      user_id: userId,
      church_id: churchId,
    });

    return res.json({
      success: true,
      message: "Đã đánh dấu tất cả thông báo là đã đọc",
      affectedRows,
    });
  } catch (error) {
    console.error("MARK ALL NOTIFICATIONS READ ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể cập nhật thông báo",
    });
  }
};

// ============================================================
// DELETE ONE
// DELETE /api/notifications/:id
// ============================================================

exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = Number(req.params.id);

    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!isValidId(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "ID thông báo không hợp lệ",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const deleted = await notificationService.deleteMyNotification({
      notification_id: notificationId,
      user_id: userId,
      church_id: churchId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo",
      });
    }

    return res.json({
      success: true,
      message: "Đã xóa thông báo",
    });
  } catch (error) {
    console.error("DELETE NOTIFICATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể xóa thông báo",
    });
  }
};

// ============================================================
// DELETE ALL
// DELETE /api/notifications/my/all
// ============================================================

exports.deleteAllNotifications = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const affectedRows = await notificationService.deleteAllMyNotifications({
      user_id: userId,
      church_id: churchId,
    });

    return res.json({
      success: true,
      message: "Đã xóa tất cả thông báo",
      affectedRows,
    });
  } catch (error) {
    console.error("DELETE ALL NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể xóa tất cả thông báo",
    });
  }
};

// ============================================================
// STATS
// GET /api/notifications/stats
// ============================================================

exports.getNotificationStats = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const data = await notificationService.getMyNotificationStats({
      user_id: userId,
      church_id: churchId,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET NOTIFICATION STATS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể lấy thống kê thông báo",
    });
  }
};

// ============================================================
// UNREAD COUNT
// GET /api/notifications/unread-count
// ============================================================

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng",
      });
    }

    const unread = await notificationService.getUnreadCount({
      user_id: userId,
      church_id: churchId,
    });

    return res.json({
      success: true,
      data: {
        unread: Number(unread || 0),
      },
    });
  } catch (error) {
    console.error("GET UNREAD COUNT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể lấy số thông báo chưa đọc",
    });
  }
};

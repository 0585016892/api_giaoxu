const notificationService = require("../services/notificationService");

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const getChurchId = (req) => {
  return Number(req.user?.church_id || req.user?.parish_id || 0);
};

const getUserId = (req) => {
  return Number(req.user?.id || 0);
};

const isValidId = (id) => {
  return Number.isInteger(Number(id)) && Number(id) > 0;
};

/**
 * ============================================================
 * GET /api/notifications
 * ============================================================
 */

exports.getNotifications = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng hoặc giáo xứ",
      });
    }

    const { page = 1, limit = 20, unread_only = false } = req.query;

    const result = await notificationService.getMyNotifications({
      user_id: userId,
      church_id: churchId,
      page,
      limit,
      unread_only,
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

/**
 * ============================================================
 * GET /api/notifications/today
 * ============================================================
 */

exports.getNotificationsToday = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    if (!userId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng hoặc giáo xứ",
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

/**
 * ============================================================
 * GET /api/notifications/:id
 * ============================================================
 */

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

/**
 * ============================================================
 * POST /api/notifications
 * ============================================================
 */

exports.createNotification = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const createdBy = getUserId(req);

    if (!churchId || !createdBy) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được người dùng hoặc giáo xứ",
      });
    }

    const {
      type = "system",
      title,
      content = null,
      priority = "normal",
      related_type = null,
      related_id = null,
      action_url = null,

      user_ids = [],
      target_role = null,
    } = req.body;

    if (!Array.isArray(user_ids) && !target_role) {
      return res.status(400).json({
        success: false,
        message: "Phải cung cấp user_ids hoặc target_role",
      });
    }

    const data = await notificationService.createNotification({
      church_id: churchId,

      type,
      title,
      content,
      priority,

      related_type,
      related_id,
      action_url,

      created_by: createdBy,

      user_ids,
      target_role,
    });

    return res.status(201).json({
      success: true,
      message: "Tạo thông báo thành công",
      data,
    });
  } catch (error) {
    console.error("CREATE NOTIFICATION ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Không thể tạo thông báo",
    });
  }
};

/**
 * ============================================================
 * PUT /api/notifications/:id/read
 * ============================================================
 */

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

/**
 * ============================================================
 * PUT /api/notifications/read-all
 * ============================================================
 */

exports.markAllAsRead = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

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

/**
 * ============================================================
 * DELETE /api/notifications/:id
 * ============================================================
 */

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

/**
 * ============================================================
 * DELETE /api/notifications/my/all
 * ============================================================
 */

exports.deleteAllNotifications = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

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
      message: error.message || "Không thể xóa thông báo",
    });
  }
};

/**
 * ============================================================
 * GET /api/notifications/stats
 * ============================================================
 */

exports.getNotificationStats = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

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

/**
 * ============================================================
 * GET /api/notifications/unread-count
 * ============================================================
 */

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = getUserId(req);
    const churchId = getChurchId(req);

    const unread = await notificationService.getUnreadCount({
      user_id: userId,
      church_id: churchId,
    });

    return res.json({
      success: true,
      data: {
        unread,
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

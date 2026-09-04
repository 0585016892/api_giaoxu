const express = require("express");

const router = express.Router();

const notificationController = require("../controllers/notificationController");

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

const { verifyToken } = require("../middleware/authMiddleware");

// ============================================================
// NOTIFICATION ROUTES
// ============================================================

// Danh sách thông báo
router.get("/", verifyToken, notificationController.getNotifications);

// Thông báo hôm nay
router.get("/today", verifyToken, notificationController.getNotificationsToday);

// Thống kê
router.get("/stats", verifyToken, notificationController.getNotificationStats);

// Số thông báo chưa đọc
router.get("/unread-count", verifyToken, notificationController.getUnreadCount);

// Đánh dấu tất cả đã đọc
router.put("/read-all", verifyToken, notificationController.markAllAsRead);

// Xóa tất cả thông báo của user hiện tại
router.delete(
  "/my/all",
  verifyToken,
  notificationController.deleteAllNotifications,
);

// Tạo notification
router.post("/", verifyToken, notificationController.createNotification);

// ============================================================
// ROUTES CÓ :id
// Phải đặt SAU các route đặc biệt ở trên.
// ============================================================

// Chi tiết notification
router.get("/:id", verifyToken, notificationController.getNotificationById);

// Đánh dấu một notification đã đọc
router.put("/:id/read", verifyToken, notificationController.markAsRead);

// Xóa một notification của user hiện tại
router.delete("/:id", verifyToken, notificationController.deleteNotification);

module.exports = router;

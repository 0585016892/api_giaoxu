const express = require("express");

const router = express.Router();

const notificationController = require("../controllers/notificationController");

const { verifyToken } = require("../middleware/authMiddleware");

// ============================================================
// ALL ROUTES REQUIRE LOGIN
// ============================================================

router.use(verifyToken);

// ============================================================
// CREATE
// ============================================================

router.post("/", notificationController.createNotification);

// ============================================================
// LIST
// ============================================================

router.get("/", notificationController.getNotifications);

// ============================================================
// TODAY
// ============================================================

router.get("/today", notificationController.getNotificationsToday);

// ============================================================
// STATS
// ============================================================

router.get("/stats", notificationController.getNotificationStats);

// ============================================================
// UNREAD COUNT
// ============================================================

router.get("/unread-count", notificationController.getUnreadCount);

// ============================================================
// MARK ALL READ
// ============================================================

router.put("/read-all", notificationController.markAllAsRead);

// ============================================================
// DELETE ALL
// ============================================================

router.delete("/my/all", notificationController.deleteAllNotifications);

// ============================================================
// DETAIL
// ============================================================

router.get("/:id", notificationController.getNotificationById);

// ============================================================
// MARK ONE READ
// ============================================================

router.put("/:id/read", notificationController.markAsRead);

// ============================================================
// DELETE ONE
// ============================================================

router.delete("/:id", notificationController.deleteNotification);

module.exports = router;

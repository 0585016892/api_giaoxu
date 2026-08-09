const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const notificationController = require("../controllers/notificationController");
router.get("/today", notificationController.getNotificationsToDay);
router.put("/read-all", verifyToken, notificationController.markAllAsRead);

router.post("/", notificationController.createNotification);

router.get("/", notificationController.getNotifications);

router.get("/stats", notificationController.getNotificationStats);

router.get("/:id", notificationController.getNotificationById);

router.put("/:id/read", notificationController.markAsRead);

router.delete("/:id", notificationController.deleteNotification);
module.exports = router;

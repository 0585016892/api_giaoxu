const express = require("express");
const router = express.Router();

const controller = require("../controllers/catechismJourneyController");

// Đổi đường dẫn này nếu dự án đang đặt middleware xác thực ở vị trí khác.
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/classes", verifyToken, controller.getClasses);
router.get("/classes/:classId", verifyToken, controller.getClassJourney);

module.exports = router;

const express = require("express");
const router = express.Router();

const activityLogController = require("../controllers/activityLogController");

const { verifyToken } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/authorize");

// GET ALL LOGS
router.get("/", verifyToken, authorize("admin"), activityLogController.getLogs);

// GET DETAIL
router.get(
  "/:id",
  verifyToken,
  authorize("admin"),
  activityLogController.getLogById,
);

module.exports = router;

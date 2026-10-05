const express = require("express");
const router = express.Router();

const activityLogController = require("../controllers/activityLogController");

const { verifyToken } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/authorize");
const requireSystemAdmin = require("../middleware/requireSystemAdmin");

// GET ALL LOGS
router.get("/", verifyToken, requireSystemAdmin, activityLogController.getLogs);

// GET DETAIL
router.get(
  "/:id",
  verifyToken,
  requireSystemAdmin,
  activityLogController.getLogById,
);
router.delete(
  "/",
  verifyToken,
  requireSystemAdmin,
  activityLogController.deleteLogs,
);
module.exports = router;

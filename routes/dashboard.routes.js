const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");
const { verifyToken } = require("../middleware/authMiddleware");
const requireSystemAdmin = require("../middleware/requireSystemAdmin");
const { globalApiLimiter } = require("./middleware/rateLimitMiddleware");

router.get(
  "/",
  requireSystemAdmin,
  globalApiLimiter,
  dashboardController.getDashboard,
);
router.get(
  "/dashboard-cate",
  verifyToken,
  globalApiLimiter,
  dashboardController.getDashboardCate,
);
router.get(
  "/dashboard-parent",
  verifyToken,
  globalApiLimiter,
  dashboardController.getDashboardParent,
);

module.exports = router;

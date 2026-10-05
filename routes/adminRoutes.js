const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const upload = require("../middleware/uploadAvatar");
const { verifyToken } = require("../middleware/authMiddleware");
const requireSystemAdmin = require("../middleware/requireSystemAdmin");
const {
  destructiveLimiter,
  globalApiLimiter,
} = require("../middleware/rateLimitMiddleware");

// CREATE (có upload avatar)
router.post(
  "/",
  upload.single("avatar"),
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.createAdmin,
);

// UPDATE (có upload avatar)
router.put(
  "/:id",
  upload.single("avatar"),
  verifyToken,
  adminController.updateAdmin,
);

router.get(
  "/",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.getAllAdmins,
);
router.get(
  "/:id",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.getAdminById,
);
router.patch(
  "/:id/toggle",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.toggleActive,
);
router.patch(
  "/:id/toggle-catechits",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.toggleActiveCatechits,
);

router.put(
  "/password/:id",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.changePassword,
);

router.put(
  "/:id/reset-passwordcate",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.resetCatechitsPassword,
);
router.put(
  "/:id/reset-password",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  adminController.resetAdminPassword,
);
router.delete(
  "/:id",
  verifyToken,
  requireSystemAdmin,
  destructiveLimiter,
  globalApiLimiter,
  adminController.deleteAdmin,
);

// khóa / mở tài khoản

module.exports = router;

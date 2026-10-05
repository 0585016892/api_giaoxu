const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");

const uploadLicensePayment = require("../middleware/uploadLicensePayment");

const controller = require("../controllers/licenseRegistrationController");
const requireSystemAdmin = require("../middleware/requireSystemAdmin");
const { globalApiLimiter } = require("./middleware/rateLimitMiddleware");

/**
 * ============================================================
 * AUTH
 * ============================================================
 */

router.use(verifyToken);

/**
 * ============================================================
 * CATECHIST / CHURCH
 * ============================================================
 */

/**
 * Thông tin gói + QR + STK + nội dung CK
 */
router.get(
  "/registration/config",
  requireSystemAdmin,
  globalApiLimiter,
  controller.getRegistrationConfig,
);

/**
 * Lịch sử đăng ký của giáo xứ hiện tại
 */
router.get(
  "/registration/me",
  requireSystemAdmin,
  globalApiLimiter,
  controller.getMyRegistrations,
);

/**
 * Chi tiết đăng ký của giáo xứ hiện tại
 */
router.get(
  "/registration/:id",
  requireSystemAdmin,
  globalApiLimiter,
  controller.getRegistrationById,
);

/**
 * Tạo đăng ký
 *
 * Content-Type:
 * multipart/form-data
 *
 * field:
 * payment_image
 */
router.post(
  "/registration",
  requireSystemAdmin,
  globalApiLimiter,
  uploadLicensePayment.single("payment_image"),
  controller.createRegistration,
);

/**
 * Xóa yêu cầu pending
 */
router.delete(
  "/registration/:id",
  requireSystemAdmin,
  globalApiLimiter,
  controller.deleteMyRegistration,
);

/**
 * ============================================================
 * SYSTEM ADMIN
 * ============================================================
 *
 * Nếu project của m đã có requireSystemAdmin thì dùng middleware
 * đó ở đây.
 */

/*
const {
  requireSystemAdmin,
} = require("../middleware/authMiddleware");

router.use(requireSystemAdmin);
*/

router.get(
  "/registrations",
  requireSystemAdmin,
  globalApiLimiter,
  controller.getAllRegistrations,
);

router.get(
  "/registrations/:id",
  requireSystemAdmin,
  globalApiLimiter,
  controller.getAdminRegistrationById,
);

router.put(
  "/registrations/:id/approve",
  requireSystemAdmin,
  globalApiLimiter,
  controller.approveRegistration,
);

router.put(
  "/registrations/:id/reject",
  requireSystemAdmin,
  globalApiLimiter,
  controller.rejectRegistration,
);

module.exports = router;

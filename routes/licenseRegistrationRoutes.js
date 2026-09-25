const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");

const uploadLicensePayment = require("../middleware/uploadLicensePayment");

const controller = require("../controllers/licenseRegistrationController");

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
router.get("/registration/config", controller.getRegistrationConfig);

/**
 * Lịch sử đăng ký của giáo xứ hiện tại
 */
router.get("/registration/me", controller.getMyRegistrations);

/**
 * Chi tiết đăng ký của giáo xứ hiện tại
 */
router.get("/registration/:id", controller.getRegistrationById);

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
  uploadLicensePayment.single("payment_image"),
  controller.createRegistration,
);

/**
 * Xóa yêu cầu pending
 */
router.delete("/registration/:id", controller.deleteMyRegistration);

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

router.get("/registrations", controller.getAllRegistrations);

router.get("/registrations/:id", controller.getAdminRegistrationById);

router.put("/registrations/:id/approve", controller.approveRegistration);

router.put("/registrations/:id/reject", controller.rejectRegistration);

module.exports = router;

const express = require("express");

const router = express.Router();

const catechistController = require("../controllers/catechistController");

const { verifyToken } = require("../middleware/authMiddleware");
const {
  destructiveLimiter,
  globalApiLimiter,
} = require("../middleware/rateLimitMiddleware");

// =========================================================
// MIDDLEWARE
// Tất cả API Giáo lý viên đều yêu cầu đăng nhập
// =========================================================

router.use(verifyToken);

// =========================================================
// QUẢN LÝ GIÁO LÝ VIÊN
// =========================================================

// Danh sách Giáo lý viên của giáo xứ hiện tại
router.get("/", globalApiLimiter, catechistController.getAllCatechists);

// Chi tiết Giáo lý viên
router.get("/:id", globalApiLimiter, catechistController.getCatechistById);

// Tạo Giáo lý viên thuộc giáo xứ hiện tại
router.post("/", globalApiLimiter, catechistController.createCatechist);
router.post("/assign-class", globalApiLimiter, catechistController.assignClass);

// Lấy các thư bổ nhiệm chưa đọc
router.get(
  "/appointments/pending",
  globalApiLimiter,
  catechistController.getPendingAppointments,
);

// Xác nhận đã đọc thư bổ nhiệm
router.patch(
  "/appointments/:id/read",
  globalApiLimiter,
  catechistController.readAppointment,
);

// Cập nhật Giáo lý viên
router.put("/:id", globalApiLimiter, catechistController.updateCatechist);
router.delete(
  "/remove-class",
  globalApiLimiter,
  catechistController.removeClass,
);

// Xóa Giáo lý viên
router.delete(
  "/:id",
  destructiveLimiter,
  globalApiLimiter,
  catechistController.deleteCatechist,
);

// =========================================================
// PHÂN CÔNG GIÁO LÝ VIÊN VÀO LỚP
// =========================================================

module.exports = router;

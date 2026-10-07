const express = require("express");

const router = express.Router();

const academicYearController = require("../controllers/academicYearController");

// ============================================================
// AUTH
// ============================================================
//
// Thay authMiddleware bằng middleware auth JWT hiện tại
// của project nếu tên file/function của bạn khác.
//
// ============================================================

const { verifyToken } = require("../middleware/authMiddleware");

// ============================================================
// ACADEMIC YEAR
// ============================================================

// 1. Preview khởi tạo năm học
router.post(
  "/preview-create",
  verifyToken,
  academicYearController.previewCreateAcademicYear,
);

// 2. Khởi tạo năm học
router.post("", verifyToken, academicYearController.createAcademicYear);

// 3. Preview phân lớp
router.post(
  "/preview-promotion",
  verifyToken,
  academicYearController.previewPromotion,
);

// 4. Chốt phân lớp
router.post(
  "/confirm-promotion",
  verifyToken,
  academicYearController.confirmPromotion,
);

module.exports = router;

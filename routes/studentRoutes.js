const express = require("express");

const router = express.Router();

const studentController = require("../controllers/studentController");

const { verifyToken } = require("../middleware/authMiddleware");
const { destructiveLimiter } = require("../middlewares/rateLimitMiddleware");
const { globalApiLimiter } = require("./middlewares/rateLimitMiddleware");

const uploadStudentAvatar = require("../middleware/uploadStudentAvatar");

const multer = require("multer");

// =====================================================
// MULTER - IMPORT EXCEL
// =====================================================

const uploadStudentExcel = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },

  fileFilter: (req, file, cb) => {
    const fileName = String(file.originalname || "").toLowerCase();

    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

    if (!isExcel) {
      return cb(new Error("Chỉ hỗ trợ file Excel (.xlsx hoặc .xls)"));
    }

    cb(null, true);
  },
});

// =====================================================
// TẤT CẢ API HỌC SINH ĐỀU PHẢI ĐĂNG NHẬP
// =====================================================

// Lấy danh sách học sinh
router.get("/", verifyToken, globalApiLimiter, studentController.getStudents);

// Lấy học sinh theo giáo lý viên
router.get(
  "/student-class",
  verifyToken,
  globalApiLimiter,
  studentController.getStudentsByTeacher,
);
router.get(
  "/classes/:id/students",
  verifyToken,
  globalApiLimiter,
  studentController.getStudentsByClass,
);
// Chi tiết học sinh
router.get(
  "/:id",
  verifyToken,
  globalApiLimiter,
  studentController.getStudentById,
);
router.post(
  "/export-excel",
  verifyToken,
  globalApiLimiter,
  studentController.exportStudentsExcel,
);
// Thêm học sinh
router.post(
  "/",
  verifyToken,
  globalApiLimiter,
  uploadStudentAvatar.single("avatar"),
  studentController.createStudent,
);
// =====================================================
// IMPORT HỌC SINH TỪ EXCEL
// =====================================================

router.post(
  "/import-excel",
  verifyToken,
  uploadStudentExcel.single("file"),
  globalApiLimiter,
  studentController.importStudentsExcel,
);
router.put(
  "/:id/bulk-update",
  verifyToken,
  globalApiLimiter,
  studentController.bulkUpdateStudents,
);
// Cập nhật học sinh
router.put(
  "/:id",
  verifyToken,
  uploadStudentAvatar.single("avatar"),
  globalApiLimiter,
  studentController.updateStudent,
);

// Xóa học sinh
router.delete(
  "/bulk",
  verifyToken,
  destructiveLimiter,
  globalApiLimiter,
  studentController.deleteStudentsBulk,
);

router.delete(
  "/:id",
  verifyToken,
  destructiveLimiter,
  globalApiLimiter,
  studentController.deleteStudent,
);

module.exports = router;

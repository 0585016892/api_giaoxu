const express = require("express");

const router = express.Router();

const studentController = require("../controllers/studentController");

const { verifyToken } = require("../middleware/authMiddleware");

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
router.get("/", verifyToken, studentController.getStudents);

// Lấy học sinh theo giáo lý viên
router.get(
  "/student-class",
  verifyToken,
  studentController.getStudentsByTeacher,
);
router.get(
  "/classes/:id/students",
  authMiddleware,
  studentController.getStudentsByClass,
);
// Chi tiết học sinh
router.get("/:id", verifyToken, studentController.getStudentById);

// Thêm học sinh
router.post(
  "/",
  uploadStudentAvatar.single("avatar"),
  verifyToken,
  studentController.createStudent,
);

// =====================================================
// IMPORT HỌC SINH TỪ EXCEL
// =====================================================

router.post(
  "/import-excel",
  verifyToken,
  uploadStudentExcel.single("file"),
  studentController.importStudentsExcel,
);

// Cập nhật học sinh
router.put(
  "/:id",
  verifyToken,
  uploadStudentAvatar.single("avatar"),
  studentController.updateStudent,
);

// Xóa học sinh
router.delete("/:id", verifyToken, studentController.deleteStudent);

module.exports = router;

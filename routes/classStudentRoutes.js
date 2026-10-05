const express = require("express");

const router = express.Router();

const controller = require("../controllers/classStudentController");
const { verifyToken } = require("../middleware/authMiddleware");
const { destructiveLimiter } = require("../middleware/rateLimitMiddleware");
const { globalApiLimiter } = require("./middleware/rateLimitMiddleware");

// =====================================================
// AUTHENTICATION
// church_id được lấy từ:
// req.user.church_id
// =====================================================

router.use(verifyToken);

// =====================================================
// HỌC SINH TRONG LỚP
// GET /api/class-students/class/:classId
//
// Chỉ lấy học sinh của lớp thuộc giáo xứ hiện tại
// =====================================================

router.get("/class/:classId", globalApiLimiter, controller.getStudentsByClass);

// =====================================================
// CÁC LỚP CỦA HỌC SINH
// GET /api/class-students/student/:studentId
//
// Chỉ lấy các lớp thuộc giáo xứ hiện tại
// =====================================================

router.get(
  "/student/:studentId",
  globalApiLimiter,
  controller.getClassesByStudent,
);

// =====================================================
// THÊM HỌC SINH VÀO LỚP
// POST /api/class-students
//
// Body:
// {
//   "class_id": 1,
//   "student_id": 10,
//   "status": "studying"
// }
//
// Backend tự kiểm tra:
// - class thuộc church
// - student thuộc church
// =====================================================

router.post("/", globalApiLimiter, controller.addStudentToClass);

// =====================================================
// CẬP NHẬT QUAN HỆ LỚP - HỌC SINH
// PUT /api/class-students/update/:classId/:studentId
//
// Backend phải kiểm tra class + student thuộc church
// =====================================================

router.put(
  "/update/:classId/:studentId",
  globalApiLimiter,
  controller.updateClassStudent,
);

// =====================================================
// CHUYỂN LỚP
// PUT /api/class-students/:classId/:studentId/change-class
//
// Body:
// {
//   "new_class_id": 5
// }
//
// Backend phải kiểm tra:
// - lớp cũ thuộc church
// - học sinh thuộc church
// - lớp mới thuộc church
// =====================================================

router.put(
  "/:classId/:studentId/change-class",
  globalApiLimiter,
  controller.changeClassStudent,
);
router.put(
  "/classes/:classId/change-students",
  globalApiLimiter,
  controller.changeClassStudents,
);
// =====================================================
// XÓA HỌC SINH KHỎI LỚP
// DELETE /api/class-students/:classId/:studentId
//
// Chỉ được xóa quan hệ thuộc giáo xứ hiện tại
// =====================================================

router.delete(
  "/:classId/:studentId",
  destructiveLimiter,
  globalApiLimiter,
  controller.removeStudentFromClass,
);

module.exports = router;

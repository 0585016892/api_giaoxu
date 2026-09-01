const express = require("express");

const router = express.Router();

const attendanceController = require("../controllers/attendanceController");

// Đổi đường dẫn này theo authMiddleware hiện tại của m
const { verifyToken } = require("../middleware/authMiddleware");

/**
 * =========================================================
 * ATTENDANCE
 * =========================================================
 */

/**
 * Lấy điểm danh của một lớp theo ngày
 *
 * GET
 * /api/attendance?class_id=17&date=2026-09-01
 */
router.get("/", verifyToken, attendanceController.getAttendance);

/**
 * Lưu điểm danh cả lớp
 *
 * POST
 * /api/attendance/bulk
 */
router.post("/bulk", verifyToken, attendanceController.saveBulkAttendance);

/**
 * Lịch sử điểm danh của học sinh
 *
 * GET
 * /api/attendance/student/:studentId
 */
router.get(
  "/student/:studentId",
  verifyToken,
  attendanceController.getStudentAttendance,
);

/**
 * Thống kê điểm danh của lớp
 *
 * GET
 * /api/attendance/statistics/class/:classId
 */
router.get(
  "/statistics/class/:classId",
  verifyToken,
  attendanceController.getClassStatistics,
);

/**
 * Cập nhật một bản ghi điểm danh
 *
 * PUT
 * /api/attendance/:id
 */
router.put("/:id", verifyToken, attendanceController.updateAttendance);

/**
 * Xóa một bản ghi điểm danh
 *
 * DELETE
 * /api/attendance/:id
 */
router.delete("/:id", verifyToken, attendanceController.deleteAttendance);

module.exports = router;

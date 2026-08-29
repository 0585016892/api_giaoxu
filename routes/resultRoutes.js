const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const resultController = require("../controllers/resultController");

// =========================================================
// AUTHENTICATION
// =========================================================

// Tất cả API kết quả đều yêu cầu đăng nhập
router.use(verifyToken);

// =========================================================
// STATISTICS
// =========================================================

// Thống kê tổng quan
router.get("/statistics", resultController.getResultStatistics);

// Bảng xếp hạng toàn giáo xứ
router.get("/leaderboard", resultController.getLeaderboard);

// =========================================================
// CLASS
// =========================================================

// Bảng điểm của lớp
router.get("/class/:classId", resultController.getResultsByClass);

// Top 3 của lớp
router.get("/class/:classId/leaderboard", resultController.getClassLeaderboard);

// Thống kê lớp
router.get("/class/:classId/statistics", resultController.getClassStatistics);

// =========================================================
// STUDENT
// =========================================================

// Thống kê học sinh
router.get(
  "/student/:studentId/statistics",
  resultController.getStudentStatistics,
);

// Toàn bộ điểm của học sinh
router.get("/student/:studentId", resultController.getResultsByStudent);

// =========================================================
// CRUD
// =========================================================

// Danh sách kết quả
router.get("/", resultController.getResults);

// Chi tiết kết quả
router.get("/:id", resultController.getResultById);

// Thêm kết quả
router.post("/", resultController.createResult);

// Cập nhật kết quả
router.put("/:id", resultController.updateResult);

// Xóa kết quả
router.delete("/:id", resultController.deleteResult);

module.exports = router;

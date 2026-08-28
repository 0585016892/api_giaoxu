const express = require("express");

const router = express.Router();

const resultController = require("../controllers/resultController");

// =========================================================
// STATISTICS
// =========================================================

router.get("/statistics", resultController.getResultStatistics);

// =========================================================
// LEADERBOARD
// =========================================================

router.get("/leaderboard", resultController.getLeaderboard);

// =========================================================
// CLASS
// =========================================================

// Bảng điểm của lớp
router.get("/class/:classId", resultController.getResultsByClass);

// TOP 3 của lớp
router.get("/class/:classId/leaderboard", resultController.getClassLeaderboard);

// Thống kê lớp
router.get("/class/:classId/statistics", resultController.getClassStatistics);

// =========================================================
// STUDENT
// =========================================================

// Thống kê học viên
router.get(
  "/student/:studentId/statistics",
  resultController.getStudentStatistics,
);

// Toàn bộ điểm của học viên
router.get("/student/:studentId", resultController.getResultsByStudent);

// =========================================================
// CRUD
// =========================================================

router.get("/", resultController.getResults);

router.get("/:id", resultController.getResultById);

router.post("/", resultController.createResult);

router.put("/:id", resultController.updateResult);

router.delete("/:id", resultController.deleteResult);

module.exports = router;

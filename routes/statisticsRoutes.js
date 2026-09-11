const express = require("express");

const router = express.Router();

const {
  getOverview,
  getStudentStatistics,
  getClassStatistics,
  getAttendanceStatistics,
  getCatechistStatistics,
  getStudentAttendanceStatistics,
} = require("../controllers/statisticsController");

const { verifyToken } = require("../middleware/authMiddleware");

/**
 * =========================================================
 * AUTH
 * =========================================================
 */

router.use(verifyToken);

/**
 * =========================================================
 * THỐNG KÊ TỔNG QUAN
 * GET /api/statistics/overview
 * =========================================================
 */

router.get("/overview", getOverview);

/**
 * =========================================================
 * THỐNG KÊ HỌC SINH
 * GET /api/statistics/students
 * =========================================================
 */

router.get("/students", getStudentStatistics);

/**
 * =========================================================
 * THỐNG KÊ LỚP
 * GET /api/statistics/classes
 * =========================================================
 */

router.get("/classes", getClassStatistics);

/**
 * =========================================================
 * THỐNG KÊ CHUYÊN CẦN
 * GET /api/statistics/attendance
 * =========================================================
 */

router.get("/attendance", getAttendanceStatistics);
// Chi tiết chuyên cần từng học sinh
router.get("/attendance/students", getStudentAttendanceStatistics);
/**
 * =========================================================
 * THỐNG KÊ GIÁO LÝ VIÊN
 * GET /api/statistics/catechists
 * =========================================================
 */

router.get("/catechists", getCatechistStatistics);

module.exports = router;

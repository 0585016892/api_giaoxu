const express = require("express");

const router = express.Router();

const parentController = require("../controllers/parentController");

const { verifyToken } = require("../middleware/verifyToken");

/**
 * =========================================================
 * PARENT API
 * =========================================================
 *
 * Tất cả API đều yêu cầu JWT.
 *
 * Parent ID lấy từ:
 *
 * req.user.id
 *
 * Church ID lấy từ:
 *
 * req.user.church_id
 *
 * =========================================================
 */

/**
 * =========================================================
 * THÔNG TIN PHỤ HUYNH
 *
 * GET /api/parent/me
 * =========================================================
 */

router.get("/me", verifyToken, parentController.getMe);

/**
 * =========================================================
 * DANH SÁCH CON
 *
 * GET /api/parent/children
 *
 * Trả:
 * - tổng số con
 * - thông tin từng con
 * - lớp hiện tại
 * - tổng hợp điểm danh
 * - điểm gần nhất
 * =========================================================
 */

router.get("/children", verifyToken, parentController.getChildren);

/**
 * =========================================================
 * CHI TIẾT CON
 *
 * GET /api/parent/children/:studentId
 * =========================================================
 */

router.get("/children/:studentId", verifyToken, parentController.getChild);

/**
 * =========================================================
 * ĐIỂM DANH
 *
 * GET /api/parent/children/:studentId/attendance
 *
 * Query:
 *
 * ?type=catechism
 * ?type=mass
 *
 * ?from=2026-09-01
 * ?to=2026-09-30
 *
 * ?page=1
 * ?pageSize=20
 *
 * =========================================================
 */

router.get(
  "/children/:studentId/attendance",
  verifyToken,
  parentController.getChildAttendance,
);

/**
 * =========================================================
 * KẾT QUẢ
 *
 * GET /api/parent/children/:studentId/results
 *
 * Query:
 *
 * ?exam_type=paper
 *
 * ?from=2026-01-01
 * ?to=2026-12-31
 *
 * =========================================================
 */

router.get(
  "/children/:studentId/results",
  verifyToken,
  parentController.getChildResults,
);

/**
 * =========================================================
 * LỊCH HỌC
 *
 * GET /api/parent/children/:studentId/schedule
 * =========================================================
 */

router.get(
  "/children/:studentId/schedule",
  verifyToken,
  parentController.getChildSchedule,
);

/**
 * =========================================================
 * CHỨNG CHỈ
 *
 * GET /api/parent/children/:studentId/certificates
 * =========================================================
 */

router.get(
  "/children/:studentId/certificates",
  verifyToken,
  parentController.getChildCertificates,
);

module.exports = router;

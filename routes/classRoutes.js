const express = require("express");

const router = express.Router();

console.log("🔥 CLASS ROUTES LOADED");

const {
  // =========================
  // CLASS
  // =========================
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getClassesByTeacherId,

  // =========================
  // SCHEDULE
  // =========================
  getClassSchedules,
  createClassSchedule,
  updateClassSchedule,
  deleteClassSchedule,
} = require("../controllers/classController");

const { verifyToken } = require("../middleware/authMiddleware");
const { destructiveLimiter } = require("../middlewares/rateLimitMiddleware");
const { globalApiLimiter } = require("./middlewares/rateLimitMiddleware");

// =========================================================
// QUẢN LÝ LỚP HỌC
// =========================================================

// =========================================================
// DANH SÁCH LỚP
// GET /api/classes
// =========================================================

router.get("/", verifyToken, globalApiLimiter, getClasses);

// =========================================================
// LỚP CỦA GIÁO LÝ VIÊN ĐANG ĐĂNG NHẬP
// GET /api/classes/teacher-class
// =========================================================

router.get(
  "/teacher-class",
  verifyToken,
  globalApiLimiter,
  (req, res, next) => {
    console.log("🔥 HIT GET /api/classes/teacher-class");
    console.log("USER:", req.user);

    next();
  },
  getClassesByTeacherId,
);

// =========================================================
// LỊCH HỌC CỦA TOÀN BỘ GIÁO XỨ
//
// GET /api/classes/schedules
//
// Dùng cho trang:
// Thứ 2 | Thứ 3 | ... | Chủ nhật
// =========================================================

router.get("/schedules", verifyToken, globalApiLimiter, getClassSchedules);

// =========================================================
// THÊM LỊCH HỌC CHO LỚP
//
// POST /api/classes/:id/schedules
//
// Body:
// {
//   "day_of_week": 2,
//   "start_time": "19:00",
//   "end_time": "20:30",
//   "room": "Phòng 1"
// }
// =========================================================

router.post(
  "/:id/schedules",
  verifyToken,
  globalApiLimiter,
  createClassSchedule,
);

// =========================================================
// SỬA LỊCH HỌC
//
// PUT /api/classes/:id/schedules/:scheduleId
// =========================================================

router.put(
  "/:id/schedules/:scheduleId",
  verifyToken,
  globalApiLimiter,
  updateClassSchedule,
);

// =========================================================
// XÓA LỊCH HỌC
//
// DELETE /api/classes/:id/schedules/:scheduleId
// =========================================================

router.delete(
  "/:id/schedules/:scheduleId",
  destructiveLimiter,
  verifyToken,
  globalApiLimiter,
  deleteClassSchedule,
);

// =========================================================
// CHI TIẾT LỚP
//
// GET /api/classes/:id
//
// PHẢI ĐẶT SAU /schedules
// =========================================================

router.get("/:id", verifyToken, globalApiLimiter, getClassById);

// =========================================================
// TẠO LỚP
//
// POST /api/classes
// =========================================================

router.post("/", verifyToken, globalApiLimiter, createClass);

// =========================================================
// SỬA LỚP
//
// PUT /api/classes/:id
// =========================================================

router.put("/:id", verifyToken, globalApiLimiter, updateClass);

// =========================================================
// XÓA LỚP
//
// DELETE /api/classes/:id
// =========================================================

router.delete("/:id", verifyToken, globalApiLimiter, deleteClass);

module.exports = router;

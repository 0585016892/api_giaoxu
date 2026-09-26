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

// =========================================================
// QUẢN LÝ LỚP HỌC
// =========================================================

// =========================================================
// DANH SÁCH LỚP
// GET /api/classes
// =========================================================

router.get("/", verifyToken, getClasses);

// =========================================================
// LỚP CỦA GIÁO LÝ VIÊN ĐANG ĐĂNG NHẬP
// GET /api/classes/teacher-class
// =========================================================

router.get(
  "/teacher-class",
  verifyToken,
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

router.get("/schedules", verifyToken, getClassSchedules);

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

router.post("/:id/schedules", verifyToken, createClassSchedule);

// =========================================================
// SỬA LỊCH HỌC
//
// PUT /api/classes/:id/schedules/:scheduleId
// =========================================================

router.put("/:id/schedules/:scheduleId", verifyToken, updateClassSchedule);

// =========================================================
// XÓA LỊCH HỌC
//
// DELETE /api/classes/:id/schedules/:scheduleId
// =========================================================

router.delete("/:id/schedules/:scheduleId", verifyToken, deleteClassSchedule);

// =========================================================
// CHI TIẾT LỚP
//
// GET /api/classes/:id
//
// PHẢI ĐẶT SAU /schedules
// =========================================================

router.get("/:id", verifyToken, getClassById);

// =========================================================
// TẠO LỚP
//
// POST /api/classes
// =========================================================

router.post("/", verifyToken, createClass);

// =========================================================
// SỬA LỚP
//
// PUT /api/classes/:id
// =========================================================

router.put("/:id", verifyToken, updateClass);

// =========================================================
// XÓA LỚP
//
// DELETE /api/classes/:id
// =========================================================

router.delete("/:id", verifyToken, deleteClass);

module.exports = router;

const express = require("express");

const router = express.Router();

console.log("🔥 CLASS ROUTES LOADED");

const {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getClassesByTeacherId,
} = require("../controllers/classController");

const { verifyToken } = require("../middleware/authMiddleware");

// =========================
// QUẢN LÝ LỚP HỌC
// =========================

// Danh sách lớp
router.get("/", verifyToken, getClasses);

// Lớp của giáo lý viên đang đăng nhập
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

// Chi tiết lớp
router.get("/:id", verifyToken, getClassById);

// Tạo lớp
router.post("/", verifyToken, createClass);

// Sửa lớp
router.put("/:id", verifyToken, updateClass);

// Xóa lớp
router.delete("/:id", verifyToken, deleteClass);

module.exports = router;

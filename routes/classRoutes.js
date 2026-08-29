const express = require("express");

const router = express.Router();

const {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
} = require("../controllers/classController");

const { verifyToken } = require("../middleware/authMiddleware");

// =========================
// QUẢN LÝ LỚP HỌC
// =========================

// Danh sách lớp
router.get("/", verifyToken, getClasses);

// Chi tiết lớp
router.get("/:id", verifyToken, getClassById);

// Tạo lớp
router.post("/", verifyToken, createClass);

// Sửa lớp
router.put("/:id", verifyToken, updateClass);

// Xóa lớp
router.delete("/:id", verifyToken, deleteClass);

module.exports = router;

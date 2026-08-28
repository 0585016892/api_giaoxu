const express = require("express");

const router = express.Router();

const {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
} = require("../controllers/classController");

// Danh sách lớp
router.get("/", getClasses);

// Chi tiết lớp
router.get("/:id", getClassById);

// Tạo lớp
router.post("/", createClass);

// Sửa lớp
router.put("/:id", updateClass);

// Xóa lớp
router.delete("/:id", deleteClass);

module.exports = router;

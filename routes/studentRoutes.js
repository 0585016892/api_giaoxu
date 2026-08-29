const express = require("express");

const router = express.Router();

const studentController = require("../controllers/studentController");
const { verifyToken } = require("../middleware/authMiddleware");

// =====================================================
// TẤT CẢ API HỌC SINH ĐỀU PHẢI ĐĂNG NHẬP
// =====================================================

router.get("/", verifyToken, studentController.getStudents);

router.get("/:id", verifyToken, studentController.getStudentById);

router.post("/", verifyToken, studentController.createStudent);

router.put("/:id", verifyToken, studentController.updateStudent);

router.delete("/:id", verifyToken, studentController.deleteStudent);

module.exports = router;

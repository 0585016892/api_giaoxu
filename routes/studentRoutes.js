const express = require("express");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});
const router = express.Router();

const studentController = require("../controllers/studentController");
const { verifyToken } = require("../middleware/authMiddleware");

// =====================================================
// TẤT CẢ API HỌC SINH ĐỀU PHẢI ĐĂNG NHẬP
// =====================================================

router.get("/", verifyToken, studentController.getStudents);

router.get(
  "/student-class",
  verifyToken,
  studentController.getStudentsByTeacher,
);
router.get("/:id", verifyToken, studentController.getStudentById);

router.post("/", verifyToken, studentController.createStudent);
router.post(
  "/import-excel",
  verifyToken,
  upload.single("file"),
  studentController.importStudentsExcel,
);

router.put("/:id", verifyToken, studentController.updateStudent);

router.delete("/:id", verifyToken, studentController.deleteStudent);

module.exports = router;

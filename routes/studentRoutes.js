const express = require("express");

const router = express.Router();

const studentController = require("../controllers/studentController");
const { verifyToken } = require("../middleware/authMiddleware");
const uploadStudentAvatar = require("../middleware/uploadStudentAvatar");

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

router.post(
  "/",
  uploadStudentAvatar.single("avatar"),
  verifyToken,
  studentController.createStudent,
);
router.post(
  "/import-excel",
  verifyToken,

  studentController.importStudentsExcel,
);

router.put(
  "/:id",
  verifyToken,
  uploadStudentAvatar.single("avatar"),
  studentController.updateStudent,
);

router.delete("/:id", verifyToken, studentController.deleteStudent);

module.exports = router;

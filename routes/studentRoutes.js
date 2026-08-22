const express = require("express");

const router = express.Router();

const {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,

  getStudentClasses,
  createStudentClass,
  updateStudentClass,
  deleteStudentClass,

  getStudentExams,
  createStudentExam,
  updateStudentExam,
  deleteStudentExam,
} = require("../controllers/studentController");

// =====================================================
// STUDENTS
// =====================================================

router.get("/", getStudents);

router.get("/:id", getStudentById);

router.post("/", createStudent);

router.put("/:id", updateStudent);

router.delete("/:id", deleteStudent);

// =====================================================
// STUDENT CLASSES
// =====================================================

router.get("/student-classes/student/:studentId", getStudentClasses);

router.post("/student-classes", createStudentClass);

router.put("/student-classes/:id", updateStudentClass);

router.delete("/student-classes/:id", deleteStudentClass);

// =====================================================
// STUDENT EXAMS
// =====================================================

router.get("/student-exams/student/:studentId", getStudentExams);

router.post("/student-exams", createStudentExam);

router.put("/student-exams/:id", updateStudentExam);

router.delete("/student-exams/:id", deleteStudentExam);

module.exports = router;

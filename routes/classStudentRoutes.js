const express = require("express");
const router = express.Router();

const controller = require("../controllers/classStudentController");

// Học sinh trong lớp
router.get("/class/:classId", controller.getStudentsByClass);

// Các lớp của học sinh
router.get("/student/:studentId", controller.getClassesByStudent);

// Thêm học sinh vào lớp
router.post("/", controller.addStudentToClass);

// Cập nhật quan hệ lớp - học sinh
router.put("/update/:classId/:studentId", controller.updateClassStudent);
router.put("/:classId/:studentId/change-class", controller.changeClassStudent);

// Xóa học sinh khỏi lớp
router.delete("/:classId/:studentId", controller.removeStudentFromClass);

module.exports = router;

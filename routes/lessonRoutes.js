const express = require("express");
const router = express.Router();

const lessonController = require("../controllers/lessonController");
const { verifyToken } = require("../middleware/authMiddleware");

// Danh sách bài học
router.get("/", verifyToken, lessonController.getAll);

// Chi tiết bài học
router.get("/:id", verifyToken, lessonController.getById);

// Thêm bài học
router.post("/", verifyToken, lessonController.create);

// Cập nhật bài học
router.put("/:id", verifyToken, lessonController.update);

// Xóa bài học
router.delete("/:id", verifyToken, lessonController.delete);

module.exports = router;

const express = require("express");

const router = express.Router();

const questionController = require("../controllers/questionController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả question API đều yêu cầu đăng nhập
router.use(verifyToken);

// =========================================================
// EXAM
// Đặt trước /:id
// =========================================================

router.get("/exam/generate", questionController.generateExam);

router.post("/exam/submit", questionController.submitExam);

// =========================================================
// QUESTIONS
// =========================================================

router.get("/", questionController.getAll);

router.get("/:id", questionController.getById);

router.post("/", questionController.create);

router.put("/:id", questionController.update);

router.delete("/:id", questionController.delete);

module.exports = router;

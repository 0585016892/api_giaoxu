const express = require("express");

const router = express.Router();

const questionController = require("../controllers/questionController");
const { verifyToken } = require("../middleware/authMiddleware");

// =========================================================
// QUIZ BÀI HỌC
// =========================================================

// GET /api/questions/play/:lessonId
router.get("/play/:lessonId", verifyToken, questionController.getQuizByLesson);

// POST /api/questions/play/:lessonId/submit
router.post(
  "/play/:lessonId/submit",
  verifyToken,
  questionController.submitQuiz,
);

// =========================================================
// EXAM
// =========================================================

// GET /api/questions/exam/generate
router.get("/exam/generate", verifyToken, questionController.generateExam);

// POST /api/questions/exam/submit
router.post("/exam/submit", verifyToken, questionController.submitExam);

// =========================================================
// QUESTIONS
// =========================================================

// GET /api/questions/lesson/:lessonId
router.get("/lesson/:lessonId", verifyToken, questionController.getByLesson);

// GET /api/questions
router.get("/", verifyToken, questionController.getAll);

// GET /api/questions/:id
router.get("/:id", verifyToken, questionController.getById);

// POST /api/questions
router.post("/", verifyToken, questionController.create);

// PUT /api/questions/:id
router.put("/:id", verifyToken, questionController.update);

// DELETE /api/questions/:id
router.delete("/:id", verifyToken, questionController.delete);

module.exports = router;

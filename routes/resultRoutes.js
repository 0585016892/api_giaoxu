const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");

const resultController = require("../controllers/resultController");

// ============================================================
// AUTHENTICATION
// ============================================================

router.use(verifyToken);

// ============================================================
// LEADERBOARD
// ============================================================

router.get("/leaderboard", resultController.getLeaderboard);

router.get("/class/:classId/leaderboard", resultController.getClassLeaderboard);

// ============================================================
// STATISTICS
// ============================================================

router.get("/statistics", resultController.getResultStatistics);

// ============================================================
// CLASS
// ============================================================

router.get("/class/:classId", resultController.getResultsByClass);

router.get("/class/:classId/statistics", resultController.getClassStatistics);

// ============================================================
// STUDENT
// ============================================================

router.get(
  "/student/:studentId/statistics",
  resultController.getStudentStatistics,
);

router.get("/student/:studentId", resultController.getResultsByStudent);

// ============================================================
// GRADING RULE
// ============================================================

router.get("/rule/:ruleId", resultController.getResultsByRule);

router.get("/rule-item/:ruleItemId", resultController.getResultsByRuleItem);

// ============================================================
// CRUD
// ============================================================

router.get("/", resultController.getResults);

router.get("/:id", resultController.getResultById);

router.post("/", resultController.createResult);

router.put("/:id", resultController.updateResult);

router.delete("/:id", resultController.deleteResult);

module.exports = router;

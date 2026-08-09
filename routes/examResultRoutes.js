const express = require("express");

const router = express.Router();

const {
  createExamResult,
  getExamResults,
  getExamResultById,
  deleteExamResult,
  getExamResultByCode,
} = require("../controllers/examResultController");

// POST
router.post("/", createExamResult);

// GET tất cả
router.get("/", getExamResults);

// GET theo ID
router.get("/:id", getExamResultById);
router.get("/code/:code", getExamResultByCode);

// DELETE
router.delete("/:id", deleteExamResult);

module.exports = router;

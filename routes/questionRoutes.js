// routes/questionRoutes.js

const express = require("express");
const router = express.Router();
const questionController = require("../controllers/questionController");

// THÊM
router.get("/exam", questionController.generateExam);
router.get("/", questionController.getAll);
router.get("/:id", questionController.getById);
router.post("/submit-exam", questionController.submitExam);

router.post("/", questionController.create);
router.put("/:id", questionController.update);
router.delete("/:id", questionController.delete);

module.exports = router;

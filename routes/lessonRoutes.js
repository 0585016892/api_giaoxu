const express = require("express");
const router = express.Router();

const lessonController = require("../controllers/lessonController");

// TYPES phải đặt trước :id
router.get("/types", lessonController.getTypes);

router.get("/", lessonController.getAll);
router.get("/:id", lessonController.getById);

router.post("/", lessonController.create);

router.put("/:id", lessonController.update);

router.delete("/:id", lessonController.delete);

module.exports = router;

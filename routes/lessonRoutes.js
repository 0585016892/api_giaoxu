const express = require("express");
const router = express.Router();

const lessonController = require("../controllers/lessonController");
const { verifyToken } = require("../middleware/authMiddleware");

// Bắt buộc xác thực trước khi xử lý mọi route
router.use(verifyToken);

router.get("/programs", lessonController.getPrograms);
router.get("/types", lessonController.getTypes);
router.get("/", lessonController.getAll);
router.get("/:id", lessonController.getById);
router.post("/", lessonController.create);
router.put("/:id", lessonController.update);
router.delete("/:id", lessonController.delete);

module.exports = router;

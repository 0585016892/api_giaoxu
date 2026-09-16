const express = require("express");

const router = express.Router();

const lessonController = require("../controllers/lessonController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả API lesson đều yêu cầu đăng nhập
router.use(verifyToken);

// TYPES phải đặt trước :id
router.get("/types", lessonController.getTypes);

router.get("/", lessonController.getAll);

router.get("/:id", lessonController.getById);

router.post("/", lessonController.create);

router.put("/:id", lessonController.update);

router.delete("/:id", lessonController.delete);

module.exports = router;

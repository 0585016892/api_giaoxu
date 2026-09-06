const express = require("express");

const router = express.Router();

const corsController = require("../controllers/corsController");

// Danh sách
router.get("/", corsController.getAll);

// Active domains
router.get("/active", corsController.getActive);

// Thêm
router.post("/", corsController.create);

// Sửa
router.put("/:id", corsController.update);

// Bật / tắt
router.patch("/:id/toggle", corsController.toggle);

// Xóa
router.delete("/:id", corsController.remove);

module.exports = router;

// routes/catechismProgramRoutes.js

const express = require("express");
const router = express.Router();

const catechismProgramController = require("../controllers/catechismProgramController");

// GET: Danh sách, tìm kiếm, lọc, phân trang
router.get("/", catechismProgramController.getAllPrograms);

// GET: Chi tiết
router.get("/:id", catechismProgramController.getProgramById);

// POST: Tạo mới
router.post("/", catechismProgramController.createProgram);

// PUT: Cập nhật
router.put("/:id", catechismProgramController.updateProgram);

// PATCH: Cập nhật trạng thái
router.patch("/:id/status", catechismProgramController.updateProgramStatus);

// DELETE: Xóa
router.delete("/:id", catechismProgramController.deleteProgram);

module.exports = router;

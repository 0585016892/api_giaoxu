const express = require("express");

const router = express.Router();

const catechistController = require("../controllers/catechistController");

const { verifyToken } = require("../middleware/authMiddleware");

// =========================================================
// MIDDLEWARE
// Tất cả API Giáo lý viên đều yêu cầu đăng nhập
// =========================================================

router.use(verifyToken);

// =========================================================
// QUẢN LÝ GIÁO LÝ VIÊN
// =========================================================

// Danh sách Giáo lý viên của giáo xứ hiện tại
router.get("/", catechistController.getAllCatechists);

// Chi tiết Giáo lý viên
router.get("/:id", catechistController.getCatechistById);

// Tạo Giáo lý viên thuộc giáo xứ hiện tại
router.post("/", catechistController.createCatechist);

// Cập nhật Giáo lý viên
router.put("/:id", catechistController.updateCatechist);

// Xóa Giáo lý viên
router.delete("/:id", catechistController.deleteCatechist);

// =========================================================
// PHÂN CÔNG GIÁO LÝ VIÊN VÀO LỚP
// =========================================================

router.post("/assign-class", catechistController.assignClass);
router.delete("/remove-class", catechistController.removeClass);
module.exports = router;

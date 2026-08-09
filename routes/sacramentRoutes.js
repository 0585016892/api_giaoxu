const express = require("express");
const router = express.Router();
const sacramentController = require("../controllers/sacramentController");

// Lấy danh sách bí tích (có lọc, phân trang, tìm kiếm)
router.get("/", sacramentController.getAll);

// Lấy lịch sử bí tích của 1 giáo dân cụ thể
router.get(
  "/parishioner/:parishioner_id",
  sacramentController.getByParishionerId,
);

// Lấy chi tiết 1 hồ sơ bí tích theo ID (Phục vụ in trích lục)
router.get("/:id", sacramentController.getById);

// Tạo mới bí tích
router.post("/", sacramentController.create);

// Cập nhật bí tích
router.put("/:id", sacramentController.update);

// Xóa bí tích
router.delete("/:id", sacramentController.remove);

module.exports = router;

const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const gradingRuleController = require("../controllers/gradingRuleController");

// ============================================================
// AUTHENTICATION
// Tất cả API bên dưới đều yêu cầu đăng nhập
// ============================================================

router.use(verifyToken);

// ============================================================
// GRADING RULE
// ============================================================

// GET /api/grading-rules
// Lấy quy tắc tính điểm của giáo xứ hiện tại
router.get("/", gradingRuleController.getGradingRule);

// POST /api/grading-rules
// Tạo quy tắc tính điểm
router.post("/", gradingRuleController.createGradingRule);

// PUT /api/grading-rules/:id
// Cập nhật quy tắc và toàn bộ danh sách đầu điểm
router.put("/:id", gradingRuleController.updateGradingRule);

// DELETE /api/grading-rules/:id
// Xóa quy tắc tính điểm
router.delete("/:id", gradingRuleController.deleteGradingRule);

// ============================================================
// GRADING RULE ITEMS
// ============================================================

// GET /api/grading-rules/:id/items
// Lấy danh sách đầu điểm của quy tắc
router.get("/:id/items", gradingRuleController.getGradingRuleItems);

// POST /api/grading-rules/:id/items
// Thêm đầu điểm mới
router.post("/:id/items", gradingRuleController.createGradingRuleItem);

// PUT /api/grading-rules/:id/items/:itemId
// Cập nhật thông tin đầu điểm và trọng số
router.put("/:id/items/:itemId", gradingRuleController.updateGradingRuleItem);

// DELETE /api/grading-rules/:id/items/:itemId
// Xóa đầu điểm nếu chưa có kết quả tham chiếu
router.delete(
  "/:id/items/:itemId",
  gradingRuleController.deleteGradingRuleItem,
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;

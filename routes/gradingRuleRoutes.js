const express = require("express");

const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");

const gradingRuleController = require("../controllers/gradingRuleController");

// ============================================================
// AUTH
// ============================================================

router.use(verifyToken);

// ============================================================
// GRADING RULE
// ============================================================

// Lấy quy tắc tính điểm của giáo xứ hiện tại
router.get("/", gradingRuleController.getGradingRule);

// Tạo quy tắc tính điểm
router.post("/", gradingRuleController.createGradingRule);

// Cập nhật quy tắc tính điểm
router.put("/:id", gradingRuleController.updateGradingRule);

// Xóa quy tắc tính điểm
router.delete("/:id", gradingRuleController.deleteGradingRule);

// ============================================================
// GRADING RULE ITEMS
// ============================================================

// Danh sách đầu điểm
router.get("/:id/items", gradingRuleController.getGradingRuleItems);

// Thêm đầu điểm
router.post("/:id/items", gradingRuleController.createGradingRuleItem);

// Cập nhật đầu điểm
router.put("/:id/items/:itemId", gradingRuleController.updateGradingRuleItem);

// Xóa đầu điểm
router.delete(
  "/:id/items/:itemId",
  gradingRuleController.deleteGradingRuleItem,
);

module.exports = router;

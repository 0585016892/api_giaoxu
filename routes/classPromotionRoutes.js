const express = require("express");

const router = express.Router();

const classPromotionController = require("../controllers/classPromotionController");

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
//
// Đổi đường dẫn middleware dưới đây theo project hiện tại
// nếu project của anh đang dùng tên khác.
// ============================================================

const { verifyToken } = require("../middleware/authMiddleware");

// ============================================================
// PREVIEW
// ============================================================

router.post("/preview", verifyToken, classPromotionController.previewPromotion);

// ============================================================
// CONFIRM
// ============================================================

router.post("/confirm", verifyToken, classPromotionController.confirmPromotion);

module.exports = router;

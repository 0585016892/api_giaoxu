const express = require("express");

const router = express.Router();

const {
  getChurchSettings,
  updateChurchSettings,
} = require("../controllers/settingChurchController");

const { verifyToken } = require("../middleware/authMiddleware");

// ============================================================
// CHURCH SETTINGS
// ============================================================

// Lấy cấu hình
router.get("/church", verifyToken, getChurchSettings);

// Cập nhật cấu hình
router.put("/church", verifyToken, updateChurchSettings);

module.exports = router;

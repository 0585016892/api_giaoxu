const express = require("express");

const router = express.Router();

const {
  getChurchSettings,
  updateChurchSettings,
} = require("../controllers/settingChurchController");

const { verifyToken } = require("../middleware/authMiddleware");
const uploadChurchSettings = require("../middleware/uploadChurchSettings");
// ============================================================
// CHURCH SETTINGS
// ============================================================

// Lấy cấu hình
router.get("/church", verifyToken, getChurchSettings);

// Cập nhật cấu hình
router.put(
  "/church",
  uploadChurchSettings.fields([
    {
      name: "logo",
      maxCount: 1,
    },
    {
      name: "cover_image",
      maxCount: 1,
    },
  ]),
  verifyToken,
  updateChurchSettings,
);

module.exports = router;

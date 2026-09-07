const express = require("express");
const router = express.Router();

const licenseController = require("../controllers/licenseController");

// Middleware xác thực JWT hiện tại của bạn
const { verifyToken } = require("../middleware/authMiddleware");

// GET /api/license/me
router.get("/me", verifyToken, licenseController.getMyLicense);

module.exports = router;

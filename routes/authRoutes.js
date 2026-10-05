const express = require("express");

const router = express.Router();

const authController = require("../controllers/authController");

const { authLimiter } = require("../middlewares/rateLimitMiddleware");

// ============================================================
// AUTH - LOGIN
// ============================================================

router.post("/login", authLimiter, authController.login);

// ============================================================
// AUTH - REGISTER REQUEST
// POST /api/auth/register
//
// Bước 1:
// - Kiểm tra thông tin đăng ký
// - Hash password
// - Tạo OTP
// - Lưu pending registration
// - Gửi OTP qua email
// ============================================================

router.post("/register", authLimiter, authController.registerRequest);

// ============================================================
// AUTH - REGISTER VERIFY
// POST /api/auth/register/verify
//
// Bước 2:
// - Kiểm tra OTP
// - Tạo church
// - Tạo admin/catechist
// - Xác thực email
// - Xóa pending registration
// - Trả JWT
// ============================================================

router.post("/register/verify", authLimiter, authController.registerVerify);

module.exports = router;

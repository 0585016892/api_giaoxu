const express = require("express");

const router = express.Router();

const forgotPasswordController = require("../controllers/authForgotPasswordController");

// ============================================================
// FORGOT PASSWORD
// ============================================================

// Bước 1:
// Kiểm tra email đăng ký
router.post("/forgot-password/request", forgotPasswordController.request);

// Bước 2:
// Nhập email mới và gửi OTP
router.post("/forgot-password/send-otp", forgotPasswordController.sendOtp);

// Bước 3:
// Xác minh OTP
router.post("/forgot-password/verify-otp", forgotPasswordController.verifyOtp);

// Bước 4:
// Đổi mật khẩu + cập nhật email
router.post("/forgot-password/reset", forgotPasswordController.resetPassword);

module.exports = router;

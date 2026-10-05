const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authLimiter } = require("../middlewares/rateLimitMiddleware");

router.post("/login", authLimiter, authController.login);
router.post("/register", authLimiter, authController.register);
module.exports = router;

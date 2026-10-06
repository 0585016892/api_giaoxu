// routes/assistantRoutes.js

const express = require("express");

const router = express.Router();

const assistantController = require("../controllers/assistantController");

const verifyToken = require("../middleware/verifyToken");
const globalApiLimiter = require("../middleware/globalApiLimiter");

/**
 * ============================================================
 * POST /api/assistant/chat
 * ============================================================
 *
 * Phase 1:
 * - Chỉ đọc knowledge.
 * - Không đọc database.
 * - Không ghi database.
 * - Không gọi AI.
 */

router.post("/chat", verifyToken, globalApiLimiter, assistantController.chat);

module.exports = router;

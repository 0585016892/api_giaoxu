const express = require("express");

const router = express.Router();

const chatbotController = require("../controllers/chatbotController");
const chatHistoryController = require("../controllers/chatHistoryController");

router.post("/", chatbotController.chat);
router.get("/history/:sessionId", chatHistoryController.history);
module.exports = router;

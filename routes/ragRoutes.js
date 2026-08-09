const express = require("express");
const router = express.Router();

const ragController = require("../controllers/ragController");

// Đồng bộ dữ liệu
router.post("/train", ragController.train);

// Tạo vector
router.post("/train-embedding", ragController.trainEmbedding);

module.exports = router;

const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");
// const authMiddleware = require("../middleware/authMiddleware");
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/", dashboardController.getDashboard);

module.exports = router;

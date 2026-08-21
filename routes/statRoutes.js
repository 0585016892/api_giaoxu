const express = require("express");
const router = express.Router();

const {
  trackVisitor,
  getStats,
  getVisitorChart,
  getVisitorHistory,
} = require("../controllers/statController");
router.post("/track", trackVisitor);

router.get("/", getStats);
router.get("/history/:ip", getVisitorHistory);
router.get("/chart", getVisitorChart);

module.exports = router;

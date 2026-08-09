const express = require("express");
const router = express.Router();

const {
  trackVisitor,
  getStats,
  getVisitorChart,
} = require("../controllers/statController");
router.post("/track", trackVisitor);

router.get("/", getStats);
router.get("/chart", getVisitorChart);

module.exports = router;

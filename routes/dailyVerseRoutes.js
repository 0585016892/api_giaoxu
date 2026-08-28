const express = require("express");

const router = express.Router();

const dailyVerseController = require("../controllers/dailyVerseController");

// =====================================================
// DAILY VERSES
// =====================================================
router.get("/random", dailyVerseController.getRandomVerse);

// GET    /api/daily-verses
router.get("/", dailyVerseController.getDailyVerses);

// GET    /api/daily-verses/:id
router.get("/:id", dailyVerseController.getDailyVerseById);

// POST   /api/daily-verses
router.post("/", dailyVerseController.createDailyVerse);

// PUT    /api/daily-verses/:id
router.put("/:id", dailyVerseController.updateDailyVerse);

// DELETE /api/daily-verses/:id
router.delete("/:id", dailyVerseController.deleteDailyVerse);

module.exports = router;

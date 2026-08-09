const express = require("express");
const router = express.Router();
const prayerController = require("../controllers/prayerController");
const { verifyToken } = require("../middleware/authMiddleware");

// Public
router.get("/", prayerController.getAll);
router.get("/all", prayerController.getAllFe);
router.get("/:id", prayerController.getById);

// Protected
router.post("/", verifyToken, prayerController.create);
router.put("/:id", verifyToken, prayerController.update);
router.delete("/:id", verifyToken, prayerController.remove);

module.exports = router;

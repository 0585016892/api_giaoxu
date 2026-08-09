const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadEvent");
const eventController = require("../controllers/eventController");

router.get("/", eventController.getEvents);
router.get("/:slug", eventController.getEventBySlug);

router.post("/", upload.array("images", 50), eventController.createEvent);
router.patch("/:id/status", eventController.updateEventStatus);
router.put("/:id", upload.array("images", 50), eventController.updateEvent);
router.delete("/:id", eventController.deleteEvent);

module.exports = router;

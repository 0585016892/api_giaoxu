const express = require("express");

const router = express.Router();

const contactMessageController = require("../controllers/contactMessageController");
router.get("/check-feedback", contactMessageController.checkFeedback);
router.post("/", contactMessageController.createContactMessage);

module.exports = router;

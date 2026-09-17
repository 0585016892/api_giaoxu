const express = require("express");

const router = express.Router();

const contactMessageController = require("../controllers/contactMessageController");

router.post("/", contactMessageController.createContactMessage);

module.exports = router;

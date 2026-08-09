const express = require("express");
const router = express.Router();

const { getAllImages } = require("../controllers/galleryController");

// GET ALL IMAGES
router.get("/images", getAllImages);

module.exports = router;

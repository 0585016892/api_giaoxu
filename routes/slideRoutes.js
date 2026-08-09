// routes/slideRoutes.js

const express = require("express");
const router = express.Router();
const slideController = require("../controllers/slideController");
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// ================= MULTER CONFIG =================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/slides/");
  },
  filename: function (req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ cho phép ảnh jpg, png, webp"));
  }
};

const upload = multer({ storage, fileFilter });

// ================= ROUTES =================

router.get("/", slideController.getSlides);
router.get("/active", slideController.getActiveSlides);

router.post("/", upload.single("image"), slideController.createSlide);

router.put("/:id", upload.single("image"), slideController.updateSlide);
router.put("/:id/status", slideController.updateSlideStatus);

router.delete("/:id", slideController.deleteSlide);

module.exports = router;

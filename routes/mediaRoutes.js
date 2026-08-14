const express = require("express");

const router = express.Router();

const upload = require("../middleware/mediaUpload");

const {
  getAllMedia,
  getMediaById,
  createMedia,
  updateMedia,
  deleteMedia,
  increaseView,
  increaseDownload,
  getCategories,
  changeMediaStatus,
} = require("../controllers/mediaController");

// =====================================================
// GET
// =====================================================

router.get("/", getAllMedia);

router.get("/categories", getCategories);

router.get("/:id", getMediaById);

// =====================================================
// CREATE
// =====================================================

router.post(
  "/",
  upload.fields([
    {
      name: "audio",
      maxCount: 1,
    },
    {
      name: "video",
      maxCount: 1,
    },
    {
      name: "thumbnail",
      maxCount: 1,
    },
  ]),
  createMedia,
);

// =====================================================
// UPDATE
// =====================================================

router.put(
  "/:id",
  upload.fields([
    {
      name: "audio",
      maxCount: 1,
    },
    {
      name: "video",
      maxCount: 1,
    },
    {
      name: "thumbnail",
      maxCount: 1,
    },
  ]),
  updateMedia,
);

// =====================================================
// VIEW
// =====================================================

router.post("/:id/view", increaseView);

// =====================================================
// DOWNLOAD
// =====================================================

router.post("/:id/download", increaseDownload);
router.patch("/:id/status", changeMediaStatus);
// =====================================================
// DELETE
// =====================================================

router.delete("/:id", deleteMedia);

module.exports = router;

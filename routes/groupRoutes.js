const express = require("express");
const router = express.Router();

const {
  createGroup,
  getGroups,
  getGroupDetail,
  updateGroup,
  deleteGroup,
} = require("../controllers/groupController");

const upload = require("../middleware/uploadGroupImage");

// ===== ROUTES =====

router.get("/", getGroups);
router.get("/:slug", getGroupDetail);
router.post("/", upload.single("image"), createGroup);
router.put("/:id", upload.single("image"), updateGroup);
router.delete("/:id", deleteGroup);

module.exports = router;

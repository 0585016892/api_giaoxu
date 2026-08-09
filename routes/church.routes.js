const express = require("express");
const router = express.Router();

const churchController = require("../controllers/church.controller");
const upload = require("../middleware/uploadChurch");
// ================= CRUD =================
router.get("/", churchController.getAll);
router.get("/:id", churchController.getById);
router.post("/", upload.single("image"), churchController.create);
router.put("/:id", upload.single("image"), churchController.update);
router.delete("/:id", churchController.remove);

// ================= EXTRA =================
router.patch("/:id/toggle", churchController.toggleActive);

// tìm gần vị trí map
router.get("/map/search", churchController.searchMap);

module.exports = router;

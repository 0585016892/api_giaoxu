const express = require("express");
const router = express.Router();

const churchController = require("../controllers/church.controller");
const upload = require("../middleware/uploadChurch");
const { verifyToken } = require("../middleware/authMiddleware");
const requireSystemAdmin = require("../middleware/requireSystemAdmin");
const {
  destructiveLimiter,
  globalApiLimiter,
} = require("../middleware/rateLimitMiddleware");

// ================= CRUD =================
// Tổng Giáo phận
router.get("/archdioceses", churchController.getArchdioceses);

// Giáo phận thuộc Tổng Giáo phận
router.get(
  "/by-parent/:parentDioceseId",

  churchController.getDiocesesByParent,
);
router.get(
  "/by-diocese/:dioceseId",

  churchController.getDeaneriesByDiocese,
);

router.get(
  "/",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  churchController.getAll,
);

router.get("/:id", verifyToken, globalApiLimiter, churchController.getById);
router.post(
  "/:id/activate-license",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  churchController.activateLicense,
);
router.post(
  "/",
  verifyToken,
  requireSystemAdmin,
  upload.single("image"),
  globalApiLimiter,
  churchController.create,
);

router.put(
  "/:id",
  verifyToken,
  requireSystemAdmin,
  upload.single("image"),
  globalApiLimiter,
  churchController.update,
);
router.delete(
  "/:id",
  verifyToken,
  requireSystemAdmin,
  destructiveLimiter,
  globalApiLimiter,
  churchController.remove,
);

// ================= EXTRA =================
router.patch(
  "/:id/toggle",
  verifyToken,
  requireSystemAdmin,
  globalApiLimiter,
  churchController.toggleActive,
);

// tìm gần vị trí map
router.get("/map/search", globalApiLimiter, churchController.searchMap);

module.exports = router;

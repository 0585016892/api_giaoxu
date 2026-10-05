const express = require("express");

const router = express.Router();

const corsController = require("../controllers/corsController");
const requireSystemAdmin = require("../middleware/requireSystemAdmin");
const { globalApiLimiter } = require("./middleware/rateLimitMiddleware");

// Danh sách
router.get("/", requireSystemAdmin, globalApiLimiter, corsController.getAll);

// Active domains
router.get(
  "/active",
  requireSystemAdmin,
  globalApiLimiter,
  corsController.getActive,
);

// Thêm
router.post("/", requireSystemAdmin, globalApiLimiter, corsController.create);

// Sửa
router.put("/:id", requireSystemAdmin, globalApiLimiter, corsController.update);

// Bật / tắt
router.patch(
  "/:id/toggle",
  requireSystemAdmin,
  globalApiLimiter,
  corsController.toggle,
);

// Xóa
router.delete(
  "/:id",
  requireSystemAdmin,
  globalApiLimiter,
  corsController.remove,
);

module.exports = router;

const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const upload = require("../middleware/uploadAvatar");
const { authorize } = require("../middleware/authorize");
const { verifyToken } = require("../middleware/authMiddleware");

// CREATE (có upload avatar)
router.post(
  "/",
  upload.single("avatar"),
  verifyToken,
  adminController.createAdmin,
);

// UPDATE (có upload avatar)
router.put(
  "/:id",
  upload.single("avatar"),
  verifyToken,
  adminController.updateAdmin,
);

router.get("/", verifyToken, adminController.getAllAdmins);
router.get("/:id", verifyToken, adminController.getAdminById);
router.patch("/:id/toggle", verifyToken, adminController.toggleActive);
router.put("/password/:id", verifyToken, adminController.changePassword);

router.put(
  "/:id/reset-passwordcate",
  verifyToken,
  adminController.resetCatechitsPassword,
);
router.put(
  "/:id/reset-password",
  verifyToken,
  adminController.resetAdminPassword,
);
router.delete("/:id", verifyToken, adminController.deleteAdmin);

// khóa / mở tài khoản

module.exports = router;

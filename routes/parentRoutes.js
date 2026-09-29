const express = require("express");

const router = express.Router();

const parentController = require("../controllers/parentController");

const { verifyToken } = require("../middleware/authMiddleware");

router.get("/me", verifyToken, parentController.getMe);

router.get("/children", verifyToken, parentController.getChildren);

router.get("/children/:studentId", verifyToken, parentController.getChild);

router.get(
  "/children/:studentId/attendance",
  verifyToken,
  parentController.getChildAttendance,
);

router.get(
  "/children/:studentId/results",
  verifyToken,
  parentController.getChildResults,
);

router.get(
  "/children/:studentId/schedule",
  verifyToken,
  parentController.getChildSchedule,
);

router.get(
  "/children/:studentId/certificates",
  verifyToken,
  parentController.getChildCertificates,
);

module.exports = router;

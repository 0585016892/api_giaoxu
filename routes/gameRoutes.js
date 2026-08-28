const express = require("express");

const router = express.Router();

const gameController = require("../controllers/gameController");

const upload = require("../middleware/gameUpload");
const { verifyToken } = require("../middleware/authMiddleware");

/**
 * =========================================================
 * GAME ROUTES
 * =========================================================
 */

/**
 * GET ALL
 */
router.get("/", verifyToken, gameController.getAllGames);

/**
 * GET BY TEACHER
 */
router.get(
  "/teacher/:teacherId",
  verifyToken,
  gameController.getGamesByTeacher,
);

/**
 * GET BY ID
 */
router.get("/:id", verifyToken, gameController.getGameById);

/**
 * CREATE
 */
router.post(
  "/",
  verifyToken,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "background", maxCount: 1 },
    { name: "backgroundMusic", maxCount: 1 },
    { name: "correctSound", maxCount: 1 },
    { name: "wrongSound", maxCount: 1 },
    { name: "cardImages", maxCount: 100 },
  ]),
  gameController.createGame,
);

/**
 * UPDATE
 */
router.put(
  "/:id",
  verifyToken,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "background", maxCount: 1 },
    { name: "backgroundMusic", maxCount: 1 },
    { name: "correctSound", maxCount: 1 },
    { name: "wrongSound", maxCount: 1 },
    { name: "cardImages", maxCount: 100 },
  ]),
  gameController.updateGame,
);

/**
 * DELETE
 */
router.delete("/:id", verifyToken, gameController.deleteGame);

module.exports = router;

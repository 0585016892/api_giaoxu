const express = require("express");

const router = express.Router();

const deaneryController = require("../controllers/deaneryController");

/**
 * =========================================================
 * DEANERIES
 * =========================================================
 */

/**
 * Lấy Giáo hạt theo Giáo phận
 *
 * GET /api/deaneries/diocese/:dioceseId
 *
 * QUAN TRỌNG:
 * Route này phải đặt TRƯỚC /:id
 */
router.get("/diocese/:dioceseId", deaneryController.getDeaneriesByDiocese);

/**
 * Danh sách Giáo hạt
 *
 * GET /api/deaneries
 */
router.get("/", deaneryController.getAllDeaneries);

/**
 * Chi tiết
 *
 * GET /api/deaneries/:id
 */
router.get("/:id", deaneryController.getDeaneryById);

/**
 * Thêm
 *
 * POST /api/deaneries
 */
router.post("/", deaneryController.createDeanery);

/**
 * Sửa
 *
 * PUT /api/deaneries/:id
 */
router.put("/:id", deaneryController.updateDeanery);

/**
 * Xóa
 *
 * DELETE /api/deaneries/:id
 */
router.delete("/:id", deaneryController.deleteDeanery);

/**
 * Bật / tắt
 *
 * PATCH /api/deaneries/:id/toggle
 */
router.patch("/:id/toggle", deaneryController.toggleDeaneryActive);

module.exports = router;

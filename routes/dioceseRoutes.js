const express = require("express");

const router = express.Router();

const dioceseController = require("../controllers/dioceseController");

/**
 * =========================================================
 * DIOCESES
 * =========================================================
 */

/**
 * Tổng Giáo phận
 *
 * GET /api/dioceses/archdioceses
 */
router.get("/archdioceses", dioceseController.getArchdioceses);

/**
 * Giáo phận thuộc Tổng Giáo phận
 *
 * GET /api/dioceses/by-parent/:parentDioceseId
 */
router.get(
  "/by-parent/:parentDioceseId",
  dioceseController.getDiocesesByParent,
);

/**
 * Danh sách Giáo phận
 *
 * GET /api/dioceses
 */
router.get("/", dioceseController.getAllDioceses);

/**
 * Chi tiết
 *
 * GET /api/dioceses/:id
 */
router.get("/:id", dioceseController.getDioceseById);

/**
 * Thêm
 *
 * POST /api/dioceses
 */
router.post("/", dioceseController.createDiocese);

/**
 * Sửa
 *
 * PUT /api/dioceses/:id
 */
router.put("/:id", dioceseController.updateDiocese);

/**
 * Xóa
 *
 * DELETE /api/dioceses/:id
 */
router.delete("/:id", dioceseController.deleteDiocese);

/**
 * Bật / tắt
 *
 * PATCH /api/dioceses/:id/toggle
 */
router.patch("/:id/toggle", dioceseController.toggleDioceseActive);

module.exports = router;

const express = require("express");

const router = express.Router();

const lessonResourceController = require("../controllers/lessonResourceController");

const { uploadLessonResource } = require("../middleware/uploadLessonResource");

const { verifyToken } = require("../middleware/authMiddleware");

/**
 * =========================================================
 * LESSON RESOURCE ROUTES
 * =========================================================
 */
// Lấy câu hỏi theo bài học
router.get(
  "/lesson/:lessonId",
  verifyToken,
  lessonResourceController.getByLesson,
);
/**
 * GET
 * Danh sách tài nguyên của bài học
 */
router.get(
  "/:lessonId/resources",
  verifyToken,
  lessonResourceController.getByLesson,
);

/**
 * POST
 * Upload file + tạo resource
 *
 * multipart/form-data
 * field: file
 */
router.post(
  "/:lessonId/resources",
  verifyToken,
  uploadLessonResource.single("file"),
  lessonResourceController.create,
);

/**
 * GET
 * Chi tiết resource
 */
router.get("/resources/:id", verifyToken, lessonResourceController.getById);

/**
 * PUT
 * Cập nhật metadata
 */
router.put("/resources/:id", verifyToken, lessonResourceController.update);

/**
 * PATCH
 * Ẩn / hiện
 */
router.patch(
  "/resources/:id/status",
  verifyToken,
  lessonResourceController.updateStatus,
);

/**
 * DELETE
 * Xóa resource + file
 */
router.delete("/resources/:id", verifyToken, lessonResourceController.remove);

module.exports = router;

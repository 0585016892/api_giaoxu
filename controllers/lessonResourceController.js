const db = require("../config/db");

const fs = require("fs");
const path = require("path");

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

const getChurchId = (req) => {
  return req.user?.church_id ?? null;
};

const getUserId = (req) => {
  return req.user?.id ?? null;
};

/**
 * Xác định loại file
 */
const detectFileType = (fileName = "", mimeType = "") => {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");

  if (["ppt", "pptx"].includes(ext)) {
    return "pptx";
  }

  if (ext === "pdf") {
    return "pdf";
  }

  if (["doc", "docx"].includes(ext)) {
    return "docx";
  }

  if (["xls", "xlsx"].includes(ext)) {
    return "xlsx";
  }

  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return "image";
  }

  if (["mp4", "webm", "mov"].includes(ext)) {
    return "video";
  }

  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) {
    return "audio";
  }

  if (ext === "zip") {
    return "archive";
  }

  /**
   * Fallback theo MIME
   */
  if (mimeType?.startsWith("image/")) {
    return "image";
  }

  if (mimeType?.startsWith("video/")) {
    return "video";
  }

  if (mimeType?.startsWith("audio/")) {
    return "audio";
  }

  return ext || null;
};

/**
 * URL public của file
 */
const buildFileUrl = (req, lessonId, fileName) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;

  const host = req.get("host");

  return `${protocol}://${host}/uploads/lessons/${lessonId}/${encodeURIComponent(
    fileName,
  )}`;
};

/**
 * Xóa file nếu tồn tại
 */
const removeFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("⚠️ Không thể xóa file:", error.message);
  }
};

/**
 * =========================================================
 * GET BY LESSON
 * =========================================================
 */

exports.getByLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;

    const churchId = getChurchId(req);

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu lessonId",
      });
    }

    /**
     * Kiểm tra bài học
     */
    const [lessons] = await db.query(
      `
      SELECT
        id,
        title,
        catechism_type,
        church_id
      FROM lessons
      WHERE id = ?
        AND (
          church_id IS NULL
          OR church_id = ?
        )
      LIMIT 1
      `,
      [lessonId, churchId],
    );

    if (!lessons.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài học",
      });
    }

    /**
     * Lấy resources
     */
    const [resources] = await db.query(
      `
      SELECT
        lr.*,
        a.username AS creator_username
      FROM lesson_resources lr
      LEFT JOIN admins a
        ON a.id = lr.created_by
      WHERE lr.lesson_id = ?
        AND lr.is_active = 1
        AND (
          lr.church_id IS NULL
          OR lr.church_id = ?
        )
      ORDER BY
        lr.sort_order ASC,
        lr.created_at DESC
      `,
      [lessonId, churchId],
    );

    return res.json({
      success: true,

      data: {
        lesson: lessons[0],
        resources,
      },
    });
  } catch (error) {
    console.error("❌ getByLesson:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy tài nguyên bài học",
    });
  }
};

/**
 * =========================================================
 * GET BY ID
 * =========================================================
 */

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    const churchId = getChurchId(req);

    const [rows] = await db.query(
      `
      SELECT
        lr.*,
        l.title AS lesson_title,
        l.catechism_type,
        a.username AS creator_username
      FROM lesson_resources lr

      INNER JOIN lessons l
        ON l.id = lr.lesson_id

      LEFT JOIN admins a
        ON a.id = lr.created_by

      WHERE lr.id = ?
        AND (
          lr.church_id IS NULL
          OR lr.church_id = ?
        )
        AND (
          l.church_id IS NULL
          OR l.church_id = ?
        )

      LIMIT 1
      `,
      [id, churchId, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài nguyên",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ getById:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy tài nguyên",
    });
  }
};
// Lấy câu hỏi theo bài học
exports.getByLessonQuestion = async (req, res) => {
  try {
    const { lessonId } = req.params;

    if (!lessonId || isNaN(Number(lessonId))) {
      return res.status(400).json({
        success: false,
        message: "lessonId không hợp lệ",
      });
    }

    const [questions] = await db.query(
      `
      SELECT
        id,
        lesson_id,
        question,
        answer_a,
        answer_b,
        answer_c,
        answer_d,
        correct_answer,
        created_at,
        updated_at
      FROM questions
      WHERE lesson_id = ?
      ORDER BY id ASC
      `,
      [Number(lessonId)],
    );

    return res.json({
      success: true,
      lesson_id: Number(lessonId),
      total: questions.length,
      questions,
    });
  } catch (error) {
    console.error("GET QUESTIONS BY LESSON ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy câu hỏi của bài học",
      error: error.message,
    });
  }
};
/**
 * =========================================================
 * UPLOAD + CREATE
 *
 * POST
 * /api/lessons/:lessonId/resources
 *
 * multipart/form-data
 *
 * file = file
 * title = ...
 * description = ...
 * resource_category = presentation
 * =========================================================
 */

/**
 * =========================================================
 * CREATE LESSON RESOURCE
 *
 * POST /api/lessons/:lessonId/resources
 *
 * Hỗ trợ:
 * 1. Upload file
 * 2. Thêm đường link
 *
 * FILE:
 * - req.file
 *
 * LINK:
 * - resource_type = "link"
 * - external_url = "https://..."
 *
 * Không bắt buộc phải có file.
 * Chỉ cần có FILE hoặc LINK.
 * =========================================================
 */

exports.create = async (req, res) => {
  let uploadedFilePath = null;

  try {
    const { lessonId } = req.params;

    const churchId = getChurchId(req);
    const userId = getUserId(req);

    const {
      title,
      description,
      resource_type,
      resource_category,
      sort_order = 0,
      visibility = "public",
      is_downloadable = 1,
      external_url,
    } = req.body;

    /**
     * =====================================================
     * FILE
     * =====================================================
     */

    const file = req.file || null;

    /**
     * =====================================================
     * NORMALIZE
     * =====================================================
     */

    const normalizedTitle =
      title !== undefined && title !== null ? String(title).trim() : "";

    const normalizedExternalUrl =
      external_url !== undefined && external_url !== null
        ? String(external_url).trim()
        : "";

    /**
     * =====================================================
     * RESOURCE TYPE
     *
     * Nếu frontend truyền:
     * resource_type = link
     *
     * => link
     *
     * Nếu có file:
     * => file
     *
     * Nếu không truyền:
     * tự xác định.
     * =====================================================
     */

    let finalResourceType = resource_type
      ? String(resource_type).trim().toLowerCase()
      : "";

    if (!finalResourceType) {
      finalResourceType = normalizedExternalUrl ? "link" : "file";
    }

    /**
     * Chỉ cho phép 2 loại hiện tại
     */
    if (!["file", "link"].includes(finalResourceType)) {
      return res.status(400).json({
        success: false,
        message: "Loại tài nguyên không hợp lệ",
      });
    }

    /**
     * =====================================================
     * VALIDATE LESSON ID
     * =====================================================
     */

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu lessonId",
      });
    }

    /**
     * =====================================================
     * VALIDATE TITLE
     * =====================================================
     */

    if (!normalizedTitle) {
      if (file?.path) {
        removeFile(file.path);
      }

      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên tài nguyên",
      });
    }

    /**
     * =====================================================
     * VALIDATE FILE / LINK
     * =====================================================
     *
     * Phải có ít nhất một:
     *
     * file
     * hoặc
     * external_url
     */

    if (!file && !normalizedExternalUrl) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn file hoặc nhập đường link",
      });
    }

    /**
     * =====================================================
     * KHÔNG CHO CẢ FILE + LINK
     * =====================================================
     */

    if (file && normalizedExternalUrl) {
      removeFile(file.path);

      return res.status(400).json({
        success: false,
        message: "Chỉ được chọn file hoặc nhập đường link",
      });
    }

    /**
     * =====================================================
     * VALIDATE RESOURCE TYPE
     * =====================================================
     */

    if (finalResourceType === "file" && !file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn file để tải lên",
      });
    }

    if (finalResourceType === "link" && !normalizedExternalUrl) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đường link",
      });
    }

    /**
     * =====================================================
     * VALIDATE URL
     * =====================================================
     */

    if (normalizedExternalUrl) {
      try {
        const parsedUrl = new URL(normalizedExternalUrl);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return res.status(400).json({
            success: false,
            message: "Đường link không hợp lệ",
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Đường link không hợp lệ",
        });
      }
    }

    /**
     * =====================================================
     * FILE PATH
     * =====================================================
     */

    if (file?.path) {
      uploadedFilePath = file.path;
    }

    /**
     * =====================================================
     * KIỂM TRA LESSON
     * =====================================================
     */

    const [lessons] = await db.query(
      `
      SELECT
        id,
        title,
        church_id
      FROM lessons
      WHERE id = ?
        AND (
          church_id IS NULL
          OR church_id = ?
        )
      LIMIT 1
      `,
      [lessonId, churchId],
    );

    if (!lessons.length) {
      if (uploadedFilePath) {
        removeFile(uploadedFilePath);
      }

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài học hoặc bạn không có quyền truy cập",
      });
    }

    const lesson = lessons[0];

    /**
     * =====================================================
     * CHURCH ID
     * =====================================================
     */

    const finalChurchId = lesson.church_id ?? churchId ?? null;

    /**
     * =====================================================
     * FILE DATA
     * =====================================================
     */

    let fileType = null;
    let fileName = null;
    let fileUrl = null;
    let mimeType = null;
    let fileSize = null;

    if (file) {
      fileType = detectFileType(file.originalname, file.mimetype);

      fileName = file.originalname;

      fileUrl = buildFileUrl(req, lessonId, file.filename);

      mimeType = file.mimetype;

      fileSize = file.size;
    }

    /**
     * =====================================================
     * LINK DATA
     * =====================================================
     *
     * Link:
     *
     * file_type   = "link"
     * file_name   = NULL
     * file_url    = NULL
     * external_url = URL
     *
     * =====================================================
     */

    if (finalResourceType === "link") {
      fileType = "link";
      fileName = null;
      fileUrl = null;
      mimeType = null;
      fileSize = null;
    }

    /**
     * =====================================================
     * IS DOWNLOADABLE
     *
     * Link mặc định không cho download.
     * =====================================================
     */

    const finalIsDownloadable =
      finalResourceType === "link" ? 0 : is_downloadable ? 1 : 0;

    /**
     * =====================================================
     * INSERT DB
     * =====================================================
     */

    const [result] = await db.query(
      `
      INSERT INTO lesson_resources (
        lesson_id,
        church_id,

        title,
        description,

        resource_type,
        resource_category,

        file_type,
        file_name,
        file_url,

        external_url,

        mime_type,
        file_size,

        thumbnail_url,

        sort_order,

        visibility,

        is_downloadable,
        is_active,

        created_by
      )

      VALUES (
        ?, ?,

        ?, ?,

        ?, ?,

        ?, ?,
        ?,

        ?,

        ?, ?,

        NULL,

        ?,

        ?,

        ?,
        1,

        ?
      )
      `,
      [
        lessonId,
        finalChurchId,

        normalizedTitle,
        description || null,

        finalResourceType,
        resource_category || null,

        fileType,
        fileName,
        fileUrl,

        normalizedExternalUrl || null,

        mimeType,
        fileSize,

        Number(sort_order) || 0,

        visibility || "public",

        finalIsDownloadable,

        userId,
      ],
    );

    /**
     * =====================================================
     * LẤY RECORD VỪA TẠO
     * =====================================================
     */

    const [rows] = await db.query(
      `
      SELECT *
      FROM lesson_resources
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId],
    );

    /**
     * =====================================================
     * SUCCESS
     * =====================================================
     */

    return res.status(201).json({
      success: true,

      message:
        finalResourceType === "link"
          ? "Đã thêm đường link thành công"
          : "Đã tải tài liệu lên thành công",

      data: rows[0],
    });
  } catch (error) {
    console.error("❌ create lessonResource:", error);

    /**
     * =====================================================
     * CLEANUP FILE
     * =====================================================
     */

    if (uploadedFilePath) {
      removeFile(uploadedFilePath);
    }

    return res.status(500).json({
      success: false,
      message: "Không thể thêm tài nguyên",
    });
  }
};

/**
 * =========================================================
 * UPDATE METADATA
 *
 * PUT /api/lessons/resources/:id
 *
 * Có thể cập nhật:
 * - title
 * - description
 * - category
 * - sort_order
 * - visibility
 * - is_downloadable
 * - is_active
 * - external_url
 * =========================================================
 */

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    const churchId = getChurchId(req);

    const {
      title,
      description,
      resource_type,
      resource_category,
      sort_order,
      visibility,
      is_downloadable,
      is_active,
      external_url,
    } = req.body;

    /**
     * =====================================================
     * FIND RESOURCE
     * =====================================================
     */

    const [rows] = await db.query(
      `
      SELECT *
      FROM lesson_resources
      WHERE id = ?
        AND (
          church_id IS NULL
          OR church_id = ?
        )
      LIMIT 1
      `,
      [id, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài nguyên",
      });
    }

    const existing = rows[0];

    /**
     * =====================================================
     * NORMALIZE
     * =====================================================
     */

    const finalTitle =
      title !== undefined ? String(title).trim() : existing.title;

    const finalDescription =
      description !== undefined ? description : existing.description;

    const finalCategory =
      resource_category !== undefined
        ? resource_category
        : existing.resource_category;

    const finalSortOrder =
      sort_order !== undefined ? Number(sort_order) || 0 : existing.sort_order;

    const finalVisibility =
      visibility !== undefined ? visibility : existing.visibility;

    const finalIsDownloadable =
      is_downloadable !== undefined
        ? is_downloadable
          ? 1
          : 0
        : existing.is_downloadable;

    const finalIsActive =
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    const finalResourceType =
      resource_type !== undefined
        ? String(resource_type).trim().toLowerCase()
        : existing.resource_type;

    const finalExternalUrl =
      external_url !== undefined
        ? String(external_url).trim()
        : existing.external_url;

    /**
     * =====================================================
     * VALIDATE TITLE
     * =====================================================
     */

    if (!finalTitle) {
      return res.status(400).json({
        success: false,
        message: "Tên tài nguyên không được để trống",
      });
    }

    /**
     * =====================================================
     * VALIDATE RESOURCE TYPE
     * =====================================================
     */

    if (!["file", "link"].includes(finalResourceType)) {
      return res.status(400).json({
        success: false,
        message: "Loại tài nguyên không hợp lệ",
      });
    }

    /**
     * =====================================================
     * LINK
     * =====================================================
     */

    if (finalResourceType === "link") {
      if (!finalExternalUrl) {
        return res.status(400).json({
          success: false,
          message: "Tài nguyên link phải có đường link",
        });
      }

      try {
        const parsedUrl = new URL(finalExternalUrl);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return res.status(400).json({
            success: false,
            message: "Đường link không hợp lệ",
          });
        }
      } catch {
        return res.status(400).json({
          success: false,
          message: "Đường link không hợp lệ",
        });
      }
    }

    /**
     * =====================================================
     * FILE
     * =====================================================
     */

    if (finalResourceType === "file") {
      /**
       * Nếu chuyển từ link -> file
       * mà không upload file mới thì không thể.
       */
      if (existing.resource_type === "link" && !existing.file_url) {
        return res.status(400).json({
          success: false,
          message: "Không thể chuyển link thành file nếu chưa tải file mới lên",
        });
      }
    }

    /**
     * =====================================================
     * UPDATE
     * =====================================================
     */

    await db.query(
      `
      UPDATE lesson_resources
      SET
        title = ?,
        description = ?,
        resource_type = ?,
        resource_category = ?,
        external_url = ?,
        sort_order = ?,
        visibility = ?,
        is_downloadable = ?,
        is_active = ?
      WHERE id = ?
      `,
      [
        finalTitle,

        finalDescription,

        finalResourceType,

        finalCategory,

        finalResourceType === "link" ? finalExternalUrl : null,

        finalSortOrder,

        finalVisibility,

        finalResourceType === "link" ? 0 : finalIsDownloadable,

        finalIsActive,

        id,
      ],
    );

    /**
     * =====================================================
     * GET UPDATED
     * =====================================================
     */

    const [updated] = await db.query(
      `
      SELECT *
      FROM lesson_resources
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    return res.json({
      success: true,
      message: "Đã cập nhật tài nguyên",
      data: updated[0],
    });
  } catch (error) {
    console.error("❌ update lessonResource:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật tài nguyên",
    });
  }
};

/**
 * =========================================================
 * DELETE
 *
 * Xóa DB + file thật
 *
 * DELETE /api/lessons/resources/:id
 * =========================================================
 */

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    const churchId = getChurchId(req);

    const [rows] = await db.query(
      `
      SELECT *
      FROM lesson_resources
      WHERE id = ?
        AND (
          church_id IS NULL
          OR church_id = ?
        )
      LIMIT 1
      `,
      [id, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài nguyên",
      });
    }

    const resource = rows[0];

    /**
     * Xóa DB trước
     */
    await db.query(
      `
      DELETE FROM lesson_resources
      WHERE id = ?
      `,
      [id],
    );

    /**
     * Xóa file thật
     *
     * Chỉ xử lý file nội bộ
     */
    if (resource.file_name && resource.lesson_id) {
      const filePath = path.join(
        __dirname,
        "..",
        "uploads",
        "lessons",
        String(resource.lesson_id),
        resource.file_url
          ? decodeURIComponent(resource.file_url.split("/").pop())
          : resource.file_name,
      );

      removeFile(filePath);
    }

    return res.json({
      success: true,
      message: "Đã xóa tài nguyên và file",
    });
  } catch (error) {
    console.error("❌ remove lessonResource:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa tài nguyên",
    });
  }
};

/**
 * =========================================================
 * STATUS
 * =========================================================
 */

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const churchId = getChurchId(req);

    const { is_active } = req.body;

    if (is_active === undefined) {
      return res.status(400).json({
        success: false,
        message: "Thiếu is_active",
      });
    }

    const [result] = await db.query(
      `
      UPDATE lesson_resources
      SET is_active = ?
      WHERE id = ?
        AND (
          church_id IS NULL
          OR church_id = ?
        )
      `,
      [is_active ? 1 : 0, id, churchId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài nguyên",
      });
    }

    return res.json({
      success: true,
      message: is_active ? "Đã hiển thị tài nguyên" : "Đã ẩn tài nguyên",
    });
  } catch (error) {
    console.error("❌ updateStatus:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái",
    });
  }
};

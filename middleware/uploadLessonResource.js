const multer = require("multer");
const path = require("path");
const fs = require("fs");

/**
 * =========================================================
 * CẤU HÌNH
 * =========================================================
 */

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "lessons");

/**
 * =========================================================
 * WHITELIST EXTENSION
 * =========================================================
 */

const ALLOWED_EXTENSIONS = new Set([
  // PowerPoint
  ".ppt",
  ".pptx",

  // PDF
  ".pdf",

  // Word
  ".doc",
  ".docx",

  // Excel
  ".xls",
  ".xlsx",

  // Images
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",

  // Video
  ".mp4",
  ".webm",
  ".mov",

  // Audio
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",

  // Archive
  ".zip",
]);

/**
 * =========================================================
 * WHITELIST MIME
 * =========================================================
 */

const ALLOWED_MIME_TYPES = new Set([
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  // PDF
  "application/pdf",

  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",

  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",

  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",

  // ZIP
  "application/zip",
]);

/**
 * =========================================================
 * TÊN FILE AN TOÀN
 * =========================================================
 */

const sanitizeFileName = (fileName) => {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

/**
 * =========================================================
 * STORAGE
 * =========================================================
 */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const lessonId = req.params.lessonId;

      if (!lessonId) {
        return cb(new Error("Không xác định được lessonId"));
      }

      const lessonFolder = path.join(UPLOAD_ROOT, String(lessonId));

      /**
       * Tạo thư mục nếu chưa tồn tại
       */
      fs.mkdirSync(lessonFolder, {
        recursive: true,
      });

      cb(null, lessonFolder);
    } catch (error) {
      cb(error);
    }
  },

  filename: (req, file, cb) => {
    try {
      const originalName = path.basename(file.originalname);

      const ext = path.extname(originalName).toLowerCase();

      const nameWithoutExt = path.basename(originalName, ext);

      const safeName = sanitizeFileName(nameWithoutExt);

      const timestamp = Date.now();

      const random = Math.random().toString(36).substring(2, 8);

      const finalName = `${safeName}-${timestamp}-${random}${ext}`;

      cb(null, finalName);
    } catch (error) {
      cb(error);
    }
  },
});

/**
 * =========================================================
 * FILE FILTER
 * =========================================================
 */

const fileFilter = (req, file, cb) => {
  try {
    const extension = path.extname(file.originalname).toLowerCase();

    const mimeType = file.mimetype;

    /**
     * Extension không được phép
     */
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return cb(new Error(`Định dạng file không được hỗ trợ: ${extension}`));
    }

    /**
     * MIME không được phép
     */
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return cb(new Error(`Loại file không được hỗ trợ: ${mimeType}`));
    }

    cb(null, true);
  } catch (error) {
    cb(error);
  }
};

/**
 * =========================================================
 * MULTER
 * =========================================================
 */

const uploadLessonResource = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE,

    /**
     * Chỉ cho phép upload 1 file/lần
     */
    files: 1,
  },

  fileFilter,
});

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = {
  uploadLessonResource,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  UPLOAD_ROOT,
};

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// =====================================================
// TẠO THƯ MỤC
// =====================================================

const audioDir = path.join(__dirname, "../uploads/media/audio");

const videoDir = path.join(__dirname, "../uploads/media/video");

const thumbnailDir = path.join(__dirname, "../uploads/media/thumbnails");

[audioDir, videoDir, thumbnailDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true,
    });
  }
});

// =====================================================
// STORAGE
// =====================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "audio") {
      cb(null, audioDir);
      return;
    }

    if (file.fieldname === "video") {
      cb(null, videoDir);
      return;
    }

    if (file.fieldname === "thumbnail") {
      cb(null, thumbnailDir);
      return;
    }

    cb(new Error("Loại file không hợp lệ"));
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    const baseName = path
      .basename(file.originalname, ext)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();

    const uniqueName = `${Date.now()}-${baseName}${ext}`;

    cb(null, uniqueName);
  },
});

// =====================================================
// FILE FILTER
// =====================================================

const fileFilter = (req, file, cb) => {
  // AUDIO
  if (file.fieldname === "audio") {
    const allowed = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/aac",
      "audio/ogg",
      "audio/webm",
      "audio/x-m4a",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          "File audio không hợp lệ. Chỉ hỗ trợ MP3, WAV, M4A, AAC, OGG, WEBM.",
        ),
      );
    }

    return cb(null, true);
  }

  // VIDEO
  if (file.fieldname === "video") {
    const allowed = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error("File video không hợp lệ. Chỉ hỗ trợ MP4, WEBM, MOV, MKV."),
      );
    }

    return cb(null, true);
  }

  // THUMBNAIL
  if (file.fieldname === "thumbnail") {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Thumbnail phải là JPG, PNG hoặc WEBP."));
    }

    return cb(null, true);
  }

  cb(new Error("Field upload không hợp lệ"));
};

// =====================================================
// MULTER
// =====================================================

const upload = multer({
  storage,

  fileFilter,

  limits: {
    // 500MB
    fileSize: 500 * 1024 * 1024,
  },
});

module.exports = upload;

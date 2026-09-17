const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==========================================
// TẠO THƯ MỤC UPLOAD
// ==========================================

const uploadDir = path.join(process.cwd(), "uploads", "students");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

// ==========================================
// STORAGE
// ==========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const uniqueName = `student-${Date.now()}-${Math.round(
      Math.random() * 1e9,
    )}${ext}`;

    cb(null, uniqueName);
  },
});

// ==========================================
// FILE FILTER
// ==========================================

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Chỉ cho phép ảnh JPG, JPEG, PNG hoặc WEBP"), false);
  }

  cb(null, true);
};

// ==========================================
// UPLOAD
// ==========================================

const uploadStudentAvatar = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = uploadStudentAvatar;

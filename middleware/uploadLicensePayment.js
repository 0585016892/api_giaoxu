const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(process.cwd(), "uploads", "license-payments");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "");

    const timestamp = Date.now();

    const random = Math.random().toString(36).substring(2, 10);

    cb(null, `license-${timestamp}-${random}${safeExt}`);
  },
});

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP"));
  }

  cb(null, true);
};

const uploadLicensePayment = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = uploadLicensePayment;

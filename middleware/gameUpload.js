const multer = require("multer");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  const audioTypes = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
  ];

  if (file.fieldname === "thumbnail" || file.fieldname === "background") {
    if (!imageTypes.includes(file.mimetype)) {
      return cb(new Error("Thumbnail/background phải là file hình ảnh"));
    }
  }

  if (
    file.fieldname === "backgroundMusic" ||
    file.fieldname === "correctSound" ||
    file.fieldname === "wrongSound"
  ) {
    if (!audioTypes.includes(file.mimetype)) {
      return cb(new Error("File âm thanh không hợp lệ"));
    }
  }

  cb(null, true);
};

module.exports = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter,
});

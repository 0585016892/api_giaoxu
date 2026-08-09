const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Định nghĩa đường dẫn thư mục lưu file
const uploadDir = path.join(__dirname, "../uploads/documents");

// Tự động kiểm tra và tạo thư mục nếu chưa có
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình lưu trữ tệp (DiskStorage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Lưu file vào uploads/documents
  },
  filename: (req, file, cb) => {
    // Đổi tên file để tránh trùng lặp: timestamp + tên gốc
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);

    // Tạo tên file an toàn
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

// Bộ lọc file (chỉ cho phép PDF, Word, Excel, Images...)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Định dạng file không được hỗ trợ!"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // Giới hạn 20MB
  fileFilter: fileFilter,
});

module.exports = upload;

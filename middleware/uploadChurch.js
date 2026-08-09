const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 1. Tự động kiểm tra & tạo thư mục 'uploads/' nếu chưa tồn tại
const uploadDir = path.join(__dirname, "../uploads/church");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. Cấu hình nơi lưu trữ và đổi tên file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Lưu file vào thư mục uploads
  },
  filename: (req, file, cb) => {
    // Tạo tên file độc nhất: image-1715000000000-123456789.jpg
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// 3. Bộ lọc định dạng file (Chỉ chấp nhận file hình ảnh)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extName = allowedTypes.test(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimeType = allowedTypes.test(file.mimetype);

  if (extName && mimeType) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Chỉ chấp nhận các định dạng file ảnh (jpg, jpeg, png, gif, webp)!",
      ),
    );
  }
};

// 4. Khởi tạo Multer với cấu hình
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Giới hạn kích thước tối đa 5MB
  },
});

module.exports = upload;

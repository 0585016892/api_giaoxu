const multer = require("multer");

const upload = multer({
  dest: "uploads/",
});

router.post("/pdf", upload.single("file"), uploadController.upload);

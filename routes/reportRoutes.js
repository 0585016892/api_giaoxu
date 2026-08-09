const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

// 1. Thống kê theo loại
router.get("/church", reportController.getChurchStats);
router.get("/document", reportController.getDocumentStats);
router.get("/event", reportController.getEventStats);
router.get("/exam", reportController.getExamResultStats);
router.get("/parishioners", reportController.getParishionerStats);
router.get("/liturgical", reportController.getLiturgicalStats);
router.get("/visitors", reportController.getVisitorStats);

// 2. API Xuất báo cáo CSV / Excel (Tải về trực tiếp)
router.get("/export/:type", reportController.exportReport);

module.exports = router;

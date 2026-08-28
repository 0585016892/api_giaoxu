const express = require("express");
const router = express.Router();
const catechistController = require("../controllers/catechistController");

// Routes quản lý Giáo lý viên
router.get("/", catechistController.getAllCatechists);
router.get("/:id", catechistController.getCatechistById);
router.post("/", catechistController.createCatechist);
router.put("/:id", catechistController.updateCatechist);
router.delete("/:id", catechistController.deleteCatechist);

// Route phân lớp
router.post("/assign-class", catechistController.assignClass);

module.exports = router;

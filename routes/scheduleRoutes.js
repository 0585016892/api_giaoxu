const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/scheduleController");

/* =========================
   SCHEDULE (TUẦN)
========================= */

// tạo tuần mới
router.post("/", ctrl.createSchedule);

// lấy lịch theo tuần + giáo họ
router.get("/week", ctrl.getWeekSchedule);
router.get("/mass", ctrl.getMassSchedule);

// copy tuần trước → tuần sau / hoặc từ schedule này sang schedule khác
router.post("/copy", ctrl.copyWeek);

// generate cả năm phụng vụ
router.post("/generate-year", ctrl.generateYear);

/* =========================
   EVENT (LỄ TRONG TUẦN)
========================= */

// thêm lễ (auto detect schedule nếu thiếu schedule_id)
router.post("/event", ctrl.addEvent);

// cập nhật lễ
router.put("/event/:id", ctrl.updateEvent);

// xoá lễ
router.delete("/event/:id", ctrl.deleteEvent);

// toggle lễ quan trọng (priority)
router.patch("/event/:id/priority", ctrl.togglePriority);

/* =========================
   (OPTIONAL FUTURE)
========================= */

// // publish schedule
// router.patch("/:id/publish", ctrl.publishSchedule);

// // lấy danh sách năm phụng vụ
// router.get("/years", ctrl.getYears);

// // tạo năm phụng vụ
// router.post("/years", ctrl.createYear);

module.exports = router;

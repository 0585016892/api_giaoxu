const express = require("express");
const cors = require("cors");

const { corsOptions } = require("./config/cors");

const { errorHandler } = require("./middleware/errorHandler");

// ===============================
// ROUTES
// ===============================

const prayerRoutes = require("./routes/prayerRoutes");
const authRoutes = require("./routes/authRoutes");
const slidesRoutes = require("./routes/slideRoutes");
const eventsRoutes = require("./routes/eventRoutes");
const schedulesRoutes = require("./routes/scheduleRoutes");
const churchRoutes = require("./routes/church.routes");
const groupRoutes = require("./routes/groupRoutes");
const adminRoutes = require("./routes/adminRoutes");
const dashboardRoutes = require("./routes/dashboard.routes");
const activityLogRoutes = require("./routes/activityLogRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const setRoutes = require("./routes/settings.routes");
const lessonRoutes = require("./routes/lessonRoutes");
const questionRoutes = require("./routes/questionRoutes");
const galleryRoutes = require("./routes/galleryRoutes");
const parishionerRoutes = require("./routes/parishionerRoutes");
const examResultRoutes = require("./routes/examResultRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const ragRoutes = require("./routes/ragRoutes");
const contactRoutes = require("./routes/contactRoutes");
const statRoutes = require("./routes/statRoutes");
const documentsRoutes = require("./routes/documentsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const sacramentRoutes = require("./routes/sacramentRoutes");
const sitemap = require("./routes/sitemap");
const mediaRoutes = require("./routes/mediaRoutes");
const studentRoutes = require("./routes/studentRoutes");
const classRoutes = require("./routes/classRoutes");
const classStudentRoutes = require("./routes/classStudentRoutes");
const catechistRoutes = require("./routes/catechistRoutes");
const gameRoutes = require("./routes/gameRoutes");
const resultRoutes = require("./routes/resultRoutes");
const dailyVerseRoutes = require("./routes/dailyVerseRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const corsRoutes = require("./routes/corsRoutes");

// ===============================
// APP
// ===============================

const app = express();

// ===============================
// CORS
// ===============================

app.use(cors(corsOptions));

// ===============================
// BODY
// ===============================

app.use(
  express.json({
    limit: "10mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  }),
);

// ===============================
// STATIC
// ===============================

app.use("/uploads", express.static("uploads"));

// ===============================
// API ROUTES
// ===============================

app.use("/api/prayers", prayerRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/slides", slidesRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/schedules", schedulesRoutes);
app.use("/api/churches", churchRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/settings", setRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/gallery", galleryRoutes);
app.use("/api/parishioners", parishionerRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/exam-results", examResultRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/stats", statRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/sacraments", sacramentRoutes);
app.use("/api/sitemap", sitemap);
app.use("/api/media", mediaRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/class-students", classStudentRoutes);
app.use("/api/catechist", catechistRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/daily-verses", dailyVerseRoutes);
app.use("/api/attendance", attendanceRoutes);

// ===============================
// CORS MANAGEMENT
// ===============================

app.use("/api/cors", corsRoutes);

// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "API public hoạt động!",
    data: {
      name: "Giaoxu API",
      status: "online",
      time: new Date(),
    },
  });
});

// ===============================
// ERROR HANDLER
// ===============================

app.use(errorHandler);

module.exports = app;

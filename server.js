const express = require("express");
const cors = require("cors");
const http = require("http");

require("dotenv").config({
  path: __dirname + "/.env",
});

console.log("DB_HOST =", process.env.DB_HOST);
console.log("DB_USER =", process.env.DB_USER);

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

// ===============================
// SOCKET
// ===============================

const { initSocket, getIO } = require("./socket/socket");

const chatSocket = require("./socket/chatSocket");
const visitorSocket = require("./socket/visitorSocket");
// ===============================
// APP
// ===============================

const app = express();

const server = http.createServer(app);

// ===============================
// INIT SOCKET ONLY 1 TIME
// ===============================

initSocket(server);

// lấy instance socket chung

const io = getIO();
app.set("io", io);

// đăng ký chatbot

chatSocket(io);
visitorSocket(io);

// ===============================
// CRON JOB
// ===============================

const { startMassCron } = require("./jobs/mass.job");

startMassCron();

// ===============================
// CORS
// ===============================

const allowedOrigins = [
  "http://localhost:3000",

  "http://localhost:3001",

  "https://giaoxudongquan.site",

  "https://www.giaoxudongquan.site",

  "https://ffcf-118-70-186-232.ngrok-free.app",
  "https://quantrigiaoly.vercel.app",
  "https://giaolyso.site",
  "https://www.giaolyso.site",
];

const corsOptions = {
  origin: (origin, callback) => {
    console.log("🌍 Origin:", origin);

    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      console.log("✅ CORS OK:", origin);

      return callback(null, true);
    }

    console.log("❌ CORS BLOCK:", origin);

    callback(new Error("Not allowed by CORS"));
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",

    "Authorization",

    "ngrok-skip-browser-warning",
  ],
};

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
// API
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
// ERROR
// ===============================

app.use((err, req, res, next) => {
  console.error("❌ SERVER ERROR:", err);

  res.status(500).json({
    success: false,

    message: err.message || "Internal Server Error",
  });
});

// ===============================
// BACKUP
// ===============================

const { initAutoBackup } = require("./utils/autoBackup");

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 12003;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  initAutoBackup();
});

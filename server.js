require("dotenv").config({
  path: __dirname + "/.env",
});

const http = require("http");

const app = require("./app");

const { initSocket, getIO } = require("./socket/socket");
const chatSocket = require("./socket/chatSocket");
const visitorSocket = require("./socket/visitorSocket");

const { startMassCron } = require("./jobs/mass.job");
const { initAutoBackup } = require("./utils/autoBackup");

const { loadCorsOrigins } = require("./services/cors.service");

const PORT = process.env.PORT || 12003;

const server = http.createServer(app);

const startServer = async () => {
  try {
    console.log("=================================");
    console.log("🚀 STARTING API SERVER");
    console.log("=================================");

    console.log("DB_HOST =", process.env.DB_HOST);
    console.log("DB_USER =", process.env.DB_USER);

    // ===============================
    // CORS
    // ===============================

    await loadCorsOrigins();

    // ===============================
    // SOCKET
    // ===============================

    initSocket(server);

    const io = getIO();

    app.set("io", io);

    chatSocket(io);
    visitorSocket(io);

    // ===============================
    // CRON
    // ===============================

    startMassCron();

    // ===============================
    // SERVER
    // ===============================

    server.listen(PORT, () => {
      console.log("=================================");
      console.log(`🚀 API running: http://localhost:${PORT}`);
      console.log(`🌐 Port: ${PORT}`);
      console.log("=================================");

      // Backup chạy sau khi server start
      initAutoBackup();
    });
  } catch (error) {
    console.error("=================================");
    console.error("❌ SERVER START ERROR");
    console.error("=================================");
    console.error(error);

    process.exit(1);
  }
};

startServer();

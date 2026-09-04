const { Server } = require("socket.io");

let io = null;

// ============================================================
// LƯU HỌC VIÊN ĐANG THI
// ============================================================

const studentsDoingExam = new Map();

// ============================================================
// INIT SOCKET
// ============================================================

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://localhost:3002",

        "https://giaoxudongquan.site",
        "https://www.giaoxudongquan.site",

        "https://ffcf-118-70-186-232.ngrok-free.app",
        "https://giaolyso.site",
        "https://www.giaolyso.site",
      ],

      methods: ["GET", "POST"],

      credentials: true,
    },
  });

  // ==========================================================
  // CONNECTION
  // ==========================================================

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    // ========================================================
    // NOTIFICATION - USER JOIN ROOM
    // ========================================================

    /**
     * Frontend gửi:
     *
     * socket.emit("join:user", {
     *   userId: user.id,
     *   churchId: user.church_id,
     * });
     */

    socket.on("join:user", (data = {}) => {
      const userId = Number(data.userId);

      const churchId = Number(data.churchId);

      if (!Number.isInteger(userId) || userId <= 0) {
        console.warn("⚠️ Invalid userId:", data.userId);

        return;
      }

      // ====================================================
      // LƯU USER ID VÀO SOCKET
      // ====================================================

      socket.userId = userId;
      socket.churchId =
        Number.isInteger(churchId) && churchId > 0 ? churchId : null;

      // ====================================================
      // JOIN ROOM RIÊNG USER
      // ====================================================

      socket.join(`user:${userId}`);

      console.log(`🔔 User ${userId} joined room user:${userId}`);

      // ====================================================
      // JOIN ROOM GIÁO XỨ
      // ====================================================

      if (socket.churchId) {
        socket.join(`church:${socket.churchId}`);

        console.log(`⛪ User ${userId} joined room church:${socket.churchId}`);
      }
    });

    // ========================================================
    // LEAVE USER ROOM
    // ========================================================

    socket.on("leave:user", (data = {}) => {
      const userId = Number(data.userId);

      const churchId = Number(data.churchId);

      if (Number.isInteger(userId) && userId > 0) {
        socket.leave(`user:${userId}`);
      }

      if (Number.isInteger(churchId) && churchId > 0) {
        socket.leave(`church:${churchId}`);
      }

      console.log(`🔕 User ${userId} left notification room`);
    });

    // ========================================================
    // CHATBOT AI
    // ========================================================

    /*
      chatbot sẽ đăng ký ở chatSocket.js

      Không viết chatbot ở đây
      để tách module.
    */

    // ========================================================
    // HỌC VIÊN BẮT ĐẦU LÀM BÀI
    // ========================================================

    socket.on("student_exam_start", (data = {}) => {
      console.log("📝 Student start exam:", data);

      if (!data.examCode) {
        return;
      }

      studentsDoingExam.set(data.examCode, {
        socketId: socket.id,
        ...data,
      });

      io.emit("students_doing_exam", Array.from(studentsDoingExam.values()));
    });

    // ========================================================
    // HỌC VIÊN NỘP BÀI
    // ========================================================

    socket.on("student_exam_end", (data = {}) => {
      console.log("✅ Student end exam:", data);

      if (data.examCode) {
        studentsDoingExam.delete(data.examCode);
      }

      io.emit("students_doing_exam", Array.from(studentsDoingExam.values()));
    });

    // ========================================================
    // ADMIN XEM DANH SÁCH ĐANG THI
    // ========================================================

    socket.on("get_students_doing_exam", () => {
      socket.emit(
        "students_doing_exam",
        Array.from(studentsDoingExam.values()),
      );
    });

    // ========================================================
    // DISCONNECT
    // ========================================================

    socket.on("disconnect", (reason) => {
      console.log("🔴 Socket disconnected:", socket.id, reason);

      // ----------------------------------------------------
      // XÓA HỌC VIÊN ĐANG THI
      // ----------------------------------------------------

      for (const [examCode, student] of studentsDoingExam.entries()) {
        if (student.socketId === socket.id) {
          studentsDoingExam.delete(examCode);
        }
      }

      io.emit("students_doing_exam", Array.from(studentsDoingExam.values()));
    });
  });

  console.log("🚀 Socket.io initialized");

  return io;
};

// ============================================================
// GET IO
// ============================================================

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io chưa được khởi tạo");
  }

  return io;
};

module.exports = {
  initSocket,
  getIO,
};

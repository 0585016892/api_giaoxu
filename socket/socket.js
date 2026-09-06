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
        "http://localhost:3001",

        "https://giaoxudongquan.site",
        "https://www.giaoxudongquan.site",

        "https://giaolyso.site",
        "https://www.giaolyso.site",
        "https://quantridongquan.vercel.app",

        "https://ffcf-118-70-186-232.ngrok-free.app",
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
    // USER JOIN CHURCH ROOM
    // ========================================================

    socket.on("join:user", (data = {}) => {
      try {
        const userId = Number(data.userId);

        const churchId = Number(data.churchId);

        // ----------------------------------------------------
        // VALIDATE USER
        // ----------------------------------------------------

        if (!Number.isInteger(userId) || userId <= 0) {
          console.warn("⚠️ Invalid userId when join socket:", data.userId);

          return;
        }

        // ----------------------------------------------------
        // SAVE SOCKET DATA
        // ----------------------------------------------------

        socket.userId = userId;

        socket.churchId =
          Number.isInteger(churchId) && churchId > 0 ? churchId : null;

        // ----------------------------------------------------
        // JOIN USER ROOM
        // ----------------------------------------------------

        socket.join(`user:${userId}`);

        console.log(`👤 User ${userId} joined room: user:${userId}`);

        // ----------------------------------------------------
        // JOIN CHURCH ROOM
        // ----------------------------------------------------

        if (socket.churchId) {
          socket.join(`church:${socket.churchId}`);

          console.log(
            `⛪ User ${userId} joined room: church:${socket.churchId}`,
          );
        }
      } catch (error) {
        console.error("❌ JOIN USER SOCKET ERROR:", error);
      }
    });

    // ========================================================
    // LEAVE USER / CHURCH ROOM
    // ========================================================

    socket.on("leave:user", (data = {}) => {
      try {
        const userId = Number(data.userId);

        const churchId = Number(data.churchId);

        // ----------------------------------------------------
        // LEAVE USER ROOM
        // ----------------------------------------------------

        if (Number.isInteger(userId) && userId > 0) {
          socket.leave(`user:${userId}`);

          console.log(`👤 User ${userId} left room: user:${userId}`);
        }

        // ----------------------------------------------------
        // LEAVE CHURCH ROOM
        // ----------------------------------------------------

        if (Number.isInteger(churchId) && churchId > 0) {
          socket.leave(`church:${churchId}`);

          console.log(`⛪ User ${userId} left room: church:${churchId}`);
        }
      } catch (error) {
        console.error("❌ LEAVE USER SOCKET ERROR:", error);
      }
    });

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
      console.log("🔴 Socket disconnected:", socket.id, "| Reason:", reason);

      // ----------------------------------------------------
      // XÓA HỌC VIÊN ĐANG THI
      // ----------------------------------------------------

      let hasChanged = false;

      for (const [examCode, student] of studentsDoingExam.entries()) {
        if (student.socketId === socket.id) {
          studentsDoingExam.delete(examCode);

          hasChanged = true;
        }
      }

      if (hasChanged) {
        io.emit("students_doing_exam", Array.from(studentsDoingExam.values()));
      }
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

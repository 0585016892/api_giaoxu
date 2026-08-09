const { Server } = require("socket.io");

let io = null;

// Lưu học viên đang thi
const studentsDoingExam = new Map();

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
      ],

      methods: ["GET", "POST"],

      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    /*
      ======================================
      CHATBOT AI EVENT
      ======================================
      */

    // chatbot sẽ đăng ký ở chatSocket.js
    // không viết ở đây để tách module

    /*
      ======================================
      HỌC VIÊN BẮT ĐẦU LÀM BÀI
      ======================================
      */

    socket.on("student_exam_start", (data) => {
      console.log("📝 Student start exam:", data);

      if (!data.examCode) return;

      studentsDoingExam.set(
        data.examCode,

        {
          socketId: socket.id,

          ...data,
        },
      );

      io.emit(
        "students_doing_exam",

        Array.from(studentsDoingExam.values()),
      );
    });

    /*
      ======================================
      HỌC VIÊN NỘP BÀI
      ======================================
      */

    socket.on(
      "student_exam_end",

      (data) => {
        console.log("✅ Student end exam:", data);

        if (data.examCode) {
          studentsDoingExam.delete(data.examCode);
        }

        io.emit(
          "students_doing_exam",

          Array.from(studentsDoingExam.values()),
        );
      },
    );

    /*
      ======================================
      ADMIN XEM DANH SÁCH ĐANG THI
      ======================================
      */

    socket.on(
      "get_students_doing_exam",

      () => {
        socket.emit(
          "students_doing_exam",

          Array.from(studentsDoingExam.values()),
        );
      },
    );

    /*
      ======================================
      DISCONNECT
      ======================================
      */

    socket.on(
      "disconnect",

      () => {
        console.log(
          "🔴 Socket disconnected:",

          socket.id,
        );

        for (const [examCode, student] of studentsDoingExam.entries()) {
          if (student.socketId === socket.id) {
            studentsDoingExam.delete(examCode);
          }
        }

        io.emit(
          "students_doing_exam",

          Array.from(studentsDoingExam.values()),
        );
      },
    );
  });

  console.log("🚀 Socket.io initialized");
};

// lấy socket dùng ở module khác

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

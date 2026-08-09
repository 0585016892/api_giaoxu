const chatbotService = require("../services/chatbotService");

const { saveMessage } = require("../services/chatHistoryService");

function chatSocket(io) {
  if (!io) {
    console.error("❌ Socket.io instance không tồn tại");
    return;
  }

  io.on("connection", (socket) => {
    console.log("🟢 Chat user connected:", socket.id);

    socket.on("chat_message", async (data) => {
      try {
        const { sessionId, message } = data;

        if (!sessionId || !message || !message.trim()) {
          socket.emit("chat_error", {
            message: "Dữ liệu không hợp lệ",
          });

          return;
        }

        console.log("💬 User:", message);

        // lưu câu hỏi người dùng

        await saveMessage(sessionId, "user", message);

        let answer = "";

        // báo AI đang xử lý

        socket.emit("chat_start");

        // gọi RAG + OpenRouter Streaming

        await chatbotService.chatStream(message, (token) => {
          answer += token;

          socket.emit("chat_stream", {
            token,
          });
        });

        // kết thúc stream

        socket.emit("chat_end");

        // lưu câu trả lời

        if (answer.trim()) {
          await saveMessage(sessionId, "assistant", answer);
        }

        console.log("🤖 AI:", answer);
      } catch (error) {
        console.error("❌ SOCKET CHAT ERROR:", error);

        socket.emit("chat_error", {
          message: "Trợ lý AI đang gặp lỗi, vui lòng thử lại.",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Chat disconnected:", socket.id);
    });
  });
}

module.exports = chatSocket;

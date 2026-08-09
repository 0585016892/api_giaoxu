const onlineUsers = new Map();

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("🟢 SOCKET CONNECT VISITOT:", socket.id);

    socket.on("join-visitor", (sessionId) => {
      console.log("👤 JOIN VISITOR:", sessionId);

      onlineUsers.set(sessionId, socket.id);

      io.emit("onlineCount", onlineUsers.size);

      console.log("ONLINE:", onlineUsers.size);
    });

    socket.on("disconnect", () => {
      console.log("🔴 SOCKET DISCONNECT:", socket.id);
    });
  });
};

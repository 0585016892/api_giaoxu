require("dotenv").config();
const http = require("http");
const app = require("./app");
const { initSocket } = require("./socket/socket");
const { startMassJob } = require("./jobs/mass.job");

const server = http.createServer(app);

// init socket
initSocket(server);

// start cron job
startMassJob();

server.listen(process.env.PORT, () => {
  console.log("🚀 Server running on port " + process.env.PORT);
});

const cron = require("node-cron");
const { checkTodayMass } = require("../services/mass.service");

const startMassCron = () => {
  cron.schedule("*/30 * * * *", async () => {
    console.log("⏰ Checking today mass... (30 phút/lần)");
    await checkTodayMass();
  });
};

module.exports = {
  startMassCron,
};

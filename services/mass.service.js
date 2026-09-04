const db = require("../config/db");

const { createNotification } = require("./notificationService");

let notifiedToday = false;

async function checkTodayMass() {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        title,
        event_time,
        church_name
      FROM liturgical_events
      WHERE event_date = CURDATE()
    `);

    if (rows.length > 0 && !notifiedToday) {
      await createNotification({
        type: "TODAY_MASS",

        title: "Lịch lễ hôm nay",

        content: `Hôm nay có ${rows.length} lịch lễ`,

        related_type: "liturgical_events",
        target_role: "admin",
        related_id: rows[0].id,
        is_read: false,
      });

      console.log("📢 Đã tạo notification");

      notifiedToday = true;
    }

    if (rows.length === 0) {
      notifiedToday = false;
    }
  } catch (err) {
    console.error("❌ checkTodayMass:", err);
  }
}

module.exports = {
  checkTodayMass,
};

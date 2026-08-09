const db = require("../config/db");

exports.getDashboard = async (req, res) => {
  try {
    // =============================
    // 1️⃣ COUNT TỔNG QUAN
    // =============================
    const [
      [adminsCount],
      [churchesCount],
      [eventsCount],
      [groupsCount],
      [prayersCount],
      [slidesCount],
      [liturgicalCount],
      [visitorsCount],
      [totalVisitsCount],
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) as total FROM admins`),
      db.query(`SELECT COUNT(*) as total FROM churches`),
      db.query(`SELECT COUNT(*) as total FROM events`),
      db.query(`SELECT COUNT(*) as total FROM \`groups\``),
      db.query(`SELECT COUNT(*) as total FROM prayers`),
      db.query(`SELECT COUNT(*) as total FROM slides`),
      db.query(`SELECT COUNT(*) as total FROM liturgical_schedules`),

      // 👇 SỐ NGƯỜI TRUY CẬP DUY NHẤT
      db.query(`
        SELECT COUNT(DISTINCT ip_address) as total
        FROM activity_logs
      `),

      // 👇 TỔNG LƯỢT TRUY CẬP
      db.query(`
        SELECT COUNT(*) as total
        FROM activity_logs
      `),
    ]);

    // =============================
    // 2️⃣ THỐNG KÊ THEO TRẠNG THÁI
    // =============================
    const [[activeAdmins]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM admins 
      WHERE is_active = 1
    `);

    const [[publishedSchedules]] = await db.query(`
      SELECT COUNT(*) as total
      FROM liturgical_schedules
      WHERE status = 'PUBLISHED'
    `);

    // =============================
    // 3️⃣ 5 SỰ KIỆN MỚI NHẤT
    // =============================
    const [recentEvents] = await db.query(`
      SELECT id, title, event_date, created_at
      FROM events
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // =============================
    // 4️⃣ 5 SỰ KIỆN SẮP DIỄN RA
    // =============================
    const [upcomingEvents] = await db.query(`
      SELECT 
        id,
        title,
        event_date,
        event_time,
        type,
        church_name,
        priest,
        is_priority
      FROM liturgical_events
      WHERE event_date >= CURDATE()
      ORDER BY 
        is_priority DESC,
        event_date ASC,
        event_time ASC
      LIMIT 5
    `);

    // =============================
    // 5️⃣ 5 NHÓM MỚI NHẤT
    // =============================
    const [recentGroups] = await db.query(`
      SELECT id, name, created_at
      FROM \`groups\`
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // =============================
    // 6️⃣ LỊCH PHỤNG VỤ TUẦN NÀY
    // =============================
    const [currentWeekSchedule] = await db.query(`
      SELECT id, title, week_start, week_end, status
      FROM liturgical_schedules
      WHERE CURDATE() BETWEEN week_start AND week_end
      LIMIT 1
    `);

    // =============================
    // 7️⃣ 5 LỊCH PHỤNG VỤ SẮP TỚI
    // =============================
    const [upcomingSchedules] = await db.query(`
      SELECT id, title, week_start, week_end, status
      FROM liturgical_schedules
      WHERE week_start >= CURDATE()
      ORDER BY week_start ASC
      LIMIT 5
    `);

    // =============================
    // 8️⃣ THỐNG KÊ EVENTS THEO THÁNG
    // =============================
    const [monthlyEvents] = await db.query(`
      SELECT 
        MONTH(event_date) as month,
        COUNT(*) as total
      FROM events
      WHERE YEAR(event_date) = YEAR(CURDATE())
      GROUP BY MONTH(event_date)
      ORDER BY month ASC
    `);

    // =============================
    // RESPONSE
    // =============================
    res.json({
      success: true,
      stats: {
        totalAdmins: adminsCount[0].total,
        activeAdmins: activeAdmins.total,
        totalChurches: churchesCount[0].total,
        totalEvents: eventsCount[0].total,
        totalGroups: groupsCount[0].total,
        totalPrayers: prayersCount[0].total,
        totalSlides: slidesCount[0].total,
        totalLiturgicalSchedules: liturgicalCount[0].total,
        publishedSchedules: publishedSchedules.total,

        // 👇 VISITOR STATS
        totalVisitors: visitorsCount[0].total,
        totalVisits: totalVisitsCount[0].total,
      },

      recentEvents,
      upcomingEvents,
      recentGroups,
      currentWeekSchedule: currentWeekSchedule[0] || null,
      upcomingSchedules,
      monthlyEvents,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message,
    });
  }
};

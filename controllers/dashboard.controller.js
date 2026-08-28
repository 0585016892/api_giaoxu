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

// ============================================================
// DASHBOARD GIÁO LÝ VIÊN
// GET /api/dashboard/cate
// ============================================================
exports.getDashboardCate = async (req, res) => {
  try {
    // ========================================================
    // 1. TỔNG HỌC VIÊN
    // ========================================================

    const [[studentStats]] = await db.query(`
      SELECT COUNT(*) AS total_students
      FROM students
    `);

    // ========================================================
    // 2. HỌC VIÊN THÁNG NÀY
    // ========================================================

    const [[currentMonthStudents]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM students
      WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND created_at < DATE_ADD(
          DATE_FORMAT(CURDATE(), '%Y-%m-01'),
          INTERVAL 1 MONTH
        )
    `);

    // ========================================================
    // 3. HỌC VIÊN THÁNG TRƯỚC
    // ========================================================

    const [[lastMonthStudents]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM students
      WHERE created_at >= DATE_FORMAT(
        DATE_SUB(CURDATE(), INTERVAL 1 MONTH),
        '%Y-%m-01'
      )
      AND created_at < DATE_FORMAT(
        CURDATE(),
        '%Y-%m-01'
      )
    `);

    const currentStudents = Number(currentMonthStudents?.total || 0);

    const lastStudents = Number(lastMonthStudents?.total || 0);

    let studentCompare = 0;

    if (lastStudents > 0) {
      studentCompare = Math.round(
        ((currentStudents - lastStudents) / lastStudents) * 100,
      );
    } else if (currentStudents > 0) {
      studentCompare = 100;
    }

    // ========================================================
    // 4. THỐNG KÊ LỚP
    // ========================================================

    const [[classStats]] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(
          CASE
            WHEN status = 'active' THEN 1
            ELSE 0
          END
        ) AS active
      FROM classes
    `);

    // ========================================================
    // 5. TỔNG BÀI HỌC
    // ========================================================
    //
    // Không dùng created_at vì lessons của bạn chưa có cột này.
    //
    // ========================================================

    const [[lessonStats]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM lessons
    `);

    // ========================================================
    // 6. TỔNG RESULTS
    // ========================================================

    const [[resultStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_results,

        SUM(
          CASE
            WHEN score IS NOT NULL THEN 1
            ELSE 0
          END
        ) AS completed_results

      FROM results
    `);

    const totalResults = Number(resultStats?.total_results || 0);

    const completedResults = Number(resultStats?.completed_results || 0);

    // ========================================================
    // 7. TỶ LỆ HOÀN THÀNH
    // ========================================================

    const completionRate =
      totalResults > 0
        ? Math.round((completedResults / totalResults) * 100)
        : 0;

    // ========================================================
    // 8. RESULTS THÁNG NÀY
    // ========================================================

    const [[currentMonthResults]] = await db.query(`
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN score IS NOT NULL THEN 1
            ELSE 0
          END
        ) AS completed

      FROM results

      WHERE created_at >= DATE_FORMAT(
        CURDATE(),
        '%Y-%m-01'
      )

      AND created_at < DATE_ADD(
        DATE_FORMAT(
          CURDATE(),
          '%Y-%m-01'
        ),
        INTERVAL 1 MONTH
      )
    `);

    const currentMonthTotal = Number(currentMonthResults?.total || 0);

    const currentMonthCompleted = Number(currentMonthResults?.completed || 0);

    const currentMonthCompletion =
      currentMonthTotal > 0
        ? Math.round((currentMonthCompleted / currentMonthTotal) * 100)
        : 0;

    // ========================================================
    // 9. RESULTS THÁNG TRƯỚC
    // ========================================================

    const [[lastMonthResults]] = await db.query(`
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN score IS NOT NULL THEN 1
            ELSE 0
          END
        ) AS completed

      FROM results

      WHERE created_at >= DATE_FORMAT(
        DATE_SUB(
          CURDATE(),
          INTERVAL 1 MONTH
        ),
        '%Y-%m-01'
      )

      AND created_at < DATE_FORMAT(
        CURDATE(),
        '%Y-%m-01'
      )
    `);

    const lastMonthTotal = Number(lastMonthResults?.total || 0);

    const lastMonthCompleted = Number(lastMonthResults?.completed || 0);

    const lastMonthCompletion =
      lastMonthTotal > 0
        ? Math.round((lastMonthCompleted / lastMonthTotal) * 100)
        : 0;

    // ========================================================
    // 10. SO SÁNH TỶ LỆ HOÀN THÀNH
    // ========================================================

    let completionCompare = 0;

    if (lastMonthCompletion > 0) {
      completionCompare = Math.round(
        ((currentMonthCompletion - lastMonthCompletion) / lastMonthCompletion) *
          100,
      );
    } else if (currentMonthCompletion > 0) {
      completionCompare = 100;
    }

    // ========================================================
    // 11. WEEKLY PROGRESS
    // ========================================================
    //
    // Dùng results.created_at
    //
    // Tuần:
    //
    // Thứ 2 -> Chủ Nhật
    //
    // MySQL DAYOFWEEK:
    //
    // 1 = CN
    // 2 = Thứ 2
    // 3 = Thứ 3
    // 4 = Thứ 4
    // 5 = Thứ 5
    // 6 = Thứ 6
    // 7 = Thứ 7
    //
    // ========================================================

    const [weeklyRows] = await db.query(`
      SELECT
        DAYOFWEEK(created_at) AS mysql_day,
        COUNT(*) AS total

      FROM results

      WHERE created_at >= DATE_SUB(
        CURDATE(),
        INTERVAL WEEKDAY(CURDATE()) DAY
      )

      AND created_at < DATE_ADD(
        DATE_SUB(
          CURDATE(),
          INTERVAL WEEKDAY(CURDATE()) DAY
        ),
        INTERVAL 7 DAY
      )

      GROUP BY DAYOFWEEK(created_at)

      ORDER BY DAYOFWEEK(created_at)
    `);

    // ========================================================
    // 12. DEFAULT 7 NGÀY
    // ========================================================

    const weeklyMap = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
    };

    weeklyRows.forEach((row) => {
      const mysqlDay = Number(row.mysql_day);

      let dayIndex;

      // Chủ Nhật
      if (mysqlDay === 1) {
        dayIndex = 7;
      } else {
        dayIndex = mysqlDay - 1;
      }

      weeklyMap[dayIndex] = Number(row.total || 0);
    });

    // ========================================================
    // 13. CHART DATA
    // ========================================================

    const weeklyProgress = [
      {
        day: "Thứ 2",
        value: weeklyMap[1],
      },
      {
        day: "Thứ 3",
        value: weeklyMap[2],
      },
      {
        day: "Thứ 4",
        value: weeklyMap[3],
      },
      {
        day: "Thứ 5",
        value: weeklyMap[4],
      },
      {
        day: "Thứ 6",
        value: weeklyMap[5],
      },
      {
        day: "Thứ 7",
        value: weeklyMap[6],
      },
      {
        day: "CN",
        value: weeklyMap[7],
      },
    ];

    // ========================================================
    // 14. QUIZ METRICS
    // ========================================================
    //
    // Với bảng results hiện tại:
    //
    // score >= 50  -> Đúng / Đạt
    // score < 50   -> Sai / Không đạt
    // score NULL   -> Chưa hoàn thành
    //
    // ========================================================

    const [[quizStats]] = await db.query(`
      SELECT

        COUNT(*) AS total,

        SUM(
          CASE
            WHEN score IS NOT NULL
              AND score >= 50
            THEN 1
            ELSE 0
          END
        ) AS correct_count,

        SUM(
          CASE
            WHEN score IS NOT NULL
              AND score < 50
            THEN 1
            ELSE 0
          END
        ) AS wrong_count,

        SUM(
          CASE
            WHEN score IS NULL
            THEN 1
            ELSE 0
          END
        ) AS uncompleted_count

      FROM results
    `);

    const quizTotal = Number(quizStats?.total || 0);

    const correctCount = Number(quizStats?.correct_count || 0);

    const wrongCount = Number(quizStats?.wrong_count || 0);

    const uncompletedCount = Number(quizStats?.uncompleted_count || 0);

    // ========================================================
    // 15. TÍNH %
    // ========================================================

    const quizMetrics = {
      correct_pct:
        quizTotal > 0 ? Math.round((correctCount / quizTotal) * 100) : 0,

      wrong_pct: quizTotal > 0 ? Math.round((wrongCount / quizTotal) * 100) : 0,

      uncompleted_pct:
        quizTotal > 0 ? Math.round((uncompletedCount / quizTotal) * 100) : 0,
    };

    // ========================================================
    // 16. RESPONSE
    // ========================================================

    return res.status(200).json({
      status: "success",

      data: {
        // ====================================================
        // TOP METRICS
        // ====================================================

        top_metrics: {
          total_students: {
            value: Number(studentStats?.total_students || 0),

            compare_last_month_pct: studentCompare,
          },

          classes: {
            total: Number(classStats?.total || 0),

            active: Number(classStats?.active || 0),
          },

          lessons: {
            total: Number(lessonStats?.total || 0),

            // lessons chưa có created_at
            new_this_month: 0,
          },

          completion_rate: {
            value_pct: completionRate,

            compare_last_month_pct: completionCompare,
          },
        },

        // ====================================================
        // WEEKLY PROGRESS
        // ====================================================

        weekly_progress: {
          view_type: "week",

          chart_data: weeklyProgress,
        },

        // ====================================================
        // QUIZ METRICS
        // ====================================================

        quiz_metrics: quizMetrics,
      },
    });
  } catch (error) {
    console.error("❌ getDashboardCate error:", error);

    return res.status(500).json({
      status: "error",

      message: "Không thể lấy dữ liệu dashboard Giáo lý viên",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

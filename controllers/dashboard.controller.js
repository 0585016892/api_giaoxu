const db = require("../config/db");

exports.getDashboard = async (req, res) => {
  try {
    // =============================
    // 1. COUNT TỔNG QUAN
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
      db.query(`SELECT COUNT(*) AS total FROM admins`),

      db.query(`SELECT COUNT(*) AS total FROM churches`),

      db.query(`SELECT COUNT(*) AS total FROM events`),

      db.query(`SELECT COUNT(*) AS total FROM \`groups\``),

      db.query(`SELECT COUNT(*) AS total FROM prayers`),

      db.query(`SELECT COUNT(*) AS total FROM slides`),

      db.query(`SELECT COUNT(*) AS total FROM liturgical_schedules`),

      db.query(`
        SELECT COUNT(DISTINCT ip_address) AS total
        FROM activity_logs
      `),

      db.query(`
        SELECT COUNT(*) AS total
        FROM activity_logs
      `),
    ]);

    // =============================
    // 2. THỐNG KÊ THEO TRẠNG THÁI
    // =============================

    const [[activeAdmins]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM admins
      WHERE is_active = 1
    `);

    const [[publishedSchedules]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM liturgical_schedules
      WHERE status = 'PUBLISHED'
    `);

    // =============================
    // 3. 5 SỰ KIỆN MỚI NHẤT
    // =============================

    const [recentEvents] = await db.query(`
      SELECT
        id,
        title,
        event_date,
        created_at
      FROM events
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // =============================
    // 4. 5 SỰ KIỆN SẮP DIỄN RA
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
    // 5. 5 NHÓM MỚI NHẤT
    // =============================

    const [recentGroups] = await db.query(`
      SELECT
        id,
        name,
        created_at
      FROM \`groups\`
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // =============================
    // 6. LỊCH PHỤNG VỤ TUẦN NÀY
    // =============================

    const [currentWeekSchedule] = await db.query(`
      SELECT
        id,
        title,
        week_start,
        week_end,
        status
      FROM liturgical_schedules
      WHERE CURDATE() BETWEEN week_start AND week_end
      LIMIT 1
    `);

    // =============================
    // 7. 5 LỊCH PHỤNG VỤ SẮP TỚI
    // =============================

    const [upcomingSchedules] = await db.query(`
      SELECT
        id,
        title,
        week_start,
        week_end,
        status
      FROM liturgical_schedules
      WHERE week_start >= CURDATE()
      ORDER BY week_start ASC
      LIMIT 5
    `);

    // =============================
    // 8. EVENTS THEO THÁNG
    // =============================

    const [monthlyEvents] = await db.query(`
      SELECT
        MONTH(event_date) AS month,
        COUNT(*) AS total
      FROM events
      WHERE YEAR(event_date) = YEAR(CURDATE())
      GROUP BY MONTH(event_date)
      ORDER BY month ASC
    `);

    // =============================
    // RESPONSE DASHBOARD ADMIN
    // =============================

    res.json({
      success: true,

      stats: {
        totalAdmins: Number(adminsCount[0]?.total || 0),
        activeAdmins: Number(activeAdmins?.total || 0),

        totalChurches: Number(churchesCount[0]?.total || 0),

        totalEvents: Number(eventsCount[0]?.total || 0),

        totalGroups: Number(groupsCount[0]?.total || 0),

        totalPrayers: Number(prayersCount[0]?.total || 0),

        totalSlides: Number(slidesCount[0]?.total || 0),

        totalLiturgicalSchedules: Number(liturgicalCount[0]?.total || 0),

        publishedSchedules: Number(publishedSchedules?.total || 0),

        totalVisitors: Number(visitorsCount[0]?.total || 0),

        totalVisits: Number(totalVisitsCount[0]?.total || 0),
      },

      recentEvents,

      upcomingEvents,

      recentGroups,

      currentWeekSchedule: currentWeekSchedule[0] || null,

      upcomingSchedules,

      monthlyEvents,
    });
  } catch (error) {
    console.error("❌ Dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
    // 0. LẤY CHURCH ID TỪ TOKEN
    // ========================================================

    const churchId = Number(req.user?.church_id);

    console.log("==========================================");
    console.log("📊 DASHBOARD GIÁO LÝ VIÊN");
    console.log("👤 USER:", req.user);
    console.log("⛪ CHURCH ID:", churchId);
    console.log("==========================================");

    if (!churchId) {
      return res.status(403).json({
        status: "error",
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // ========================================================
    // 1. TỔNG HỌC VIÊN CỦA GIÁO XỨ
    // ========================================================

    const [[studentStats]] = await db.query(
      `
      SELECT
        COUNT(DISTINCT s.id) AS total_students

      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?
      `,
      [churchId],
    );

    // ========================================================
    // 2. HỌC VIÊN THÁNG NÀY
    // ========================================================

    const [[currentMonthStudents]] = await db.query(
      `
      SELECT
        COUNT(DISTINCT s.id) AS total

      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?

        AND s.created_at >= DATE_FORMAT(
          CURDATE(),
          '%Y-%m-01'
        )

        AND s.created_at < DATE_ADD(
          DATE_FORMAT(
            CURDATE(),
            '%Y-%m-01'
          ),
          INTERVAL 1 MONTH
        )
      `,
      [churchId],
    );

    // ========================================================
    // 3. HỌC VIÊN THÁNG TRƯỚC
    // ========================================================

    const [[lastMonthStudents]] = await db.query(
      `
      SELECT
        COUNT(DISTINCT s.id) AS total

      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?

        AND s.created_at >= DATE_FORMAT(
          DATE_SUB(
            CURDATE(),
            INTERVAL 1 MONTH
          ),
          '%Y-%m-01'
        )

        AND s.created_at < DATE_FORMAT(
          CURDATE(),
          '%Y-%m-01'
        )
      `,
      [churchId],
    );

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
    // 4. THỐNG KÊ LỚP CỦA GIÁO XỨ
    // ========================================================

    const [[classStats]] = await db.query(
      `
      SELECT
        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'active'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS active

      FROM classes

      WHERE church_id = ?
      `,
      [churchId],
    );

    // ========================================================
    // 5. TỔNG BÀI HỌC
    // ========================================================

    const [[lessonStats]] = await db.query(`
      SELECT
        COUNT(*) AS total
      FROM lessons
    `);

    // ========================================================
    // 6. TỔNG RESULTS CỦA GIÁO XỨ
    // ========================================================

    const [[resultStats]] = await db.query(
      `
      SELECT
        COUNT(DISTINCT r.id) AS total_results,

        COUNT(
          DISTINCT CASE
            WHEN r.score IS NOT NULL
            THEN r.id
          END
        ) AS completed_results

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?
      `,
      [churchId],
    );

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

    const [[currentMonthResults]] = await db.query(
      `
      SELECT
        COUNT(DISTINCT r.id) AS total,

        COUNT(
          DISTINCT CASE
            WHEN r.score IS NOT NULL
            THEN r.id
          END
        ) AS completed

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?

        AND r.created_at >= DATE_FORMAT(
          CURDATE(),
          '%Y-%m-01'
        )

        AND r.created_at < DATE_ADD(
          DATE_FORMAT(
            CURDATE(),
            '%Y-%m-01'
          ),
          INTERVAL 1 MONTH
        )
      `,
      [churchId],
    );

    const currentMonthTotal = Number(currentMonthResults?.total || 0);

    const currentMonthCompleted = Number(currentMonthResults?.completed || 0);

    const currentMonthCompletion =
      currentMonthTotal > 0
        ? Math.round((currentMonthCompleted / currentMonthTotal) * 100)
        : 0;

    // ========================================================
    // 9. RESULTS THÁNG TRƯỚC
    // ========================================================

    const [[lastMonthResults]] = await db.query(
      `
      SELECT
        COUNT(DISTINCT r.id) AS total,

        COUNT(
          DISTINCT CASE
            WHEN r.score IS NOT NULL
            THEN r.id
          END
        ) AS completed

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?

        AND r.created_at >= DATE_FORMAT(
          DATE_SUB(
            CURDATE(),
            INTERVAL 1 MONTH
          ),
          '%Y-%m-01'
        )

        AND r.created_at < DATE_FORMAT(
          CURDATE(),
          '%Y-%m-01'
        )
      `,
      [churchId],
    );

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

    const [weeklyRows] = await db.query(
      `
      SELECT
        DAYOFWEEK(r.created_at) AS mysql_day,

        COUNT(DISTINCT r.id) AS total

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?

        AND r.created_at >= DATE_SUB(
          CURDATE(),
          INTERVAL WEEKDAY(CURDATE()) DAY
        )

        AND r.created_at < DATE_ADD(
          DATE_SUB(
            CURDATE(),
            INTERVAL WEEKDAY(CURDATE()) DAY
          ),
          INTERVAL 7 DAY
        )

      GROUP BY DAYOFWEEK(r.created_at)

      ORDER BY DAYOFWEEK(r.created_at)
      `,
      [churchId],
    );

    // ========================================================
    // 12. MAP 7 NGÀY
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

    const [[quizStats]] = await db.query(
      `
      SELECT

        COUNT(DISTINCT r.id) AS total,

        COUNT(
          DISTINCT CASE
            WHEN r.score IS NOT NULL
              AND r.score >= 50
            THEN r.id
          END
        ) AS correct_count,

        COUNT(
          DISTINCT CASE
            WHEN r.score IS NOT NULL
              AND r.score < 50
            THEN r.id
          END
        ) AS wrong_count,

        COUNT(
          DISTINCT CASE
            WHEN r.score IS NULL
            THEN r.id
          END
        ) AS uncompleted_count

      FROM results r

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?
      `,
      [churchId],
    );

    const quizTotal = Number(quizStats?.total || 0);

    const correctCount = Number(quizStats?.correct_count || 0);

    const wrongCount = Number(quizStats?.wrong_count || 0);

    const uncompletedCount = Number(quizStats?.uncompleted_count || 0);

    // ========================================================
    // 15. QUIZ %
    // ========================================================

    const quizMetrics = {
      correct_pct:
        quizTotal > 0 ? Math.round((correctCount / quizTotal) * 100) : 0,

      wrong_pct: quizTotal > 0 ? Math.round((wrongCount / quizTotal) * 100) : 0,

      uncompleted_pct:
        quizTotal > 0 ? Math.round((uncompletedCount / quizTotal) * 100) : 0,
    };

    // ========================================================
    // 16. THỐNG KÊ HỌC SINH THEO TỪNG LỚP
    // ========================================================

    const [studentClassStats] = await db.query(
      `
      SELECT

        c.id AS class_id,

        c.code AS class_code,

        c.name AS class_name,

        c.level AS level,

        c.status AS class_status,

        COUNT(DISTINCT s.id) AS total_students,

        COUNT(
          DISTINCT CASE
            WHEN LOWER(TRIM(s.gender)) IN (
              'male',
              'nam'
            )
            THEN s.id
          END
        ) AS male_students,

        COUNT(
          DISTINCT CASE
            WHEN LOWER(TRIM(s.gender)) IN (
              'female',
              'nữ',
              'nu'
            )
            THEN s.id
          END
        ) AS female_students,

        COUNT(
          DISTINCT CASE
            WHEN s.created_at >= DATE_FORMAT(
              CURDATE(),
              '%Y-%m-01'
            )

            AND s.created_at < DATE_ADD(
              DATE_FORMAT(
                CURDATE(),
                '%Y-%m-01'
              ),
              INTERVAL 1 MONTH
            )

            THEN s.id
          END
        ) AS new_students_this_month

      FROM classes c

      LEFT JOIN class_students cs
        ON cs.class_id = c.id

      LEFT JOIN students s
        ON s.id = cs.student_id

      WHERE c.church_id = ?

      GROUP BY
        c.id,
        c.code,
        c.name,
        c.level,
        c.status

      ORDER BY c.name ASC
      `,
      [churchId],
    );

    // ========================================================
    // 17. ĐIỂM DANH HÔM NAY THEO TỪNG LỚP
    // ========================================================

    /*
      Lưu ý:

      Đoạn này giả định bảng attendances có:

      - student_id
      - class_id
      - date
      - status

      Và status:

      present = có mặt
      absent  = vắng
      excused = có phép
    */

    const [studentAttendanceStats] = await db.query(
      `
      SELECT

        c.id AS class_id,

        COUNT(
          DISTINCT CASE
            WHEN a.status = 'present'
            THEN a.student_id
          END
        ) AS present_today,

        COUNT(
          DISTINCT CASE
            WHEN a.status = 'absent'
            THEN a.student_id
          END
        ) AS absent_today,

        COUNT(
          DISTINCT CASE
            WHEN a.status = 'excused'
            THEN a.student_id
          END
        ) AS excused_today

      FROM classes c

      LEFT JOIN class_students cs
        ON cs.class_id = c.id

      LEFT JOIN attendances a
        ON a.class_id = c.id

        AND a.student_id = cs.student_id

        AND DATE(a.date) = CURDATE()

      WHERE c.church_id = ?

      GROUP BY c.id
      `,
      [churchId],
    );

    // ========================================================
    // 18. MAP ĐIỂM DANH THEO LỚP
    // ========================================================

    const attendanceByClass = {};

    studentAttendanceStats.forEach((row) => {
      attendanceByClass[Number(row.class_id)] = {
        present: Number(row.present_today || 0),

        absent: Number(row.absent_today || 0),

        excused: Number(row.excused_today || 0),
      };
    });

    // ========================================================
    // 19. GHÉP THỐNG KÊ HỌC SINH + ĐIỂM DANH
    // ========================================================

    const studentStatisticsByClass = studentClassStats.map((row) => {
      const classId = Number(row.class_id);

      const totalStudents = Number(row.total_students || 0);

      const attendance = attendanceByClass[classId] || {
        present: 0,
        absent: 0,
        excused: 0,
      };

      const present = attendance.present;

      const absent = attendance.absent;

      const excused = attendance.excused;

      // Học sinh chưa có trạng thái điểm danh
      const notCheckedIn = Math.max(
        totalStudents - present - absent - excused,
        0,
      );

      // Tỷ lệ có mặt
      const attendanceRate =
        totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0;

      return {
        class_id: classId,

        class_code: row.class_code,

        class_name: row.class_name,

        level: row.level,

        status: row.class_status,

        students: {
          total: totalStudents,

          male: Number(row.male_students || 0),

          female: Number(row.female_students || 0),

          new_this_month: Number(row.new_students_this_month || 0),
        },

        attendance_today: {
          present,

          absent,

          excused,

          not_checked_in: notCheckedIn,

          attendance_rate_pct: attendanceRate,
        },
      };
    });

    // ========================================================
    // 20. TỔNG THỐNG KÊ HỌC SINH
    // ========================================================

    const studentStatisticsOverview = {
      total_students: studentStatisticsByClass.reduce(
        (sum, item) => sum + item.students.total,
        0,
      ),

      male_students: studentStatisticsByClass.reduce(
        (sum, item) => sum + item.students.male,
        0,
      ),

      female_students: studentStatisticsByClass.reduce(
        (sum, item) => sum + item.students.female,
        0,
      ),

      total_classes: studentStatisticsByClass.length,

      active_classes: studentStatisticsByClass.filter(
        (item) => item.status === "active",
      ).length,

      new_students_this_month: studentStatisticsByClass.reduce(
        (sum, item) => sum + item.students.new_this_month,
        0,
      ),
    };

    // ========================================================
    // 21. TỔNG ĐIỂM DANH TOÀN GIÁO XỨ
    // ========================================================

    const attendanceTodayOverview = studentStatisticsByClass.reduce(
      (acc, item) => {
        acc.present += item.attendance_today.present;

        acc.absent += item.attendance_today.absent;

        acc.excused += item.attendance_today.excused;

        acc.not_checked_in += item.attendance_today.not_checked_in;

        return acc;
      },
      {
        present: 0,
        absent: 0,
        excused: 0,
        not_checked_in: 0,
      },
    );

    const totalStudentForAttendance = studentStatisticsOverview.total_students;

    const attendanceRateToday =
      totalStudentForAttendance > 0
        ? Math.round(
            (attendanceTodayOverview.present / totalStudentForAttendance) * 100,
          )
        : 0;

    // ========================================================
    // 22. RESPONSE
    // ========================================================

    return res.status(200).json({
      status: "success",

      data: {
        church_id: churchId,

        // ====================================================
        // THỐNG KÊ CŨ
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

            // lessons chưa có church_id
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

        // ====================================================
        // ⭐ THỐNG KÊ HỌC SINH THEO LỚP - MỚI
        // ====================================================

        student_statistics: {
          overview: {
            ...studentStatisticsOverview,

            attendance_today: {
              present: attendanceTodayOverview.present,

              absent: attendanceTodayOverview.absent,

              excused: attendanceTodayOverview.excused,

              not_checked_in: attendanceTodayOverview.not_checked_in,

              attendance_rate_pct: attendanceRateToday,
            },
          },

          classes: studentStatisticsByClass,
        },
      },
    });
  } catch (error) {
    console.error("❌ getDashboardCate error:", error);

    console.error("❌ SQL error:", error.sqlMessage);

    console.error("❌ Error code:", error.code);

    return res.status(500).json({
      status: "error",

      message: "Không thể lấy dữ liệu dashboard Giáo lý viên",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

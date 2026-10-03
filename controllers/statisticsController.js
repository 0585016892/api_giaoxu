const db = require("../config/db");
const XLSX = require("xlsx");

/**
 * =========================================================
 * HELPER
 * =========================================================
 */

/**
 * Lấy church_id từ token
 *
 * Ưu tiên:
 * req.user.church_id
 * fallback:
 * req.user.parish_id
 */
const getChurchId = (req) => {
  return req.user?.church_id || req.user?.parish_id || null;
};

/**
 * Chuyển giá trị sang số nguyên an toàn
 */
const toInt = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    return null;
  }

  return number;
};

/**
 * Kiểm tra tháng
 */
const isValidMonth = (month) => {
  return Number.isInteger(month) && month >= 1 && month <= 12;
};

/**
 * Kiểm tra năm
 */
const isValidYear = (year) => {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
};

/**
 * Kiểm tra ngày YYYY-MM-DD
 */
const isValidDate = (date) => {
  if (!date) return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00`);

  return !Number.isNaN(parsed.getTime());
};

/**
 * Tính tỷ lệ chuyên cần
 */
const calculateRate = (present, total) => {
  const presentNumber = Number(present || 0);
  const totalNumber = Number(total || 0);

  if (totalNumber <= 0) {
    return 0;
  }

  return Number(((presentNumber / totalNumber) * 100).toFixed(1));
};

/**
 * =========================================================
 * GET /api/statistics/overview
 *
 * Thống kê tổng quan:
 *
 * - Tổng học sinh
 * - Tổng lớp
 * - Tổng giáo lý viên
 * - Chuyên cần học giáo lý
 * - Chuyên cần Thánh lễ
 *
 * Query:
 *
 * ?month=9
 * &year=2026
 * =========================================================
 */
const getOverview = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    const month = req.query.month !== undefined ? toInt(req.query.month) : null;

    const year = req.query.year !== undefined ? toInt(req.query.year) : null;

    /**
     * Nếu truyền month thì bắt buộc phải có year
     */
    if (month !== null && year === null) {
      return res.status(400).json({
        success: false,
        message: "Khi lọc theo tháng phải chọn năm.",
      });
    }

    /**
     * Nếu truyền year thì bắt buộc phải có month
     */
    if (year !== null && month === null) {
      return res.status(400).json({
        success: false,
        message: "Khi lọc theo năm cho chuyên cần phải chọn tháng.",
      });
    }

    if (month !== null && !isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: "Tháng không hợp lệ. Tháng phải từ 1 đến 12.",
      });
    }

    if (year !== null && !isValidYear(year)) {
      return res.status(400).json({
        success: false,
        message: "Năm không hợp lệ.",
      });
    }

    // =====================================================
    // TỔNG HỌC SINH
    // =====================================================

    const [[studentResult]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM students
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // TỔNG LỚP
    // =====================================================

    const [[classResult]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM classes
      WHERE church_id = ?
        AND status != 'cancelled'
      `,
      [churchId],
    );

    // =====================================================
    // TỔNG GIÁO LÝ VIÊN
    // =====================================================

    const [[catechistResult]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM catechists
      WHERE church_id = ?
        AND status = 'active'
      `,
      [churchId],
    );

    // =====================================================
    // ĐIỀU KIỆN CHUYÊN CẦN
    // =====================================================

    let attendanceWhere = `
      WHERE church_id = ?
    `;

    const attendanceParams = [churchId];

    if (month !== null && year !== null) {
      attendanceWhere += `
        AND MONTH(attendance_date) = ?
        AND YEAR(attendance_date) = ?
      `;

      attendanceParams.push(month, year);
    }

    // =====================================================
    // CHUYÊN CẦN HỌC GIÁO LÝ
    // =====================================================

    const [[catechismAttendance]] = await db.query(
      `
      SELECT
        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'present'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS present,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'absent'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS absent,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'late'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS late,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'excused'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS excused

      FROM attendances

      ${attendanceWhere}

      AND attendance_type = 'catechism'
      `,
      attendanceParams,
    );

    // =====================================================
    // CHUYÊN CẦN THÁNH LỄ
    // =====================================================

    const [[massAttendance]] = await db.query(
      `
      SELECT
        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'present'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS present,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'absent'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS absent,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'late'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS late,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'excused'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS excused

      FROM attendances

      ${attendanceWhere}

      AND attendance_type = 'mass'
      `,
      attendanceParams,
    );

    // =====================================================
    // CHUYỂN SANG NUMBER
    // =====================================================

    const catechismTotal = Number(catechismAttendance?.total || 0);

    const catechismPresent = Number(catechismAttendance?.present || 0);

    const massTotal = Number(massAttendance?.total || 0);

    const massPresent = Number(massAttendance?.present || 0);

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: {
        filter: {
          month,
          year,
        },

        total_students: Number(studentResult?.total || 0),

        total_classes: Number(classResult?.total || 0),

        total_catechists: Number(catechistResult?.total || 0),

        catechism_attendance: {
          total: catechismTotal,

          present: catechismPresent,

          absent: Number(catechismAttendance?.absent || 0),

          late: Number(catechismAttendance?.late || 0),

          excused: Number(catechismAttendance?.excused || 0),

          rate: calculateRate(catechismPresent, catechismTotal),
        },

        mass_attendance: {
          total: massTotal,

          present: massPresent,

          absent: Number(massAttendance?.absent || 0),

          late: Number(massAttendance?.late || 0),

          excused: Number(massAttendance?.excused || 0),

          rate: calculateRate(massPresent, massTotal),
        },
      },
    });
  } catch (error) {
    console.error("getOverview error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê tổng quan.",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/statistics/students
 *
 * Thống kê học sinh hiện tại của giáo xứ
 *
 * Không lọc tháng/năm.
 * =========================================================
 */
const getStudentStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    // =====================================================
    // TỔNG
    // =====================================================

    const [[totalResult]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM students
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // GIỚI TÍNH
    // =====================================================

    const [genderRows] = await db.query(
      `
      SELECT
        gender,
        COUNT(*) AS total
      FROM students
      WHERE church_id = ?
      GROUP BY gender
      ORDER BY total DESC
      `,
      [churchId],
    );

    // =====================================================
    // TÌNH TRẠNG HỌC GIÁO LÝ
    // =====================================================

    const [catechismStatusRows] = await db.query(
      `
      SELECT
        catechism_status,
        COUNT(*) AS total
      FROM students
      WHERE church_id = ?
      GROUP BY catechism_status
      ORDER BY total DESC
      `,
      [churchId],
    );

    // =====================================================
    // TRẠNG THÁI HỌC SINH
    // =====================================================

    const [statusRows] = await db.query(
      `
      SELECT
        status,
        COUNT(*) AS total
      FROM students
      WHERE church_id = ?
      GROUP BY status
      ORDER BY total DESC
      `,
      [churchId],
    );

    return res.json({
      success: true,

      data: {
        total: Number(totalResult?.total || 0),

        gender: genderRows.map((item) => ({
          gender: item.gender,
          total: Number(item.total || 0),
        })),

        catechism_status: catechismStatusRows.map((item) => ({
          status: item.catechism_status,
          total: Number(item.total || 0),
        })),

        status: statusRows.map((item) => ({
          status: item.status,
          total: Number(item.total || 0),
        })),
      },
    });
  } catch (error) {
    console.error("getStudentStatistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê học sinh.",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/statistics/classes
 *
 * Thống kê lớp hiện tại
 *
 * LƯU Ý:
 * start_time / end_time / day_of_week
 * KHÔNG còn lấy từ classes.
 *
 * Lấy từ:
 * class_schedules
 *
 * Nếu một lớp có nhiều lịch:
 * lấy lịch đầu tiên theo id ASC.
 *
 * Không JOIN trực tiếp class_schedules để tránh
 * làm nhân bản lớp và sai COUNT học sinh.
 * =========================================================
 */
const getClassStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        c.id,
        c.name,
        c.code,
        c.category,
        c.status,

        schedule.day_of_week,
        schedule.start_time,
        schedule.end_time,
        schedule.room,

        COUNT(
          CASE
            WHEN cs.status IN ('studying', 'completed')
            THEN cs.student_id
          END
        ) AS total_students,

        COUNT(
          CASE
            WHEN cs.status = 'studying'
            THEN cs.student_id
          END
        ) AS studying_students

      FROM classes c

      LEFT JOIN (
        SELECT
          cs1.class_id,
          cs1.day_of_week,
          cs1.start_time,
          cs1.end_time,
          cs1.room
        FROM class_schedules cs1

        INNER JOIN (
          SELECT
            class_id,
            MIN(id) AS min_id
          FROM class_schedules
          GROUP BY class_id
        ) first_schedule
          ON first_schedule.class_id = cs1.class_id
          AND first_schedule.min_id = cs1.id
      ) schedule
        ON schedule.class_id = c.id

      LEFT JOIN class_students cs
        ON cs.class_id = c.id

      WHERE c.church_id = ?

      GROUP BY
        c.id,
        c.name,
        c.code,
        c.category,
        c.status,
        schedule.day_of_week,
        schedule.start_time,
        schedule.end_time,
        schedule.room

      ORDER BY c.name ASC
      `,
      [churchId],
    );

    return res.json({
      success: true,
      data: rows.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        category: item.category,
        status: item.status,

        day_of_week:
          item.day_of_week !== null ? Number(item.day_of_week) : null,

        start_time: item.start_time,
        end_time: item.end_time,
        room: item.room,

        total_students: Number(item.total_students || 0),
        studying_students: Number(item.studying_students || 0),
      })),
    });
  } catch (error) {
    console.error("getClassStatistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê lớp.",
      error: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
    });
  }
};

/**
 * =========================================================
 * GET /api/statistics/attendance
 *
 * Thống kê chuyên cần
 *
 * Có thể lọc:
 *
 * ?month=9
 * &year=2026
 *
 * hoặc:
 *
 * ?from=2026-09-01
 * &to=2026-09-30
 *
 * thêm:
 *
 * ?class_id=1
 *
 * ?attendance_type=catechism
 *
 * ?attendance_type=mass
 * =========================================================
 */
const getAttendanceStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    const {
      from,
      to,
      month: monthQuery,
      year: yearQuery,
      class_id: classIdQuery,
      attendance_type: attendanceType,
    } = req.query;

    const month = monthQuery !== undefined ? toInt(monthQuery) : null;

    const year = yearQuery !== undefined ? toInt(yearQuery) : null;

    const classId = classIdQuery !== undefined ? toInt(classIdQuery) : null;

    // =====================================================
    // VALIDATE MONTH
    // =====================================================

    if (monthQuery !== undefined) {
      if (!isValidMonth(month)) {
        return res.status(400).json({
          success: false,
          message: "Tháng không hợp lệ. Tháng phải từ 1 đến 12.",
        });
      }
    }

    // =====================================================
    // VALIDATE YEAR
    // =====================================================

    if (yearQuery !== undefined) {
      if (!isValidYear(year)) {
        return res.status(400).json({
          success: false,
          message: "Năm không hợp lệ.",
        });
      }
    }

    // =====================================================
    // MONTH + YEAR
    // =====================================================

    if (
      (month !== null && year === null) ||
      (month === null && year !== null)
    ) {
      return res.status(400).json({
        success: false,
        message: "Khi lọc theo tháng/năm phải truyền cả month và year.",
      });
    }

    // =====================================================
    // VALIDATE FROM
    // =====================================================

    if (from && !isValidDate(from)) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không hợp lệ. Định dạng phải là YYYY-MM-DD.",
      });
    }

    // =====================================================
    // VALIDATE TO
    // =====================================================

    if (to && !isValidDate(to)) {
      return res.status(400).json({
        success: false,
        message: "Ngày kết thúc không hợp lệ. Định dạng phải là YYYY-MM-DD.",
      });
    }

    // =====================================================
    // FROM <= TO
    // =====================================================

    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      });
    }

    // =====================================================
    // MONTH/YEAR + FROM/TO
    // =====================================================

    if (month !== null && year !== null && (from || to)) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể dùng đồng thời bộ lọc tháng/năm và từ ngày/đến ngày.",
      });
    }

    // =====================================================
    // VALIDATE CLASS
    // =====================================================

    if (classIdQuery !== undefined) {
      if (!classId || classId <= 0) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ.",
        });
      }

      const [[classExists]] = await db.query(
        `
        SELECT id
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [classId, churchId],
      );

      if (!classExists) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy lớp trong giáo xứ.",
        });
      }
    }

    // =====================================================
    // VALIDATE ATTENDANCE TYPE
    // =====================================================

    if (attendanceType && !["catechism", "mass"].includes(attendanceType)) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ. Chỉ nhận catechism hoặc mass.",
      });
    }

    // =====================================================
    // BUILD WHERE
    // =====================================================

    let where = `
      WHERE a.church_id = ?
    `;

    const params = [churchId];

    // =====================================================
    // MONTH / YEAR
    // =====================================================

    if (month !== null && year !== null) {
      where += `
        AND MONTH(a.attendance_date) = ?
        AND YEAR(a.attendance_date) = ?
      `;

      params.push(month, year);
    }

    // =====================================================
    // FROM
    // =====================================================

    if (from) {
      where += `
        AND a.attendance_date >= ?
      `;

      params.push(from);
    }

    // =====================================================
    // TO
    // =====================================================

    if (to) {
      where += `
        AND a.attendance_date <= ?
      `;

      params.push(to);
    }

    // =====================================================
    // CLASS
    // =====================================================

    if (classId !== null) {
      where += `
        AND a.class_id = ?
      `;

      params.push(classId);
    }

    // =====================================================
    // ATTENDANCE TYPE
    // =====================================================

    if (attendanceType) {
      where += `
        AND a.attendance_type = ?
      `;

      params.push(attendanceType);
    }

    // =====================================================
    // TỔNG QUAN
    // =====================================================

    const [[summary]] = await db.query(
      `
      SELECT

        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'present'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS present,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'absent'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS absent,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'late'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS late,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'excused'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS excused

      FROM attendances a

      ${where}
      `,
      params,
    );

    // =====================================================
    // THEO NGÀY
    // =====================================================

    const [dailyRows] = await db.query(
      `
      SELECT

        a.attendance_date,

        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'present'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS present,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'absent'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS absent,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'late'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS late,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'excused'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS excused

      FROM attendances a

      ${where}

      GROUP BY a.attendance_date

      ORDER BY a.attendance_date ASC
      `,
      params,
    );

    // =====================================================
    // THEO LỚP
    // =====================================================

    const [classRows] = await db.query(
      `
      SELECT

        c.id AS class_id,

        c.name AS class_name,

        c.code AS class_code,

        COUNT(a.id) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'present'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS present,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'absent'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS absent,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'late'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS late,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'excused'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS excused

      FROM attendances a

      INNER JOIN classes c
        ON c.id = a.class_id
        AND c.church_id = a.church_id

      ${where}

      GROUP BY
        c.id,
        c.name,
        c.code

      ORDER BY c.name ASC
      `,
      params,
    );

    // =====================================================
    // FORMAT SUMMARY
    // =====================================================

    const total = Number(summary?.total || 0);
    const present = Number(summary?.present || 0);
    const absent = Number(summary?.absent || 0);
    const late = Number(summary?.late || 0);
    const excused = Number(summary?.excused || 0);

    // =====================================================
    // FORMAT DAILY
    // =====================================================

    const daily = dailyRows.map((item) => {
      const itemTotal = Number(item.total || 0);
      const itemPresent = Number(item.present || 0);

      return {
        date: item.attendance_date,

        total: itemTotal,

        present: itemPresent,

        absent: Number(item.absent || 0),

        late: Number(item.late || 0),

        excused: Number(item.excused || 0),

        attendance_rate: calculateRate(itemPresent, itemTotal),
      };
    });

    // =====================================================
    // FORMAT BY CLASS
    // =====================================================

    const byClass = classRows.map((item) => {
      const itemTotal = Number(item.total || 0);
      const itemPresent = Number(item.present || 0);

      return {
        class_id: item.class_id,

        class_name: item.class_name,

        class_code: item.class_code,

        total: itemTotal,

        present: itemPresent,

        absent: Number(item.absent || 0),

        late: Number(item.late || 0),

        excused: Number(item.excused || 0),

        attendance_rate: calculateRate(itemPresent, itemTotal),
      };
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: {
        filter: {
          month,
          year,
          from: from || null,
          to: to || null,
          class_id: classId,
          attendance_type: attendanceType || null,
        },

        summary: {
          total,

          present,

          absent,

          late,

          excused,

          attendance_rate: calculateRate(present, total),
        },

        daily,

        by_class: byClass,
      },
    });
  } catch (error) {
    console.error("getAttendanceStatistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê chuyên cần.",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/statistics/catechists
 *
 * Quan hệ:
 *
 * catechists
 *      ↓
 * catechist_classes
 *      ↓
 * classes
 *      ↓
 * class_students
 *
 * Không sử dụng classes.catechist_id
 *
 * Thống kê hiện tại, không lọc tháng/năm.
 * =========================================================
 */
const getCatechistStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT

        ca.id,

        ca.catechist_code,

        ca.holy_name,

        ca.full_name,

        ca.gender,

        ca.level,

        ca.status,

        COUNT(
          DISTINCT c.id
        ) AS total_classes,

        COUNT(
          DISTINCT CASE
            WHEN cs.status IN (
              'studying',
              'completed'
            )
            THEN cs.student_id
          END
        ) AS total_students

      FROM catechists ca

      LEFT JOIN catechist_classes cc
        ON cc.catechist_id = ca.id

      LEFT JOIN classes c
        ON c.id = cc.class_id
        AND c.church_id = ca.church_id
        AND c.status != 'cancelled'

      LEFT JOIN class_students cs
        ON cs.class_id = c.id

      WHERE ca.church_id = ?

      GROUP BY

        ca.id,

        ca.catechist_code,

        ca.holy_name,

        ca.full_name,

        ca.gender,

        ca.level,

        ca.status

      ORDER BY ca.full_name ASC
      `,
      [churchId],
    );

    return res.json({
      success: true,

      data: rows.map((item) => ({
        id: item.id,

        catechist_code: item.catechist_code,

        holy_name: item.holy_name,

        full_name: item.full_name,

        gender: item.gender,

        level: item.level,

        status: item.status,

        total_classes: Number(item.total_classes || 0),

        total_students: Number(item.total_students || 0),
      })),
    });
  } catch (error) {
    console.error("getCatechistStatistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê giáo lý viên.",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/statistics/attendance/students
 *
 * Thống kê chuyên cần CHI TIẾT THEO TỪNG HỌC SINH
 *
 * Có thể lọc:
 *
 * ?month=9
 * &year=2026
 *
 * hoặc:
 *
 * ?from=2026-09-01
 * &to=2026-09-30
 *
 * thêm:
 *
 * ?class_id=1
 *
 * ?attendance_type=catechism
 * ?attendance_type=mass
 * =========================================================
 */
const getStudentAttendanceStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    const {
      from,
      to,
      month: monthQuery,
      year: yearQuery,
      class_id: classIdQuery,
      attendance_type: attendanceType,
    } = req.query;

    // =====================================================
    // PARSE
    // =====================================================

    const month = monthQuery !== undefined ? toInt(monthQuery) : null;

    const year = yearQuery !== undefined ? toInt(yearQuery) : null;

    const classId = classIdQuery !== undefined ? toInt(classIdQuery) : null;

    // =====================================================
    // VALIDATE MONTH
    // =====================================================

    if (monthQuery !== undefined) {
      if (!isValidMonth(month)) {
        return res.status(400).json({
          success: false,
          message: "Tháng không hợp lệ. Tháng phải từ 1 đến 12.",
        });
      }
    }

    // =====================================================
    // VALIDATE YEAR
    // =====================================================

    if (yearQuery !== undefined) {
      if (!isValidYear(year)) {
        return res.status(400).json({
          success: false,
          message: "Năm không hợp lệ.",
        });
      }
    }

    // =====================================================
    // MONTH + YEAR
    // =====================================================

    if (
      (month !== null && year === null) ||
      (month === null && year !== null)
    ) {
      return res.status(400).json({
        success: false,
        message: "Khi lọc theo tháng/năm phải truyền cả month và year.",
      });
    }

    // =====================================================
    // VALIDATE FROM
    // =====================================================

    if (from && !isValidDate(from)) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không hợp lệ. Định dạng phải là YYYY-MM-DD.",
      });
    }

    // =====================================================
    // VALIDATE TO
    // =====================================================

    if (to && !isValidDate(to)) {
      return res.status(400).json({
        success: false,
        message: "Ngày kết thúc không hợp lệ. Định dạng phải là YYYY-MM-DD.",
      });
    }

    // =====================================================
    // FROM <= TO
    // =====================================================

    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      });
    }

    // =====================================================
    // MONTH/YEAR + FROM/TO
    // =====================================================

    if (month !== null && year !== null && (from || to)) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể dùng đồng thời bộ lọc tháng/năm và từ ngày/đến ngày.",
      });
    }

    // =====================================================
    // VALIDATE CLASS
    // =====================================================

    if (classIdQuery !== undefined) {
      if (!classId || classId <= 0) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ.",
        });
      }

      const [[classExists]] = await db.query(
        `
        SELECT id
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
        [classId, churchId],
      );

      if (!classExists) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy lớp trong giáo xứ.",
        });
      }
    }

    // =====================================================
    // VALIDATE ATTENDANCE TYPE
    // =====================================================

    if (attendanceType && !["catechism", "mass"].includes(attendanceType)) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ. Chỉ nhận catechism hoặc mass.",
      });
    }

    // =====================================================
    // BUILD WHERE
    // =====================================================

    let where = `
      WHERE a.church_id = ?
    `;

    const params = [churchId];

    // =====================================================
    // MONTH / YEAR
    // =====================================================

    if (month !== null && year !== null) {
      where += `
        AND MONTH(a.attendance_date) = ?
        AND YEAR(a.attendance_date) = ?
      `;

      params.push(month, year);
    }

    // =====================================================
    // FROM
    // =====================================================

    if (from) {
      where += `
        AND a.attendance_date >= ?
      `;

      params.push(from);
    }

    // =====================================================
    // TO
    // =====================================================

    if (to) {
      where += `
        AND a.attendance_date <= ?
      `;

      params.push(to);
    }

    // =====================================================
    // CLASS
    // =====================================================

    if (classId !== null) {
      where += `
        AND a.class_id = ?
      `;

      params.push(classId);
    }

    // =====================================================
    // TYPE
    // =====================================================

    if (attendanceType) {
      where += `
        AND a.attendance_type = ?
      `;

      params.push(attendanceType);
    }

    // =====================================================
    // THỐNG KÊ TỪNG HỌC SINH
    // =====================================================

    const [rows] = await db.query(
      `
      SELECT

        s.id AS student_id,

        s.code AS student_code,

        s.name AS student_name,

        s.gender,

        s.catechism_level,

        COUNT(a.id) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'present'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS present,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'absent'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS absent,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'late'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS late,

        COALESCE(
          SUM(
            CASE
              WHEN a.status = 'excused'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS excused

      FROM attendances a

      INNER JOIN students s
        ON s.id = a.student_id
        AND s.church_id = a.church_id

      ${where}

      GROUP BY
        s.id,
        s.code,
        s.name,
        s.gender,
        s.catechism_level

      ORDER BY
        s.name ASC
      `,
      params,
    );

    // =====================================================
    // FORMAT
    // =====================================================

    const students = rows.map((item) => {
      const total = Number(item.total || 0);
      const present = Number(item.present || 0);
      const absent = Number(item.absent || 0);
      const late = Number(item.late || 0);
      const excused = Number(item.excused || 0);

      return {
        student_id: item.student_id,

        student_code: item.student_code,

        student_name: item.student_name,

        gender: item.gender,

        catechism_level: item.catechism_level,

        total,

        present,

        absent,

        late,

        excused,

        attendance_rate: calculateRate(present, total),
      };
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: {
        filter: {
          month,
          year,
          from: from || null,
          to: to || null,
          class_id: classId,
          attendance_type: attendanceType || null,
        },

        total_students: students.length,

        students,
      },
    });
  } catch (error) {
    console.error("getStudentAttendanceStatistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê chuyên cần từng học sinh.",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

const exportAttendanceReport = async (req, res) => {
  try {
    console.log("");
    console.log("============================================================");
    console.log("              EXPORT ATTENDANCE REPORT");
    console.log("============================================================");

    // =========================================================
    // CHURCH
    // =========================================================

    const churchId = getChurchId(req);

    console.log("CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

    // =========================================================
    // QUERY PARAMS
    // =========================================================

    const {
      month: monthQuery,
      year: yearQuery,
      from,
      to,
      date,
      class_id: classIdQuery,
      attendance_type: attendanceTypeQuery,
    } = req.query;

    const month = monthQuery !== undefined ? toInt(monthQuery) : null;

    const year = yearQuery !== undefined ? toInt(yearQuery) : null;

    const classId = classIdQuery !== undefined ? toInt(classIdQuery) : null;

    const finalAttendanceType = attendanceTypeQuery || "catechism";

    console.log("MONTH:", month);
    console.log("YEAR:", year);
    console.log("FROM:", from);
    console.log("TO:", to);
    console.log("DATE:", date);
    console.log("CLASS ID:", classId);
    console.log("ATTENDANCE TYPE:", finalAttendanceType);

    // =========================================================
    // VALIDATE ATTENDANCE TYPE
    // =========================================================

    if (!["catechism", "mass"].includes(finalAttendanceType)) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ. Chỉ nhận catechism hoặc mass.",
      });
    }

    // =========================================================
    // VALIDATE MONTH
    // =========================================================

    if (monthQuery !== undefined) {
      if (!isValidMonth(month)) {
        return res.status(400).json({
          success: false,
          message: "Tháng không hợp lệ. Tháng phải từ 1 đến 12.",
        });
      }
    }

    // =========================================================
    // VALIDATE YEAR
    // =========================================================

    if (yearQuery !== undefined) {
      if (!isValidYear(year)) {
        return res.status(400).json({
          success: false,
          message: "Năm không hợp lệ.",
        });
      }
    }

    // =========================================================
    // MONTH + YEAR
    // =========================================================

    if (
      (month !== null && year === null) ||
      (month === null && year !== null)
    ) {
      return res.status(400).json({
        success: false,
        message: "Khi xuất theo tháng phải truyền cả month và year.",
      });
    }

    // =========================================================
    // VALIDATE DATE
    // =========================================================

    if (date && !isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "Ngày không hợp lệ. Định dạng phải là YYYY-MM-DD.",
      });
    }

    // =========================================================
    // VALIDATE FROM
    // =========================================================

    if (from && !isValidDate(from)) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không hợp lệ. Định dạng phải là YYYY-MM-DD.",
      });
    }

    // =========================================================
    // VALIDATE TO
    // =========================================================

    if (to && !isValidDate(to)) {
      return res.status(400).json({
        success: false,
        message: "Ngày kết thúc không hợp lệ. Định dạng phải là YYYY-MM-DD.",
      });
    }

    // =========================================================
    // FROM <= TO
    // =========================================================

    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      });
    }

    // =========================================================
    // CHỈ CHỌN 1 KIỂU THỜI GIAN
    // =========================================================

    const hasMonthFilter = month !== null || year !== null;

    const hasRangeFilter = !!from || !!to;

    const hasDateFilter = !!date;

    const filterCount =
      Number(hasMonthFilter) + Number(hasRangeFilter) + Number(hasDateFilter);

    if (filterCount > 1) {
      return res.status(400).json({
        success: false,
        message:
          "Chỉ được chọn một trong: tháng/năm, từ ngày/đến ngày hoặc ngày cụ thể.",
      });
    }

    // =========================================================
    // CLASS ID
    // =========================================================
    //
    // CATECHISM:
    //   Có thể lọc theo class_id.
    //
    // MASS:
    //   KHÔNG bắt buộc class_id.
    //   Nếu FE không truyền class_id -> toàn bộ Thánh lễ.
    //
    // =========================================================

    if (classIdQuery !== undefined) {
      if (!classId || classId <= 0) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ.",
        });
      }

      const [[classExists]] = await db.query(
        `
            SELECT
              id,
              name,
              code
            FROM classes
            WHERE id = ?
              AND church_id = ?
            LIMIT 1
          `,
        [classId, churchId],
      );

      if (!classExists) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy lớp trong giáo xứ.",
        });
      }
    }

    // =========================================================
    // DATE CONDITION
    // =========================================================

    let dateWhere = "";

    const dateParams = [];

    // ---------------------------------------------------------
    // THEO THÁNG
    // ---------------------------------------------------------

    if (month !== null && year !== null) {
      dateWhere += `
        AND MONTH(a.attendance_date) = ?
        AND YEAR(a.attendance_date) = ?
      `;

      dateParams.push(month, year);
    }

    // ---------------------------------------------------------
    // THEO NGÀY CỤ THỂ
    // ---------------------------------------------------------

    if (date) {
      dateWhere += `
        AND a.attendance_date = ?
      `;

      dateParams.push(date);
    }

    // ---------------------------------------------------------
    // TỪ NGÀY
    // ---------------------------------------------------------

    if (from) {
      dateWhere += `
        AND a.attendance_date >= ?
      `;

      dateParams.push(from);
    }

    // ---------------------------------------------------------
    // ĐẾN NGÀY
    // ---------------------------------------------------------

    if (to) {
      dateWhere += `
        AND a.attendance_date <= ?
      `;

      dateParams.push(to);
    }

    // =========================================================
    // CLASS CONDITION
    // =========================================================

    let classWhere = "";

    const classParams = [];

    if (classId !== null) {
      classWhere = `
        AND a.class_id = ?
      `;

      classParams.push(classId);
    }

    // =========================================================
    // LẤY THÔNG TIN GIÁO XỨ
    // =========================================================

    const [[church]] = await db.query(
      `
          SELECT
            id,
            name,
            code
          FROM churches
          WHERE id = ?
          LIMIT 1
        `,
      [churchId],
    );

    if (!church) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin giáo xứ.",
      });
    }

    console.log("CHURCH:", church.name, "| CODE:", church.code);

    // =========================================================
    // LẤY DANH SÁCH LỚP
    // =========================================================

    let classes = [];

    // ---------------------------------------------------------
    // CÓ CLASS_ID
    // ---------------------------------------------------------

    if (classId !== null) {
      const [classRows] = await db.query(
        `
            SELECT
              id,
              name,
              code
            FROM classes
            WHERE id = ?
              AND church_id = ?
            LIMIT 1
          `,
        [classId, churchId],
      );

      classes = classRows;
    }

    // ---------------------------------------------------------
    // CATECHISM + KHÔNG CHỌN LỚP
    // ---------------------------------------------------------
    else if (finalAttendanceType === "catechism") {
      const [classRows] = await db.query(
        `
            SELECT
              id,
              name,
              code
            FROM classes
            WHERE church_id = ?
              AND status != 'cancelled'
            ORDER BY
              name ASC
          `,
        [churchId],
      );

      classes = classRows;
    }

    // ---------------------------------------------------------
    // MASS
    //
    // Không lấy danh sách lớp.
    // ---------------------------------------------------------
    else {
      classes = [];
    }

    console.log("TOTAL CLASSES:", classes.length);

    // =========================================================
    // WORKBOOK
    // =========================================================

    const workbook = XLSX.utils.book_new();

    // =========================================================
    // HELPER FORMAT DATE
    // =========================================================

    const formatDate = (value) => {
      if (!value) {
        return "";
      }

      // MySQL DATE thường có dạng YYYY-MM-DD
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [yearValue, monthValue, dayValue] = value.split("-");

        return `${dayValue}/${monthValue}/${yearValue}`;
      }

      const parsedDate = new Date(value);

      if (Number.isNaN(parsedDate.getTime())) {
        return String(value);
      }

      const dayValue = String(parsedDate.getDate()).padStart(2, "0");

      const monthValue = String(parsedDate.getMonth() + 1).padStart(2, "0");

      const yearValue = parsedDate.getFullYear();

      return `${dayValue}/${monthValue}/${yearValue}`;
    };

    // =========================================================
    // HELPER GENDER
    // =========================================================

    const formatGender = (gender) => {
      if (!gender) {
        return "";
      }

      switch (gender) {
        case "male":
          return "Nam";

        case "female":
          return "Nữ";

        case "other":
          return "Khác";

        default:
          return gender;
      }
    };

    // =========================================================
    // HELPER CALCULATE RATE
    // =========================================================

    const calculateRateSafe = (present, total) => {
      const presentNumber = Number(present || 0);

      const totalNumber = Number(total || 0);

      if (totalNumber <= 0) {
        return "0.00";
      }

      return ((presentNumber / totalNumber) * 100).toFixed(2);
    };

    // =========================================================
    // HELPER SHEET NAME
    // =========================================================

    const makeSafeSheetName = (name, fallback) => {
      let safeName = String(name || fallback)
        .replace(/[\\\/\?\*\[\]\:]/g, "")
        .trim();

      if (!safeName) {
        safeName = fallback;
      }

      // Excel tối đa 31 ký tự
      safeName = safeName.substring(0, 31);

      return safeName;
    };

    // =========================================================
    // HELPER UNIQUE SHEET NAME
    // =========================================================

    const makeUniqueSheetName = (name) => {
      let baseName = makeSafeSheetName(name, "Bao-cao");

      let finalName = baseName;

      let index = 1;

      while (workbook.SheetNames.includes(finalName)) {
        const suffix = `-${index}`;

        finalName = `${baseName.substring(0, 31 - suffix.length)}${suffix}`;

        index++;
      }

      return finalName;
    };

    // =========================================================
    // HELPER PERIOD TEXT
    // =========================================================

    const getPeriodText = () => {
      if (month !== null && year !== null) {
        return `Tháng ${month}/${year}`;
      }

      if (date) {
        return `Ngày ${formatDate(date)}`;
      }

      if (from || to) {
        return `${from ? formatDate(from) : "..."} đến ${
          to ? formatDate(to) : "..."
        }`;
      }

      return "Tất cả thời gian";
    };

    // =========================================================
    // HELPER CREATE SHEET
    // =========================================================

    const createAttendanceSheet = ({
      title,
      classInfo = null,
      rows = [],
      sheetName,
    }) => {
      const data = [];

      // =====================================================
      // TITLE
      // =====================================================

      data.push([title]);

      data.push(["Giáo xứ", church?.name || ""]);

      if (church?.code) {
        data.push(["Mã giáo xứ", church.code]);
      }

      // =====================================================
      // CLASS
      // =====================================================

      if (classInfo) {
        data.push(["Lớp", classInfo.name || ""]);

        data.push(["Mã lớp", classInfo.code || ""]);
      }

      // =====================================================
      // ATTENDANCE TYPE
      // =====================================================

      data.push([
        "Loại điểm danh",
        finalAttendanceType === "mass" ? "Thánh lễ" : "Học giáo lý",
      ]);

      // =====================================================
      // PERIOD
      // =====================================================

      data.push(["Thời gian", getPeriodText()]);

      data.push([]);

      // =====================================================
      // HEADER
      // =====================================================

      data.push([
        "STT",
        "Mã học sinh",
        "Họ và tên",
        "Giới tính",
        "Ngày sinh",
        "Tổng",
        "Có mặt",
        "Vắng",
        "Trễ",
        "Có phép",
        "Tỷ lệ",
      ]);

      // =====================================================
      // DATA
      // =====================================================

      rows.forEach((item, index) => {
        data.push([
          index + 1,

          item.student_code || "",

          item.student_name || "",

          formatGender(item.gender),

          formatDate(item.date_of_birth),

          Number(item.total || 0),

          Number(item.present || 0),

          Number(item.absent || 0),

          Number(item.late || 0),

          Number(item.excused || 0),

          `${calculateRateSafe(item.present, item.total)}%`,
        ]);
      });

      // =====================================================
      // TOTAL
      // =====================================================

      const total = rows.reduce(
        (sum, item) => sum + Number(item.total || 0),
        0,
      );

      const present = rows.reduce(
        (sum, item) => sum + Number(item.present || 0),
        0,
      );

      const absent = rows.reduce(
        (sum, item) => sum + Number(item.absent || 0),
        0,
      );

      const late = rows.reduce((sum, item) => sum + Number(item.late || 0), 0);

      const excused = rows.reduce(
        (sum, item) => sum + Number(item.excused || 0),
        0,
      );

      data.push([]);

      data.push([
        "",
        "",
        "TỔNG",
        "",
        "",
        total,
        present,
        absent,
        late,
        excused,
        `${calculateRateSafe(present, total)}%`,
      ]);

      // =====================================================
      // CREATE WORKSHEET
      // =====================================================

      const worksheet = XLSX.utils.aoa_to_sheet(data);

      // =====================================================
      // COLUMN WIDTH
      // =====================================================

      worksheet["!cols"] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 30 },
        { wch: 12 },
        { wch: 15 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
      ];

      // =====================================================
      // FREEZE HEADER
      // =====================================================

      worksheet["!freeze"] = {
        xSplit: 0,
        ySplit: 8,
      };

      // =====================================================
      // APPEND SHEET
      // =====================================================

      const uniqueSheetName = makeUniqueSheetName(sheetName);

      XLSX.utils.book_append_sheet(workbook, worksheet, uniqueSheetName);

      console.log("CREATED SHEET:", uniqueSheetName, "| ROWS:", rows.length);
    };

    // =========================================================
    // CATECHISM
    // =========================================================

    if (finalAttendanceType === "catechism") {
      console.log("");
      console.log(
        "============================================================",
      );
      console.log("EXPORT TYPE: CATECHISM");
      console.log(
        "============================================================",
      );

      // -------------------------------------------------------
      // Nếu có class_id:
      // chỉ export lớp đó.
      //
      // Nếu không có:
      // export toàn bộ lớp.
      // -------------------------------------------------------

      for (const classInfo of classes) {
        console.log(
          "------------------------------------------------------------",
        );

        console.log("EXPORT CLASS:", classInfo.id, classInfo.name);

        console.log("CLASS CODE:", classInfo.code);

        const [rows] = await db.query(
          `
              SELECT

                s.id AS student_id,

                s.code AS student_code,

                s.name AS student_name,

                s.gender,

                s.date_of_birth
                  AS date_of_birth,

                COUNT(a.id)
                  AS total,

                COALESCE(
                  SUM(
                    CASE
                      WHEN a.status = 'present'
                      THEN 1
                      ELSE 0
                    END
                  ),
                  0
                ) AS present,

                COALESCE(
                  SUM(
                    CASE
                      WHEN a.status = 'absent'
                      THEN 1
                      ELSE 0
                    END
                  ),
                  0
                ) AS absent,

                COALESCE(
                  SUM(
                    CASE
                      WHEN a.status = 'late'
                      THEN 1
                      ELSE 0
                    END
                  ),
                  0
                ) AS late,

                COALESCE(
                  SUM(
                    CASE
                      WHEN a.status = 'excused'
                      THEN 1
                      ELSE 0
                    END
                  ),
                  0
                ) AS excused

              FROM attendances a

              INNER JOIN students s
                ON s.id = a.student_id
                AND s.church_id = a.church_id

              WHERE
                a.church_id = ?

                AND a.class_id = ?

                AND a.attendance_type = 'catechism'

                ${dateWhere}

              GROUP BY
                s.id,
                s.code,
                s.name,
                s.gender,
                s.date_of_birth

              ORDER BY
                s.name ASC
            `,
          [churchId, classInfo.id, ...dateParams],
        );

        console.log("STUDENT ROWS:", rows.length);

        // -----------------------------------------------------
        // SHEET NAME
        // -----------------------------------------------------

        const sheetName = `${classInfo.code || ""}-${classInfo.name || classInfo.id}`;

        createAttendanceSheet({
          title: "BÁO CÁO CHUYÊN CẦN HỌC GIÁO LÝ",

          classInfo,

          rows,

          sheetName: sheetName || `Lop-${classInfo.id}`,
        });
      }
    }

    // =========================================================
    // MASS
    // =========================================================

    if (finalAttendanceType === "mass") {
      console.log("");
      console.log(
        "============================================================",
      );
      console.log("EXPORT TYPE: MASS");
      console.log(
        "============================================================",
      );

      console.log("MASS DOES NOT REQUIRE CLASS.");

      // -------------------------------------------------------
      // THÁNH LỄ:
      //
      // Không chọn lớp -> toàn bộ attendance mass.
      //
      // Nếu có class_id do dữ liệu cũ / request đặc biệt:
      // vẫn lọc theo class_id.
      // -------------------------------------------------------

      const [rows] = await db.query(
        `
            SELECT

              s.id AS student_id,

              s.code AS student_code,

              s.name AS student_name,

              s.gender,

              s.date_of_birth
                AS date_of_birth,

              COUNT(a.id)
                AS total,

              COALESCE(
                SUM(
                  CASE
                    WHEN a.status = 'present'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS present,

              COALESCE(
                SUM(
                  CASE
                    WHEN a.status = 'absent'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS absent,

              COALESCE(
                SUM(
                  CASE
                    WHEN a.status = 'late'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS late,

              COALESCE(
                SUM(
                  CASE
                    WHEN a.status = 'excused'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS excused

            FROM attendances a

            INNER JOIN students s
              ON s.id = a.student_id
              AND s.church_id = a.church_id

            WHERE
              a.church_id = ?

              AND a.attendance_type = 'mass'

              ${dateWhere}

              ${classWhere}

            GROUP BY
              s.id,
              s.code,
              s.name,
              s.gender,
              s.date_of_birth

            ORDER BY
              s.name ASC
          `,
        [churchId, ...dateParams, ...classParams],
      );

      console.log("MASS STUDENT ROWS:", rows.length);

      // -------------------------------------------------------
      // TẠO SHEET THÁNH LỄ
      // -------------------------------------------------------

      createAttendanceSheet({
        title: "BÁO CÁO CHUYÊN CẦN THÁNH LỄ",

        classInfo: null,

        rows,

        sheetName: "Thanh-le",
      });
    }

    // =========================================================
    // KIỂM TRA SHEET
    // =========================================================

    console.log("");
    console.log("============================================================");

    console.log("SHEET NAMES:", workbook.SheetNames);

    console.log("TOTAL SHEETS:", workbook.SheetNames.length);

    console.log("============================================================");

    if (workbook.SheetNames.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không có dữ liệu để xuất báo cáo.",
      });
    }

    // =========================================================
    // FILENAME
    // =========================================================

    let periodName = "tat-ca";

    if (month !== null && year !== null) {
      periodName = `thang-${month}-${year}`;
    }

    if (date) {
      periodName = `ngay-${date}`;
    }

    if (from || to) {
      periodName = `tu-${from || "tat-ca"}-den-${to || "tat-ca"}`;
    }

    const typeName =
      finalAttendanceType === "mass" ? "thanh-le" : "hoc-giao-ly";

    const fileName = `bao-cao-chuyen-can-${typeName}-${periodName}.xlsx`;

    console.log("FILE NAME:", fileName);

    // =========================================================
    // WRITE XLSX BUFFER
    // =========================================================

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    console.log("BUFFER SIZE:", buffer.length);

    // =========================================================
    // RESPONSE HEADERS
    // =========================================================

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );

    res.setHeader("Content-Length", buffer.length);

    // =========================================================
    // SUCCESS
    // =========================================================

    console.log("");
    console.log("============================================================");

    console.log("              EXPORT SUCCESS");

    console.log("============================================================");

    console.log("FILE:", fileName);

    console.log("SIZE:", buffer.length, "bytes");

    console.log("SHEETS:", workbook.SheetNames.join(", "));

    console.log("============================================================");

    return res.send(buffer);
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );

    console.error("      EXPORT ATTENDANCE REPORT ERROR");

    console.error(
      "============================================================",
    );

    console.error("MESSAGE:", error?.message);

    console.error("CODE:", error?.code);

    console.error("SQL STATE:", error?.sqlState);

    console.error("SQL MESSAGE:", error?.sqlMessage);

    console.error("STACK:", error?.stack);

    console.error(
      "============================================================",
    );

    return res.status(500).json({
      success: false,
      message: "Lỗi khi xuất báo cáo chuyên cần.",
      error: error?.message || null,
      code: error?.code || null,
      sqlMessage: error?.sqlMessage || null,
    });
  }
};
module.exports = {
  getOverview,
  getStudentStatistics,
  getClassStatistics,
  getAttendanceStatistics,
  getStudentAttendanceStatistics,
  getCatechistStatistics,
  exportAttendanceReport,
};

const db = require("../config/db");
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
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
    console.log(
      "\n============================================================",
    );
    console.log("          EXPORT ATTENDANCE REPORT - FAITHEDU");
    console.log("============================================================");

    // =========================================================
    // 1. CHUẨN BỊ DỮ LIỆU VÀ VALIDATE
    // =========================================================
    const churchId = getChurchId(req);

    if (!churchId) {
      console.error("[EXPORT] Không xác định được giáo xứ.");

      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ.",
      });
    }

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

    const attendanceType = attendanceTypeQuery || "catechism";

    console.log("[EXPORT] Church:", churchId);
    console.log("[EXPORT] Type:", attendanceType);
    console.log("[EXPORT] Period:", { month, year, from, to, date });
    console.log("[EXPORT] Class:", classId);
    console.log("[EXPORT] Query params:", JSON.stringify(req.query));

    if (!["catechism", "mass"].includes(attendanceType)) {
      return res.status(400).json({
        success: false,
        message: "Loại điểm danh không hợp lệ.",
      });
    }

    if (monthQuery !== undefined && !isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: "Tháng phải từ 1 đến 12.",
      });
    }

    if (yearQuery !== undefined && !isValidYear(year)) {
      return res.status(400).json({
        success: false,
        message: "Năm không hợp lệ.",
      });
    }

    if (
      (month !== null && year === null) ||
      (month === null && year !== null)
    ) {
      return res.status(400).json({
        success: false,
        message: "Phải truyền đồng thời month và year.",
      });
    }

    for (const [field, value] of [
      ["date", date],
      ["from", from],
      ["to", to],
    ]) {
      if (value && !isValidDate(value)) {
        return res.status(400).json({
          success: false,
          message: `${field} không hợp lệ. Định dạng YYYY-MM-DD.`,
        });
      }
    }

    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      });
    }

    const filterCount =
      Number(month !== null || year !== null) +
      Number(Boolean(from || to)) +
      Number(Boolean(date));

    if (filterCount > 1) {
      return res.status(400).json({
        success: false,
        message:
          "Chỉ chọn một kiểu lọc: tháng/năm, khoảng ngày hoặc ngày cụ thể.",
      });
    }

    // =========================================================
    // 2. XÁC NHẬN GIÁO XỨ VÀ LỚP
    // =========================================================
    const [[church]] = await db.query(
      `SELECT id, name, code
       FROM churches
       WHERE id = ?
       LIMIT 1`,
      [churchId],
    );

    if (!church) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ.",
      });
    }

    let selectedClass = null;

    if (classIdQuery !== undefined) {
      if (!Number.isInteger(classId) || classId <= 0) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ.",
        });
      }

      const [[foundClass]] = await db.query(
        `SELECT id, name, code
         FROM classes
         WHERE id = ? AND church_id = ?
         LIMIT 1`,
        [classId, churchId],
      );

      if (!foundClass) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy lớp trong giáo xứ.",
        });
      }

      selectedClass = foundClass;
    }

    let classes = [];

    if (attendanceType === "catechism") {
      if (selectedClass) {
        classes = [selectedClass];
      } else {
        const [classRows] = await db.query(
          `SELECT id, name, code
           FROM classes
           WHERE church_id = ?
             AND (status IS NULL OR status != 'cancelled')
           ORDER BY name ASC`,
          [churchId],
        );

        classes = classRows;
      }
    }

    console.log("[EXPORT] Classes to export:", {
      count: classes.length,
      classes: classes.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
      })),
    });

    // =========================================================
    // 3. ĐIỀU KIỆN LỌC NGÀY
    // =========================================================
    let dateWhere = "";
    const dateParams = [];

    if (month !== null && year !== null) {
      dateWhere += `
        AND a.attendance_date >= ?
        AND a.attendance_date < ?
      `;

      dateParams.push(
        `${year}-${String(month).padStart(2, "0")}-01`,
        month === 12
          ? `${year + 1}-01-01`
          : `${year}-${String(month + 1).padStart(2, "0")}-01`,
      );
    }

    if (date) {
      dateWhere += ` AND a.attendance_date = ?`;
      dateParams.push(date);
    }

    if (from) {
      dateWhere += ` AND a.attendance_date >= ?`;
      dateParams.push(from);
    }

    if (to) {
      dateWhere += ` AND a.attendance_date < DATE_ADD(?, INTERVAL 1 DAY)`;
      dateParams.push(to);
    }

    // =========================================================
    // 3B. TẠO DANH SÁCH NGÀY HIỂN THỊ TRÊN EXCEL
    //
    // Theo tháng: từ ngày 01 đến ngày cuối tháng.
    // Theo khoảng ngày: từ from đến to, bao gồm cả hai đầu.
    // Theo ngày cụ thể: chỉ có một cột ngày.
    // Không truyền lọc ngày: giữ báo cáo tổng hợp, không sinh cột ngày.
    // =========================================================
    const reportDates = (() => {
      let startDate = null;
      let endDate = null;

      if (month !== null && year !== null) {
        startDate = new Date(Date.UTC(year, month - 1, 1));
        endDate = new Date(Date.UTC(year, month, 0));
      } else if (date) {
        startDate = new Date(`${date}T00:00:00Z`);
        endDate = new Date(`${date}T00:00:00Z`);
      } else if (from || to) {
        const startValue = from || to;
        const endValue = to || from;

        startDate = new Date(`${startValue}T00:00:00Z`);
        endDate = new Date(`${endValue}T00:00:00Z`);
      }

      if (!startDate || !endDate) {
        return [];
      }

      const dates = [];

      for (
        let cursor = new Date(startDate);
        cursor <= endDate;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        dates.push(
          `${cursor.getUTCFullYear()}-${String(
            cursor.getUTCMonth() + 1,
          ).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`,
        );
      }

      console.log("[EXPORT] Report dates generated:", {
        count: dates.length,
        firstDate: dates[0] || null,
        lastDate: dates[dates.length - 1] || null,
        dates,
      });

      return dates;
    })();

    const statusShortCodes = {
      present: "C",
      late: "M",
      excused: "P",
      absent: "V",
    };

    // =========================================================
    // 4. HÀM LẤY THỐNG KÊ ĐIỂM DANH
    // =========================================================

    const getAttendanceRows = async (filterClassId = null) => {
      let classWhere = "";
      let studentSourceQuery = "";
      let studentSourceParams = [];

      // =========================================================
      // 1. CHUẨN BỊ ĐIỀU KIỆN LỚP
      // =========================================================
      if (attendanceType === "catechism") {
        if (filterClassId === null) {
          console.warn(
            "[EXPORT] Học giáo lý chưa xác định lớp. Bỏ qua truy vấn dữ liệu học sinh.",
          );

          return [];
        }

        classWhere = `
      AND EXISTS (
        SELECT 1
        FROM class_students cs
        WHERE cs.student_id = s.id
          AND cs.class_id = ?
          AND cs.status = 'studying'
      )
    `;

        studentSourceParams.push(filterClassId);

        studentSourceQuery = `
      INNER JOIN classes cl
        ON cl.id = ?
       AND cl.church_id = s.church_id
    `;

        // Tham số của JOIN phải đứng trước tham số WHERE.
        studentSourceParams = [filterClassId, filterClassId];
      }

      // =========================================================
      // 2. LẤY ĐẦY ĐỦ DANH SÁCH HỌC SINH
      //
      // Không lấy học sinh từ attendances.
      // Học sinh chưa điểm danh vẫn phải xuất hiện.
      // =========================================================
      const studentParams = [churchId];

      if (attendanceType === "catechism") {
        studentParams.push(...studentSourceParams);
      }

      const [students] = await db.query(
        `
    SELECT
      s.id AS student_id,
      s.code AS student_code,
      s.name AS student_name,
      s.gender,
      s.date_of_birth
    FROM students s
    ${studentSourceQuery}
    WHERE s.church_id = ?
      ${attendanceType === "catechism" ? classWhere : ""}
    ORDER BY s.name ASC, s.id ASC
    `,
        studentParams,
      );

      console.log("[EXPORT] Student roster query:", {
        churchId,
        attendanceType,
        classId: filterClassId,
        studentCount: students.length,
      });

      // Không có học sinh thì vẫn trả mảng rỗng hợp lệ.
      if (students.length === 0) {
        console.warn("[EXPORT] Không có học sinh trong danh sách.", {
          churchId,
          attendanceType,
          classId: filterClassId,
        });

        return [];
      }

      // =========================================================
      // 3. LẤY THỐNG KÊ ĐIỂM DANH
      //
      // Chỉ tổng hợp những bản ghi điểm danh thực tế.
      // =========================================================
      const aggregateParams = [churchId, attendanceType, ...dateParams];

      let attendanceClassWhere = "";

      if (filterClassId !== null) {
        attendanceClassWhere = " AND a.class_id = ?";
        aggregateParams.push(filterClassId);
      }

      console.log("[EXPORT] Aggregate query:", {
        churchId,
        attendanceType,
        classId: filterClassId,
        dateFilter: {
          month,
          year,
          from,
          to,
          date,
        },
        params: aggregateParams,
      });

      const [aggregateRows] = await db.query(
        `
    SELECT
      a.student_id,

      COUNT(a.id) AS total,

      COALESCE(SUM(
        CASE WHEN a.status = 'present' THEN 1 ELSE 0 END
      ), 0) AS present,

      COALESCE(SUM(
        CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END
      ), 0) AS absent,

      COALESCE(SUM(
        CASE WHEN a.status = 'late' THEN 1 ELSE 0 END
      ), 0) AS late,

      COALESCE(SUM(
        CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END
      ), 0) AS excused

    FROM attendances a

    INNER JOIN students s
      ON s.id = a.student_id
     AND s.church_id = a.church_id

    WHERE a.church_id = ?
      AND a.attendance_type = ?
      ${dateWhere}
      ${attendanceClassWhere}

    GROUP BY a.student_id
    `,
        aggregateParams,
      );

      const aggregateMap = new Map();

      for (const row of aggregateRows) {
        aggregateMap.set(String(row.student_id), {
          total: Number(row.total || 0),
          present: Number(row.present || 0),
          absent: Number(row.absent || 0),
          late: Number(row.late || 0),
          excused: Number(row.excused || 0),
        });
      }

      console.log("[EXPORT] Aggregate attendance query success:", {
        classId: filterClassId,
        studentsWithAttendance: aggregateMap.size,
      });

      // =========================================================
      // 4. LẤY TRẠNG THÁI THEO TỪNG NGÀY
      // =========================================================
      const dailyParams = [churchId, attendanceType, ...dateParams];

      if (filterClassId !== null) {
        dailyParams.push(filterClassId);
      }

      const [dailyRows] = await db.query(
        `
    SELECT
      a.student_id,
      DATE_FORMAT(
        a.attendance_date,
        '%Y-%m-%d'
      ) AS attendance_day,
      a.status

    FROM attendances a

    INNER JOIN students s
      ON s.id = a.student_id
     AND s.church_id = a.church_id

    WHERE a.church_id = ?
      AND a.attendance_type = ?
      ${dateWhere}
      ${attendanceClassWhere}

    ORDER BY
      a.attendance_date ASC,
      a.student_id ASC,
      a.id ASC
    `,
        dailyParams,
      );

      const dailyMap = new Map();

      for (const dailyRow of dailyRows) {
        const studentKey = String(dailyRow.student_id);
        const dayKey = String(dailyRow.attendance_day || "").slice(0, 10);

        if (!dailyMap.has(studentKey)) {
          dailyMap.set(studentKey, {});
        }

        // Nếu một học sinh có nhiều bản ghi cùng ngày,
        // bản ghi sau theo thứ tự truy vấn sẽ được sử dụng.
        dailyMap.get(studentKey)[dayKey] =
          statusShortCodes[dailyRow.status] || "";
      }

      // =========================================================
      // 5. GHÉP DANH SÁCH HỌC SINH VỚI THỐNG KÊ
      //
      // Không có bản ghi điểm danh:
      // - Vẫn có tên học sinh.
      // - Số liệu bằng 0.
      // - Trạng thái ngày để trống.
      // =========================================================
      const result = students.map((student) => {
        const statistics = aggregateMap.get(String(student.student_id)) || {
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        };

        return {
          ...student,
          ...statistics,
          dailyStatuses: dailyMap.get(String(student.student_id)) || {},
        };
      });

      const studentsWithoutAttendance = result.filter(
        (student) => student.total === 0,
      ).length;

      console.log("[EXPORT] Final roster:", {
        churchId,
        attendanceType,
        classId: filterClassId,
        totalStudents: result.length,
        studentsWithAttendance: result.length - studentsWithoutAttendance,
        studentsWithoutAttendance,
        dailyRecords: dailyRows.length,
      });

      return result;
    };

    // =========================================================
    // 5. THEME EXCEL FAITHEDU
    // =========================================================
    const C = {
      navy: "173B5E",
      navyDark: "102A43",
      gold: "D9A441",
      cream: "FFF9EE",
      white: "FFFFFF",
      background: "F4F7FB",
      border: "DCE5EF",
      text: "243447",
      muted: "6B7280",
      green: "2E7D5B",
      greenLight: "E8F5EE",
      red: "C94C4C",
      redLight: "FDECEC",
      amber: "B7791F",
      amberLight: "FFF7E0",
      blueLight: "EEF3F7",
    };

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "FaithEdu";
    workbook.subject = "Báo cáo chuyên cần";
    workbook.title = "Báo cáo chuyên cần FaithEdu";
    workbook.created = new Date();

    workbook.views = [
      {
        x: 0,
        y: 0,
        width: 18000,
        height: 10000,
        firstSheet: 0,
        activeTab: 0,
      },
    ];

    // =========================================================
    // 6. HELPER
    // =========================================================
    const formatDate = (value) => {
      if (!value) return "";

      const str = String(value);

      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const [y, m, d] = str.substring(0, 10).split("-");
        return `${d}/${m}/${y}`;
      }

      const parsed = new Date(value);

      if (Number.isNaN(parsed.getTime())) {
        return str;
      }

      return [
        String(parsed.getDate()).padStart(2, "0"),
        String(parsed.getMonth() + 1).padStart(2, "0"),
        parsed.getFullYear(),
      ].join("/");
    };

    const formatGender = (gender) => {
      return (
        {
          male: "Nam",
          female: "Nữ",
          other: "Khác",
        }[gender] ||
        gender ||
        ""
      );
    };

    const rate = (present, total) => {
      return total > 0 ? present / total : 0;
    };

    const getPeriodText = () => {
      if (month !== null && year !== null) {
        return `Tháng ${month}/${year}`;
      }

      if (date) {
        return `Ngày ${formatDate(date)}`;
      }

      if (from || to) {
        return `${from ? formatDate(from) : "Đầu kỳ"} - ${
          to ? formatDate(to) : "Cuối kỳ"
        }`;
      }

      return "Tất cả thời gian";
    };

    const sumRows = (rows) =>
      rows.reduce(
        (sum, row) => {
          sum.total += row.total;
          sum.present += row.present;
          sum.absent += row.absent;
          sum.late += row.late;
          sum.excused += row.excused;

          return sum;
        },
        {
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        },
      );

    const safeSheetName = (name) => {
      let result = String(name || "Bao-cao")
        .replace(/[\\/*?:\[\]]/g, "")
        .trim()
        .substring(0, 31);

      if (!result) result = "Bao-cao";

      const base = result;
      let index = 1;

      while (workbook.getWorksheet(result)) {
        const suffix = `-${index++}`;
        result = base.substring(0, 31 - suffix.length) + suffix;
      }

      return result;
    };

    const styleTitle = (sheet, title, lastCol) => {
      sheet.mergeCells(1, 1, 2, lastCol);

      const cell = sheet.getCell(1, 1);

      cell.value = title;
      cell.font = {
        name: "Aptos Display",
        size: 18,
        bold: true,
        color: { argb: C.white },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: C.navy },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      sheet.getRow(1).height = 28;
      sheet.getRow(2).height = 18;

      for (let row = 1; row <= 2; row++) {
        for (let col = 1; col <= lastCol; col++) {
          sheet.getCell(row, col).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: C.navy },
          };
        }
      }

      sheet.mergeCells(3, 1, 3, lastCol);

      sheet.getCell(3, 1).value =
        "FAITHEDU  |  SỐ HÓA GIÁO LÝ - KẾT NỐI ĐỨC TIN";

      sheet.getCell(3, 1).font = {
        name: "Aptos",
        size: 10,
        bold: true,
        color: { argb: C.gold },
      };

      sheet.getCell(3, 1).alignment = {
        horizontal: "center",
      };

      sheet.getRow(3).height = 22;
    };

    const styleHeader = (row) => {
      row.height = 32;

      row.eachCell((cell) => {
        cell.font = {
          name: "Aptos",
          size: 10,
          bold: true,
          color: { argb: C.white },
        };

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: C.navyDark },
        };

        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };

        cell.border = {
          top: { style: "thin", color: { argb: C.border } },
          bottom: { style: "thin", color: { argb: C.gold } },
          left: { style: "thin", color: { argb: C.border } },
          right: { style: "thin", color: { argb: C.border } },
        };
      });
    };

    const styleDataRows = (sheet, startRow, endRow, lastCol) => {
      for (let r = startRow; r <= endRow; r++) {
        const row = sheet.getRow(r);

        row.height = 24;

        for (let col = 1; col <= lastCol; col++) {
          const cell = row.getCell(col);

          cell.font = {
            name: "Aptos",
            size: 10,
            color: { argb: C.text },
          };

          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb: r % 2 === 0 ? C.white : C.background,
            },
          };

          cell.border = {
            bottom: {
              style: "hair",
              color: { argb: C.border },
            },
          };

          cell.alignment = {
            vertical: "middle",
          };
        }

        [1, 6, 7, 8, 9, 10, 11].forEach((col) => {
          row.getCell(col).alignment = {
            horizontal: "center",
            vertical: "middle",
          };
        });

        const rateCell = row.getCell(11);

        rateCell.numFmt = "0.00%";

        rateCell.font = {
          name: "Aptos",
          bold: true,
          color: {
            argb:
              Number(rateCell.value || 0) >= 0.8
                ? C.green
                : Number(rateCell.value || 0) >= 0.5
                  ? C.amber
                  : C.red,
          },
        };

        const statuses = [
          [7, C.greenLight, C.green],
          [8, C.redLight, C.red],
          [9, C.amberLight, C.amber],
          [10, C.blueLight, C.navy],
        ];

        statuses.forEach(([col, bg, fg]) => {
          row.getCell(col).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: bg },
          };

          row.getCell(col).font = {
            name: "Aptos",
            bold: true,
            color: { argb: fg },
          };
        });
      }
    };

    // =========================================================
    // 7. TẠO SHEET CHI TIẾT
    // =========================================================
    const createAttendanceSheet = ({
      title,
      classInfo = null,
      rows,
      sheetName,
    }) => {
      const sheet = workbook.addWorksheet(safeSheetName(sheetName));

      sheet.views = [
        {
          state: "frozen",
          ySplit: 9,
          showGridLines: false,
        },
      ];

      sheet.properties.defaultRowHeight = 22;

      sheet.columns = [
        { key: "stt", width: 7 },
        { key: "code", width: 17 },
        { key: "name", width: 30 },
        { key: "gender", width: 12 },
        { key: "dob", width: 16 },
        { key: "total", width: 12 },
        { key: "present", width: 13 },
        { key: "absent", width: 12 },
        { key: "late", width: 12 },
        { key: "excused", width: 13 },
        { key: "rate", width: 16 },
        ...reportDates.map((day) => ({
          key: `day_${day}`,
          width: 7,
        })),
      ];

      const lastCol = 11 + reportDates.length;
      const lastColLetter = sheet.getColumn(lastCol).letter;

      styleTitle(sheet, title, lastCol);

      sheet.mergeCells("A4:B4");
      sheet.getCell("A4").value = "GIÁO XỨ";
      sheet.getCell("C4").value = church.name || "";

      sheet.mergeCells("A5:B5");
      sheet.getCell("A5").value = "MÃ GIÁO XỨ";
      sheet.getCell("C5").value = church.code || "";

      sheet.mergeCells("A6:B6");
      sheet.getCell("A6").value = "LOẠI ĐIỂM DANH";
      sheet.getCell("C6").value =
        attendanceType === "mass" ? "Thánh lễ" : "Học giáo lý";

      sheet.mergeCells("A7:B7");
      sheet.getCell("A7").value = "THỜI GIAN";
      sheet.getCell("C7").value = getPeriodText();

      if (classInfo) {
        sheet.mergeCells("E4:F4");
        sheet.getCell("E4").value = "LỚP";
        sheet.getCell("G4").value = classInfo.name || "";

        sheet.mergeCells("E5:F5");
        sheet.getCell("E5").value = "MÃ LỚP";
        sheet.getCell("G5").value = classInfo.code || "";
      }

      [4, 5, 6, 7].forEach((r) => {
        ["A", "B", "E", "F"].forEach((col) => {
          const cell = sheet.getCell(`${col}${r}`);

          cell.font = {
            name: "Aptos",
            bold: true,
            color: { argb: C.navy },
          };
        });

        sheet.getRow(r).height = 23;
      });

      const headerRow = 9;

      sheet.getRow(headerRow).values = [
        "STT",
        "Mã học sinh",
        "Họ và tên",
        "Giới tính",
        "Ngày sinh",
        "Tổng lượt",
        "Có mặt",
        "Vắng",
        "Trễ",
        "Có phép",
        "Tỷ lệ chuyên cần",
        ...reportDates.map((day) => formatDate(day)),
      ];

      styleHeader(sheet.getRow(headerRow));

      // Chú thích trạng thái nằm phía trên tiêu đề cột ngày.
      if (reportDates.length > 0) {
        sheet.mergeCells(8, 1, 8, lastCol);

        const legendCell = sheet.getCell(8, 1);

        legendCell.value =
          "QUY ƯỚC: Có - C  |  Muộn - M  |  Phép - P  |  Vắng - V  |  Ô trống: chưa có bản ghi điểm danh";

        legendCell.font = {
          name: "Aptos",
          size: 10,
          bold: true,
          color: { argb: C.navy },
        };

        legendCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: C.cream },
        };

        legendCell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };

        legendCell.border = {
          top: { style: "thin", color: { argb: C.border } },
          bottom: { style: "thin", color: { argb: C.border } },
          left: { style: "thin", color: { argb: C.border } },
          right: { style: "thin", color: { argb: C.border } },
        };

        sheet.getRow(8).height = 25;
      }

      // =======================================================
      // THÊM DỮ LIỆU HỌC SINH VÀ TRẠNG THÁI THEO TỪNG NGÀY
      // =======================================================
      rows.forEach((item, index) => {
        const row = sheet.addRow([
          index + 1,
          item.student_code || "",
          item.student_name || "",
          formatGender(item.gender),
          formatDate(item.date_of_birth),
          item.total,
          item.present,
          item.absent,
          item.late,
          item.excused,
          rate(item.present, item.total),
          ...reportDates.map((day) => item.dailyStatuses?.[day] || ""),
        ]);

        row.getCell(11).numFmt = "0.00%";

        reportDates.forEach((day, dayIndex) => {
          const cell = row.getCell(12 + dayIndex);
          const code = item.dailyStatuses?.[day] || "";

          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
          };

          cell.font = {
            name: "Aptos",
            size: 10,
            bold: Boolean(code),
            color: { argb: C.text },
          };

          const dayColors = {
            C: C.greenLight,
            M: C.amberLight,
            P: C.blueLight,
            V: C.redLight,
          };

          if (code && dayColors[code]) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: dayColors[code] },
            };
          }
        });
      });

      const lastDataRow = sheet.rowCount;

      if (rows.length > 0) {
        styleDataRows(sheet, 10, lastDataRow, lastCol);

        sheet.autoFilter = {
          from: "A9",
          to: `${lastColLetter}${lastDataRow}`,
        };
      }

      // =======================================================
      // TỔNG CỘNG
      // =======================================================
      const totals = sumRows(rows);

      const totalRow = sheet.addRow([
        "",
        "",
        "TỔNG CỘNG",
        "",
        "",
        totals.total,
        totals.present,
        totals.absent,
        totals.late,
        totals.excused,
        rate(totals.present, totals.total),
        ...reportDates.map(() => ""),
      ]);

      totalRow.height = 30;

      totalRow.eachCell((cell) => {
        cell.font = {
          name: "Aptos",
          bold: true,
          color: { argb: C.white },
        };

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: C.navy },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
        };

        cell.border = {
          top: { style: "medium", color: { argb: C.gold } },
        };
      });

      totalRow.getCell(11).numFmt = "0.00%";

      // =======================================================
      // GHI CHÚ CUỐI BẢNG
      // =======================================================
      const noteRow = sheet.rowCount + 2;

      sheet.mergeCells(noteRow, 1, noteRow, lastCol);

      sheet.getCell(noteRow, 1).value =
        "Lưu ý: Tỷ lệ chuyên cần = Tổng lượt có mặt / Tổng lượt điểm danh. " +
        "Tỷ lệ tổng cộng được tính trên toàn bộ lượt điểm danh của học sinh. " +
        (reportDates.length > 0
          ? "C = Có mặt; M = Muộn; P = Có phép; V = Vắng; ô trống = không có bản ghi điểm danh trong ngày đó."
          : "");

      sheet.getCell(noteRow, 1).font = {
        italic: true,
        size: 9,
        color: { argb: C.muted },
      };

      sheet.getCell(noteRow, 1).alignment = {
        wrapText: true,
        vertical: "middle",
      };

      sheet.getRow(noteRow).height = 32;

      console.log(
        "[EXPORT] Sheet:",
        sheet.name,
        "| Students:",
        rows.length,
        "| Total attendance:",
        totals.total,
      );

      return { rows, totals, sheet };
    };

    // =========================================================
    // 8. LẤY DỮ LIỆU VÀ TẠO CÁC SHEET
    // =========================================================
    const reports = [];

    if (attendanceType === "catechism") {
      for (const classInfo of classes) {
        console.log("[EXPORT] Processing class:", {
          id: classInfo.id,
          name: classInfo.name,
          code: classInfo.code,
        });

        const rows = await getAttendanceRows(classInfo.id);

        const report = createAttendanceSheet({
          title: "BÁO CÁO CHUYÊN CẦN HỌC GIÁO LÝ",
          classInfo,
          rows,
          sheetName: `${classInfo.code || ""}-${classInfo.name || classInfo.id}`,
        });

        reports.push({
          name: classInfo.name || `Lớp ${classInfo.id}`,
          code: classInfo.code || "",
          ...report,
        });
      }
    } else {
      const rows = await getAttendanceRows(
        selectedClass ? selectedClass.id : null,
      );

      const report = createAttendanceSheet({
        title: "BÁO CÁO CHUYÊN CẦN THÁNH LỄ",
        rows,
        sheetName: "Thanh-le",
      });

      reports.push({
        name: selectedClass
          ? `Thánh lễ - ${selectedClass.name}`
          : "Toàn bộ Thánh lễ",
        code: "",
        ...report,
      });
    }

    // =========================================================
    // 9. SHEET TỔNG QUAN
    // =========================================================
    const overview = workbook.addWorksheet("Tong-quan", {
      properties: { tabColor: C.gold },
      views: [{ showGridLines: false }],
    });

    overview.columns = [
      { width: 28 },
      { width: 19 },
      { width: 19 },
      { width: 19 },
      { width: 19 },
      { width: 19 },
    ];

    styleTitle(overview, "FAITHEDU - TỔNG QUAN CHUYÊN CẦN", 6);

    overview.mergeCells("A4:F4");
    overview.getCell("A4").value = `Giáo xứ: ${church.name || ""}`;

    overview.getCell("A4").font = {
      bold: true,
      size: 12,
      color: { argb: C.navy },
    };

    overview.mergeCells("A5:F5");

    overview.getCell("A5").value = `Loại điểm danh: ${
      attendanceType === "mass" ? "Thánh lễ" : "Học giáo lý"
    }  |  Thời gian: ${getPeriodText()}`;

    overview.getCell("A5").font = {
      size: 10,
      color: { argb: C.muted },
    };

    const grand = reports.reduce(
      (acc, report) => {
        acc.students += report.rows.length;
        acc.total += report.totals.total;
        acc.present += report.totals.present;
        acc.absent += report.totals.absent;
        acc.late += report.totals.late;
        acc.excused += report.totals.excused;

        return acc;
      },
      {
        students: 0,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      },
    );

    const cards = [
      {
        label: "TỔNG LƯỢT ĐIỂM DANH",
        value: grand.total,
        color: C.navy,
      },
      {
        label: "CÓ MẶT",
        value: grand.present,
        color: C.green,
      },
      {
        label: "VẮNG",
        value: grand.absent,
        color: C.red,
      },
      {
        label: "ĐI TRỄ",
        value: grand.late,
        color: C.amber,
      },
      {
        label: "CÓ PHÉP",
        value: grand.excused,
        color: C.navy,
      },
      {
        label: "TỶ LỆ CHUYÊN CẦN",
        value: rate(grand.present, grand.total),
        color: C.green,
        percent: true,
      },
    ];

    const cardPositions = [
      ["A7:B7", "A8:B9"],
      ["C7:D7", "C8:D9"],
      ["E7:F7", "E8:F9"],
      ["A11:B11", "A12:B13"],
      ["C11:D11", "C12:D13"],
      ["E11:F11", "E12:F13"],
    ];

    cards.forEach((card, index) => {
      const [labelRange, valueRange] = cardPositions[index];

      overview.mergeCells(labelRange);
      overview.mergeCells(valueRange);

      const labelCell = overview.getCell(labelRange.split(":")[0]);

      const valueCell = overview.getCell(valueRange.split(":")[0]);

      labelCell.value = card.label;

      labelCell.font = {
        bold: true,
        size: 10,
        color: { argb: C.white },
      };

      labelCell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: card.color },
      };

      valueCell.value = card.value;

      valueCell.font = {
        bold: true,
        size: 22,
        color: { argb: card.color },
      };

      valueCell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      valueCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: C.cream },
      };

      if (card.percent) {
        valueCell.numFmt = "0.00%";
      }

      for (const range of [labelRange, valueRange]) {
        const [start, end] = range.split(":");

        const startCell = overview.getCell(start);
        const endCell = overview.getCell(end);

        for (let r = startCell.row; r <= endCell.row; r++) {
          for (let col = startCell.col; col <= endCell.col; col++) {
            overview.getCell(r, col).border = {
              top: {
                style: "thin",
                color: { argb: C.border },
              },
              bottom: {
                style: "thin",
                color: { argb: C.border },
              },
              left: {
                style: "thin",
                color: { argb: C.border },
              },
              right: {
                style: "thin",
                color: { argb: C.border },
              },
            };
          }
        }
      }
    });

    // =========================================================
    // 10. BẢNG SO SÁNH VÀ THANH TRỰC QUAN
    // =========================================================
    overview.mergeCells("A16:F16");

    overview.getCell("A16").value = "THỐNG KÊ THEO LỚP / PHẠM VI";

    overview.getCell("A16").font = {
      bold: true,
      size: 12,
      color: { argb: C.white },
    };

    overview.getCell("A16").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.navy },
    };

    const summaryHeader = overview.getRow(17);

    summaryHeader.values = [
      "Lớp / phạm vi",
      "Tổng lượt",
      "Có mặt",
      "Vắng",
      "Trễ",
      "Tỷ lệ chuyên cần",
    ];

    styleHeader(summaryHeader);

    reports.forEach((report) => {
      const row = overview.addRow([
        report.name,
        report.totals.total,
        report.totals.present,
        report.totals.absent,
        report.totals.late,
        rate(report.totals.present, report.totals.total),
      ]);

      row.getCell(6).numFmt = "0.00%";
    });

    if (reports.length > 0) {
      styleDataRows(overview, 18, 17 + reports.length, 6);

      for (let r = 18; r <= 17 + reports.length; r++) {
        overview.getCell(r, 6).numFmt = "0.00%";
      }
    }

    const legendRow = 19 + reports.length;

    overview.mergeCells(legendRow, 1, legendRow, 6);

    overview.getCell(legendRow, 1).value =
      "BÁO CÁO ĐƯỢC TẠO TỰ ĐỘNG BỞI FAITHEDU";

    overview.getCell(legendRow, 1).font = {
      bold: true,
      color: { argb: C.gold },
    };

    overview.getCell(legendRow, 1).alignment = {
      horizontal: "center",
    };

    overview.views = [
      {
        state: "frozen",
        ySplit: 5,
        showGridLines: false,
      },
    ];

    // =========================================================
    // 11. XUẤT FILE EXCEL
    // =========================================================
    const safePeriod = (() => {
      if (month !== null && year !== null) {
        return `thang-${month}-${year}`;
      }

      if (date) {
        return `ngay-${date}`;
      }

      if (from || to) {
        return `tu-${from || "dau-ky"}-den-${to || "cuoi-ky"}`;
      }

      return "tat-ca";
    })();

    const typeName = attendanceType === "mass" ? "thanh-le" : "hoc-giao-ly";

    const fileName = `bao-cao-chuyen-can-${typeName}-${safePeriod}.xlsx`;

    console.log("[EXPORT] Preparing workbook buffer...");

    const buffer = await workbook.xlsx.writeBuffer();

    console.log(
      "[EXPORT] Sheets:",
      workbook.worksheets.map((sheet) => sheet.name),
    );

    console.log("[EXPORT] Students:", grand.students);
    console.log("[EXPORT] Total attendance:", grand.total);
    console.log("[EXPORT] Buffer size:", buffer.length);
    console.log("[EXPORT] Report dates count:", reportDates.length);

    console.log(
      "[EXPORT] Workbook detail:",
      JSON.stringify({
        sheetCount: workbook.worksheets.length,
        sheets: workbook.worksheets.map((sheet) => ({
          name: sheet.name,
          rows: sheet.rowCount,
          columns: sheet.columnCount,
        })),
        summary: {
          students: grand.students,
          total: grand.total,
          present: grand.present,
          absent: grand.absent,
          late: grand.late,
          excused: grand.excused,
        },
      }),
    );

    console.log("[EXPORT] SUCCESS:", fileName);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );

    res.setHeader("Content-Length", buffer.length);

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(
      "\n============================================================",
    );

    console.error("EXPORT ATTENDANCE REPORT ERROR");
    console.error("MESSAGE:", error?.message);
    console.error("CODE:", error?.code);
    console.error("SQL STATE:", error?.sqlState);
    console.error("SQL MESSAGE:", error?.sqlMessage);
    console.error("STACK:", error?.stack);

    console.error(
      "============================================================",
    );

    if (res.headersSent) {
      return res.end();
    }

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

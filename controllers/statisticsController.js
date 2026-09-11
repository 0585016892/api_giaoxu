const db = require("../config/db");

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
 * Không lọc tháng/năm.
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

        c.day_of_week,
        c.start_time,
        c.end_time,

        COUNT(
          CASE
            WHEN cs.status IN (
              'studying',
              'completed'
            )
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

      LEFT JOIN class_students cs
        ON cs.class_id = c.id

      WHERE c.church_id = ?

      GROUP BY
        c.id,
        c.name,
        c.code,
        c.category,
        c.status,
        c.day_of_week,
        c.start_time,
        c.end_time

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

        day_of_week: item.day_of_week,

        start_time: item.start_time,

        end_time: item.end_time,

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
 *
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
    // KHÔNG CHO DÙNG MONTH/YEAR VÀ FROM/TO CÙNG LÚC
    // =====================================================

    if (month !== null && year !== null && (from || to)) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể dùng đồng thời bộ lọc tháng/năm và từ ngày/đến ngày.",
      });
    }

    // =====================================================
    // VALIDATE CLASS ID
    // =====================================================

    if (classIdQuery !== undefined) {
      if (!classId || classId <= 0) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ.",
        });
      }

      /**
       * Quan trọng:
       * Kiểm tra class có thuộc giáo xứ hiện tại hay không.
       */
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
 * EXPORT
 * =========================================================
 */
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
 *
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
    // MONTH/YEAR VÀ FROM/TO KHÔNG DÙNG ĐỒNG THỜI
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
module.exports = {
  getOverview,
  getStudentStatistics,
  getClassStatistics,
  getAttendanceStatistics,
  getStudentAttendanceStatistics,
  getCatechistStatistics,
};

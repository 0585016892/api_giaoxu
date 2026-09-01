const db = require("../config/db");

/**
 * =========================================================
 * HELPER
 * =========================================================
 */

/**
 * Lấy user đăng nhập
 */
const getAuthUser = (req) => {
  return req.user || {};
};

/**
 * Lấy church_id
 *
 * Ưu tiên:
 * req.user.church_id
 * req.user.parish_id
 */
const getChurchId = (req) => {
  const user = getAuthUser(req);

  return Number(user.church_id || user.parish_id || 0);
};

/**
 * Lấy teacher_id
 *
 * Có thể tùy authMiddleware:
 * req.user.teacher_id
 * hoặc req.user.id
 */
const getTeacherId = (req) => {
  const user = getAuthUser(req);

  return Number(user.teacher_id || user.id || 0);
};

/**
 * Kiểm tra ngày YYYY-MM-DD
 */
const isValidDate = (date) => {
  if (!date || typeof date !== "string") {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00`);

  return !Number.isNaN(parsed.getTime());
};

/**
 * Các trạng thái điểm danh
 */
const VALID_STATUS = ["present", "absent", "late", "excused"];

/**
 * =========================================================
 * 1. GET ATTENDANCE
 *
 * GET /api/attendance
 *
 * Query:
 * ?class_id=17
 * &date=2026-09-01
 *
 * Lấy toàn bộ học sinh thuộc lớp
 * + trạng thái điểm danh trong ngày nếu đã có.
 * =========================================================
 */
const getAttendance = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const classId = Number(req.query.class_id);
    const date = req.query.date;

    /**
     * Validate class_id
     */
    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    /**
     * Validate date
     */
    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "date phải có định dạng YYYY-MM-DD",
      });
    }

    /**
     * =====================================================
     * KIỂM TRA LỚP THUỘC GIÁO XỨ
     * =====================================================
     */
    const [classRows] = await db.execute(
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

    if (classRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp trong giáo xứ",
      });
    }

    /**
     * =====================================================
     * LẤY HỌC SINH QUA class_students
     * =====================================================
     */
    const [rows] = await db.execute(
      `
        SELECT
          s.id AS student_id,
          s.name AS student_name,

          a.id AS attendance_id,
          a.status,
          a.check_in_time,
          a.note,
          a.teacher_id,
          a.attendance_date,
          a.created_at,
          a.updated_at

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id

        LEFT JOIN attendances a
          ON a.student_id = s.id
          AND a.class_id = ?
          AND a.attendance_date = ?
          AND a.church_id = ?

        WHERE cs.class_id = ?
          AND s.church_id = ?

        ORDER BY s.name ASC
      `,
      [classId, date, churchId, classId, churchId],
    );

    /**
     * =====================================================
     * THỐNG KÊ
     * =====================================================
     */

    const totalStudents = rows.length;

    const present = rows.filter((item) => item.status === "present").length;

    const absent = rows.filter((item) => item.status === "absent").length;

    const late = rows.filter((item) => item.status === "late").length;

    const excused = rows.filter((item) => item.status === "excused").length;

    const notAttended = rows.filter((item) => !item.status).length;

    return res.json({
      success: true,

      data: {
        class: classRows[0],

        date,

        total_students: totalStudents,

        present,

        absent,

        late,

        excused,

        not_attended: notAttended,

        students: rows,
      },
    });
  } catch (error) {
    console.error("GET ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy điểm danh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * 2. SAVE BULK ATTENDANCE
 *
 * POST /api/attendance/bulk
 *
 * Body:
 *
 * {
 *   "class_id": 17,
 *   "date": "2026-09-01",
 *   "students": [
 *      {
 *        "student_id": 1,
 *        "status": "present",
 *        "check_in_time": "07:30:00",
 *        "note": ""
 *      }
 *   ]
 * }
 * =========================================================
 */
const saveBulkAttendance = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const churchId = getChurchId(req);
    const teacherId = getTeacherId(req);

    /**
     * =====================================================
     * AUTH
     * =====================================================
     */

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    if (!teacherId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản giáo lý viên",
      });
    }

    const { class_id, date, students } = req.body;

    const classId = Number(class_id);

    /**
     * =====================================================
     * VALIDATE CLASS
     * =====================================================
     */

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    /**
     * =====================================================
     * VALIDATE DATE
     * =====================================================
     */

    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "date phải có định dạng YYYY-MM-DD",
      });
    }

    /**
     * =====================================================
     * VALIDATE STUDENTS
     * =====================================================
     */

    if (!Array.isArray(students)) {
      return res.status(400).json({
        success: false,
        message: "students phải là một mảng",
      });
    }

    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh không được rỗng",
      });
    }

    /**
     * =====================================================
     * KIỂM TRA LỚP
     * =====================================================
     */

    const [classRows] = await connection.execute(
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

    if (classRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lớp không thuộc giáo xứ của tài khoản",
      });
    }

    /**
     * =====================================================
     * LẤY HỌC SINH THUỘC LỚP
     *
     * classes
     *    ↓
     * class_students
     *    ↓
     * students
     * =====================================================
     */

    const [classStudents] = await connection.execute(
      `
          SELECT
            cs.student_id

          FROM class_students cs

          INNER JOIN students s
            ON s.id = cs.student_id

          WHERE cs.class_id = ?
            AND s.church_id = ?
        `,
      [classId, churchId],
    );

    /**
     * Set ID học sinh hợp lệ
     */
    const validStudentIds = new Set(
      classStudents.map((student) => Number(student.student_id)),
    );

    /**
     * =====================================================
     * VALIDATE TỪNG HỌC SINH
     * =====================================================
     */

    for (const item of students) {
      const studentId = Number(item.student_id);

      /**
       * student_id
       */
      if (!Number.isInteger(studentId) || studentId <= 0) {
        return res.status(400).json({
          success: false,
          message: "student_id không hợp lệ",
        });
      }

      /**
       * Học sinh có thuộc lớp không?
       */
      if (!validStudentIds.has(studentId)) {
        return res.status(403).json({
          success: false,
          message: `Học sinh ${studentId} không thuộc lớp này`,
        });
      }

      /**
       * Status
       */
      if (!VALID_STATUS.includes(item.status)) {
        return res.status(400).json({
          success: false,
          message: "status phải là present, absent, late hoặc excused",
        });
      }

      /**
       * Validate check_in_time nếu có
       */
      if (
        item.check_in_time &&
        !/^\d{2}:\d{2}:\d{2}$/.test(item.check_in_time)
      ) {
        return res.status(400).json({
          success: false,
          message: "check_in_time phải có dạng HH:mm:ss",
        });
      }
    }

    /**
     * =====================================================
     * CHỐNG GỬI TRÙNG STUDENT_ID
     * =====================================================
     */

    const studentIds = students.map((item) => Number(item.student_id));

    const uniqueStudentIds = new Set(studentIds);

    if (uniqueStudentIds.size !== studentIds.length) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh bị trùng student_id",
      });
    }

    /**
     * =====================================================
     * TRANSACTION
     * =====================================================
     */

    await connection.beginTransaction();

    /**
     * =====================================================
     * INSERT / UPDATE
     *
     * UNIQUE:
     * student_id
     * class_id
     * attendance_date
     *
     * Nếu đã có → UPDATE
     * Nếu chưa có → INSERT
     * =====================================================
     */

    for (const item of students) {
      const studentId = Number(item.student_id);

      const status = item.status;

      const checkInTime = item.check_in_time || null;

      const note = item.note || null;

      await connection.execute(
        `
          INSERT INTO attendances
          (
            church_id,
            class_id,
            student_id,
            teacher_id,
            attendance_date,
            status,
            check_in_time,
            note
          )

          VALUES (?, ?, ?, ?, ?, ?, ?, ?)

          ON DUPLICATE KEY UPDATE

            status = VALUES(status),

            check_in_time =
              VALUES(check_in_time),

            note =
              VALUES(note),

            teacher_id =
              VALUES(teacher_id),

            updated_at =
              CURRENT_TIMESTAMP
        `,
        [
          churchId,
          classId,
          studentId,
          teacherId,
          date,
          status,
          checkInTime,
          note,
        ],
      );
    }

    /**
     * Commit
     */
    await connection.commit();

    return res.json({
      success: true,

      message: "Lưu điểm danh thành công",

      data: {
        class_id: classId,

        date,

        teacher_id: teacherId,

        total: students.length,
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("SAVE BULK ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lưu điểm danh",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

/**
 * =========================================================
 * 3. UPDATE ONE ATTENDANCE
 *
 * PUT /api/attendance/:id
 * =========================================================
 */
const updateAttendance = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const teacherId = getTeacherId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const attendanceId = Number(req.params.id);

    if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID điểm danh không hợp lệ",
      });
    }

    const { status, check_in_time, note } = req.body;

    /**
     * Validate status
     */
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status phải là present, absent, late hoặc excused",
      });
    }

    /**
     * Validate time
     */
    if (check_in_time && !/^\d{2}:\d{2}:\d{2}$/.test(check_in_time)) {
      return res.status(400).json({
        success: false,
        message: "check_in_time phải có dạng HH:mm:ss",
      });
    }

    /**
     * Kiểm tra bản ghi
     */
    const [rows] = await db.execute(
      `
          SELECT
            id,
            class_id,
            student_id,
            attendance_date

          FROM attendances

          WHERE id = ?
            AND church_id = ?

          LIMIT 1
        `,
      [attendanceId, churchId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bản ghi điểm danh",
      });
    }

    /**
     * Update
     */
    await db.execute(
      `
        UPDATE attendances

        SET
          status = ?,

          check_in_time = ?,

          note = ?,

          teacher_id = ?,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = ?

          AND church_id = ?
      `,
      [
        status,
        check_in_time || null,
        note || null,
        teacherId || null,
        attendanceId,
        churchId,
      ],
    );

    return res.json({
      success: true,
      message: "Cập nhật điểm danh thành công",
    });
  } catch (error) {
    console.error("UPDATE ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật điểm danh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * 4. DELETE ATTENDANCE
 *
 * DELETE /api/attendance/:id
 * =========================================================
 */
const deleteAttendance = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const attendanceId = Number(req.params.id);

    if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID điểm danh không hợp lệ",
      });
    }

    const [result] = await db.execute(
      `
          DELETE FROM attendances

          WHERE id = ?

            AND church_id = ?
        `,
      [attendanceId, churchId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bản ghi điểm danh",
      });
    }

    return res.json({
      success: true,
      message: "Xóa điểm danh thành công",
    });
  } catch (error) {
    console.error("DELETE ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa điểm danh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * 5. STUDENT ATTENDANCE HISTORY
 *
 * GET /api/attendance/student/:studentId
 *
 * LƯU Ý:
 * students không có class_id.
 *
 * Lớp được lấy từ attendances.class_id
 * và JOIN classes.
 * =========================================================
 */
const getStudentAttendance = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const studentId = Number(req.params.studentId);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    // =====================================================
    // MONTH / YEAR
    // =====================================================

    const currentDate = new Date();

    const month = req.query.month
      ? Number(req.query.month)
      : currentDate.getMonth() + 1;

    const year = req.query.year
      ? Number(req.query.year)
      : currentDate.getFullYear();

    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100
    ) {
      return res.status(400).json({
        success: false,
        message: "Tháng hoặc năm không hợp lệ",
      });
    }

    // =====================================================
    // KIỂM TRA HỌC SINH
    // =====================================================

    const [studentRows] = await db.execute(
      `
        SELECT
          s.id,
          s.name

        FROM students s

        WHERE s.id = ?
          AND s.church_id = ?

        LIMIT 1
      `,
      [studentId, churchId],
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =====================================================
    // LẤY LỊCH SỬ ĐIỂM DANH THEO THÁNG
    // =====================================================

    const [rows] = await db.execute(
      `
        SELECT
          a.id,
          a.class_id,

          c.name AS class_name,
          c.code AS class_code,

          a.attendance_date,
          a.status,
          a.check_in_time,
          a.note,
          a.teacher_id,
          a.created_at,
          a.updated_at

        FROM attendances a

        INNER JOIN classes c
          ON c.id = a.class_id

        WHERE a.student_id = ?
          AND a.church_id = ?
          AND c.church_id = ?

          AND YEAR(a.attendance_date) = ?
          AND MONTH(a.attendance_date) = ?

        ORDER BY
          a.attendance_date DESC,
          a.created_at DESC
      `,
      [studentId, churchId, churchId, year, month],
    );

    // =====================================================
    // SUMMARY
    // =====================================================

    const summary = {
      total: rows.length,

      present: rows.filter((x) => x.status === "present").length,

      absent: rows.filter((x) => x.status === "absent").length,

      late: rows.filter((x) => x.status === "late").length,

      excused: rows.filter((x) => x.status === "excused").length,
    };

    // =====================================================
    // ATTENDANCE RATE
    // =====================================================

    const attendanceRate =
      summary.total > 0
        ? (((summary.present + summary.late) / summary.total) * 100).toFixed(2)
        : "0.00";

    // =====================================================
    // DANH SÁCH THEO TỪNG TRẠNG THÁI
    // =====================================================

    const details = {
      present: rows.filter((x) => x.status === "present"),

      absent: rows.filter((x) => x.status === "absent"),

      late: rows.filter((x) => x.status === "late"),

      excused: rows.filter((x) => x.status === "excused"),
    };

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: {
        student: studentRows[0],

        month,
        year,

        summary: {
          ...summary,
          attendance_rate: Number(attendanceRate),
        },

        details,

        attendances: rows,
      },
    });
  } catch (error) {
    console.error("GET STUDENT ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử điểm danh",
      error: error.message,
    });
  }
};

const getClassStatistics = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const classId = Number(req.params.classId);

    const from = req.query.from || null;
    const to = req.query.to || null;

    /**
     * =====================================================
     * VALIDATE CLASS
     * =====================================================
     */

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
      });
    }

    /**
     * =====================================================
     * VALIDATE DATE
     * =====================================================
     */

    if (from && !isValidDate(from)) {
      return res.status(400).json({
        success: false,
        message: "from phải có định dạng YYYY-MM-DD",
      });
    }

    if (to && !isValidDate(to)) {
      return res.status(400).json({
        success: false,
        message: "to phải có định dạng YYYY-MM-DD",
      });
    }

    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message: "from không được lớn hơn to",
      });
    }

    /**
     * =====================================================
     * KIỂM TRA LỚP
     * =====================================================
     */

    const [classRows] = await db.execute(
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

    if (classRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp",
      });
    }

    /**
     * =====================================================
     * LẤY HỌC SINH
     *
     * QUAN TRỌNG:
     *
     * students KHÔNG CÓ class_id
     *
     * Quan hệ:
     *
     * class_students.class_id
     * class_students.student_id
     *
     * =====================================================
     */

    let sql = `
      SELECT

        s.id AS student_id,

        s.name AS student_name,

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

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id

      LEFT JOIN attendances a
        ON a.student_id = cs.student_id
        AND a.class_id = cs.class_id
        AND a.church_id = s.church_id

    `;

    const params = [];

    /**
     * =====================================================
     * WHERE
     * =====================================================
     */

    sql += `
      WHERE cs.class_id = ?
        AND s.church_id = ?
    `;

    params.push(classId, churchId);

    /**
     * =====================================================
     * DATE FILTER
     * =====================================================
     */

    if (from) {
      sql += `
        AND (
          a.id IS NULL
          OR a.attendance_date >= ?
        )
      `;

      params.push(from);
    }

    if (to) {
      sql += `
        AND (
          a.id IS NULL
          OR a.attendance_date <= ?
        )
      `;

      params.push(to);
    }

    /**
     * =====================================================
     * GROUP
     * =====================================================
     */

    sql += `
      GROUP BY
        s.id,
        s.name

      ORDER BY
        s.name ASC
    `;

    /**
     * =====================================================
     * EXECUTE
     * =====================================================
     */

    const [rows] = await db.execute(sql, params);

    /**
     * =====================================================
     * FORMAT DATA
     * =====================================================
     */

    const students = rows.map((item) => {
      const total = Number(item.total || 0);

      const present = Number(item.present || 0);

      const absent = Number(item.absent || 0);

      const late = Number(item.late || 0);

      const excused = Number(item.excused || 0);

      const attended = present + late;

      const attendanceRate =
        total > 0 ? ((attended / total) * 100).toFixed(2) : "0.00";

      return {
        student_id: Number(item.student_id),

        student_name: item.student_name,

        total,

        present,

        absent,

        late,

        excused,

        attendance_rate: Number(attendanceRate),
      };
    });

    /**
     * =====================================================
     * CLASS SUMMARY
     * =====================================================
     */

    const summary = {
      total_students: students.length,

      total_attendance: students.reduce((sum, item) => sum + item.total, 0),

      total_present: students.reduce((sum, item) => sum + item.present, 0),

      total_absent: students.reduce((sum, item) => sum + item.absent, 0),

      total_late: students.reduce((sum, item) => sum + item.late, 0),

      total_excused: students.reduce((sum, item) => sum + item.excused, 0),
    };

    /**
     * =====================================================
     * TỶ LỆ CHUYÊN CẦN TOÀN LỚP
     * =====================================================
     */

    const participated = summary.total_present + summary.total_late;

    summary.attendance_rate =
      summary.total_attendance > 0
        ? Number(((participated / summary.total_attendance) * 100).toFixed(2))
        : 0;

    /**
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return res.json({
      success: true,

      data: {
        class: classRows[0],

        from,

        to,

        summary,

        students,
      },
    });
  } catch (error) {
    console.error("GET CLASS STATISTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê điểm danh",
      error: error.message,
    });
  }
};
/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = {
  getAttendance,

  saveBulkAttendance,

  updateAttendance,

  deleteAttendance,

  getStudentAttendance,

  getClassStatistics,
};

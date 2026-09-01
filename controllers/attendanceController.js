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
 * Tùy authMiddleware của project:
 * req.user.id
 * req.user.teacher_id
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

  return /^\d{4}-\d{2}-\d{2}$/.test(date);
};

/**
 * Kiểm tra status
 */
const VALID_STATUS = ["present", "absent", "late", "excused"];

/**
 * =========================================================
 * 1. GET ATTENDANCE
 * GET /api/attendance
 *
 * Query:
 * ?class_id=17
 * &date=2026-09-01
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

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "date phải có định dạng YYYY-MM-DD",
      });
    }

    /**
     * Kiểm tra lớp thuộc giáo xứ
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
     * Lấy toàn bộ học sinh của lớp
     * + điểm danh nếu đã có
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
          a.created_at,
          a.updated_at

        FROM students s

        LEFT JOIN attendances a
          ON a.student_id = s.id
          AND a.class_id = ?
          AND a.attendance_date = ?
          AND a.church_id = ?

        WHERE s.class_id = ?
          AND s.church_id = ?

        ORDER BY s.name ASC
      `,
      [classId, date, churchId, classId, churchId],
    );

    return res.json({
      success: true,

      data: {
        class: classRows[0],
        date,

        total_students: rows.length,

        present: rows.filter((item) => item.status === "present").length,

        absent: rows.filter((item) => item.status === "absent").length,

        late: rows.filter((item) => item.status === "late").length,

        excused: rows.filter((item) => item.status === "excused").length,

        not_attended: rows.filter((item) => !item.status).length,

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
 * 2. BULK ATTENDANCE
 *
 * POST /api/attendance/bulk
 *
 * Body:
 * {
 *   class_id: 17,
 *   date: "2026-09-01",
 *   students: [
 *      {
 *        student_id: 1,
 *        status: "present",
 *        check_in_time: "07:30:00",
 *        note: ""
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

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "date phải có định dạng YYYY-MM-DD",
      });
    }

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
     * Kiểm tra lớp
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
     * Lấy danh sách học sinh hợp lệ
     */
    const [classStudents] = await connection.execute(
      `
        SELECT id
        FROM students
        WHERE class_id = ?
          AND church_id = ?
      `,
      [classId, churchId],
    );

    const validStudentIds = new Set(
      classStudents.map((student) => Number(student.id)),
    );

    /**
     * Validate dữ liệu
     */
    for (const item of students) {
      const studentId = Number(item.student_id);

      if (!Number.isInteger(studentId) || studentId <= 0) {
        return res.status(400).json({
          success: false,
          message: "student_id không hợp lệ",
        });
      }

      if (!validStudentIds.has(studentId)) {
        return res.status(403).json({
          success: false,
          message: `Học sinh ${studentId} không thuộc lớp này`,
        });
      }

      if (!VALID_STATUS.includes(item.status)) {
        return res.status(400).json({
          success: false,
          message: "status phải là present, absent, late hoặc excused",
        });
      }
    }

    await connection.beginTransaction();

    /**
     * INSERT hoặc UPDATE
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
            check_in_time = VALUES(check_in_time),
            note = VALUES(note),
            teacher_id = VALUES(teacher_id),
            updated_at = CURRENT_TIMESTAMP
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

    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status phải là present, absent, late hoặc excused",
      });
    }

    const [rows] = await db.execute(
      `
        SELECT id
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

    await db.execute(
      `
        UPDATE attendances
        SET
          status = ?,
          check_in_time = ?,
          note = ?,
          teacher_id = ?,
          updated_at = CURRENT_TIMESTAMP
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

    /**
     * Kiểm tra học sinh
     */
    const [studentRows] = await db.execute(
      `
        SELECT
          s.id,
          s.name,
          s.class_id,
          c.name AS class_name

        FROM students s

        LEFT JOIN classes c
          ON c.id = s.class_id
          AND c.church_id = s.church_id

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

    const [rows] = await db.execute(
      `
        SELECT
          a.id,
          a.attendance_date,
          a.status,
          a.check_in_time,
          a.note,
          a.teacher_id,
          a.created_at,
          a.updated_at

        FROM attendances a

        WHERE a.student_id = ?
          AND a.church_id = ?

        ORDER BY
          a.attendance_date DESC
      `,
      [studentId, churchId],
    );

    const summary = {
      total: rows.length,

      present: rows.filter((x) => x.status === "present").length,

      absent: rows.filter((x) => x.status === "absent").length,

      late: rows.filter((x) => x.status === "late").length,

      excused: rows.filter((x) => x.status === "excused").length,
    };

    const attendanceRate =
      summary.total > 0
        ? (((summary.present + summary.late) / summary.total) * 100).toFixed(2)
        : "0.00";

    return res.json({
      success: true,

      data: {
        student: studentRows[0],

        summary: {
          ...summary,
          attendance_rate: Number(attendanceRate),
        },

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

/**
 * =========================================================
 * 6. CLASS STATISTICS
 *
 * GET /api/attendance/statistics/class/:classId
 *
 * Query:
 * ?from=2026-08-01
 * &to=2026-08-31
 * =========================================================
 */
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

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
      });
    }

    /**
     * Kiểm tra lớp
     */
    const [classRows] = await db.execute(
      `
        SELECT id, name, code
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

    let sql = `
      SELECT
        s.id AS student_id,
        s.name AS student_name,

        COUNT(a.id) AS total,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused

      FROM students s

      LEFT JOIN attendances a
        ON a.student_id = s.id
        AND a.class_id = s.class_id
        AND a.church_id = s.church_id
    `;

    const params = [];

    sql += `
      WHERE s.class_id = ?
        AND s.church_id = ?
    `;

    params.push(classId, churchId);

    if (from && to) {
      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({
          success: false,
          message: "from và to phải có định dạng YYYY-MM-DD",
        });
      }

      sql += `
        AND (
          a.attendance_date IS NULL
          OR a.attendance_date BETWEEN ? AND ?
        )
      `;

      params.push(from, to);
    }

    sql += `
      GROUP BY
        s.id,
        s.name

      ORDER BY s.name ASC
    `;

    const [rows] = await db.execute(sql, params);

    const data = rows.map((item) => {
      const total = Number(item.total || 0);
      const present = Number(item.present || 0);
      const late = Number(item.late || 0);

      const rate =
        total > 0 ? (((present + late) / total) * 100).toFixed(2) : "0.00";

      return {
        ...item,

        total,
        present,
        absent: Number(item.absent || 0),
        late,
        excused: Number(item.excused || 0),

        attendance_rate: Number(rate),
      };
    });

    return res.json({
      success: true,

      data: {
        class: classRows[0],
        from,
        to,

        students: data,
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

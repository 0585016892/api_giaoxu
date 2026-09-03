const db = require("../config/db");

/**
 * =========================================================
 * CONFIG
 * =========================================================
 */

const VALID_STATUS = ["present", "absent", "late", "excused"];

const MAX_BULK_STUDENTS = 1000;
const MAX_NOTE_LENGTH = 255;

/**
 * =========================================================
 * AUTH HELPERS
 * =========================================================
 */

const getAuthUser = (req) => {
  return req?.user || {};
};

const toPositiveInt = (value) => {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return 0;
  }

  return number;
};

const getChurchId = (req) => {
  const user = getAuthUser(req);

  return toPositiveInt(user.church_id || user.parish_id || 0);
};

const getTeacherId = (req) => {
  const user = getAuthUser(req);

  return toPositiveInt(user.teacher_id || user.id || 0);
};

/**
 * =========================================================
 * VALIDATORS
 * =========================================================
 */

/**
 * Validate YYYY-MM-DD thật sự tồn tại.
 * Ví dụ:
 * 2026-02-31 => false
 * 2026-02-28 => true
 */
const isValidDate = (date) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

/**
 * Validate HH:mm:ss
 */
const isValidTime = (time) => {
  if (typeof time !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    return false;
  }

  const [hour, minute, second] = time.split(":").map(Number);

  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
};

/**
 * =========================================================
 * QR HELPERS
 * =========================================================
 */

/**
 * QR có thể là:
 *
 * 1. 846cee63a74f11f19cdce0d55eb860a8
 *
 * hoặc:
 *
 * 2. GLQR:846cee63a74f11f19cdce0d55eb860a8
 *
 * Token hiện tại của hệ thống có thể 32 ký tự.
 * Token mới có thể 64 ký tự.
 */
const normalizeQrToken = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  let token = value.trim();

  if (!token) {
    return null;
  }

  // Loại bỏ prefix GLQR:
  if (token.toUpperCase().startsWith("GLQR:")) {
    token = token.substring(5).trim();
  }

  // Token phải là hex, từ 32 đến 64 ký tự
  if (!/^[a-fA-F0-9]{32,64}$/.test(token)) {
    return null;
  }

  return token;
};

/**
 * Không bao giờ log full QR token.
 */
const maskQrToken = (token) => {
  if (!token || token.length < 10) {
    return "***";
  }

  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
};

/**
 * =========================================================
 * ERROR HELPERS
 * =========================================================
 */

const getErrorMessage = (error) => {
  if (process.env.NODE_ENV === "development") {
    return error?.message || "Unknown error";
  }

  return undefined;
};

const safeRollback = async (connection, transactionStarted) => {
  if (!connection || !transactionStarted) {
    return;
  }

  try {
    await connection.rollback();
  } catch (rollbackError) {
    console.error("ROLLBACK ERROR:", rollbackError?.message);
  }
};

/**
 * =========================================================
 * GET ATTENDANCE
 * =========================================================
 *
 * GET /attendance?class_id=17&date=2026-09-03
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

    const classId = toPositiveInt(req?.query?.class_id);

    const date = req?.query?.date;

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "Ngày điểm danh không hợp lệ",
      });
    }

    /**
     * Kiểm tra lớp có thuộc giáo xứ không.
     */
    const [classRows] = await db.execute(
      `
      SELECT id, name
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    /**
     * Lấy danh sách học sinh thuộc lớp
     * và trạng thái điểm danh của ngày.
     */
    const [rows] = await db.execute(
      `
      SELECT
        s.id AS student_id,
        s.code,
        s.name,
        s.status AS student_status,

        a.id AS attendance_id,
        a.status AS attendance_status,
        a.check_in_time,
        a.note,
        a.teacher_id,
        a.attendance_date

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id
       AND s.church_id = ?

      LEFT JOIN attendances a
        ON a.student_id = s.id
       AND a.class_id = ?
       AND a.church_id = ?
       AND a.attendance_date = ?

      WHERE cs.class_id = ?

      ORDER BY
        s.name ASC,
        s.id ASC
      `,
      [churchId, classId, churchId, date, classId],
    );

    const statistics = {
      total: rows.length,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      not_attended: 0,
    };

    for (const row of rows) {
      if (!row.attendance_status) {
        statistics.not_attended++;
        continue;
      }

      if (
        Object.prototype.hasOwnProperty.call(statistics, row.attendance_status)
      ) {
        statistics[row.attendance_status]++;
      }
    }

    return res.json({
      success: true,
      class: classRows[0],
      date,
      statistics,
      data: rows,
    });
  } catch (error) {
    console.error("GET ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải dữ liệu điểm danh",
      ...(getErrorMessage(error) ? { error: getErrorMessage(error) } : {}),
    });
  }
};

/**
 * =========================================================
 * SAVE BULK ATTENDANCE
 * =========================================================
 *
 * POST /attendance/bulk
 *
 * Body:
 * {
 *   "class_id": 17,
 *   "attendance_date": "2026-09-03",
 *   "students": [
 *      {
 *        "student_id": 1,
 *        "status": "present",
 *        "check_in_time": "18:30:00",
 *        "note": "..."
 *      }
 *   ]
 * }
 */
const saveBulkAttendance = async (req, res) => {
  let connection = null;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

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
        message: "Không xác định được giáo lý viên",
      });
    }

    const body = req?.body || {};

    const classId = toPositiveInt(body.class_id);
    const attendanceDate = body.attendance_date;
    const students = body.students;

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    if (!isValidDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        message: "attendance_date không hợp lệ",
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
        message: "Danh sách học sinh không được để trống",
      });
    }

    if (students.length > MAX_BULK_STUDENTS) {
      return res.status(400).json({
        success: false,
        message: `Không được gửi quá ${MAX_BULK_STUDENTS} học sinh trong một lần`,
      });
    }

    /**
     * -------------------------------------------------------
     * Kiểm tra lớp
     * -------------------------------------------------------
     */
    const [classRows] = await connection.execute(
      `
      SELECT id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Lớp học không tồn tại hoặc không thuộc giáo xứ",
      });
    }

    /**
     * -------------------------------------------------------
     * Validate toàn bộ payload trước khi transaction
     * -------------------------------------------------------
     */

    const normalizedStudents = [];
    const studentIdSet = new Set();

    for (let index = 0; index < students.length; index++) {
      const item = students[index];

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return res.status(400).json({
          success: false,
          message: `Dữ liệu học sinh tại vị trí ${index} không hợp lệ`,
        });
      }

      const studentId = toPositiveInt(item.student_id);

      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: `student_id tại vị trí ${index} không hợp lệ`,
        });
      }

      if (studentIdSet.has(studentId)) {
        return res.status(400).json({
          success: false,
          message: `Học sinh ID ${studentId} bị trùng trong danh sách`,
        });
      }

      studentIdSet.add(studentId);

      const status = item.status;

      if (!VALID_STATUS.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Trạng thái điểm danh của học sinh ${studentId} không hợp lệ`,
        });
      }

      let checkInTime = null;

      if (
        item.check_in_time !== null &&
        item.check_in_time !== undefined &&
        item.check_in_time !== ""
      ) {
        if (!isValidTime(item.check_in_time)) {
          return res.status(400).json({
            success: false,
            message: `check_in_time của học sinh ${studentId} không hợp lệ`,
          });
        }

        checkInTime = item.check_in_time;
      }

      let note = null;

      if (item.note !== null && item.note !== undefined && item.note !== "") {
        if (typeof item.note !== "string") {
          return res.status(400).json({
            success: false,
            message: `Ghi chú của học sinh ${studentId} phải là chuỗi`,
          });
        }

        note = item.note.trim();

        if (note.length > MAX_NOTE_LENGTH) {
          return res.status(400).json({
            success: false,
            message: `Ghi chú của học sinh ${studentId} không được quá ${MAX_NOTE_LENGTH} ký tự`,
          });
        }

        if (!note) {
          note = null;
        }
      }

      normalizedStudents.push({
        studentId,
        status,
        checkInTime,
        note,
      });
    }

    /**
     * -------------------------------------------------------
     * Kiểm tra tất cả học sinh thuộc lớp + giáo xứ
     * -------------------------------------------------------
     */
    const studentIds = normalizedStudents.map((item) => item.studentId);

    const placeholders = studentIds.map(() => "?").join(",");

    const [validStudents] = await connection.execute(
      `
        SELECT
          s.id
        FROM students s

        INNER JOIN class_students cs
          ON cs.student_id = s.id
         AND cs.class_id = ?

        WHERE s.church_id = ?
          AND s.id IN (${placeholders})
        `,
      [classId, churchId, ...studentIds],
    );

    const validStudentSet = new Set(validStudents.map((row) => Number(row.id)));

    const invalidStudents = studentIds.filter((id) => !validStudentSet.has(id));

    if (invalidStudents.length) {
      return res.status(400).json({
        success: false,
        message:
          "Có học sinh không tồn tại, không thuộc giáo xứ hoặc chưa được xếp vào lớp",
        invalid_student_ids: invalidStudents,
      });
    }

    /**
     * -------------------------------------------------------
     * TRANSACTION
     * -------------------------------------------------------
     */
    await connection.beginTransaction();
    transactionStarted = true;

    for (const item of normalizedStudents) {
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
          teacher_id = VALUES(teacher_id),
          status = VALUES(status),
          check_in_time = VALUES(check_in_time),
          note = VALUES(note),
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          churchId,
          classId,
          item.studentId,
          teacherId,
          attendanceDate,
          item.status,
          item.checkInTime,
          item.note,
        ],
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Lưu điểm danh thành công",
      count: normalizedStudents.length,
      class_id: classId,
      attendance_date: attendanceDate,
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted);

    console.error("SAVE BULK ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lưu điểm danh",
      ...(getErrorMessage(error) ? { error: getErrorMessage(error) } : {}),
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * =========================================================
 * UPDATE ATTENDANCE
 * =========================================================
 *
 * PUT /attendance/:id
 */
const updateAttendance = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const attendanceId = toPositiveInt(req?.params?.id);

    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        message: "ID điểm danh không hợp lệ",
      });
    }

    const body = req?.body || {};

    const status = body.status;

    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái điểm danh không hợp lệ",
      });
    }

    let checkInTime = null;

    if (
      body.check_in_time !== null &&
      body.check_in_time !== undefined &&
      body.check_in_time !== ""
    ) {
      if (!isValidTime(body.check_in_time)) {
        return res.status(400).json({
          success: false,
          message: "check_in_time không hợp lệ",
        });
      }

      checkInTime = body.check_in_time;
    }

    let note = null;

    if (body.note !== null && body.note !== undefined && body.note !== "") {
      if (typeof body.note !== "string") {
        return res.status(400).json({
          success: false,
          message: "note phải là chuỗi",
        });
      }

      note = body.note.trim();

      if (note.length > MAX_NOTE_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `note không được quá ${MAX_NOTE_LENGTH} ký tự`,
        });
      }

      if (!note) {
        note = null;
      }
    }

    const teacherId = getTeacherId(req);

    /**
     * Chỉ update bản ghi thuộc giáo xứ hiện tại.
     */
    const [existingRows] = await db.execute(
      `
      SELECT
        id,
        church_id,
        class_id,
        student_id
      FROM attendances
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [attendanceId, churchId],
    );

    if (!existingRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bản ghi điểm danh",
      });
    }

    await db.execute(
      `
      UPDATE attendances
      SET
        teacher_id = ?,
        status = ?,
        check_in_time = ?,
        note = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND church_id = ?
      `,
      [teacherId || null, status, checkInTime, note, attendanceId, churchId],
    );

    return res.json({
      success: true,
      message: "Cập nhật điểm danh thành công",
    });
  } catch (error) {
    console.error("UPDATE ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật điểm danh",
      ...(getErrorMessage(error) ? { error: getErrorMessage(error) } : {}),
    });
  }
};

/**
 * =========================================================
 * DELETE ATTENDANCE
 * =========================================================
 *
 * DELETE /attendance/:id
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

    const attendanceId = toPositiveInt(req?.params?.id);

    if (!attendanceId) {
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

    if (!result.affectedRows) {
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
      message: "Không thể xóa điểm danh",
      ...(getErrorMessage(error) ? { error: getErrorMessage(error) } : {}),
    });
  }
};

/**
 * =========================================================
 * GET STUDENT ATTENDANCE
 * =========================================================
 *
 * GET /attendance/student/:studentId
 *
 * Có thể truyền:
 * ?month=9&year=2026
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

    const studentId = toPositiveInt(req?.params?.studentId);

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    let month = Number(req?.query?.month);
    let year = Number(req?.query?.year);

    const now = new Date();

    if (!month) {
      month = now.getMonth() + 1;
    }

    if (!year) {
      year = now.getFullYear();
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "month không hợp lệ",
      });
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "year không hợp lệ",
      });
    }

    /**
     * Kiểm tra học sinh thuộc giáo xứ.
     */
    const [studentRows] = await db.execute(
      `
      SELECT
        id,
        code,
        full_name,
        status
      FROM students
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [studentId, churchId],
    );

    if (!studentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    const [rows] = await db.execute(
      `
      SELECT
        a.id,
        a.class_id,
        c.name AS class_name,
        a.attendance_date,
        a.status,
        a.check_in_time,
        a.note,
        a.teacher_id,
        a.created_at,
        a.updated_at

      FROM attendances a

      LEFT JOIN classes c
        ON c.id = a.class_id
       AND c.church_id = ?

      WHERE a.student_id = ?
        AND a.church_id = ?
        AND YEAR(a.attendance_date) = ?
        AND MONTH(a.attendance_date) = ?

      ORDER BY
        a.attendance_date DESC,
        a.id DESC
      `,
      [churchId, studentId, churchId, year, month],
    );

    const statistics = {
      total: rows.length,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };

    for (const row of rows) {
      if (Object.prototype.hasOwnProperty.call(statistics, row.status)) {
        statistics[row.status]++;
      }
    }

    return res.json({
      success: true,
      student: studentRows[0],
      month,
      year,
      statistics,
      data: rows,
    });
  } catch (error) {
    console.error("GET STUDENT ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải lịch sử điểm danh",
      ...(getErrorMessage(error) ? { error: getErrorMessage(error) } : {}),
    });
  }
};

/**
 * =========================================================
 * GET CLASS STATISTICS
 * =========================================================
 *
 * GET /attendance/statistics/:classId?from=2026-09-01&to=2026-09-30
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

    const classId = toPositiveInt(req?.params?.classId);

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
      });
    }

    let fromDate = req?.query?.from;
    let toDate = req?.query?.to;

    /**
     * Nếu không truyền khoảng ngày,
     * mặc định lấy toàn bộ.
     */
    if (fromDate && !isValidDate(fromDate)) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không hợp lệ",
      });
    }

    if (toDate && !isValidDate(toDate)) {
      return res.status(400).json({
        success: false,
        message: "Ngày kết thúc không hợp lệ",
      });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: "Ngày bắt đầu không được lớn hơn ngày kết thúc",
      });
    }

    /**
     * Kiểm tra lớp.
     */
    const [classRows] = await db.execute(
      `
      SELECT
        id,
        name
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    /**
     * Query có hoặc không có khoảng ngày.
     */
    let query = `
      SELECT
        s.id AS student_id,
        s.code,
        s.name,

        COUNT(
          CASE
            WHEN a.status = 'present'
            THEN 1
          END
        ) AS present_count,

        COUNT(
          CASE
            WHEN a.status = 'absent'
            THEN 1
          END
        ) AS absent_count,

        COUNT(
          CASE
            WHEN a.status = 'late'
            THEN 1
          END
        ) AS late_count,

        COUNT(
          CASE
            WHEN a.status = 'excused'
            THEN 1
          END
        ) AS excused_count,

        COUNT(a.id) AS total_attendance

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id
       AND s.church_id = ?

      LEFT JOIN attendances a
        ON a.student_id = s.id
       AND a.class_id = ?
       AND a.church_id = ?
    `;

    const params = [churchId, classId, churchId];

    if (fromDate && toDate) {
      query += `
        AND a.attendance_date BETWEEN ? AND ?
      `;

      params.push(fromDate, toDate);
    } else if (fromDate) {
      query += `
        AND a.attendance_date >= ?
      `;

      params.push(fromDate);
    } else if (toDate) {
      query += `
        AND a.attendance_date <= ?
      `;

      params.push(toDate);
    }

    query += `
      WHERE cs.class_id = ?

      GROUP BY
        s.id,
        s.code,
        s.name

      ORDER BY
        s.name ASC,
        s.id ASC
    `;

    params.push(classId);

    const [rows] = await db.execute(query, params);

    /**
     * Tổng thống kê.
     */
    const summary = {
      students: rows.length,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total_attendance: 0,
    };

    for (const row of rows) {
      summary.present += Number(row.present_count || 0);

      summary.absent += Number(row.absent_count || 0);

      summary.late += Number(row.late_count || 0);

      summary.excused += Number(row.excused_count || 0);

      summary.total_attendance += Number(row.total_attendance || 0);
    }

    return res.json({
      success: true,
      class: classRows[0],
      from: fromDate || null,
      to: toDate || null,
      summary,
      data: rows,
    });
  } catch (error) {
    console.error("GET CLASS STATISTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải thống kê điểm danh",
      ...(getErrorMessage(error) ? { error: getErrorMessage(error) } : {}),
    });
  }
};

/**
 * =========================================================
 * SCAN QR CODE
 * =========================================================
 *
 * POST /attendance/scan-qr
 *
 * Body:
 * {
 *   "qr_token": "846cee63a74f11f19cdce0d55eb860a8",
 *   "class_id": 17
 * }
 *
 * QR có thể:
 *
 * 846cee63a74f11f19cdce0d55eb860a8
 *
 * hoặc:
 *
 * GLQR:846cee63a74f11f19cdce0d55eb860a8
 *
 * =========================================================
 */
const scanQRCode = async (req, res) => {
  let connection = null;
  let transactionStarted = false;

  let maskedToken = "***";

  try {
    connection = await db.getConnection();

    const churchId = getChurchId(req);
    const teacherId = getTeacherId(req);

    /**
     * -------------------------------------------------------
     * AUTH
     * -------------------------------------------------------
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
        message: "Không xác định được giáo lý viên",
      });
    }

    /**
     * -------------------------------------------------------
     * BODY
     * -------------------------------------------------------
     */

    const body = req?.body || {};

    const classId = toPositiveInt(body.class_id);

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    /**
     * -------------------------------------------------------
     * QR TOKEN
     * -------------------------------------------------------
     */

    const qrToken = normalizeQrToken(body.qr_token);

    maskedToken = maskQrToken(qrToken);

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: "Mã QR không hợp lệ hoặc đã bị hỏng",
      });
    }

    /**
     * -------------------------------------------------------
     * KIỂM TRA LỚP
     * -------------------------------------------------------
     */

    const [classRows] = await connection.execute(
      `
      SELECT
        id,
        name,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Lớp học không tồn tại hoặc không thuộc giáo xứ",
      });
    }

    /**
     * -------------------------------------------------------
     * TRANSACTION
     * -------------------------------------------------------
     *
     * Bắt đầu transaction trước khi lock
     * student / class / attendance.
     */
    await connection.beginTransaction();
    transactionStarted = true;

    /**
     * -------------------------------------------------------
     * LOCK CLASS
     * -------------------------------------------------------
     */
    const [lockedClassRows] = await connection.execute(
      `
        SELECT
          id,
          name,
          church_id
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
        `,
      [classId, churchId],
    );

    if (!lockedClassRows.length) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Lớp học không còn tồn tại",
      });
    }

    /**
     * -------------------------------------------------------
     * TÌM HỌC SINH THEO QR
     * -------------------------------------------------------
     *
     * Quan trọng:
     * QR chỉ được tìm trong chính giáo xứ.
     */
    const [studentRows] = await connection.execute(
      `
        SELECT
          id,
          code,
          full_name,
          status,
          church_id,
          qr_token
        FROM students
        WHERE qr_token = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
        `,
      [qrToken, churchId],
    );

    if (!studentRows.length) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      console.warn(
        `[QR] QR KHÔNG TỒN TẠI | token=${maskedToken} | church=${churchId} | class=${classId}`,
      );

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh với mã QR này",
      });
    }

    const student = studentRows[0];

    /**
     * -------------------------------------------------------
     * KIỂM TRA CHURCH
     * -------------------------------------------------------
     *
     * Dù SQL đã check church_id,
     * vẫn giữ lớp bảo vệ này.
     */
    if (Number(student.church_id) !== Number(churchId)) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(403).json({
        success: false,
        message: "Học sinh không thuộc giáo xứ hiện tại",
      });
    }

    /**
     * -------------------------------------------------------
     * KIỂM TRA STATUS HỌC SINH
     * -------------------------------------------------------
     */
    if (student.status !== "active") {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Học sinh hiện không ở trạng thái hoạt động",
        student: {
          id: student.id,
          code: student.code,
          full_name: student.full_name,
          status: student.status,
        },
      });
    }

    /**
     * -------------------------------------------------------
     * KIỂM TRA HỌC SINH CÓ TRONG LỚP KHÔNG
     * -------------------------------------------------------
     */
    const [membershipRows] = await connection.execute(
      `
        SELECT
          class_id,
          student_id
        FROM class_students
        WHERE class_id = ?
          AND student_id = ?
        LIMIT 1
        `,
      [classId, student.id],
    );

    if (!membershipRows.length) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Học sinh này không thuộc lớp đang điểm danh",
        student: {
          id: student.id,
          code: student.code,
          full_name: student.full_name,
        },
        class: {
          id: classId,
          name: lockedClassRows[0].name,
        },
      });
    }

    /**
     * -------------------------------------------------------
     * KIỂM TRA ĐÃ ĐIỂM DANH HÔM NAY CHƯA
     * -------------------------------------------------------
     *
     * Dùng CURDATE() để ngày lấy trực tiếp từ MySQL.
     */
    const [existingAttendanceRows] = await connection.execute(
      `
        SELECT
          id,
          attendance_date,
          status,
          check_in_time,
          teacher_id,
          note
        FROM attendances
        WHERE student_id = ?
          AND class_id = ?
          AND church_id = ?
          AND attendance_date = CURDATE()
        LIMIT 1
        FOR UPDATE
        `,
      [student.id, classId, churchId],
    );

    if (existingAttendanceRows.length) {
      const existing = existingAttendanceRows[0];

      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "ALREADY_ATTENDED",
        message: "Học sinh này đã được điểm danh hôm nay",
        student: {
          id: student.id,
          code: student.code,
          full_name: student.full_name,
        },
        attendance: {
          id: existing.id,
          attendance_date: existing.attendance_date,
          status: existing.status,
          check_in_time: existing.check_in_time,
        },
      });
    }

    /**
     * -------------------------------------------------------
     * INSERT ATTENDANCE
     * -------------------------------------------------------
     *
     * CURDATE + CURTIME lấy trực tiếp từ DB.
     */
    let insertResult;

    try {
      const [result] = await connection.execute(
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
          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            CURDATE(),
            'present',
            CURTIME(),
            NULL
          )
          `,
        [churchId, classId, student.id, teacherId],
      );

      insertResult = result;
    } catch (insertError) {
      /**
       * -----------------------------------------------------
       * RACE CONDITION
       * -----------------------------------------------------
       *
       * Trường hợp:
       * Máy A và máy B cùng quét đúng lúc.
       *
       * Cả hai có thể cùng SELECT chưa có attendance,
       * nhưng UNIQUE KEY sẽ chặn INSERT thứ 2.
       */
      if (insertError?.code === "ER_DUP_ENTRY") {
        await safeRollback(connection, transactionStarted);

        transactionStarted = false;

        return res.status(409).json({
          success: false,
          code: "ALREADY_ATTENDED",
          message: "Học sinh này vừa được điểm danh bởi một thiết bị khác",
        });
      }

      throw insertError;
    }

    /**
     * -------------------------------------------------------
     * LẤY LẠI RECORD VỪA INSERT
     * -------------------------------------------------------
     *
     * Không dùng new Date() của Node.
     * Lấy trực tiếp từ MySQL để tránh lệch timezone.
     */
    const [savedRows] = await connection.execute(
      `
        SELECT
          id,
          attendance_date,
          check_in_time,
          status,
          student_id,
          class_id,
          teacher_id
        FROM attendances
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
      [insertResult.insertId, churchId],
    );

    if (!savedRows.length) {
      throw new Error("Không tìm thấy bản ghi điểm danh sau khi insert");
    }

    const savedAttendance = savedRows[0];

    /**
     * -------------------------------------------------------
     * COMMIT
     * -------------------------------------------------------
     */
    await connection.commit();
    transactionStarted = false;

    /**
     * -------------------------------------------------------
     * LOG
     * -------------------------------------------------------
     *
     * Không log full QR token.
     */
    console.log(
      `[QR] ĐIỂM DANH THÀNH CÔNG | token=${maskedToken} | student=${student.id} | class=${classId} | church=${churchId} | teacher=${teacherId}`,
    );

    return res.status(201).json({
      success: true,
      code: "ATTENDANCE_SUCCESS",
      message: "Điểm danh thành công",
      student: {
        id: student.id,
        code: student.code,
        full_name: student.full_name,
      },
      class: {
        id: classId,
        name: lockedClassRows[0].name,
      },
      attendance: {
        id: savedAttendance.id,
        attendance_date: savedAttendance.attendance_date,
        check_in_time: savedAttendance.check_in_time,
        status: savedAttendance.status,
      },
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted);

    console.error("SCAN QR ATTENDANCE ERROR:", {
      message: error?.message,
      code: error?.code,
      sqlState: error?.sqlState,
      token: maskedToken,
    });

    /**
     * Trường hợp UNIQUE KEY bị trùng
     * nhưng lọt ra ngoài inner try.
     */
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "ALREADY_ATTENDED",
        message: "Học sinh này đã được điểm danh hôm nay",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi quét mã QR",
      ...(getErrorMessage(error) ? { error: getErrorMessage(error) } : {}),
    });
  } finally {
    if (connection) {
      connection.release();
    }
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
  scanQRCode,
};

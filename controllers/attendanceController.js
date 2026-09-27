const db = require("../config/db");

/**
 * =========================================================
 * CONFIG
 * =========================================================
 */

const VALID_STATUS = ["present", "absent", "late", "excused"];

const VALID_ATTENDANCE_TYPES = ["mass", "catechism"];

const ATTENDANCE_TYPE_CONFIG = {
  mass: {
    label: "Thánh lễ",
  },

  catechism: {
    label: "Học giáo lý",
  },
};

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
 * ATTENDANCE TYPE HELPERS
 * =========================================================
 */

const normalizeAttendanceType = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const type = value.trim().toLowerCase();

  if (!VALID_ATTENDANCE_TYPES.includes(type)) {
    return null;
  }

  return type;
};

const getAttendanceTypeLabel = (type) => {
  return ATTENDANCE_TYPE_CONFIG[type]?.label || type;
};

/**
 * =========================================================
 * VALIDATORS
 * =========================================================
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
 * ATTENDANCE TIME LOGIC
 * =========================================================
 */

/**
 * Giáo lý:
 *
 * check_in_time < start_time
 * => present
 *
 * check_in_time >= start_time
 * => late
 *
 * Thánh lễ:
 *
 * Không dùng start_time của lịch lớp.
 * QR hoặc điểm danh có mặt => present.
 */

const getAttendanceStatusByStartTime = (checkInTime, startTime) => {
  if (!isValidTime(checkInTime)) {
    return "late";
  }

  if (!startTime || !isValidTime(startTime)) {
    return "present";
  }

  return checkInTime < startTime ? "present" : "late";
};

const calculateFinalStatus = ({
  attendanceType,
  requestedStatus,
  checkInTime,
  classStartTime,
}) => {
  /**
   * absent / excused giữ nguyên.
   */

  if (requestedStatus === "absent" || requestedStatus === "excused") {
    return requestedStatus;
  }

  /**
   * Thánh lễ:
   * Có mặt là present.
   *
   * Không tự tính late vì chưa có mass_start_time riêng.
   */

  if (attendanceType === "mass") {
    return "present";
  }

  /**
   * Giáo lý:
   * Tính theo start_time của lịch lớp trong class_schedules.
   */

  return getAttendanceStatusByStartTime(checkInTime, classStartTime);
};

const getCurrentTime = () => {
  return new Date().toTimeString().slice(0, 8);
};

/**
 * =========================================================
 * CLASS SCHEDULE HELPERS
 * =========================================================
 *
 * start_time không còn nằm trong bảng classes.
 * Lịch học nằm trong class_schedules và được xác định bởi:
 * - class_id
 * - day_of_week
 *
 * MySQL DAYOFWEEK():
 * 1 = Chủ nhật
 * 2 = Thứ 2
 * 3 = Thứ 3
 * 4 = Thứ 4
 * 5 = Thứ 5
 * 6 = Thứ 6
 * 7 = Thứ 7
 */

const getClassSchedule = async (executor, classId, date) => {
  if (!classId || !isValidDate(date)) {
    return null;
  }

  const [rows] = await executor.execute(
    `
      SELECT
        id,
        class_id,
        day_of_week,
        start_time,
        end_time,
        room
      FROM class_schedules
      WHERE
        class_id = ?
        AND day_of_week = DAYOFWEEK(?)
      ORDER BY id ASC
      LIMIT 1
    `,
    [classId, date],
  );

  return rows[0] || null;
};

const getCurrentDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * =========================================================
 * QR HELPERS
 * =========================================================
 */

const normalizeQrToken = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  let token = value.trim();

  if (!token) {
    return null;
  }

  if (token.toUpperCase().startsWith("GLQR:")) {
    token = token.substring(5).trim();
  }

  if (!/^[a-fA-F0-9]{32,64}$/.test(token)) {
    return null;
  }

  return token;
};

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
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || "";
};

const safeRollback = async (connection, transactionStarted) => {
  if (!connection || !transactionStarted) {
    return;
  }

  try {
    await connection.rollback();
  } catch (rollbackError) {
    console.error("ROLLBACK ERROR:", rollbackError);
  }
};

/**
 * =========================================================
 * GET ATTENDANCE
 * =========================================================
 *
 * GET /attendance
 *
 * Query:
 *
 * ?class_id=17
 * &date=2026-09-09
 * &attendance_type=mass
 * &page=1
 * &limit=10
 * &search=
 * &status=all
 */

const getAttendance = async (req, res) => {
  try {
    /**
     * =====================================================
     * AUTH
     * =====================================================
     */

    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    /**
     * =====================================================
     * QUERY PARAMS
     * =====================================================
     */

    const classId = toPositiveInt(req?.query?.class_id);

    const date =
      typeof req?.query?.date === "string" ? req.query.date.trim() : "";

    const attendanceType = normalizeAttendanceType(
      req?.query?.attendance_type || "catechism",
    );

    let page = Number.parseInt(req?.query?.page, 10);

    let limit = Number.parseInt(req?.query?.limit, 10);

    const search =
      typeof req?.query?.search === "string" ? req.query.search.trim() : "";

    const status =
      typeof req?.query?.status === "string"
        ? req.query.status.trim().toLowerCase()
        : "all";

    /**
     * =====================================================
     * VALIDATION
     * =====================================================
     */

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

    if (!attendanceType) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ",
      });
    }

    if (!Number.isInteger(page) || page < 1) {
      page = 1;
    }

    if (!Number.isInteger(limit) || limit < 1) {
      limit = 10;
    }

    if (limit > 100) {
      limit = 100;
    }

    if (
      status !== "all" &&
      status !== "present" &&
      status !== "absent" &&
      status !== "late" &&
      status !== "excused" &&
      status !== "not_attended"
    ) {
      return res.status(400).json({
        success: false,
        message: "status không hợp lệ",
      });
    }

    /**
     * =====================================================
     * CHECK CLASS
     * =====================================================
     */

    const [classRows] = await db.execute(
      `
        SELECT
          id,
          name

        FROM classes

        WHERE
          id = ?
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

    const classInfo = classRows[0];

    const classSchedule = await getClassSchedule(db, classId, date);

    /**
     * =====================================================
     * BASE QUERY
     * =====================================================
     */

    let whereSql = `
      WHERE
        cs.class_id = ?
        AND s.church_id = ?
    `;

    const params = [classId, churchId];

    if (search) {
      whereSql += `
        AND (
          s.name LIKE ?
          OR s.code LIKE ?
        )
      `;

      params.push(`%${search}%`, `%${search}%`);
    }

    /**
     * =====================================================
     * STATUS FILTER
     * =====================================================
     */

    if (status === "not_attended") {
      whereSql += `
        AND a.id IS NULL
      `;
    } else if (status !== "all") {
      whereSql += `
        AND a.status = ?
      `;

      params.push(status);
    }

    /**
     * =====================================================
     * COUNT
     * =====================================================
     */

    const [countRows] = await db.execute(
      `
        SELECT COUNT(*) AS total

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id
          AND s.church_id = ?

        LEFT JOIN attendances a
          ON a.student_id = s.id
          AND a.class_id = ?
          AND a.church_id = ?
          AND a.attendance_date = ?
          AND a.attendance_type = ?

        ${whereSql}
      `,
      [churchId, classId, churchId, date, attendanceType, ...params],
    );

    const total = Number(countRows[0]?.total || 0);

    /**
     * =====================================================
     * PAGINATION
     * =====================================================
     */

    const offset = (page - 1) * limit;

    /**
     * =====================================================
     * DATA
     * =====================================================
     */

    const [rows] = await db.execute(
      `
        SELECT
          s.id,
          s.code,
          s.name,
          s.gender,
          s.date_of_birth,

          a.id AS attendance_id,
          a.attendance_type,
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
          AND s.church_id = ?

        LEFT JOIN attendances a
          ON a.student_id = s.id
          AND a.class_id = ?
          AND a.church_id = ?
          AND a.attendance_date = ?
          AND a.attendance_type = ?

        ${whereSql}

        ORDER BY
          s.name ASC,
          s.id ASC

        LIMIT ? OFFSET ?
      `,
      [
        churchId,
        classId,
        churchId,
        date,
        attendanceType,
        ...params,
        limit,
        offset,
      ],
    );

    /**
     * =====================================================
     * STATISTICS
     * =====================================================
     */

    const [statsRows] = await db.execute(
      `
        SELECT
          COUNT(*) AS total,

          SUM(
            CASE
              WHEN a.status = 'present'
              THEN 1
              ELSE 0
            END
          ) AS present,

          SUM(
            CASE
              WHEN a.status = 'absent'
              THEN 1
              ELSE 0
            END
          ) AS absent,

          SUM(
            CASE
              WHEN a.status = 'late'
              THEN 1
              ELSE 0
            END
          ) AS late,

          SUM(
            CASE
              WHEN a.status = 'excused'
              THEN 1
              ELSE 0
            END
          ) AS excused,

          SUM(
            CASE
              WHEN a.id IS NULL
              THEN 1
              ELSE 0
            END
          ) AS not_attended

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id
          AND s.church_id = ?

        LEFT JOIN attendances a
          ON a.student_id = s.id
          AND a.class_id = ?
          AND a.church_id = ?
          AND a.attendance_date = ?
          AND a.attendance_type = ?

        WHERE
          cs.class_id = ?
      `,
      [churchId, classId, churchId, date, attendanceType, classId],
    );

    const stats = statsRows[0] || {};

    const totalStudents = Number(stats.total || 0);

    const present = Number(stats.present || 0);

    const absent = Number(stats.absent || 0);

    const late = Number(stats.late || 0);

    const excused = Number(stats.excused || 0);

    const notAttended = Number(stats.not_attended || 0);

    const attended = present + late;

    const attendanceRate =
      totalStudents > 0
        ? Number(((attended / totalStudents) * 100).toFixed(2))
        : 0;

    return res.json({
      success: true,

      class: {
        id: classInfo.id,
        name: classInfo.name,
        start_time: classSchedule?.start_time || null,
      },

      date,

      attendance_type: attendanceType,

      attendance_type_label: getAttendanceTypeLabel(attendanceType),

      statistics: {
        total: totalStudents,
        present,
        absent,
        late,
        excused,
        not_attended: notAttended,
        attendance_rate: attendanceRate,
      },

      pagination: {
        page,
        limit,
        total,
        total_pages: total > 0 ? Math.ceil(total / limit) : 0,
      },

      data: rows.map((row) => ({
        ...row,
        attendance_id: row.attendance_id || null,
        status: row.status || null,
        check_in_time: row.check_in_time || null,
        note: row.note || null,
      })),
    });
  } catch (error) {
    console.error("GET ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải dữ liệu điểm danh",

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
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
 * {
 *   class_id: 17,
 *   attendance_date: "2026-09-09",
 *   attendance_type: "catechism",
 *   students: [
 *     {
 *       student_id: 1,
 *       status: "present",
 *       check_in_time: "18:55:00",
 *       note: ""
 *     }
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

    const attendanceDate =
      typeof body.attendance_date === "string"
        ? body.attendance_date.trim()
        : "";

    const attendanceType = normalizeAttendanceType(
      body.attendance_type || "catechism",
    );

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

    if (!attendanceType) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ",
      });
    }

    if (!Array.isArray(students)) {
      return res.status(400).json({
        success: false,
        message: "students phải là một mảng",
      });
    }

    if (!students.length) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh không được để trống",
      });
    }

    if (students.length > MAX_BULK_STUDENTS) {
      return res.status(400).json({
        success: false,
        message: `Không được gửi quá ${MAX_BULK_STUDENTS} học sinh`,
      });
    }

    /**
     * CHECK CLASS
     */

    const [classRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id

          FROM classes

          WHERE
            id = ?
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

    const classInfo = classRows[0];

    const classSchedule = await getClassSchedule(
      connection,
      classId,
      attendanceDate,
    );

    /**
     * NORMALIZE STUDENTS
     */

    const normalizedStudents = [];

    for (const item of students) {
      const studentId = toPositiveInt(item?.student_id ?? item?.id);

      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: "student_id không hợp lệ",
        });
      }

      const requestedStatus =
        typeof item?.status === "string"
          ? item.status.trim().toLowerCase()
          : "";

      if (!VALID_STATUS.includes(requestedStatus)) {
        return res.status(400).json({
          success: false,
          message: `Trạng thái của học sinh ${studentId} không hợp lệ`,
        });
      }

      let checkInTime = null;

      if (
        item?.check_in_time !== undefined &&
        item?.check_in_time !== null &&
        item?.check_in_time !== ""
      ) {
        if (typeof item.check_in_time !== "string") {
          return res.status(400).json({
            success: false,
            message: `check_in_time của học sinh ${studentId} phải là chuỗi`,
          });
        }

        checkInTime = item.check_in_time.trim();

        if (!isValidTime(checkInTime)) {
          return res.status(400).json({
            success: false,
            message: `check_in_time của học sinh ${studentId} không hợp lệ`,
          });
        }
      }

      let note = null;

      if (item?.note !== undefined && item?.note !== null) {
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
            message: `Ghi chú không được quá ${MAX_NOTE_LENGTH} ký tự`,
          });
        }

        if (!note) {
          note = null;
        }
      }

      const finalStatus = calculateFinalStatus({
        attendanceType,
        requestedStatus,
        checkInTime,
        classStartTime: classSchedule?.start_time || null,
      });

      normalizedStudents.push({
        studentId,
        requestedStatus,
        finalStatus,
        checkInTime,
        note,
      });
    }

    /**
     * CHECK STUDENT MEMBERSHIP
     */

    const studentIds = normalizedStudents.map((item) => item.studentId);

    const placeholders = studentIds.map(() => "?").join(",");

    const [membershipRows] = await connection.execute(
      `
        SELECT
          cs.student_id,
          s.id,
          s.code,
          s.name

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id
          AND s.church_id = ?

        WHERE
          cs.class_id = ?
          AND cs.student_id IN (${placeholders})
      `,
      [churchId, classId, ...studentIds],
    );

    const membershipMap = new Map(
      membershipRows.map((row) => [Number(row.student_id), row]),
    );

    for (const item of normalizedStudents) {
      if (!membershipMap.has(item.studentId)) {
        return res.status(400).json({
          success: false,
          message: `Học sinh ${item.studentId} không thuộc lớp này`,
        });
      }
    }

    /**
     * BEGIN TRANSACTION
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * LOCK CLASS
     */

    const [lockedClassRows] = await connection.execute(
      `
          SELECT
            id,
            name

          FROM classes

          WHERE
            id = ?
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
        message: "Lớp học không tồn tại hoặc không thuộc giáo xứ",
      });
    }

    const lockedClass = lockedClassRows[0];

    const lockedClassSchedule = await getClassSchedule(
      connection,
      classId,
      attendanceDate,
    );

    /**
     * RE-CALCULATE STATUS AFTER LOCK
     */

    for (const item of normalizedStudents) {
      item.finalStatus = calculateFinalStatus({
        attendanceType,
        requestedStatus: item.requestedStatus,
        checkInTime: item.checkInTime,
        classStartTime: lockedClassSchedule?.start_time || null,
      });
    }

    /**
     * SAVE
     */

    const savedRows = [];

    for (const item of normalizedStudents) {
      const [existingRows] = await connection.execute(
        `
          SELECT
            id,
            status
          FROM attendances
          WHERE
            church_id = ?
            AND class_id = ?
            AND student_id = ?
            AND attendance_date = ?
            AND attendance_type = ?
          LIMIT 1
          FOR UPDATE
        `,
        [churchId, classId, item.studentId, attendanceDate, attendanceType],
      );

      if (existingRows.length) {
        const existing = existingRows[0];

        await connection.execute(
          `
            UPDATE attendances

            SET
              teacher_id = ?,
              status = ?,
              check_in_time = ?,
              note = ?,
              updated_at = CURRENT_TIMESTAMP

            WHERE
              id = ?
              AND church_id = ?
          `,
          [
            teacherId,
            item.finalStatus,
            item.checkInTime,
            item.note,
            existing.id,
            churchId,
          ],
        );

        savedRows.push({
          id: existing.id,
          student_id: item.studentId,
          status: item.finalStatus,
          check_in_time: item.checkInTime,
          note: item.note,
        });
      } else {
        const [insertResult] = await connection.execute(
          `
            INSERT INTO attendances (
              church_id,
              class_id,
              student_id,
              teacher_id,
              attendance_type,
              attendance_date,
              status,
              check_in_time,
              note,
              created_at,
              updated_at
            )

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `,
          [
            churchId,
            classId,
            item.studentId,
            teacherId,
            attendanceType,
            attendanceDate,
            item.finalStatus,
            item.checkInTime,
            item.note,
          ],
        );

        savedRows.push({
          id: insertResult.insertId,
          student_id: item.studentId,
          status: item.finalStatus,
          check_in_time: item.checkInTime,
          note: item.note,
        });
      }
    }

    await connection.commit();

    transactionStarted = false;

    return res.status(201).json({
      success: true,

      message: `Lưu điểm danh ${getAttendanceTypeLabel(
        attendanceType,
      )} thành công`,

      count: normalizedStudents.length,

      class_id: classId,

      class_name: lockedClass.name,

      start_time: lockedClassSchedule?.start_time || null,

      attendance_date: attendanceDate,

      attendance_type: attendanceType,

      attendance_type_label: getAttendanceTypeLabel(attendanceType),

      data: normalizedStudents.map((item) => ({
        student_id: item.studentId,
        requested_status: item.requestedStatus,
        status: item.finalStatus,
        check_in_time: item.checkInTime,
        note: item.note,
      })),
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted);

    console.error("SAVE BULK ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lưu điểm danh",

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
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
 */

const updateAttendance = async (req, res) => {
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

    const attendanceId = toPositiveInt(req?.params?.id);

    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        message: "attendanceId không hợp lệ",
      });
    }

    const body = req?.body || {};

    const requestedStatus =
      typeof body.status === "string" ? body.status.trim().toLowerCase() : "";

    if (!VALID_STATUS.includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái điểm danh không hợp lệ",
      });
    }

    let checkInTime = null;

    if (
      body.check_in_time !== undefined &&
      body.check_in_time !== null &&
      body.check_in_time !== ""
    ) {
      if (typeof body.check_in_time !== "string") {
        return res.status(400).json({
          success: false,
          message: "check_in_time phải là chuỗi",
        });
      }

      checkInTime = body.check_in_time.trim();

      if (!isValidTime(checkInTime)) {
        return res.status(400).json({
          success: false,
          message: "check_in_time không hợp lệ",
        });
      }
    }

    let note = null;

    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== "string") {
        return res.status(400).json({
          success: false,
          message: "Ghi chú phải là chuỗi",
        });
      }

      note = body.note.trim();

      if (note.length > MAX_NOTE_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `Ghi chú không được quá ${MAX_NOTE_LENGTH} ký tự`,
        });
      }

      if (!note) {
        note = null;
      }
    }

    await connection.beginTransaction();

    transactionStarted = true;

    const [existingRows] = await connection.execute(
      `
          SELECT
            a.id,
            a.church_id,
            a.class_id,
            a.student_id,
            a.attendance_type,
            a.status,
            a.check_in_time,
            a.attendance_date,

            c.name AS class_name

          FROM attendances a

          INNER JOIN classes c
            ON c.id = a.class_id
            AND c.church_id = a.church_id

          WHERE
            a.id = ?
            AND a.church_id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [attendanceId, churchId],
    );

    if (!existingRows.length) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bản ghi điểm danh",
      });
    }

    const existing = existingRows[0];

    const existingSchedule = await getClassSchedule(
      connection,
      existing.class_id,
      existing.attendance_date,
    );

    /**
     * Giữ nguyên nguyên tắc cũ:
     * attendance đã xác nhận thì không update.
     */

    if (VALID_STATUS.includes(existing.status)) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(409).json({
        success: false,

        code: "ALREADY_ATTENDED",

        message:
          "Học sinh này đã được điểm danh và không thể thay đổi trạng thái",

        attendance: {
          id: existing.id,

          student_id: existing.student_id,

          attendance_date: existing.attendance_date,

          attendance_type: existing.attendance_type,

          status: existing.status,

          check_in_time: existing.check_in_time,
        },
      });
    }

    const finalStatus = calculateFinalStatus({
      attendanceType: existing.attendance_type,

      requestedStatus,

      checkInTime,

      classStartTime: existingSchedule?.start_time || null,
    });

    await connection.execute(
      `
        UPDATE attendances

        SET
          teacher_id = ?,
          status = ?,
          check_in_time = ?,
          note = ?,
          updated_at = CURRENT_TIMESTAMP

        WHERE
          id = ?
          AND church_id = ?
      `,
      [teacherId, finalStatus, checkInTime, note, attendanceId, churchId],
    );

    await connection.commit();

    transactionStarted = false;

    return res.json({
      success: true,

      message: "Cập nhật điểm danh thành công",

      data: {
        id: attendanceId,
        class_id: existing.class_id,
        class_name: existing.class_name,
        student_id: existing.student_id,
        attendance_type: existing.attendance_type,
        attendance_date: existing.attendance_date,
        status: finalStatus,
        check_in_time: checkInTime,
        note,
        start_time: existingSchedule?.start_time || null,
      },
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted);

    console.error("UPDATE ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật điểm danh",

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * =========================================================
 * DELETE ATTENDANCE
 * =========================================================
 */

const deleteAttendance = async (req, res) => {
  let connection = null;

  let transactionStarted = false;

  try {
    connection = await db.getConnection();

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
        message: "attendanceId không hợp lệ",
      });
    }

    await connection.beginTransaction();

    transactionStarted = true;

    const [rows] = await connection.execute(
      `
        SELECT
          id,
          status
        FROM attendances
        WHERE
          id = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [attendanceId, churchId],
    );

    if (!rows.length) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bản ghi điểm danh",
      });
    }

    await connection.execute(
      `
        DELETE FROM attendances

        WHERE
          id = ?
          AND church_id = ?
      `,
      [attendanceId, churchId],
    );

    await connection.commit();

    transactionStarted = false;

    return res.json({
      success: true,
      message: "Xóa điểm danh thành công",
      id: attendanceId,
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted);

    console.error("DELETE ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa điểm danh",

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * =========================================================
 * GET STUDENT ATTENDANCE
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

    const studentId = toPositiveInt(req?.params?.studentId);

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const [studentRows] = await db.execute(
      `
        SELECT
          id,
          code,
          name
        FROM students
        WHERE
          id = ?
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

    /**
     * HISTORY
     */

    const [rows] = await db.execute(
      `
          SELECT
            a.id,
            a.class_id,

            c.name AS class_name,

            (
              SELECT cs.start_time
              FROM class_schedules cs
              WHERE
                cs.class_id = a.class_id
                AND cs.day_of_week = DAYOFWEEK(a.attendance_date)
              ORDER BY cs.id ASC
              LIMIT 1
            ) AS start_time,

            a.attendance_date,
            a.attendance_type,
            a.status,
            a.check_in_time,
            a.note,
            a.teacher_id,
            a.created_at,
            a.updated_at

          FROM attendances a

          LEFT JOIN classes c
            ON c.id = a.class_id
            AND c.church_id = a.church_id

          WHERE
            a.student_id = ?
            AND a.church_id = ?

          ORDER BY
            a.attendance_date DESC,
            a.id DESC
        `,
      [studentId, churchId],
    );

    return res.json({
      success: true,

      student: studentRows[0],

      data: rows,
    });
  } catch (error) {
    console.error("GET STUDENT ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải lịch sử điểm danh",

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
    });
  }
};

/**
 * =========================================================
 * GET CLASS STATISTICS
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

    const classId = toPositiveInt(req?.params?.classId);

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
      });
    }

    const fromDate = req?.query?.from;

    const toDate = req?.query?.to;

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
     * CHECK CLASS
     */

    const [classRows] = await db.execute(
      `
          SELECT
            id,
            name

          FROM classes

          WHERE
            id = ?
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

    const scheduleDate = fromDate || toDate || getCurrentDate();

    const classSchedule = await getClassSchedule(db, classId, scheduleDate);

    /**
     * QUERY
     */

    let query = `
      SELECT
        s.id AS student_id,
        s.code,
        s.name,

        COUNT(
          CASE
            WHEN a.attendance_type = 'mass'
            AND a.status = 'present'
            THEN 1
          END
        ) AS mass_present_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'mass'
            AND a.status = 'absent'
            THEN 1
          END
        ) AS mass_absent_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'mass'
            AND a.status = 'late'
            THEN 1
          END
        ) AS mass_late_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'mass'
            AND a.status = 'excused'
            THEN 1
          END
        ) AS mass_excused_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'mass'
            THEN 1
          END
        ) AS mass_total,

        COUNT(
          CASE
            WHEN a.attendance_type = 'catechism'
            AND a.status = 'present'
            THEN 1
          END
        ) AS catechism_present_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'catechism'
            AND a.status = 'absent'
            THEN 1
          END
        ) AS catechism_absent_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'catechism'
            AND a.status = 'late'
            THEN 1
          END
        ) AS catechism_late_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'catechism'
            AND a.status = 'excused'
            THEN 1
          END
        ) AS catechism_excused_count,

        COUNT(
          CASE
            WHEN a.attendance_type = 'catechism'
            THEN 1
          END
        ) AS catechism_total

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
        AND a.attendance_date
        BETWEEN ? AND ?
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
      WHERE
        cs.class_id = ?

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
     * SUMMARY
     */

    const summary = {
      students: rows.length,

      mass: {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      },

      catechism: {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      },
    };

    for (const row of rows) {
      summary.mass.total += Number(row.mass_total || 0);

      summary.mass.present += Number(row.mass_present_count || 0);

      summary.mass.absent += Number(row.mass_absent_count || 0);

      summary.mass.late += Number(row.mass_late_count || 0);

      summary.mass.excused += Number(row.mass_excused_count || 0);

      summary.catechism.total += Number(row.catechism_total || 0);

      summary.catechism.present += Number(row.catechism_present_count || 0);

      summary.catechism.absent += Number(row.catechism_absent_count || 0);

      summary.catechism.late += Number(row.catechism_late_count || 0);

      summary.catechism.excused += Number(row.catechism_excused_count || 0);
    }

    return res.json({
      success: true,

      class: {
        ...classRows[0],
        start_time: classSchedule?.start_time || null,
      },

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

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
    });
  }
};

/**
 * =========================================================
 * SCAN QR CODE
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

    const attendanceType = normalizeAttendanceType(body.attendance_type);

    const qrToken = normalizeQrToken(body.qr_token);

    maskedToken = maskQrToken(qrToken);

    console.log("========== QR ATTENDANCE ==========");
    console.log("body:", body);
    console.log("attendance_type:", body.attendance_type);
    console.log("normalized:", attendanceType);
    console.log("class_id:", classId);
    console.log("qr_token:", maskedToken);
    console.log("===================================");

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    if (!attendanceType) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ",
      });
    }

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: "Mã QR không hợp lệ",
      });
    }

    /**
     * CHECK CLASS
     */

    const [classRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id

          FROM classes

          WHERE
            id = ?
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

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * LOCK CLASS
     */

    const [lockedClassRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id

          FROM classes

          WHERE
            id = ?
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
        message: "Lớp học không tồn tại hoặc không thuộc giáo xứ",
      });
    }

    const lockedClass = lockedClassRows[0];

    const attendanceDate = getCurrentDate();

    const lockedClassSchedule = await getClassSchedule(
      connection,
      classId,
      attendanceDate,
    );

    /**
     * FIND STUDENT BY QR
     *
     * QR token có thể đang nằm ở một trong các cột
     * qr_token / qr_code tùy schema hiện tại.
     */

    const [studentRows] = await connection.execute(
      `
        SELECT
          s.id,
          s.code,
          s.name

        FROM students s

        INNER JOIN class_students cs
          ON cs.student_id = s.id
          AND cs.class_id = ?

        WHERE
          s.church_id = ?
          AND (
            s.qr_token = ?
            OR s.qr_code = ?
          )

        LIMIT 1

        FOR UPDATE
      `,
      [classId, churchId, qrToken, qrToken],
    );

    if (!studentRows.length) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message: "Không tìm thấy học sinh từ mã QR này",
      });
    }

    const student = studentRows[0];

    /**
     * CHECK DUPLICATE
     */

    const [existingRows] = await connection.execute(
      `
        SELECT
          id,
          status,
          check_in_time,
          note

        FROM attendances

        WHERE
          church_id = ?
          AND class_id = ?
          AND student_id = ?
          AND attendance_date = ?
          AND attendance_type = ?

        LIMIT 1

        FOR UPDATE
      `,
      [churchId, classId, student.id, attendanceDate, attendanceType],
    );

    if (existingRows.length) {
      const existing = existingRows[0];

      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(409).json({
        success: false,

        code: "ALREADY_ATTENDED",

        message: "Học sinh này đã được điểm danh",

        attendance: {
          id: existing.id,
          status: existing.status,
          check_in_time: existing.check_in_time,
          note: existing.note,
        },

        student: {
          id: student.id,
          code: student.code,
          name: student.name,
        },
      });
    }

    /**
     * TIME
     */

    const checkInTime = getCurrentTime();

    const finalStatus = calculateFinalStatus({
      attendanceType,

      requestedStatus: "present",

      checkInTime,

      classStartTime: lockedClassSchedule?.start_time || null,
    });

    /**
     * INSERT
     */

    let insertResult;

    try {
      [insertResult] = await connection.execute(
        `
          INSERT INTO attendances (
            church_id,
            class_id,
            student_id,
            teacher_id,
            attendance_type,
            attendance_date,
            status,
            check_in_time,
            note,
            created_at,
            updated_at
          )

          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [
          churchId,
          classId,
          student.id,
          teacherId,
          attendanceType,
          attendanceDate,
          finalStatus,
          checkInTime,
          null,
        ],
      );
    } catch (insertError) {
      /**
       * Nếu DB có unique key và bị race condition,
       * trả về trạng thái đã điểm danh.
       */

      if (insertError?.code === "ER_DUP_ENTRY" || insertError?.errno === 1062) {
        await safeRollback(connection, transactionStarted);

        transactionStarted = false;

        return res.status(409).json({
          success: false,
          code: "ALREADY_ATTENDED",
          message: "Học sinh này đã được điểm danh",
        });
      }

      throw insertError;
    }

    const [savedRows] = await connection.execute(
      `
        SELECT
          id,
          church_id,
          class_id,
          student_id,
          teacher_id,
          attendance_type,
          attendance_date,
          status,
          check_in_time,
          note,
          created_at,
          updated_at

        FROM attendances

        WHERE
          id = ?
          AND church_id = ?

        LIMIT 1
      `,
      [insertResult.insertId, churchId],
    );

    const savedAttendance = savedRows[0] || {
      id: insertResult.insertId,
      church_id: churchId,
      class_id: classId,
      student_id: student.id,
      teacher_id: teacherId,
      attendance_type: attendanceType,
      attendance_date: attendanceDate,
      status: finalStatus,
      check_in_time: checkInTime,
      note: null,
    };

    await connection.commit();

    transactionStarted = false;

    return res.status(201).json({
      success: true,

      code: "ATTENDANCE_SUCCESS",

      message: `Điểm danh ${getAttendanceTypeLabel(attendanceType)} thành công`,

      attendance_type: attendanceType,

      attendance_type_label: getAttendanceTypeLabel(attendanceType),

      student: {
        id: student.id,
        code: student.code,
        name: student.name,
      },

      class: {
        id: classId,
        name: lockedClass.name,
        start_time: lockedClassSchedule?.start_time || null,
      },

      attendance: savedAttendance,
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted);

    console.error("[QR] SCAN ERROR:", {
      token: maskedToken,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Không thể điểm danh bằng QR",

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * =========================================================
 * FINISH ATTENDANCE
 * =========================================================
 *
 * POST /attendance/finish
 *
 * {
 *   class_id: 17,
 *   attendance_date: "2026-09-09",
 *   attendance_type: "mass"
 * }
 */

const finishAttendance = async (req, res) => {
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

    const attendanceDate =
      typeof body.attendance_date === "string"
        ? body.attendance_date.trim()
        : "";

    const attendanceType = normalizeAttendanceType(
      body.attendance_type || "catechism",
    );

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

    if (!attendanceType) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ",
      });
    }

    /**
     * CHECK CLASS
     */

    const [classRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id

          FROM classes

          WHERE
            id = ?
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

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * LOCK CLASS
     */

    const [lockedClassRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id

          FROM classes

          WHERE
            id = ?
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
        message: "Lớp học không tồn tại hoặc không thuộc giáo xứ",
      });
    }

    const lockedClass = lockedClassRows[0];

    const lockedClassSchedule = await getClassSchedule(
      connection,
      classId,
      attendanceDate,
    );

    /**
     * GET STUDENTS
     */

    const [studentRows] = await connection.execute(
      `
        SELECT
          s.id,
          s.code,
          s.name

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id
          AND s.church_id = ?

        WHERE
          cs.class_id = ?

        ORDER BY
          s.name ASC,
          s.id ASC
      `,
      [churchId, classId],
    );

    const students = studentRows || [];

    /**
     * GET ATTENDED STUDENTS
     */

    const [attendanceRows] = await connection.execute(
      `
        SELECT
          student_id,
          id,
          status,
          check_in_time

        FROM attendances

        WHERE
          church_id = ?
          AND class_id = ?
          AND attendance_date = ?
          AND attendance_type = ?

        FOR UPDATE
      `,
      [churchId, classId, attendanceDate, attendanceType],
    );

    const attendedStudentIds = new Set(
      attendanceRows.map((row) => Number(row.student_id)),
    );

    /**
     * CREATE ABSENT FOR UNMARKED STUDENTS
     */

    const unmarkedStudents = students.filter(
      (student) => !attendedStudentIds.has(Number(student.id)),
    );

    for (const student of unmarkedStudents) {
      await connection.execute(
        `
          INSERT INTO attendances (
            church_id,
            class_id,
            student_id,
            teacher_id,
            attendance_type,
            attendance_date,
            status,
            check_in_time,
            note,
            created_at,
            updated_at
          )

          VALUES (?, ?, ?, ?, ?, ?, 'absent', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [
          churchId,
          classId,
          student.id,
          teacherId,
          attendanceType,
          attendanceDate,
        ],
      );
    }

    await connection.commit();

    transactionStarted = false;

    return res.json({
      success: true,

      message:
        unmarkedStudents.length > 0
          ? `Đã kết thúc điểm danh ${getAttendanceTypeLabel(attendanceType)}. ${
              unmarkedStudents.length
            } học sinh chưa điểm danh được chuyển thành vắng.`
          : `Đã kết thúc điểm danh ${getAttendanceTypeLabel(
              attendanceType,
            )}. Tất cả học sinh đã được điểm danh.`,

      class_id: classId,

      class_name: lockedClass.name,

      start_time: lockedClassSchedule?.start_time || null,

      attendance_date: attendanceDate,

      attendance_type: attendanceType,

      attendance_type_label: getAttendanceTypeLabel(attendanceType),

      total_students: students.length,

      already_attended: attendedStudentIds.size,

      marked_absent: unmarkedStudents.length,

      data: unmarkedStudents.map((student) => ({
        student_id: student.id,
        code: student.code,
        name: student.name,
        status: "absent",
      })),
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted);

    console.error("FINISH ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể kết thúc điểm danh",

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
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

  finishAttendance,
};

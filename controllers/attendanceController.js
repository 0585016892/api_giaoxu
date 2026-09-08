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
 *
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
 * ATTENDANCE TIME LOGIC
 * =========================================================
 *
 * Quy tắc:
 *
 * check_in_time < start_time
 *      => present
 *
 * check_in_time >= start_time
 *      => late
 *
 * Ví dụ lớp bắt đầu 18:30:00
 *
 * 18:29:59 => present
 * 18:30:00 => late
 * 18:30:01 => late
 *
 * Nếu lớp chưa cấu hình start_time:
 *      => mặc định present
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

/**
 * Lấy giờ hiện tại của server theo HH:mm:ss
 */
const getCurrentTime = () => {
  return new Date().toTimeString().slice(0, 8);
};

/**
 * =========================================================
 * QR HELPERS
 * =========================================================
 */

/**
 * QR có thể là:
 *
 * 846cee63a74f11f19cdce0d55eb860a8
 *
 * hoặc:
 *
 * GLQR:846cee63a74f11f19cdce0d55eb860a8
 *
 * Token:
 * - hex
 * - 32 đến 64 ký tự
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

/**
 * Không log full QR token.
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
 * GET /attendance
 *
 * Query:
 * ?class_id=17
 * &date=2026-09-08
 * &page=1
 * &limit=10
 * &search=
 * &status=all
 */
const getAttendance = async (req, res) => {
  console.log("GET ATTENDANCE REQUEST");

  try {
    /**
     * =====================================================
     * 1. AUTH
     * =====================================================
     */

    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const safeChurchId = Number(churchId);

    if (!Number.isInteger(safeChurchId) || safeChurchId <= 0) {
      return res.status(403).json({
        success: false,
        message: "Giáo xứ không hợp lệ",
      });
    }

    /**
     * =====================================================
     * 2. QUERY PARAMS
     * =====================================================
     */

    const classId = toPositiveInt(req?.query?.class_id);

    const date =
      typeof req?.query?.date === "string" ? req.query.date.trim() : "";

    let page = Number.parseInt(req?.query?.page, 10);

    let limit = Number.parseInt(req?.query?.limit, 10);

    if (!Number.isInteger(page) || page < 1) {
      page = 1;
    }

    if (!Number.isInteger(limit) || limit < 1) {
      limit = 10;
    }

    limit = Math.min(limit, 100);

    const search =
      typeof req?.query?.search === "string" ? req.query.search.trim() : "";

    const status =
      typeof req?.query?.status === "string"
        ? req.query.status.trim().toLowerCase()
        : "all";

    const safePage = Math.trunc(page);
    const safeLimit = Math.trunc(limit);

    /**
     * =====================================================
     * 3. VALIDATE
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

    /**
     * =====================================================
     * 4. CHECK CLASS
     *
     * LẤY LUÔN start_time
     * =====================================================
     */

    const [classRows] = await db.execute(
      `
        SELECT
          id,
          name,
          start_time
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [classId, safeChurchId],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    const classInfo = classRows[0];

    /**
     * =====================================================
     * 5. VALID STATUS
     * =====================================================
     */

    const validStatuses = [
      "all",
      "present",
      "absent",
      "late",
      "excused",
      "not_attended",
      "unmarked",
    ];

    let normalizedStatus = status;

    if (!validStatuses.includes(normalizedStatus)) {
      normalizedStatus = "all";
    }

    if (normalizedStatus === "unmarked") {
      normalizedStatus = "not_attended";
    }

    /**
     * =====================================================
     * 6. BUILD FILTER
     * =====================================================
     */

    const whereConditions = ["cs.class_id = ?", "s.church_id = ?"];

    const whereParams = [classId, safeChurchId];

    /**
     * SEARCH
     */

    if (search) {
      whereConditions.push(`
        (
          s.name LIKE ?
          OR s.code LIKE ?
        )
      `);

      const keyword = `%${search}%`;

      whereParams.push(keyword, keyword);
    }

    /**
     * STATUS
     */

    if (normalizedStatus !== "all") {
      if (normalizedStatus === "not_attended") {
        whereConditions.push(`
          a.id IS NULL
        `);
      } else {
        whereConditions.push(`
          a.status = ?
        `);

        whereParams.push(normalizedStatus);
      }
    }

    const whereSQL = whereConditions.join("\nAND ");

    /**
     * =====================================================
     * 7. COUNT
     * =====================================================
     */

    const [countRows] = await db.execute(
      `
        SELECT
          COUNT(*) AS total

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id

        LEFT JOIN attendances a
          ON a.student_id = s.id
          AND a.class_id = ?
          AND a.church_id = ?
          AND a.attendance_date = ?

        WHERE
          ${whereSQL}
      `,
      [classId, safeChurchId, date, ...whereParams],
    );

    const total = Number(countRows?.[0]?.total || 0);

    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 1;

    const currentPage =
      total > 0 && safePage > totalPages ? totalPages : safePage;

    const currentOffset = Math.trunc((currentPage - 1) * safeLimit);

    /**
     * =====================================================
     * 8. GET STUDENTS
     * =====================================================
     */

    const studentSQL = `
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

      LEFT JOIN attendances a
        ON a.student_id = s.id
        AND a.class_id = ?
        AND a.church_id = ?
        AND a.attendance_date = ?

      WHERE
        ${whereSQL}

      ORDER BY
        s.name ASC,
        s.id ASC

      LIMIT ${safeLimit}
      OFFSET ${currentOffset}
    `;

    const [rows] = await db.execute(studentSQL, [
      classId,
      safeChurchId,
      date,
      ...whereParams,
    ]);

    /**
     * =====================================================
     * 9. STATISTICS
     *
     * Toàn bộ học sinh trong lớp.
     * Không phụ thuộc pagination/search/status.
     * =====================================================
     */

    const [statRows] = await db.execute(
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
          ) AS excused,

          COALESCE(
            SUM(
              CASE
                WHEN a.id IS NULL
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS not_attended

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id

        LEFT JOIN attendances a
          ON a.student_id = s.id
          AND a.class_id = ?
          AND a.church_id = ?
          AND a.attendance_date = ?

        WHERE
          cs.class_id = ?
          AND s.church_id = ?
      `,
      [classId, safeChurchId, date, classId, safeChurchId],
    );

    const stats = statRows?.[0] || {};

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

    const statistics = {
      total: totalStudents,

      present,

      absent,

      late,

      excused,

      not_attended: notAttended,

      notMarked: notAttended,

      attended,

      attendance_rate: attendanceRate,

      rate: attendanceRate,
    };

    /**
     * =====================================================
     * 10. RESPONSE
     * =====================================================
     */

    return res.json({
      success: true,

      class: {
        id: classInfo.id,
        name: classInfo.name,
        start_time: classInfo.start_time,
      },

      date,

      statistics,

      pagination: {
        page: currentPage,
        limit: safeLimit,
        total,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },

      filters: {
        search,

        status:
          normalizedStatus === "not_attended" ? "unmarked" : normalizedStatus,
      },

      data: Array.isArray(rows) ? rows : [],
    });
  } catch (error) {
    console.error("GET ATTENDANCE ERROR:", error);

    console.error("GET ATTENDANCE DETAIL:", {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      sqlMessage: error?.sqlMessage,
    });

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
 * Body:
 * {
 *   class_id: 17,
 *   attendance_date: "2026-09-08",
 *   students: [
 *     {
 *       student_id: 1,
 *       status: "present",
 *       check_in_time: "18:29:59",
 *       note: null
 *     }
 *   ]
 * }
 *
 * BACKEND TỰ TÍNH:
 *
 * 18:29:59 < 18:30:00
 * => present
 *
 * 18:30:00 >= 18:30:00
 * => late
 * =========================================================
 */
const saveBulkAttendance = async (req, res) => {
  let connection = null;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

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
        message: "Không xác định được giáo lý viên",
      });
    }

    /**
     * =====================================================
     * BODY
     * =====================================================
     */

    const body = req?.body || {};

    const classId = toPositiveInt(body.class_id);

    const attendanceDate =
      typeof body.attendance_date === "string"
        ? body.attendance_date.trim()
        : "";

    const students = body.students;

    /**
     * =====================================================
     * VALIDATE
     * =====================================================
     */

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

    if (!students.length) {
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
     * =====================================================
     * CHECK CLASS + START TIME
     * =====================================================
     */

    const [classRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id,
            start_time
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

    const classInfo = classRows[0];

    const classStartTime = classInfo.start_time;

    /**
     * =====================================================
     * VALIDATE PAYLOAD
     * =====================================================
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

      const requestedStatus = item.status;

      if (!VALID_STATUS.includes(requestedStatus)) {
        return res.status(400).json({
          success: false,
          message: `Trạng thái điểm danh của học sinh ${studentId} không hợp lệ`,
        });
      }

      /**
       * CHECK IN TIME
       */

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

      /**
       * Nếu present / late mà FE không
       * gửi giờ thì backend lấy giờ hiện tại.
       */
      if (
        (requestedStatus === "present" || requestedStatus === "late") &&
        !checkInTime
      ) {
        checkInTime = getCurrentTime();
      }

      /**
       * NOTE
       */

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

      /**
       * ===================================================
       * TÍNH STATUS CUỐI CÙNG
       * ===================================================
       *
       * Chỉ present / late mới phụ thuộc giờ.
       *
       * absent / excused giữ nguyên.
       */

      let finalStatus = requestedStatus;

      if (requestedStatus === "present" || requestedStatus === "late") {
        finalStatus = getAttendanceStatusByStartTime(
          checkInTime,
          classStartTime,
        );
      }

      normalizedStudents.push({
        studentId,
        requestedStatus,
        finalStatus,
        checkInTime,
        note,
      });
    }

    /**
     * =====================================================
     * KIỂM TRA MEMBERSHIP
     * =====================================================
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

          WHERE
            s.church_id = ?
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
     * =====================================================
     * BEGIN TRANSACTION
     * =====================================================
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * =====================================================
     * LOCK CLASS
     *
     * Giúp tránh 2 thiết bị cùng lúc
     * ghi attendance cho cùng lớp.
     * =====================================================
     */

    const [lockedClassRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id,
            start_time
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

    const lockedClass = lockedClassRows[0];

    /**
     * =====================================================
     * KIỂM TRA ĐÃ ĐIỂM DANH
     *
     * ĐÃ CÓ RECORD => KHÔNG CHO GHI ĐÈ
     * =====================================================
     */

    const [existingRows] = await connection.execute(
      `
          SELECT
            id,
            student_id,
            attendance_date,
            status,
            check_in_time,
            note
          FROM attendances
          WHERE
            class_id = ?
            AND church_id = ?
            AND attendance_date = ?
            AND student_id IN (${placeholders})
          FOR UPDATE
        `,
      [classId, churchId, attendanceDate, ...studentIds],
    );

    if (existingRows.length) {
      const existing = existingRows[0];

      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "ALREADY_ATTENDED",

        message: "Có học sinh đã được điểm danh và không thể ghi đè trạng thái",

        attendance: {
          id: existing.id,
          student_id: existing.student_id,
          attendance_date: existing.attendance_date,
          status: existing.status,
          check_in_time: existing.check_in_time,
          note: existing.note,
        },
      });
    }

    /**
     * =====================================================
     * INSERT
     * =====================================================
     */

    for (const item of normalizedStudents) {
      try {
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
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            churchId,
            classId,
            item.studentId,
            teacherId,
            attendanceDate,
            item.finalStatus,
            item.checkInTime,
            item.note,
          ],
        );
      } catch (insertError) {
        /**
         * Nếu xảy ra race condition
         * với thiết bị khác.
         */

        if (insertError?.code === "ER_DUP_ENTRY") {
          await safeRollback(connection, transactionStarted);

          transactionStarted = false;

          return res.status(409).json({
            success: false,
            code: "ALREADY_ATTENDED",
            message: "Học sinh vừa được điểm danh bởi một thiết bị khác",
          });
        }

        throw insertError;
      }
    }

    /**
     * =====================================================
     * COMMIT
     * =====================================================
     */

    await connection.commit();

    transactionStarted = false;

    /**
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return res.status(201).json({
      success: true,

      message: "Lưu điểm danh thành công",

      count: normalizedStudents.length,

      class_id: classId,

      class_name: lockedClass.name,

      start_time: lockedClass.start_time,

      attendance_date: attendanceDate,

      data: normalizedStudents.map((item) => ({
        student_id: item.studentId,
        status: item.finalStatus,
        check_in_time: item.checkInTime,
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
 *
 * PUT /attendance/:id
 *
 * QUAN TRỌNG:
 *
 * Nếu attendance đã có status hợp lệ:
 * => KHÔNG CHO UPDATE.
 *
 * Backend vẫn kiểm tra start_time nếu
 * bản ghi cũ somehow chưa có status.
 * =========================================================
 */
const updateAttendance = async (req, res) => {
  let connection = null;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

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

    const attendanceId = toPositiveInt(req?.params?.id);

    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        message: "ID điểm danh không hợp lệ",
      });
    }

    const body = req?.body || {};

    const requestedStatus = body.status;

    if (!VALID_STATUS.includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái điểm danh không hợp lệ",
      });
    }

    /**
     * =====================================================
     * CHECK TIME
     * =====================================================
     */

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

    /**
     * Nếu present / late nhưng không
     * truyền giờ => lấy giờ hiện tại.
     */

    if (
      (requestedStatus === "present" || requestedStatus === "late") &&
      !checkInTime
    ) {
      checkInTime = getCurrentTime();
    }

    /**
     * =====================================================
     * NOTE
     * =====================================================
     */

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

    /**
     * =====================================================
     * TRANSACTION
     * =====================================================
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * =====================================================
     * LOCK ATTENDANCE + CLASS
     * =====================================================
     */

    const [existingRows] = await connection.execute(
      `
          SELECT
            a.id,
            a.church_id,
            a.class_id,
            a.student_id,
            a.status,
            a.check_in_time,
            a.attendance_date,

            c.name AS class_name,
            c.start_time

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

    /**
     * =====================================================
     * IMMUTABLE ATTENDANCE
     *
     * Đã có status hợp lệ:
     * present
     * absent
     * late
     * excused
     *
     * => KHÔNG CHO ĐỔI.
     * =====================================================
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

          status: existing.status,

          check_in_time: existing.check_in_time,
        },
      });
    }

    /**
     * =====================================================
     * TÍNH STATUS
     *
     * Trường hợp database có bản ghi
     * nhưng status chưa hợp lệ/null.
     * =====================================================
     */

    let finalStatus = requestedStatus;

    if (requestedStatus === "present" || requestedStatus === "late") {
      finalStatus = getAttendanceStatusByStartTime(
        checkInTime,
        existing.start_time,
      );
    }

    /**
     * =====================================================
     * UPDATE
     * =====================================================
     */

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
        teacherId || null,
        finalStatus,
        checkInTime,
        note,
        attendanceId,
        churchId,
      ],
    );

    /**
     * =====================================================
     * COMMIT
     * =====================================================
     */

    await connection.commit();

    transactionStarted = false;

    return res.json({
      success: true,

      message: "Cập nhật điểm danh thành công",

      attendance: {
        id: attendanceId,

        status: finalStatus,

        check_in_time: checkInTime,
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
 *
 * DELETE /attendance/:id
 *
 * Để đảm bảo nguyên tắc:
 *
 * "Đã điểm danh thì không được thay đổi"
 *
 * => Không cho xóa bản ghi attendance hợp lệ.
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
        message: "ID điểm danh không hợp lệ",
      });
    }

    await connection.beginTransaction();

    transactionStarted = true;

    const [rows] = await connection.execute(
      `
          SELECT
            id,
            student_id,
            attendance_date,
            status,
            check_in_time
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

    const attendance = rows[0];

    /**
     * Không cho xóa attendance hợp lệ.
     */

    if (VALID_STATUS.includes(attendance.status)) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(409).json({
        success: false,

        code: "ATTENDANCE_LOCKED",

        message: "Bản ghi điểm danh đã được xác nhận và không thể xóa",

        attendance: {
          id: attendance.id,

          student_id: attendance.student_id,

          attendance_date: attendance.attendance_date,

          status: attendance.status,

          check_in_time: attendance.check_in_time,
        },
      });
    }

    /**
     * Trường hợp record chưa có status hợp lệ
     * mới cho xóa.
     */

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
 *
 * GET /attendance/student/:studentId
 *
 * ?month=9&year=2026
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
     * =====================================================
     * CHECK STUDENT
     * =====================================================
     */

    const [studentRows] = await db.execute(
      `
          SELECT
            id,
            code,
            name,
            status
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
     * =====================================================
     * HISTORY
     * =====================================================
     */

    const [rows] = await db.execute(
      `
          SELECT
            a.id,
            a.class_id,
            c.name AS class_name,
            c.start_time,

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
           AND c.church_id = a.church_id

          WHERE
            a.student_id = ?
            AND a.church_id = ?
            AND YEAR(a.attendance_date) = ?
            AND MONTH(a.attendance_date) = ?

          ORDER BY
            a.attendance_date DESC,
            a.id DESC
        `,
      [studentId, churchId, year, month],
    );

    /**
     * =====================================================
     * STATISTICS
     * =====================================================
     */

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
 *
 * GET /attendance/statistics/:classId
 *
 * ?from=2026-09-01
 * &to=2026-09-30
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

    let fromDate = req?.query?.from;

    let toDate = req?.query?.to;

    /**
     * =====================================================
     * DATE VALIDATION
     * =====================================================
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
     * =====================================================
     * CHECK CLASS
     * =====================================================
     */

    const [classRows] = await db.execute(
      `
          SELECT
            id,
            name,
            start_time
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

    /**
     * =====================================================
     * QUERY
     * =====================================================
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

        COUNT(a.id)
          AS total_attendance

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

    /**
     * DATE FILTER
     */

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
     * =====================================================
     * SUMMARY
     * =====================================================
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

    /**
     * =====================================================
     * RESPONSE
     * =====================================================
     */

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
 *
 * POST /attendance/scan-qr
 *
 * Body:
 * {
 *   qr_token: "...",
 *   class_id: 17
 * }
 *
 * QR chỉ điểm danh ngày hiện tại.
 *
 * Backend dùng:
 *   CURDATE()
 *   giờ server hiện tại
 *
 * Sau đó so sánh:
 *
 * check_in_time < classes.start_time
 *     => present
 *
 * check_in_time >= classes.start_time
 *     => late
 * =========================================================
 */
const scanQRCode = async (req, res) => {
  let connection = null;
  let transactionStarted = false;

  let maskedToken = "***";

  try {
    console.log("\n======================================================");

    console.log("[QR] 🚀 BẮT ĐẦU QUÉT QR");

    console.log("[QR] Time:", new Date().toISOString());

    connection = await db.getConnection();

    console.log("[QR] ✅ DB connection OK");

    const churchId = getChurchId(req);

    const teacherId = getTeacherId(req);

    console.log("[QR] AUTH:", {
      churchId,
      teacherId,
      userId: req?.user?.id,
      role: req?.user?.role,
    });

    /**
     * ======================================================
     * AUTH
     * ======================================================
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
     * ======================================================
     * BODY
     * ======================================================
     */

    const body = req?.body || {};

    const classId = toPositiveInt(body.class_id);

    /**
     * ======================================================
     * QR TOKEN
     * ======================================================
     */

    const qrToken = normalizeQrToken(body.qr_token);

    maskedToken = maskQrToken(qrToken);

    console.log("[QR] BODY:", {
      class_id: body.class_id,

      qr_token_exists: !!body.qr_token,

      qr_token_length:
        typeof body.qr_token === "string" ? body.qr_token.length : null,
    });

    console.log("[QR] TOKEN:", {
      maskedToken,
      valid: !!qrToken,
      length: qrToken?.length || 0,
    });

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "class_id không hợp lệ",
      });
    }

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: "Mã QR không hợp lệ hoặc đã bị hỏng",
      });
    }

    /**
     * ======================================================
     * CHECK CLASS
     * ======================================================
     */

    const [classRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id,
            start_time
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

    /**
     * ======================================================
     * BEGIN TRANSACTION
     * ======================================================
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * ======================================================
     * LOCK CLASS
     * ======================================================
     */

    const [lockedClassRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id,
            start_time
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
        message: "Lớp học không còn tồn tại",
      });
    }

    const lockedClass = lockedClassRows[0];

    /**
     * ======================================================
     * TÌM STUDENT
     * ======================================================
     */

    const [studentRows] = await connection.execute(
      `
          SELECT
            id,
            code,
            name,
            status,
            church_id,
            qr_token
          FROM students
          WHERE
            qr_token = ?
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
        `[QR] ❌ QR KHÔNG TỒN TẠI | token=${maskedToken} | church=${churchId} | class=${classId}`,
      );

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh với mã QR này",
      });
    }

    const student = studentRows[0];

    /**
     * ======================================================
     * CHECK CHURCH
     * ======================================================
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
     * ======================================================
     * CHECK STUDENT STATUS
     * ======================================================
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

          name: student.name,

          status: student.status,
        },
      });
    }

    /**
     * ======================================================
     * CHECK MEMBERSHIP
     * ======================================================
     */

    const [membershipRows] = await connection.execute(
      `
          SELECT
            class_id,
            student_id
          FROM class_students
          WHERE
            class_id = ?
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

          name: student.name,
        },

        class: {
          id: classId,

          name: lockedClass.name,
        },
      });
    }

    /**
     * ======================================================
     * KIỂM TRA ĐÃ ĐIỂM DANH HÔM NAY
     * ======================================================
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

          WHERE
            student_id = ?
            AND class_id = ?
            AND church_id = ?
            AND attendance_date =
              CURDATE()

          LIMIT 1

          FOR UPDATE
        `,
      [student.id, classId, churchId],
    );

    if (existingAttendanceRows.length) {
      const existing = existingAttendanceRows[0];

      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      console.warn("[QR] ⚠️ ĐÃ ĐIỂM DANH:", {
        attendanceId: existing.id,

        studentId: student.id,

        date: existing.attendance_date,

        time: existing.check_in_time,

        status: existing.status,
      });

      return res.status(409).json({
        success: false,

        code: "ALREADY_ATTENDED",

        message: "Học sinh này đã được điểm danh hôm nay",

        student: {
          id: student.id,

          code: student.code,

          name: student.name,
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
     * ======================================================
     * LẤY GIỜ HIỆN TẠI
     * ======================================================
     */

    const checkInTime = getCurrentTime();

    /**
     * ======================================================
     * TÍNH STATUS THEO START_TIME
     * ======================================================
     */

    const finalStatus = getAttendanceStatusByStartTime(
      checkInTime,
      lockedClass.start_time,
    );

    console.log("[QR] TIME CHECK:", {
      checkInTime,
      startTime: lockedClass.start_time,
      finalStatus,
    });

    /**
     * ======================================================
     * INSERT
     * ======================================================
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
              ?,
              ?,
              NULL
            )
          `,
        [churchId, classId, student.id, teacherId, finalStatus, checkInTime],
      );

      insertResult = result;
    } catch (insertError) {
      /**
       * Race condition:
       * thiết bị khác vừa điểm danh.
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
     * ======================================================
     * GET SAVED RECORD
     * ======================================================
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
          WHERE
            id = ?
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
     * ======================================================
     * COMMIT
     * ======================================================
     */

    await connection.commit();

    transactionStarted = false;

    console.log(
      `[QR] ✅ ĐIỂM DANH THÀNH CÔNG
token=${maskedToken}
student=${student.id}
code=${student.code}
name="${student.name}"
class=${classId}
className="${lockedClass.name}"
church=${churchId}
teacher=${teacherId}
attendance=${savedAttendance.id}
date=${savedAttendance.attendance_date}
time=${savedAttendance.check_in_time}
status=${savedAttendance.status}`,
    );

    return res.status(201).json({
      success: true,

      code: "ATTENDANCE_SUCCESS",

      message: "Điểm danh thành công",

      student: {
        id: student.id,

        code: student.code,

        name: student.name,
      },

      class: {
        id: classId,

        name: lockedClass.name,

        start_time: lockedClass.start_time,
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

    console.error("\n======================================================");

    console.error("[QR] 💥 SCAN QR ERROR");

    console.error("[QR] token:", maskedToken);

    console.error("[QR] message:", error?.message);

    console.error("[QR] code:", error?.code);

    console.error("[QR] sqlState:", error?.sqlState);

    console.error("[QR] errno:", error?.errno);

    console.error("[QR] stack:", error?.stack);

    console.error("======================================================\n");

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

      ...(getErrorMessage(error)
        ? {
            error: getErrorMessage(error),
          }
        : {}),
    });
  } finally {
    if (connection) {
      connection.release();

      console.log("[QR] 🔓 DB connection released");
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
 * Body:
 * {
 *   class_id: 17,
 *   attendance_date: "2026-09-08"
 * }
 *
 * Khi kết thúc:
 *
 * Đã có attendance:
 *   present -> giữ
 *   late    -> giữ
 *   absent  -> giữ
 *   excused -> giữ
 *
 * Chưa có attendance:
 *   => absent
 *
 * Xử lý toàn bộ học sinh,
 * không phụ thuộc pagination FE.
 * =========================================================
 */
const finishAttendance = async (req, res) => {
  let connection = null;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

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
        message: "Không xác định được giáo lý viên",
      });
    }

    /**
     * =====================================================
     * BODY
     * =====================================================
     */

    const body = req?.body || {};

    const classId = toPositiveInt(body.class_id);

    const attendanceDate =
      typeof body.attendance_date === "string"
        ? body.attendance_date.trim()
        : "";

    /**
     * =====================================================
     * VALIDATE
     * =====================================================
     */

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

    /**
     * =====================================================
     * CHECK CLASS
     * =====================================================
     */

    const [classRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id,
            start_time
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

    /**
     * =====================================================
     * BEGIN TRANSACTION
     * =====================================================
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * =====================================================
     * LOCK CLASS
     * =====================================================
     */

    const [lockedClassRows] = await connection.execute(
      `
          SELECT
            id,
            name,
            church_id,
            start_time
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
        message: "Lớp học không còn tồn tại",
      });
    }

    const lockedClass = lockedClassRows[0];

    /**
     * =====================================================
     * GET ACTIVE STUDENTS
     * =====================================================
     */

    const [students] = await connection.execute(
      `
          SELECT
            s.id AS student_id,
            s.code,
            s.name

          FROM class_students cs

          INNER JOIN students s
            ON s.id = cs.student_id

          WHERE
            cs.class_id = ?
            AND s.church_id = ?
            AND s.status = 'active'

          ORDER BY
            s.name ASC,
            s.id ASC
        `,
      [classId, churchId],
    );

    /**
     * =====================================================
     * NO STUDENTS
     * =====================================================
     */

    if (!students.length) {
      await connection.commit();

      transactionStarted = false;

      return res.json({
        success: true,

        message: "Lớp không có học sinh cần điểm danh",

        class_id: classId,

        class_name: lockedClass.name,

        attendance_date: attendanceDate,

        total_students: 0,

        already_attended: 0,

        marked_absent: 0,
      });
    }

    /**
     * =====================================================
     * GET EXISTING ATTENDANCE
     * =====================================================
     */

    const [existingAttendances] = await connection.execute(
      `
          SELECT
            id,
            student_id,
            status
          FROM attendances
          WHERE
            class_id = ?
            AND church_id = ?
            AND attendance_date = ?
          FOR UPDATE
        `,
      [classId, churchId, attendanceDate],
    );

    const attendedStudentIds = new Set(
      existingAttendances.map((row) => Number(row.student_id)),
    );

    /**
     * =====================================================
     * UNMARKED STUDENTS
     * =====================================================
     */

    const unmarkedStudents = students.filter(
      (student) => !attendedStudentIds.has(Number(student.student_id)),
    );

    /**
     * =====================================================
     * INSERT ABSENT
     * =====================================================
     */

    for (const student of unmarkedStudents) {
      try {
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
            VALUES
            (
              ?,
              ?,
              ?,
              ?,
              ?,
              'absent',
              NULL,
              NULL
            )
          `,
          [churchId, classId, student.student_id, teacherId, attendanceDate],
        );
      } catch (insertError) {
        /**
         * Nếu duplicate do race condition
         * thì giữ bản ghi đã tồn tại.
         */

        if (insertError?.code === "ER_DUP_ENTRY") {
          continue;
        }

        throw insertError;
      }
    }

    /**
     * =====================================================
     * COMMIT
     * =====================================================
     */

    await connection.commit();

    transactionStarted = false;

    const totalStudents = students.length;

    const alreadyAttended = attendedStudentIds.size;

    const markedAbsent = unmarkedStudents.length;

    /**
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return res.json({
      success: true,

      message:
        markedAbsent > 0
          ? `Đã kết thúc điểm danh. ${markedAbsent} học sinh chưa điểm danh được chuyển thành vắng.`
          : "Đã kết thúc điểm danh. Tất cả học sinh đã được điểm danh.",

      class_id: classId,

      class_name: lockedClass.name,

      start_time: lockedClass.start_time,

      attendance_date: attendanceDate,

      total_students: totalStudents,

      already_attended: alreadyAttended,

      marked_absent: markedAbsent,
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

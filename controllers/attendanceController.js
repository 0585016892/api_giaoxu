const db = require("../config/db");
const ExcelJS = require("exceljs");

/**
 * =========================================================
 * EXPORT EXCEL ATTENDANCE
 * GET /attendance/export-excel
 *
 * Query:
 * - date
 * - attendance_type: mass | catechism
 * - class_id: bắt buộc với catechism
 * - search
 * - status
 * =========================================================
 */

/**
 * =========================================================
 * ATTENDANCE CONTROLLER
 * =========================================================
 *
 * 2 LOẠI ĐIỂM DANH:
 *
 * 1. catechism = Học giáo lý
 *    - Có class_id
 *    - Teacher chỉ được điểm danh lớp mình phụ trách
 *
 * 2. mass = Thánh lễ
 *    - Frontend KHÔNG cần class_id
 *    - Danh sách = toàn bộ học sinh trong giáo xứ
 *    - Backend tự lấy lớp hiện tại của từng học sinh
 *      chỉ để lưu vào attendances.class_id
 *
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

/**
 * Giáo xứ của user
 */
const getChurchId = (req) => {
  const user = getAuthUser(req);

  return toPositiveInt(user.church_id || user.parish_id || 0);
};

/**
 * Teacher ID
 *
 * QUAN TRỌNG:
 * Không dùng req.user.id làm teacher_id một cách mặc định.
 *
 * Vì:
 * req.user.id thường là admins.id.
 *
 * Teacher phải dùng:
 * req.user.teacher_id
 */
const getTeacherId = (req) => {
  const user = getAuthUser(req);

  return toPositiveInt(user.teacher_id || 0);
};

const getUserRole = (req) => {
  return typeof req?.user?.role === "string"
    ? req.user.role.trim().toLowerCase()
    : "";
};

const isTeacher = (req) => {
  return getUserRole(req) === "teacher";
};

/**
 * =========================================================
 * ATTENDANCE TYPE
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
 * DATE / TIME
 * =========================================================
 */

const getCurrentDate = () => {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(now.getMonth() + 1).padStart(2, "0");

  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getCurrentTime = () => {
  return new Date().toTimeString().slice(0, 8);
};

/**
 * =========================================================
 * STATUS
 * =========================================================
 *
 * GIÁO LÝ:
 *
 * check_in_time < start_time
 *     => present
 *
 * check_in_time >= start_time
 *     => late
 *
 * THÁNH LỄ:
 *
 * present luôn là present.
 *
 * Chưa có giờ bắt đầu Thánh lễ riêng.
 * =========================================================
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
  if (requestedStatus === "absent" || requestedStatus === "excused") {
    return requestedStatus;
  }

  if (attendanceType === "mass") {
    return "present";
  }

  return getAttendanceStatusByStartTime(checkInTime, classStartTime);
};

/**
 * =========================================================
 * CLASS SCHEDULE
 * =========================================================
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
        ORDER BY
          id ASC
        LIMIT 1
      `,
    [classId, date],
  );

  return rows[0] || null;
};

/**
 * =========================================================
 * QR
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

  if (/\s/.test(token)) {
    return null;
  }

  if (!/^[A-Za-z0-9-]{10,128}$/.test(token)) {
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
 * ERROR
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
 * GET TEACHER ASSIGNED CLASSES
 * =========================================================
 *
 * QUAN TRỌNG:
 * - classes KHÔNG có teacher_id
 * - Việc phân lớp nằm ở catechist_classes
 *
 * teacher_id trong JWT / req.user phải tương ứng
 * với catechists.id nếu hệ thống của bạn đang dùng
 * teacher_id = catechists.id.
 *
 * =========================================================
 */
const getTeacherAssignedClasses = async (connection, req, churchId) => {
  const teacherId = getTeacherId(req);

  if (!teacherId) {
    return [];
  }

  const [rows] = await connection.execute(
    `
      SELECT DISTINCT
        c.id,
        c.name,
        c.code

      FROM classes c

      INNER JOIN catechist_classes cc
        ON cc.class_id = c.id

      WHERE
        c.church_id = ?
        AND cc.catechist_id = ?
        AND (
          cc.status IS NULL
          OR cc.status IN ('teaching', 'active')
        )

      ORDER BY
        c.name ASC,
        c.id ASC
    `,
    [churchId, teacherId],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    code: row.code || null,
  }));
};

/**
 * =========================================================
 * CHECK TEACHER CAN ACCESS CLASS
 * =========================================================
 */

const teacherCanAccessClass = async (executor, req, churchId, classId) => {
  if (!isTeacher(req)) {
    return {
      ok: true,
    };
  }

  const teacherId = getTeacherId(req);

  if (!teacherId) {
    return {
      ok: false,
      status: 401,
      message: "Tài khoản giáo viên chưa có teacher_id",
    };
  }

  const [rows] = await executor.execute(
    `
        SELECT
          id,
          name,
          code,
          teacher_id
        FROM classes
        WHERE
          id = ?
          AND church_id = ?
          AND teacher_id = ?
        LIMIT 1
      `,
    [classId, churchId, teacherId],
  );

  if (!rows.length) {
    return {
      ok: false,
      status: 403,
      message: "Bạn không được phân công lớp này nên không có quyền điểm danh",
    };
  }

  return {
    ok: true,
    class: rows[0],
  };
};

/**
 * =========================================================
 * RESOLVE CATECHISM CLASS
 * =========================================================
 *
 * CHỈ DÙNG CHO HỌC GIÁO LÝ.
 *
 * ADMIN:
 *   class_id bắt buộc
 *
 * TEACHER:
 *
 *   class_id có:
 *      kiểm tra class.teacher_id
 *
 *   class_id không có:
 *      nếu chỉ có 1 lớp -> tự lấy
 *      nếu nhiều lớp -> báo frontend chọn
 *
 * Không bao giờ lấy bừa lớp đầu tiên.
 * =========================================================
 */

const resolveCatechismClass = async (
  connection,
  req,
  churchId,
  requestedClassId,
) => {
  const classes = await getTeacherAssignedClasses(connection, req, churchId);

  if (!Array.isArray(classes) || classes.length === 0) {
    return {
      ok: false,
      status: 403,
      message: "Giáo viên chưa được phân công lớp giáo lý",
      classes: [],
    };
  }

  /**
   * Có class_id từ frontend
   */
  if (requestedClassId) {
    const classInfo = classes.find(
      (item) => Number(item.id) === Number(requestedClassId),
    );

    if (!classInfo) {
      return {
        ok: false,
        status: 403,
        message: "Bạn không được phép điểm danh lớp này",
        classes,
      };
    }

    return {
      ok: true,
      class: classInfo,
      classes,
    };
  }

  /**
   * Không truyền class_id
   *
   * Nếu giáo viên chỉ có đúng 1 lớp
   * thì có thể tự xác định lớp.
   */
  if (classes.length === 1) {
    return {
      ok: true,
      class: classes[0],
      classes,
    };
  }

  /**
   * Có nhiều lớp nhưng không biết chọn lớp nào
   */
  return {
    ok: false,
    status: 400,
    message: "Vui lòng chọn lớp giáo lý",
    classes,
  };
};
/**
 * =========================================================
 * STUDENT CLASS
 * =========================================================
 *
 * Dùng cho MASS.
 *
 * Chỉ dùng class_id để lưu DB.
 *
 * Không dùng để giới hạn danh sách Mass.
 * =========================================================
 */

const getStudentClass = async (executor, churchId, studentId) => {
  const [rows] = await executor.execute(
    `
        SELECT
          c.id,
          c.name,
          c.code
        FROM class_students cs
        INNER JOIN classes c
          ON c.id = cs.class_id
          AND c.church_id = ?
        INNER JOIN students s
          ON s.id = cs.student_id
          AND s.church_id = ?
        WHERE
          cs.student_id = ?
        ORDER BY
          c.id ASC
        LIMIT 1
      `,
    [churchId, churchId, studentId],
  );

  return rows[0] || null;
};

/**
 * =========================================================
 * GET ALL PARISH STUDENTS
 * =========================================================
 */

const getAllParishStudents = async (executor, churchId) => {
  const [rows] = await executor.execute(
    `
        SELECT
          s.id,
          s.code,
          s.name,
          s.gender,
          s.date_of_birth
        FROM students s
        WHERE
          s.church_id = ?
        ORDER BY
          s.name ASC,
          s.id ASC
      `,
    [churchId],
  );

  return rows || [];
};

/**
 * =========================================================
 * GET ATTENDANCE
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

    const requestedClassId = toPositiveInt(req?.query?.class_id);

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
     * VALIDATE
     * =====================================================
     */

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

    const validStatuses = [
      "all",
      "present",
      "absent",
      "late",
      "excused",
      "not_attended",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status không hợp lệ",
      });
    }

    /**
     * =====================================================
     * CATECHISM
     * =====================================================
     */

    if (attendanceType === "catechism") {
      const classResult = await resolveCatechismClass(
        db,
        req,
        churchId,
        requestedClassId,
      );
      if (!classResult.ok) {
        const errorStatus =
          Number.isInteger(classResult.status) && classResult.status >= 400
            ? classResult.status
            : 403;

        return res.status(errorStatus).json({
          success: false,
          message:
            classResult.message || "Giáo viên không được phân công lớp giáo lý",
          ...(Array.isArray(classResult.classes)
            ? {
                classes: classResult.classes,
              }
            : {}),
        });
      }

      const classInfo = classResult.class;

      const classId = Number(classInfo.id);

      const classSchedule = await getClassSchedule(db, classId, date);

      let whereSql = `
        WHERE
          cs.class_id = ?
      `;

      const params = [classId];

      if (search) {
        whereSql += `
          AND (
            s.name LIKE ?
            OR s.code LIKE ?
          )
        `;

        params.push(`%${search}%`, `%${search}%`);
      }

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
       * COUNT
       */

      const [countRows] = await db.execute(
        `
            SELECT
              COUNT(*) AS total

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

      const offset = (page - 1) * limit;

      /**
       * DATA
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

            LIMIT ${limit}
            OFFSET ${offset}
          `,
        [churchId, classId, churchId, date, attendanceType, ...params],
      );

      /**
       * STATISTICS
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
          code: classInfo.code || null,
          start_time: classSchedule?.start_time || null,
        },

        date,

        attendance_type: "catechism",

        attendance_type_label: "Học giáo lý",

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
    }

    /**
     * =====================================================
     * MASS
     * =====================================================
     *
     * KHÔNG class_id.
     *
     * KHÔNG resolveCatechismClass().
     *
     * TOÀN BỘ HỌC SINH GIÁO XỨ.
     * =====================================================
     */

    let whereSql = `
      WHERE
        s.church_id = ?
    `;

    const params = [churchId];

    if (search) {
      whereSql += `
        AND (
          s.name LIKE ?
          OR s.code LIKE ?
        )
      `;

      params.push(`%${search}%`, `%${search}%`);
    }

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
     * COUNT
     */

    const [countRows] = await db.execute(
      `
          SELECT
            COUNT(*) AS total

          FROM students s

          LEFT JOIN attendances a
            ON a.student_id = s.id
            AND a.church_id = ?
            AND a.attendance_date = ?
            AND a.attendance_type = 'mass'

          ${whereSql}
        `,
      [churchId, date, ...params],
    );

    const total = Number(countRows[0]?.total || 0);

    const offset = (page - 1) * limit;

    /**
     * DATA
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
            a.class_id,
            a.created_at,
            a.updated_at

          FROM students s

          LEFT JOIN attendances a
            ON a.student_id = s.id
            AND a.church_id = ?
            AND a.attendance_date = ?
            AND a.attendance_type = 'mass'

          ${whereSql}

          ORDER BY
            s.name ASC,
            s.id ASC

          LIMIT ${limit}
          OFFSET ${offset}
        `,
      [churchId, date, ...params],
    );

    /**
     * STATISTICS
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

          FROM students s

          LEFT JOIN attendances a
            ON a.student_id = s.id
            AND a.church_id = ?
            AND a.attendance_date = ?
            AND a.attendance_type = 'mass'

          WHERE
            s.church_id = ?
        `,
      [churchId, date, churchId],
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

      class: null,

      date,

      attendance_type: "mass",

      attendance_type_label: "Thánh lễ",

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

        class_id: row.class_id || null,

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

    /**
     * Chỉ teacher mới cần teacher_id.
     *
     * Admin có thể không có teacher_id.
     */
    if (isTeacher(req) && !teacherId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản giáo viên chưa có teacher_id",
      });
    }

    const body = req?.body || {};

    const attendanceType = normalizeAttendanceType(
      body.attendance_type || "catechism",
    );

    const attendanceDate =
      typeof body.attendance_date === "string"
        ? body.attendance_date.trim()
        : "";

    const students = body.students;

    if (!attendanceType) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ",
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
        message: `Không được gửi quá ${MAX_BULK_STUDENTS} học sinh`,
      });
    }

    /**
     * =====================================================
     * CATECHISM CLASS
     * =====================================================
     */

    let classId = null;
    let classInfo = null;
    let classSchedule = null;

    if (attendanceType === "catechism") {
      const classResult = await resolveCatechismClass(
        connection,
        req,
        churchId,
        body.class_id,
      );

      if (!classResult.ok) {
        return res.status(classResult.status).json({
          success: false,
          message: classResult.message,

          ...(classResult.classes
            ? {
                classes: classResult.classes,
              }
            : {}),
        });
      }

      classInfo = classResult.class;

      classId = Number(classInfo.id);

      classSchedule = await getClassSchedule(
        connection,
        classId,
        attendanceDate,
      );
    }

    /**
     * =====================================================
     * NORMALIZE
     * =====================================================
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

      normalizedStudents.push({
        studentId,

        requestedStatus,

        checkInTime,

        note,

        classId: attendanceType === "catechism" ? classId : null,

        className: attendanceType === "catechism" ? classInfo.name : null,

        startTime:
          attendanceType === "catechism"
            ? classSchedule?.start_time || null
            : null,

        finalStatus: null,
      });
    }

    /**
     * =====================================================
     * CHECK STUDENTS
     * =====================================================
     */

    for (const item of normalizedStudents) {
      /**
       * ===================================================
       * CATECHISM
       * ===================================================
       */

      if (attendanceType === "catechism") {
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
                AND cs.student_id = ?
              LIMIT 1
            `,
          [churchId, item.classId, item.studentId],
        );

        if (!membershipRows.length) {
          return res.status(400).json({
            success: false,
            code: "STUDENT_NOT_IN_CLASS",
            message: `Học sinh ${item.studentId} không thuộc lớp này`,
          });
        }
      } else {
        /**
         * ===================================================
         * MASS
         * ===================================================
         */
        const [studentRows] = await connection.execute(
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
          [item.studentId, churchId],
        );

        if (!studentRows.length) {
          return res.status(400).json({
            success: false,
            code: "STUDENT_NOT_IN_CHURCH",
            message: `Học sinh ${item.studentId} không thuộc giáo xứ`,
          });
        }

        /**
         * Lớp chỉ để lưu DB.
         */
        const studentClass = await getStudentClass(
          connection,
          churchId,
          item.studentId,
        );

        if (!studentClass) {
          return res.status(400).json({
            success: false,
            code: "STUDENT_NO_CLASS",
            message: `Học sinh ${item.studentId} chưa được xếp vào lớp`,
          });
        }

        item.classId = Number(studentClass.id);

        item.className = studentClass.name;

        /**
         * Mass không tính late.
         */
        item.startTime = null;
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
     * CALCULATE STATUS
     * =====================================================
     */

    for (const item of normalizedStudents) {
      item.finalStatus = calculateFinalStatus({
        attendanceType,
        requestedStatus: item.requestedStatus,
        checkInTime: item.checkInTime,
        classStartTime: item.startTime,
      });
    }

    /**
     * =====================================================
     * SAVE
     * =====================================================
     */

    const savedRows = [];

    for (const item of normalizedStudents) {
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
        [
          churchId,
          item.classId,
          item.studentId,
          attendanceDate,
          attendanceType,
        ],
      );

      /**
       * UPDATE
       */

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
              updated_at =
                CURRENT_TIMESTAMP
            WHERE
              id = ?
              AND church_id = ?
          `,
          [
            teacherId || null,
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

          class_id: item.classId,

          class_name: item.className,

          previous_status: existing.status,

          status: item.finalStatus,

          check_in_time: item.checkInTime,

          note: item.note,

          action: "updated",
        });
      } else {
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
                VALUES (
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  CURRENT_TIMESTAMP,
                  CURRENT_TIMESTAMP
                )
              `,
            [
              churchId,
              item.classId,
              item.studentId,
              teacherId || null,
              attendanceType,
              attendanceDate,
              item.finalStatus,
              item.checkInTime,
              item.note,
            ],
          );
        } catch (insertError) {
          if (
            insertError?.code === "ER_DUP_ENTRY" ||
            insertError?.errno === 1062
          ) {
            await safeRollback(connection, transactionStarted);

            transactionStarted = false;

            return res.status(409).json({
              success: false,
              code: "ALREADY_ATTENDED",
              message: `Học sinh ${item.studentId} đã được điểm danh`,
            });
          }

          throw insertError;
        }

        savedRows.push({
          id: insertResult.insertId,

          student_id: item.studentId,

          class_id: item.classId,

          class_name: item.className,

          previous_status: null,

          status: item.finalStatus,

          check_in_time: item.checkInTime,

          note: item.note,

          action: "created",
        });
      }
    }

    await connection.commit();

    transactionStarted = false;

    return res.json({
      success: true,

      message: `Lưu điểm danh ${getAttendanceTypeLabel(
        attendanceType,
      )} thành công`,

      count: normalizedStudents.length,

      class_id: attendanceType === "catechism" ? classId : null,

      class_name:
        attendanceType === "catechism" ? classInfo?.name || null : null,

      attendance_date: attendanceDate,

      attendance_type: attendanceType,

      attendance_type_label: getAttendanceTypeLabel(attendanceType),

      data: normalizedStudents.map((item) => ({
        student_id: item.studentId,

        class_id: item.classId,

        class_name: item.className,

        requested_status: item.requestedStatus,

        status: item.finalStatus,

        check_in_time: item.checkInTime,

        note: item.note,
      })),

      saved: savedRows,
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
 * SCAN QR
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

    if (isTeacher(req) && !teacherId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản giáo viên chưa có teacher_id",
      });
    }

    const body = req?.body || {};

    let classId = toPositiveInt(body.class_id);

    const attendanceType = normalizeAttendanceType(body.attendance_type);

    const qrToken = normalizeQrToken(body.qr_token);

    maskedToken = maskQrToken(qrToken);

    console.log("========== QR ATTENDANCE ==========");

    console.log("role:", getUserRole(req));

    console.log("teacher_id:", teacherId || null);

    console.log("attendance_type:", body.attendance_type);

    console.log("normalized:", attendanceType);

    console.log("class_id:", classId || null);

    console.log("qr_token:", maskedToken);

    console.log("===================================");

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
     * =====================================================
     * CATECHISM
     * =====================================================
     */

    if (attendanceType === "catechism") {
      const classResult = await resolveCatechismClass(
        connection,
        req,
        churchId,
        classId,
      );

      if (!classResult.ok) {
        return res.status(classResult.status).json({
          success: false,
          message: classResult.message,

          ...(classResult.classes
            ? {
                classes: classResult.classes,
              }
            : {}),
        });
      }

      classId = Number(classResult.class.id);
    }

    /**
     * MASS:
     *
     * Không cần class_id.
     */

    const attendanceDate = getCurrentDate();

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * =====================================================
     * FIND STUDENT
     * =====================================================
     */

    let studentRows;

    if (attendanceType === "catechism") {
      const [rows] = await connection.execute(
        `
            SELECT
              s.id,
              s.code,
              s.name
            FROM students s
            INNER JOIN class_students cs
              ON cs.student_id =
                s.id
              AND cs.class_id = ?
            WHERE
              s.church_id = ?
              AND s.qr_token = ?
            LIMIT 1
            FOR UPDATE
          `,
        [classId, churchId, qrToken],
      );

      studentRows = rows;
    } else {
      const [rows] = await connection.execute(
        `
            SELECT
              s.id,
              s.code,
              s.name
            FROM students s
            WHERE
              s.church_id = ?
              AND s.qr_token = ?
            LIMIT 1
            FOR UPDATE
          `,
        [churchId, qrToken],
      );

      studentRows = rows;
    }

    if (!studentRows.length) {
      await safeRollback(connection, transactionStarted);

      transactionStarted = false;

      return res.status(404).json({
        success: false,

        code: "STUDENT_NOT_FOUND",

        message:
          attendanceType === "catechism"
            ? "Không tìm thấy học sinh trong lớp này từ mã QR"
            : "Không tìm thấy học sinh trong giáo xứ từ mã QR này",
      });
    }

    const student = studentRows[0];

    /**
     * =====================================================
     * MASS -> STUDENT CLASS
     * =====================================================
     */

    let classInfo = null;

    if (attendanceType === "mass") {
      classInfo = await getStudentClass(connection, churchId, student.id);

      if (!classInfo) {
        await safeRollback(connection, transactionStarted);

        transactionStarted = false;

        return res.status(400).json({
          success: false,

          code: "STUDENT_NO_CLASS",

          message: "Học sinh chưa được xếp vào lớp",

          student: {
            id: student.id,
            code: student.code,
            name: student.name,
          },
        });
      }

      classId = Number(classInfo.id);
    }

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
      code,
      church_id,
      catechist_id
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

    /**
     * Teacher:
     * kiểm tra lại quyền lớp.
     *
     * Mass không giới hạn theo class,
     * nhưng class_id lưu DB vẫn phải là
     * lớp hợp lệ trong giáo xứ.
     */
    if (isTeacher(req) && attendanceType === "catechism") {
      const allowed = Number(lockedClass.teacher_id) === Number(teacherId);

      if (!allowed) {
        await safeRollback(connection, transactionStarted);

        transactionStarted = false;

        return res.status(403).json({
          success: false,
          message: "Bạn không được phân công lớp này",
        });
      }
    }

    /**
     * =====================================================
     * SCHEDULE
     * =====================================================
     */

    const lockedClassSchedule =
      attendanceType === "catechism"
        ? await getClassSchedule(connection, classId, attendanceDate)
        : null;

    /**
     * =====================================================
     * DUPLICATE
     * =====================================================
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

        message: `Học sinh này đã được điểm danh ${getAttendanceTypeLabel(
          attendanceType,
        )}`,

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

        class: {
          id: classId,
          name: lockedClass.name,
        },
      });
    }

    /**
     * =====================================================
     * TIME
     * =====================================================
     */

    const checkInTime = getCurrentTime();

    /**
     * =====================================================
     * STATUS
     * =====================================================
     */

    const finalStatus = calculateFinalStatus({
      attendanceType,

      requestedStatus: "present",

      checkInTime,

      classStartTime: lockedClassSchedule?.start_time || null,
    });

    /**
     * =====================================================
     * INSERT
     * =====================================================
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
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `,
        [
          churchId,
          classId,
          student.id,
          teacherId || null,
          attendanceType,
          attendanceDate,
          finalStatus,
          checkInTime,
          null,
        ],
      );
    } catch (insertError) {
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

      attendance: {
        id: insertResult.insertId,

        church_id: churchId,

        class_id: classId,

        student_id: student.id,

        teacher_id: teacherId || null,

        attendance_type: attendanceType,

        attendance_date: attendanceDate,

        status: finalStatus,

        check_in_time: checkInTime,

        note: null,
      },
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

    if (isTeacher(req) && !teacherId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản giáo viên chưa có teacher_id",
      });
    }

    const body = req?.body || {};

    const attendanceDate =
      typeof body.attendance_date === "string"
        ? body.attendance_date.trim()
        : "";

    const attendanceType = normalizeAttendanceType(
      body.attendance_type || "catechism",
    );

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

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * =====================================================
     * CATECHISM
     * =====================================================
     */

    if (attendanceType === "catechism") {
      const classResult = await resolveCatechismClass(
        connection,
        req,
        churchId,
        body.class_id,
      );

      if (!classResult.ok) {
        await safeRollback(connection, transactionStarted);

        transactionStarted = false;

        return res.status(classResult.status).json({
          success: false,

          message: classResult.message,

          ...(classResult.classes
            ? {
                classes: classResult.classes,
              }
            : {}),
        });
      }

      const classId = Number(classResult.class.id);

      const lockedClass = classResult.class;

      /**
       * STUDENTS
       */

      const [studentRows] = await connection.execute(
        `
            SELECT
              s.id,
              s.code,
              s.name
            FROM class_students cs
            INNER JOIN students s
              ON s.id =
                cs.student_id
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
       * EXISTING
       */

      const [attendanceRows] = await connection.execute(
        `
            SELECT
              id,
              student_id,
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

      const unmarkedStudents = students.filter(
        (student) => !attendedStudentIds.has(Number(student.id)),
      );

      /**
       * INSERT ABSENT
       */

      for (const student of unmarkedStudents) {
        try {
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
              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'absent',
                NULL,
                NULL,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
            `,
            [
              churchId,
              classId,
              student.id,
              teacherId || null,
              attendanceType,
              attendanceDate,
            ],
          );
        } catch (insertError) {
          if (
            insertError?.code === "ER_DUP_ENTRY" ||
            insertError?.errno === 1062
          ) {
            continue;
          }

          throw insertError;
        }
      }

      await connection.commit();

      transactionStarted = false;

      return res.json({
        success: true,

        message:
          unmarkedStudents.length > 0
            ? `Đã kết thúc điểm danh Học giáo lý. ${unmarkedStudents.length} học sinh chưa điểm danh được chuyển thành vắng.`
            : "Đã kết thúc điểm danh Học giáo lý. Tất cả học sinh đã được điểm danh.",

        class_id: classId,

        class_name: lockedClass.name,

        attendance_date: attendanceDate,

        attendance_type: attendanceType,

        attendance_type_label: "Học giáo lý",

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
    }

    /**
     * =====================================================
     * MASS
     * =====================================================
     *
     * Toàn bộ học sinh giáo xứ.
     *
     * Không class_id.
     * =====================================================
     */

    const students = await getAllParishStudents(connection, churchId);

    /**
     * EXISTING MASS
     */

    const [attendanceRows] = await connection.execute(
      `
          SELECT
            id,
            student_id,
            class_id,
            status,
            check_in_time
          FROM attendances
          WHERE
            church_id = ?
            AND attendance_date = ?
            AND attendance_type = ?
          FOR UPDATE
        `,
      [churchId, attendanceDate, attendanceType],
    );

    const attendedStudentMap = new Map();

    for (const row of attendanceRows) {
      attendedStudentMap.set(Number(row.student_id), row);
    }

    const unmarkedStudents = students.filter(
      (student) => !attendedStudentMap.has(Number(student.id)),
    );

    const markedAbsent = [];

    /**
     * =====================================================
     * INSERT MASS ABSENT
     * =====================================================
     */

    for (const student of unmarkedStudents) {
      const studentClass = await getStudentClass(
        connection,
        churchId,
        student.id,
      );

      /**
       * class_id NOT NULL
       *
       * Không có lớp:
       * không thể INSERT.
       */
      if (!studentClass) {
        console.warn("[MASS FINISH] Student has no class:", {
          student_id: student.id,
          code: student.code,
          name: student.name,
        });

        continue;
      }

      try {
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
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              'absent',
              NULL,
              NULL,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `,
          [
            churchId,

            Number(studentClass.id),

            student.id,

            teacherId || null,

            attendanceType,

            attendanceDate,
          ],
        );

        markedAbsent.push({
          student_id: student.id,

          code: student.code,

          name: student.name,

          class_id: Number(studentClass.id),

          class_name: studentClass.name,

          status: "absent",
        });
      } catch (insertError) {
        if (
          insertError?.code === "ER_DUP_ENTRY" ||
          insertError?.errno === 1062
        ) {
          continue;
        }

        throw insertError;
      }
    }

    await connection.commit();

    transactionStarted = false;

    return res.json({
      success: true,

      message:
        markedAbsent.length > 0
          ? `Đã kết thúc điểm danh Thánh lễ. ${markedAbsent.length} học sinh chưa điểm danh được chuyển thành vắng.`
          : "Đã kết thúc điểm danh Thánh lễ. Tất cả học sinh đã được điểm danh.",

      class_id: null,

      class_name: null,

      start_time: null,

      attendance_date: attendanceDate,

      attendance_type: attendanceType,

      attendance_type_label: "Thánh lễ",

      total_students: students.length,

      already_attended: attendedStudentMap.size,

      marked_absent: markedAbsent.length,

      data: markedAbsent,
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

    if (isTeacher(req) && !teacherId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản giáo viên chưa có teacher_id",
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

    /**
     * =====================================================
     * GET ATTENDANCE
     * =====================================================
     */

    const [existingRows] = await connection.execute(
      `
          SELECT
            a.id,
            a.church_id,
            a.class_id,
            a.student_id,
            a.teacher_id,
            a.attendance_type,
            a.status,
            a.check_in_time,
            a.note,
            a.attendance_date,

            c.name AS class_name

          FROM attendances a

          INNER JOIN classes c
            ON c.id = a.class_id
            AND c.church_id =
              a.church_id

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
     * TEACHER PERMISSION
     * =====================================================
     *
     * CATECHISM:
     *   phải phụ trách lớp.
     *
     * MASS:
     *   không giới hạn bởi class_id.
     * =====================================================
     */

    if (isTeacher(req) && existing.attendance_type === "catechism") {
      const permission = await teacherCanAccessClass(
        connection,
        req,
        churchId,
        existing.class_id,
      );

      if (!permission.ok) {
        await safeRollback(connection, transactionStarted);

        transactionStarted = false;

        return res.status(permission.status).json({
          success: false,
          message: permission.message,
        });
      }
    }

    /**
     * =====================================================
     * SCHEDULE
     * =====================================================
     */

    const existingSchedule =
      existing.attendance_type === "catechism"
        ? await getClassSchedule(
            connection,
            existing.class_id,
            existing.attendance_date,
          )
        : null;

    /**
     * =====================================================
     * STATUS
     * =====================================================
     */

    const finalStatus = calculateFinalStatus({
      attendanceType: existing.attendance_type,

      requestedStatus,

      checkInTime,

      classStartTime: existingSchedule?.start_time || null,
    });

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
          updated_at =
            CURRENT_TIMESTAMP
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

    await connection.commit();

    transactionStarted = false;

    return res.json({
      success: true,

      message: "Cập nhật điểm danh thành công",

      data: {
        id: attendanceId,

        church_id: churchId,

        class_id: existing.class_id,

        class_name: existing.class_name,

        student_id: existing.student_id,

        attendance_type: existing.attendance_type,

        attendance_type_label: getAttendanceTypeLabel(existing.attendance_type),

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
            class_id,
            student_id,
            attendance_type,
            attendance_date,
            status,
            teacher_id
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
     * Teacher:
     *
     * Mass:
     *   cho phép
     *
     * Catechism:
     *   phải phụ trách lớp.
     */

    if (isTeacher(req) && attendance.attendance_type === "catechism") {
      const permission = await teacherCanAccessClass(
        connection,
        req,
        churchId,
        attendance.class_id,
      );

      if (!permission.ok) {
        await safeRollback(connection, transactionStarted);

        transactionStarted = false;

        return res.status(permission.status).json({
          success: false,
          message: permission.message,
        });
      }
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

    const [rows] = await db.execute(
      `
          SELECT
            a.id,
            a.class_id,

            c.name AS class_name,

            (
              SELECT
                cs.start_time
              FROM class_schedules cs
              WHERE
                cs.class_id =
                  a.class_id
                AND cs.day_of_week =
                  DAYOFWEEK(
                    a.attendance_date
                  )
              ORDER BY
                cs.id ASC
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
            AND c.church_id =
              a.church_id

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

      data: rows.map((row) => ({
        ...row,

        class_id: row.class_id || null,

        class_name: row.class_name || null,

        attendance_type: row.attendance_type || null,

        status: row.status || null,

        check_in_time: row.check_in_time || null,

        note: row.note || null,
      })),
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

    const fromDate =
      typeof req?.query?.from === "string" ? req.query.from.trim() : "";

    const toDate =
      typeof req?.query?.to === "string" ? req.query.to.trim() : "";

    const attendanceType = req?.query?.attendance_type
      ? normalizeAttendanceType(req.query.attendance_type)
      : null;

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

    if (req?.query?.attendance_type && !attendanceType) {
      return res.status(400).json({
        success: false,
        message: "attendance_type không hợp lệ",
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
            code,
            teacher_id
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
     * Teacher chỉ xem lớp được phân công.
     */

    if (isTeacher(req)) {
      const permission = await teacherCanAccessClass(
        db,
        req,
        churchId,
        classId,
      );

      if (!permission.ok) {
        return res.status(permission.status).json({
          success: false,
          message: "Bạn không có quyền xem thống kê của lớp này",
        });
      }
    }

    const scheduleDate = fromDate || toDate || getCurrentDate();

    const classSchedule = await getClassSchedule(db, classId, scheduleDate);

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

    if (attendanceType) {
      query += `
        AND a.attendance_type = ?
      `;

      params.push(attendanceType);
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
        id: classRows[0].id,

        name: classRows[0].name,

        code: classRows[0].code || null,

        start_time: classSchedule?.start_time || null,
      },

      from: fromDate || null,

      to: toDate || null,

      summary,

      data: rows.map((row) => ({
        ...row,

        mass_total: Number(row.mass_total || 0),

        mass_present_count: Number(row.mass_present_count || 0),

        mass_absent_count: Number(row.mass_absent_count || 0),

        mass_late_count: Number(row.mass_late_count || 0),

        mass_excused_count: Number(row.mass_excused_count || 0),

        catechism_total: Number(row.catechism_total || 0),

        catechism_present_count: Number(row.catechism_present_count || 0),

        catechism_absent_count: Number(row.catechism_absent_count || 0),

        catechism_late_count: Number(row.catechism_late_count || 0),

        catechism_excused_count: Number(row.catechism_excused_count || 0),
      })),
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

const exportAttendanceExcel = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    const {
      date,
      attendance_type = "catechism",
      class_id,
      search = "",
      status = "all",
    } = req.query;

    // -----------------------------------------------------
    // VALIDATE
    // -----------------------------------------------------

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({
        success: false,
        message: "Ngày điểm danh không hợp lệ",
      });
    }

    if (!["mass", "catechism"].includes(attendance_type)) {
      return res.status(400).json({
        success: false,
        message: "Loại điểm danh không hợp lệ",
      });
    }

    let classId = null;

    if (attendance_type === "catechism") {
      classId = Number(class_id);

      if (!Number.isInteger(classId) || classId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn lớp giáo lý",
        });
      }
    }

    const allowedStatuses = ["all", "present", "absent", "late", "excused"];

    const finalStatus = String(status || "all").toLowerCase();

    if (!allowedStatuses.includes(finalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái điểm danh không hợp lệ",
      });
    }

    // -----------------------------------------------------
    // SQL CONDITIONS
    // -----------------------------------------------------

    const where = [
      "a.church_id = ?",
      "a.attendance_date = ?",
      "a.attendance_type = ?",
    ];

    const values = [churchId, date, attendance_type];

    if (attendance_type === "catechism") {
      where.push("a.class_id = ?");
      values.push(classId);
    }

    if (finalStatus !== "all") {
      where.push("a.status = ?");
      values.push(finalStatus);
    }

    if (String(search).trim()) {
      where.push(`(
        s.full_name LIKE ?
        OR s.student_code LIKE ?
        OR s.qr_code LIKE ?
      )`);

      const keyword = `%${String(search).trim()}%`;

      values.push(keyword, keyword, keyword);
    }

    // -----------------------------------------------------
    // QUERY
    //
    // Lưu ý:
    // Nếu bảng students của bạn dùng tên cột khác
    // (ví dụ name thay cho full_name), chỉnh tại đây.
    // -----------------------------------------------------

    const sql = `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type,
        a.status,
        a.check_in_time,
        a.note,

        s.student_code,
        s.full_name,

        c.name AS class_name

      FROM attendances a

      INNER JOIN students s
        ON s.id = a.student_id
        AND s.church_id = a.church_id

      LEFT JOIN classes c
        ON c.id = a.class_id
        AND c.church_id = a.church_id

      WHERE ${where.join(" AND ")}

      ORDER BY
        c.name ASC,
        s.full_name ASC,
        s.id ASC
    `;

    const [rows] = await db.execute(sql, values);

    // -----------------------------------------------------
    // EXCEL WORKBOOK
    // -----------------------------------------------------

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "FaithEdu";
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet("Diem danh", {
      views: [{ state: "frozen", ySplit: 5 }],
    });

    worksheet.columns = [
      { key: "index", width: 8 },
      { key: "student_code", width: 18 },
      { key: "full_name", width: 30 },
      { key: "class_name", width: 24 },
      { key: "attendance_date", width: 16 },
      { key: "attendance_type", width: 20 },
      { key: "status", width: 18 },
      { key: "check_in_time", width: 20 },
      { key: "note", width: 35 },
    ];

    // -----------------------------------------------------
    // TITLE
    // -----------------------------------------------------

    worksheet.mergeCells("A1:I1");

    const titleCell = worksheet.getCell("A1");

    titleCell.value = "DANH SÁCH ĐIỂM DANH";
    titleCell.font = {
      name: "Arial",
      size: 16,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    titleCell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF173B5E" },
    };

    worksheet.getRow(1).height = 32;

    // -----------------------------------------------------
    // INFORMATION
    // -----------------------------------------------------

    worksheet.mergeCells("A2:I2");

    worksheet.getCell("A2").value = `Ngày: ${date} | Loại: ${
      attendance_type === "mass" ? "Thánh lễ" : "Học Giáo lý"
    }`;

    worksheet.getCell("A2").font = {
      name: "Arial",
      size: 11,
      italic: true,
      color: { argb: "FF475569" },
    };

    worksheet.getCell("A2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getRow(2).height = 24;

    worksheet.mergeCells("A3:I3");

    worksheet.getCell("A3").value = `Tổng số: ${rows.length} học sinh`;

    worksheet.getCell("A3").font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: "FF173B5E" },
    };

    worksheet.getCell("A3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getRow(3).height = 22;

    // Dòng trống
    worksheet.getRow(4).height = 8;

    // -----------------------------------------------------
    // TABLE HEADER
    // -----------------------------------------------------

    const headerRow = worksheet.getRow(5);

    headerRow.values = [
      "STT",
      "Mã học sinh",
      "Họ và tên",
      "Lớp",
      "Ngày điểm danh",
      "Loại điểm danh",
      "Trạng thái",
      "Giờ điểm danh",
      "Ghi chú",
    ];

    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.font = {
        name: "Arial",
        size: 10,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9A441" },
      };

      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    // -----------------------------------------------------
    // DATA
    // -----------------------------------------------------

    const statusLabels = {
      present: "Có mặt",
      absent: "Vắng",
      late: "Đi muộn",
      excused: "Có phép",
    };

    rows.forEach((item, index) => {
      const row = worksheet.addRow([
        index + 1,
        item.student_code || "",
        item.full_name || "",
        item.class_name || "",
        item.attendance_date ? String(item.attendance_date).slice(0, 10) : "",
        item.attendance_type === "mass" ? "Thánh lễ" : "Học Giáo lý",
        statusLabels[item.status] || item.status || "",
        item.check_in_time || "",
        item.note || "",
      ]);

      row.height = 24;

      row.eachCell((cell) => {
        cell.font = {
          name: "Arial",
          size: 10,
          color: { argb: "FF334155" },
        };

        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };

        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });

      row.getCell(1).alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      row.getCell(5).alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      row.getCell(7).alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      row.getCell(8).alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      const statusCell = row.getCell(7);

      const statusColors = {
        present: "FFE8F5E9",
        absent: "FFFFEBEE",
        late: "FFFFF3E0",
        excused: "FFE3F2FD",
      };

      if (statusColors[item.status]) {
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: statusColors[item.status] },
        };
      }
    });

    // -----------------------------------------------------
    // PRINT SETTINGS
    // -----------------------------------------------------

    worksheet.autoFilter = {
      from: "A5",
      to: "I5",
    };

    worksheet.pageSetup = {
      paperSize: worksheet.PAPER_A4,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };

    // -----------------------------------------------------
    // RESPONSE
    // -----------------------------------------------------

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `diem-danh-${attendance_type}-${date}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    res.setHeader("Content-Length", buffer.length);

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error("[exportAttendanceExcel] ERROR:", error);

    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      success: false,
      message: "Không thể xuất Excel điểm danh",
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
  scanQRCode,
  finishAttendance,
  exportAttendanceExcel,
};

// ============================================================
// FAITHEDU - ASSISTANT TOOLS
// PHASE 5.1 → 5.7
//
// NGUYÊN TẮC:
// - READ ONLY
// - CHỈ SELECT
// - KHÔNG INSERT
// - KHÔNG UPDATE
// - KHÔNG DELETE
// - LUÔN SCOPE THEO church_id
// - KHÔNG TRUST church_id TỪ FRONTEND
// - TEACHER FAIL-CLOSED
// ============================================================

const db = require("../../config/db");

// ============================================================
// CONSTANTS
// ============================================================

const CHURCH_WIDE_ROLES = ["admin_catechist", "catechist"];

const MAX_STUDENTS = 100;
const MAX_CLASSES = 100;
const MAX_ATTENDANCE_ROWS = 200;
const MAX_HISTORY_ROWS = 200;
const MAX_RANKING_ROWS = 100;
const MAX_ANOMALY_ROWS = 100;

const TEACHER_REQUIRES_ASSIGNMENT_CHECK = true;

const ATTENDANCE_TYPES = {
  CATECHISM: "catechism",
  MASS: "mass",
};

const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"];

// ============================================================
// ERROR
// ============================================================

function createAssistantError(message, code = "ASSISTANT_ERROR", status = 400) {
  const error = new Error(message);

  error.code = code;
  error.status = status;

  return error;
}

// ============================================================
// NORMALIZE
// ============================================================

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ============================================================
// USER / CHURCH
// ============================================================

function requireChurch(user) {
  const churchId = Number(user?.church_id || user?.parish_id);

  if (!Number.isInteger(churchId) || churchId <= 0) {
    throw createAssistantError(
      "Không xác định được giáo xứ của tài khoản.",
      "ASSISTANT_CHURCH_REQUIRED",
      403,
    );
  }

  return churchId;
}

function requireReadPermission(user) {
  const role = String(user?.role || "").trim();

  const allowedRoles = [
    "admin",
    "admin_catechist",
    "catechist",
    "teacher",
    "parent",
  ];

  if (!allowedRoles.includes(role)) {
    throw createAssistantError(
      "Tài khoản không có quyền sử dụng trợ lý.",
      "ASSISTANT_PERMISSION_DENIED",
      403,
    );
  }

  return true;
}

// ============================================================
// TEACHER ACCESS
//
// QUAN TRỌNG:
// Không tự đoán bảng assignment.
// Nếu chưa có helper/schema chính xác thì FAIL-CLOSED.
// ============================================================

async function assertTeacherClassAccess({ user, churchId, classId }) {
  const role = String(user?.role || "");

  if (role !== "teacher") {
    return true;
  }

  if (!TEACHER_REQUIRES_ASSIGNMENT_CHECK) {
    return true;
  }

  // ----------------------------------------------------------
  // Không tự đoán assignment schema.
  // ----------------------------------------------------------

  throw createAssistantError(
    "Trợ lý chưa thể xác minh phạm vi lớp được phân công cho giáo lý viên.",
    "ASSISTANT_TEACHER_ASSIGNMENT_UNAVAILABLE",
    403,
  );
}

// ============================================================
// INTEGER
// ============================================================

function toPositiveInt(value, fieldName = "ID") {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw createAssistantError(
      `${fieldName} không hợp lệ.`,
      "ASSISTANT_INVALID_ID",
      400,
    );
  }

  return number;
}

// ============================================================
// LIMIT
// ============================================================

function safeLimit(value, fallback, max) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }

  return Math.min(number, max);
}

// ============================================================
// ATTENDANCE TYPE
// ============================================================

function normalizeAttendanceType(type) {
  const value = String(type || "")
    .trim()
    .toLowerCase();

  if (value === ATTENDANCE_TYPES.MASS) {
    return ATTENDANCE_TYPES.MASS;
  }

  return ATTENDANCE_TYPES.CATECHISM;
}

function attendanceTypeLabel(type) {
  return normalizeAttendanceType(type) === ATTENDANCE_TYPES.MASS
    ? "Thánh lễ"
    : "Học giáo lý";
}

// ============================================================
// DATE
// ============================================================

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10))
  );
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeDateInput(value, fieldName = "Ngày") {
  if (!value) {
    throw createAssistantError(
      `${fieldName} không được để trống.`,
      "ASSISTANT_DATE_REQUIRED",
      400,
    );
  }

  const date = String(value).trim();

  if (!isValidDateString(date)) {
    throw createAssistantError(
      `${fieldName} không hợp lệ.`,
      "ASSISTANT_INVALID_DATE",
      400,
    );
  }

  return date;
}

// ============================================================
// RANGE
// ============================================================

function normalizeDateRange(startDate, endDate) {
  const start = normalizeDateInput(startDate, "Ngày bắt đầu");
  const end = normalizeDateInput(endDate, "Ngày kết thúc");

  if (start > end) {
    throw createAssistantError(
      "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      "ASSISTANT_INVALID_DATE_RANGE",
      400,
    );
  }

  return {
    startDate: start,
    endDate: end,
  };
}

// ============================================================
// CLASS OWNERSHIP
// ============================================================

async function assertClassBelongsToChurch(dbConnection, churchId, classId) {
  const [rows] = await dbConnection.query(
    `
      SELECT
        c.id,
        c.name,
        c.code,
        c.church_id
      FROM classes c
      WHERE c.id = ?
        AND c.church_id = ?
      LIMIT 1
    `,
    [classId, churchId],
  );

  if (!rows.length) {
    throw createAssistantError(
      "Không tìm thấy lớp trong giáo xứ.",
      "ASSISTANT_CLASS_NOT_FOUND",
      404,
    );
  }

  return rows[0];
}

// ============================================================
// SEARCH STUDENTS
// ============================================================

async function searchStudents({
  user,
  keyword = "",
  classId = null,
  limit = 20,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeLimitValue = safeLimit(limit, 20, MAX_STUDENTS);

  const connection = db;

  const params = [churchId];

  let where = `
    WHERE s.church_id = ?
  `;

  const normalizedKeyword = String(keyword || "").trim();

  if (normalizedKeyword) {
    const like = `%${normalizedKeyword}%`;

    where += `
      AND (
        s.name LIKE ?
        OR s.code LIKE ?
        OR s.phone LIKE ?
        OR s.email LIKE ?
        OR s.father_name LIKE ?
        OR s.mother_name LIKE ?
        OR s.father_phone LIKE ?
        OR s.mother_phone LIKE ?
      )
    `;

    params.push(like, like, like, like, like, like, like, like);
  }

  if (classId) {
    const safeClassId = toPositiveInt(classId, "Class ID");

    await assertClassBelongsToChurch(connection, churchId, safeClassId);

    where += `
      AND EXISTS (
        SELECT 1
        FROM class_students cs_filter
        INNER JOIN classes c_filter
          ON c_filter.id = cs_filter.class_id
         AND c_filter.church_id = ?
        WHERE cs_filter.student_id = s.id
          AND cs_filter.class_id = ?
      )
    `;

    params.push(churchId, safeClassId);
  }

  const [rows] = await connection.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,
        s.phone,
        s.email,
        s.father_name,
        s.mother_name,
        s.father_phone,
        s.mother_phone,
        s.gender,
        s.date_of_birth,
        s.status,

        (
          SELECT GROUP_CONCAT(
            DISTINCT c.name
            ORDER BY c.name
            SEPARATOR ', '
          )
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
           AND c.church_id = ?
          WHERE cs.student_id = s.id
        ) AS class_names,

        (
          SELECT GROUP_CONCAT(
            DISTINCT c.id
            ORDER BY c.id
            SEPARATOR ','
          )
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
           AND c.church_id = ?
          WHERE cs.student_id = s.id
        ) AS class_ids

      FROM students s

      ${where}

      ORDER BY s.name ASC, s.id ASC

      LIMIT ${safeLimitValue}
    `,
    [churchId, churchId, ...params],
  );

  return rows;
}

// ============================================================
// STUDENT DETAIL
// ============================================================

async function getStudentDetail({ user, studentId = null, keyword = "" }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  let student;

  if (studentId) {
    const safeStudentId = toPositiveInt(studentId, "Student ID");

    const [rows] = await db.query(
      `
        SELECT
          s.id,
          s.name,
          s.code,
          s.phone,
          s.email,
          s.father_name,
          s.mother_name,
          s.father_phone,
          s.mother_phone,
          s.gender,
          s.date_of_birth,
          s.status,
          s.church_id
        FROM students s
        WHERE s.id = ?
          AND s.church_id = ?
        LIMIT 1
      `,
      [safeStudentId, churchId],
    );

    student = rows[0] || null;
  } else {
    const students = await searchStudents({
      user,
      keyword,
      limit: 10,
    });

    if (!students.length) {
      return null;
    }

    if (students.length > 1) {
      return {
        multiple: true,
        students,
      };
    }

    student = students[0];
  }

  if (!student) {
    return null;
  }

  const [classes] = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.code
      FROM class_students cs
      INNER JOIN classes c
        ON c.id = cs.class_id
       AND c.church_id = ?
      WHERE cs.student_id = ?
      ORDER BY c.name ASC
    `,
    [churchId, student.id],
  );

  // ----------------------------------------------------------
  // Teacher: kiểm tra toàn bộ class của học sinh.
  // Fail closed nếu không có assignment resolver.
  // ----------------------------------------------------------

  if (String(user?.role) === "teacher") {
    for (const classItem of classes) {
      await assertTeacherClassAccess({
        user,
        churchId,
        classId: classItem.id,
      });
    }
  }

  return {
    ...student,
    classes,
  };
}

// ============================================================
// SEARCH CLASSES
// ============================================================

async function searchClasses({ user, keyword = "", limit = 20 }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeLimitValue = safeLimit(limit, 20, MAX_CLASSES);

  const params = [churchId];

  let where = `
    WHERE c.church_id = ?
  `;

  const normalizedKeyword = String(keyword || "").trim();

  if (normalizedKeyword) {
    const like = `%${normalizedKeyword}%`;

    where += `
      AND (
        c.name LIKE ?
        OR c.code LIKE ?
      )
    `;

    params.push(like, like);
  }

  const [rows] = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.code,
        c.church_id,

        (
          SELECT COUNT(*)
          FROM class_students cs
          INNER JOIN students s
            ON s.id = cs.student_id
           AND s.church_id = c.church_id
          WHERE cs.class_id = c.id
        ) AS student_count

      FROM classes c

      ${where}

      ORDER BY c.name ASC, c.id ASC

      LIMIT ${safeLimitValue}
    `,
    params,
  );

  // ----------------------------------------------------------
  // Teacher fail-closed
  // ----------------------------------------------------------

  if (String(user?.role) === "teacher") {
    const accessible = [];

    for (const item of rows) {
      try {
        await assertTeacherClassAccess({
          user,
          churchId,
          classId: item.id,
        });

        accessible.push(item);
      } catch (error) {
        if (error.code === "ASSISTANT_TEACHER_ASSIGNMENT_UNAVAILABLE") {
          throw error;
        }

        // Không expose lớp ngoài quyền.
      }
    }

    return accessible;
  }

  return rows;
}

// ============================================================
// CLASS DETAIL
// ============================================================

async function getClassDetail({ user, classId }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeClassId = toPositiveInt(classId, "Class ID");

  const classInfo = await assertClassBelongsToChurch(db, churchId, safeClassId);

  await assertTeacherClassAccess({
    user,
    churchId,
    classId: safeClassId,
  });

  const [students] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,
        s.gender,
        s.date_of_birth,
        s.status
      FROM class_students cs
      INNER JOIN students s
        ON s.id = cs.student_id
       AND s.church_id = ?
      WHERE cs.class_id = ?
      ORDER BY s.name ASC, s.id ASC
    `,
    [churchId, safeClassId],
  );

  return {
    ...classInfo,
    student_count: students.length,
    students,
  };
}

// ============================================================
// ATTENDANCE STATISTICS
// ============================================================

function buildAttendanceStatistics(rows, rosterTotal = null) {
  const statistics = {
    total: 0,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    not_attended: 0,
    attendance_rate: 0,
  };

  if (Array.isArray(rows)) {
    for (const row of rows) {
      const status = String(row.status || row.status || "").toLowerCase();

      statistics.total += 1;

      if (status === "present") {
        statistics.present += 1;
      } else if (status === "late") {
        statistics.late += 1;
      } else if (status === "absent") {
        statistics.absent += 1;
      } else if (status === "excused") {
        statistics.excused += 1;
      } else {
        statistics.not_attended += 1;
      }
    }
  }

  if (Number.isInteger(rosterTotal) && rosterTotal >= 0) {
    statistics.total = rosterTotal;

    const attended =
      statistics.present +
      statistics.late +
      statistics.absent +
      statistics.excused;

    statistics.not_attended = Math.max(0, rosterTotal - attended);
  }

  const denominator =
    statistics.present +
    statistics.late +
    statistics.absent +
    statistics.excused +
    statistics.not_attended;

  if (denominator > 0) {
    statistics.attendance_rate = Number(
      (((statistics.present + statistics.late) / denominator) * 100).toFixed(2),
    );
  }

  return statistics;
}

// ============================================================
// CATECHISM ATTENDANCE SUMMARY
// ============================================================

async function getCatechismAttendanceSummary({ user, classId, date }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeClassId = toPositiveInt(classId, "Class ID");

  const safeDate = normalizeDateInput(date);

  const classInfo = await assertClassBelongsToChurch(db, churchId, safeClassId);

  await assertTeacherClassAccess({
    user,
    churchId,
    classId: safeClassId,
  });

  const [rows] = await db.query(
    `
      SELECT
        s.id AS student_id,
        s.name,
        s.code,

        a.id AS attendance_id,
        a.status,
        a.check_in_time,
        a.attendance_date,
        a.class_id,
        a.attendance_type

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id
       AND s.church_id = ?

      LEFT JOIN attendances a
        ON a.student_id = s.id
       AND a.church_id = ?
       AND a.class_id = ?
       AND a.attendance_date = ?
       AND a.attendance_type = 'catechism'

      WHERE cs.class_id = ?

      ORDER BY s.name ASC, s.id ASC

      LIMIT ${MAX_ATTENDANCE_ROWS}
    `,
    [churchId, churchId, safeClassId, safeDate, safeClassId],
  );

  const statistics = buildAttendanceStatistics(
    rows.map((row) => ({
      status: row.status || "not_attended",
    })),
    rows.length,
  );

  return {
    date: safeDate,
    attendance_type: "catechism",
    attendance_type_label: "Học giáo lý",
    class: classInfo,
    statistics,
    data: rows,
  };
}

// ============================================================
// MASS ATTENDANCE SUMMARY
// ============================================================

async function getMassAttendanceSummary({ user, date }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeDate = normalizeDateInput(date);

  const [rows] = await db.query(
    `
      SELECT
        s.id AS student_id,
        s.name,
        s.code,

        a.id AS attendance_id,
        a.status,
        a.check_in_time,
        a.attendance_date,
        a.class_id,
        a.attendance_type

      FROM students s

      LEFT JOIN attendances a
        ON a.student_id = s.id
       AND a.church_id = ?
       AND a.attendance_date = ?
       AND a.attendance_type = 'mass'

      WHERE s.church_id = ?

      ORDER BY s.name ASC, s.id ASC

      LIMIT ${MAX_ATTENDANCE_ROWS}
    `,
    [churchId, safeDate, churchId],
  );

  const statistics = buildAttendanceStatistics(
    rows.map((row) => ({
      status: row.status || "not_attended",
    })),
    rows.length,
  );

  return {
    date: safeDate,
    attendance_type: "mass",
    attendance_type_label: "Thánh lễ",
    class: null,
    statistics,
    data: rows,
  };
}

// ============================================================
// GENERIC ATTENDANCE SUMMARY
// ============================================================

async function getAttendanceSummary({
  user,
  classId = null,
  date,
  attendanceType = "catechism",
}) {
  const type = normalizeAttendanceType(attendanceType);

  if (type === ATTENDANCE_TYPES.MASS) {
    return getMassAttendanceSummary({
      user,
      date,
    });
  }

  if (!classId) {
    throw createAssistantError(
      "Điểm danh học giáo lý cần có lớp.",
      "ASSISTANT_CLASS_REQUIRED",
      400,
    );
  }

  return getCatechismAttendanceSummary({
    user,
    classId,
    date,
  });
}

// ============================================================
// ATTENDANCE STUDENTS
// ============================================================

async function getAttendanceStudents({
  user,
  classId = null,
  date,
  attendanceType = "catechism",
  status = "all",
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  const safeDate = normalizeDateInput(date);

  const safeStatus =
    status === "not_attended"
      ? "not_attended"
      : ATTENDANCE_STATUSES.includes(status)
        ? status
        : "all";

  let rows;

  if (type === ATTENDANCE_TYPES.CATECHISM) {
    if (!classId) {
      throw createAssistantError(
        "Điểm danh học giáo lý cần có lớp.",
        "ASSISTANT_CLASS_REQUIRED",
        400,
      );
    }

    const safeClassId = toPositiveInt(classId, "Class ID");

    await assertClassBelongsToChurch(db, churchId, safeClassId);

    await assertTeacherClassAccess({
      user,
      churchId,
      classId: safeClassId,
    });

    let statusCondition = "";
    const params = [churchId, safeClassId, churchId, safeDate];

    if (safeStatus === "not_attended") {
      statusCondition = `
        AND a.id IS NULL
      `;
    } else if (safeStatus !== "all") {
      statusCondition = `
        AND a.status = ?
      `;

      params.push(safeStatus);
    }

    const [result] = await db.query(
      `
        SELECT
          s.id,
          s.name,
          s.code,
          a.id AS attendance_id,
          a.status,
          a.check_in_time,
          a.attendance_date
        FROM class_students cs
        INNER JOIN students s
          ON s.id = cs.student_id
         AND s.church_id = ?
        LEFT JOIN attendances a
          ON a.student_id = s.id
         AND a.church_id = ?
         AND a.class_id = ?
         AND a.attendance_date = ?
         AND a.attendance_type = 'catechism'
        WHERE cs.class_id = ?
        ${statusCondition}
        ORDER BY s.name ASC, s.id ASC
        LIMIT ${MAX_ATTENDANCE_ROWS}
      `,
      [
        churchId,
        churchId,
        safeClassId,
        safeDate,
        safeClassId,
        ...(safeStatus !== "not_attended" && safeStatus !== "all"
          ? [safeStatus]
          : []),
      ],
    );

    rows = result;
  } else {
    const params = [churchId, safeDate, churchId];

    let condition = "";

    if (safeStatus === "not_attended") {
      condition = `
        AND a.id IS NULL
      `;
    } else if (safeStatus !== "all") {
      condition = `
        AND a.status = ?
      `;

      params.push(safeStatus);
    }

    const [result] = await db.query(
      `
        SELECT
          s.id,
          s.name,
          s.code,
          a.id AS attendance_id,
          a.status,
          a.check_in_time,
          a.attendance_date
        FROM students s
        LEFT JOIN attendances a
          ON a.student_id = s.id
         AND a.church_id = ?
         AND a.attendance_date = ?
         AND a.attendance_type = 'mass'
        WHERE s.church_id = ?
        ${condition}
        ORDER BY s.name ASC, s.id ASC
        LIMIT ${MAX_ATTENDANCE_ROWS}
      `,
      params,
    );

    rows = result;
  }

  return {
    date: safeDate,
    attendance_type: type,
    attendance_type_label: attendanceTypeLabel(type),
    status: safeStatus,
    total: rows.length,
    data: rows,
  };
}

// ============================================================
// STUDENT ATTENDANCE HISTORY
// ============================================================

async function getStudentAttendanceHistory({
  user,
  studentId = null,
  keyword = "",
  startDate,
  endDate,
  attendanceType = "catechism",
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  const range = normalizeDateRange(startDate, endDate);

  let student;

  if (studentId) {
    const safeStudentId = toPositiveInt(studentId, "Student ID");

    const [studentRows] = await db.query(
      `
        SELECT
          s.id,
          s.name,
          s.code
        FROM students s
        WHERE s.id = ?
          AND s.church_id = ?
        LIMIT 1
      `,
      [safeStudentId, churchId],
    );

    student = studentRows[0] || null;
  } else {
    const students = await searchStudents({
      user,
      keyword,
      limit: 10,
    });

    if (!students.length) {
      return null;
    }

    if (students.length > 1) {
      return {
        multiple: true,
        students,
      };
    }

    student = students[0];
  }

  if (!student) {
    return null;
  }

  let rows;

  if (type === ATTENDANCE_TYPES.CATECHISM) {
    const [result] = await db.query(
      `
        SELECT
          a.id,
          a.attendance_date,
          a.status,
          a.check_in_time,
          a.class_id,
          c.name AS class_name,
          a.attendance_type
        FROM attendances a
        LEFT JOIN classes c
          ON c.id = a.class_id
         AND c.church_id = ?
        WHERE a.church_id = ?
          AND a.student_id = ?
          AND a.attendance_type = 'catechism'
          AND a.attendance_date BETWEEN ? AND ?
        ORDER BY a.attendance_date DESC, a.id DESC
        LIMIT ${MAX_HISTORY_ROWS}
      `,
      [churchId, churchId, student.id, range.startDate, range.endDate],
    );

    rows = result;
  } else {
    const [result] = await db.query(
      `
        SELECT
          a.id,
          a.attendance_date,
          a.status,
          a.check_in_time,
          a.class_id,
          c.name AS class_name,
          a.attendance_type
        FROM attendances a
        LEFT JOIN classes c
          ON c.id = a.class_id
         AND c.church_id = ?
        WHERE a.church_id = ?
          AND a.student_id = ?
          AND a.attendance_type = 'mass'
          AND a.attendance_date BETWEEN ? AND ?
        ORDER BY a.attendance_date DESC, a.id DESC
        LIMIT ${MAX_HISTORY_ROWS}
      `,
      [churchId, churchId, student.id, range.startDate, range.endDate],
    );

    rows = result;
  }

  const statistics = {
    total_records: rows.length,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    attendance_rate: 0,
  };

  for (const row of rows) {
    const status = String(row.status || "").toLowerCase();

    if (status === "present") {
      statistics.present += 1;
    } else if (status === "late") {
      statistics.late += 1;
    } else if (status === "absent") {
      statistics.absent += 1;
    } else if (status === "excused") {
      statistics.excused += 1;
    }
  }

  if (statistics.total_records > 0) {
    statistics.attendance_rate = Number(
      (
        ((statistics.present + statistics.late) / statistics.total_records) *
        100
      ).toFixed(2),
    );
  }

  return {
    student,
    start_date: range.startDate,
    end_date: range.endDate,
    attendance_type: type,
    attendance_type_label: attendanceTypeLabel(type),
    statistics,
    data: rows,
  };
}

// ============================================================
// STUDENT ATTENDANCE RANKING
//
// Mặc định xếp theo số vắng giảm dần.
// ============================================================

async function getStudentAttendanceRanking({
  user,
  startDate,
  endDate,
  attendanceType = "catechism",
  classId = null,
  limit = 20,
  minRecords = 1,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  const range = normalizeDateRange(startDate, endDate);

  const safeLimitValue = safeLimit(limit, 20, MAX_RANKING_ROWS);

  const safeMinRecords =
    Number.isInteger(Number(minRecords)) && Number(minRecords) >= 1
      ? Number(minRecords)
      : 1;

  let classCondition = "";
  const params = [churchId, type, range.startDate, range.endDate, churchId];

  if (classId) {
    const safeClassId = toPositiveInt(classId, "Class ID");

    await assertClassBelongsToChurch(db, churchId, safeClassId);

    await assertTeacherClassAccess({
      user,
      churchId,
      classId: safeClassId,
    });

    classCondition = `
      AND a.class_id = ?
    `;

    params.push(safeClassId);
  }

  params.push(safeMinRecords);

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,

        COUNT(a.id) AS total_records,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused,

        ROUND(
          (
            (
              SUM(
                CASE
                  WHEN a.status IN ('present', 'late')
                  THEN 1 ELSE 0
                END
              )
              / NULLIF(COUNT(a.id), 0)
            ) * 100
          ),
          2
        ) AS attendance_rate

      FROM students s

      INNER JOIN attendances a
        ON a.student_id = s.id
       AND a.church_id = ?
       AND a.attendance_type = ?
       AND a.attendance_date BETWEEN ? AND ?
       ${classCondition}

      WHERE s.church_id = ?

      GROUP BY
        s.id,
        s.name,
        s.code

      HAVING COUNT(a.id) >= ?

      ORDER BY
        absent DESC,
        late DESC,
        attendance_rate ASC,
        s.name ASC

      LIMIT ${safeLimitValue}
    `,
    params,
  );

  return rows;
}

// ============================================================
// CLASS ATTENDANCE RANKING
//
// Chỉ hỗ trợ catechism.
// Mass không gắn lớp.
// ============================================================

async function getClassAttendanceRanking({
  user,
  startDate,
  endDate,
  attendanceType = "catechism",
  limit = 50,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  if (type === ATTENDANCE_TYPES.MASS) {
    throw createAssistantError(
      "Không thể xếp hạng chuyên cần theo lớp đối với Thánh lễ vì điểm danh Thánh lễ không bắt buộc gắn lớp.",
      "ASSISTANT_MASS_CLASS_RANKING_UNSUPPORTED",
      400,
    );
  }

  const range = normalizeDateRange(startDate, endDate);

  const safeLimitValue = safeLimit(limit, 50, MAX_RANKING_ROWS);

  const [rows] = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.code,

        COUNT(a.id) AS total_records,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused,

        ROUND(
          (
            SUM(
              CASE
                WHEN a.status IN ('present', 'late')
                THEN 1 ELSE 0
              END
            )
            / NULLIF(COUNT(a.id), 0)
          ) * 100,
          2
        ) AS attendance_rate

      FROM classes c

      LEFT JOIN attendances a
        ON a.class_id = c.id
       AND a.church_id = ?
       AND a.attendance_type = 'catechism'
       AND a.attendance_date BETWEEN ? AND ?

      WHERE c.church_id = ?

      GROUP BY
        c.id,
        c.name,
        c.code

      ORDER BY
        attendance_rate DESC,
        absent ASC,
        c.name ASC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate, churchId],
  );

  // Teacher fail-closed.
  if (String(user?.role) === "teacher") {
    for (const row of rows) {
      await assertTeacherClassAccess({
        user,
        churchId,
        classId: row.id,
      });
    }
  }

  return rows;
}

// ============================================================
// COMPARE CLASSES
// ============================================================

async function compareClasses({
  user,
  classIds,
  startDate,
  endDate,
  attendanceType = "catechism",
}) {
  requireReadPermission(user);

  if (!Array.isArray(classIds) || classIds.length < 2) {
    throw createAssistantError(
      "Cần ít nhất 2 lớp để so sánh.",
      "ASSISTANT_COMPARE_CLASSES_REQUIRED",
      400,
    );
  }

  const uniqueIds = [
    ...new Set(
      classIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (uniqueIds.length < 2) {
    throw createAssistantError(
      "Không đủ lớp hợp lệ để so sánh.",
      "ASSISTANT_COMPARE_CLASSES_INVALID",
      400,
    );
  }

  const ranking = await getClassAttendanceRanking({
    user,
    startDate,
    endDate,
    attendanceType,
    limit: MAX_RANKING_ROWS,
  });

  const map = new Map(ranking.map((item) => [Number(item.id), item]));

  return uniqueIds.map((id) => map.get(id)).filter(Boolean);
}

// ============================================================
// PARISH STATISTICS
// ============================================================

async function getParishStatistics({
  user,
  startDate,
  endDate,
  attendanceType = "catechism",
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  const range = normalizeDateRange(startDate, endDate);

  const [studentRows] = await db.query(
    `
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN status = 'active'
            THEN 1 ELSE 0
          END
        ) AS active,

        SUM(
          CASE
            WHEN status <> 'active'
              OR status IS NULL
            THEN 0 ELSE 0
          END
        ) AS ignored

      FROM students

      WHERE church_id = ?
    `,
    [churchId],
  );

  const [unassignedRows] = await db.query(
    `
      SELECT COUNT(*) AS total
      FROM students s
      WHERE s.church_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
           AND c.church_id = s.church_id
          WHERE cs.student_id = s.id
        )
    `,
    [churchId],
  );

  const [classRows] = await db.query(
    `
      SELECT COUNT(*) AS total
      FROM classes
      WHERE church_id = ?
    `,
    [churchId],
  );

  const [attendanceRows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_records,

        COUNT(
          DISTINCT attendance_date
        ) AS attendance_days,

        SUM(
          CASE
            WHEN status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused

      FROM attendances

      WHERE church_id = ?
        AND attendance_type = ?
        AND attendance_date BETWEEN ? AND ?
    `,
    [churchId, type, range.startDate, range.endDate],
  );

  const attendance = attendanceRows[0] || {};

  const totalRecords = Number(attendance.total_records || 0);

  const present = Number(attendance.present || 0);

  const late = Number(attendance.late || 0);

  const attendanceRate =
    totalRecords > 0
      ? Number((((present + late) / totalRecords) * 100).toFixed(2))
      : 0;

  return {
    start_date: range.startDate,
    end_date: range.endDate,

    attendance_type: type,
    attendance_type_label: attendanceTypeLabel(type),

    students: {
      total: Number(studentRows[0]?.total || 0),
      active: Number(studentRows[0]?.active || 0),
      unassigned: Number(unassignedRows[0]?.total || 0),
    },

    classes: {
      total: Number(classRows[0]?.total || 0),
    },

    attendance: {
      total_records: totalRecords,
      attendance_days: Number(attendance.attendance_days || 0),
      present,
      late,
      absent: Number(attendance.absent || 0),
      excused: Number(attendance.excused || 0),
      attendance_rate: attendanceRate,
    },
  };
}

// ============================================================
// STUDENTS NEEDING ATTENTION
// ============================================================

async function getStudentsNeedingAttention({
  user,
  startDate,
  endDate,
  attendanceType = "catechism",
  threshold = 70,
  classId = null,
  limit = 30,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  const range = normalizeDateRange(startDate, endDate);

  const safeThreshold = Math.max(0, Math.min(100, Number(threshold) || 70));

  const safeLimitValue = safeLimit(limit, 30, MAX_RANKING_ROWS);

  let classCondition = "";
  const params = [churchId, type, range.startDate, range.endDate, churchId];

  if (classId) {
    const safeClassId = toPositiveInt(classId, "Class ID");

    await assertClassBelongsToChurch(db, churchId, safeClassId);

    await assertTeacherClassAccess({
      user,
      churchId,
      classId: safeClassId,
    });

    classCondition = `
      AND a.class_id = ?
    `;

    params.push(safeClassId);
  }

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,

        COUNT(a.id) AS total_records,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused,

        ROUND(
          (
            SUM(
              CASE
                WHEN a.status IN ('present', 'late')
                THEN 1 ELSE 0
              END
            )
            / NULLIF(COUNT(a.id), 0)
          ) * 100,
          2
        ) AS attendance_rate

      FROM students s

      INNER JOIN attendances a
        ON a.student_id = s.id
       AND a.church_id = ?
       AND a.attendance_type = ?
       AND a.attendance_date BETWEEN ? AND ?
       ${classCondition}

      WHERE s.church_id = ?

      GROUP BY
        s.id,
        s.name,
        s.code

      HAVING
        COUNT(a.id) > 0
        AND attendance_rate < ?

      ORDER BY
        attendance_rate ASC,
        absent DESC,
        late DESC,
        s.name ASC

      LIMIT ${safeLimitValue}
    `,
    [...params, safeThreshold],
  );

  return rows;
}

// ============================================================
// UNASSIGNED STUDENTS
// ============================================================

async function getUnassignedStudents({ user, limit = 50 }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeLimitValue = safeLimit(limit, 50, MAX_STUDENTS);

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,
        s.gender,
        s.date_of_birth,
        s.status

      FROM students s

      WHERE s.church_id = ?

        AND NOT EXISTS (
          SELECT 1
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
           AND c.church_id = s.church_id
          WHERE cs.student_id = s.id
        )

      ORDER BY
        s.name ASC,
        s.id ASC

      LIMIT ${safeLimitValue}
    `,
    [churchId],
  );

  return rows;
}

// ============================================================
// ATTENDANCE ANOMALIES
// ============================================================

async function getAttendanceAnomalies({
  user,
  startDate,
  endDate,
  limit = 50,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const range = normalizeDateRange(startDate, endDate);

  const safeLimitValue = safeLimit(limit, 50, MAX_ANOMALY_ROWS);

  const anomalies = [];

  // ==========================================================
  // 1. DUPLICATE ATTENDANCE
  // ==========================================================

  const [duplicateRows] = await db.query(
    `
      SELECT
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type,
        COUNT(*) AS duplicate_count,

        MAX(s.name) AS student_name,
        MAX(s.code) AS student_code

      FROM attendances a

      LEFT JOIN students s
        ON s.id = a.student_id
       AND s.church_id = a.church_id

      WHERE a.church_id = ?
        AND a.attendance_date BETWEEN ? AND ?

      GROUP BY
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type

      HAVING COUNT(*) > 1

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate],
  );

  for (const row of duplicateRows) {
    anomalies.push({
      type: "duplicate_attendance",
      severity: "high",
      message: `Có ${row.duplicate_count} bản ghi điểm danh trùng cho cùng học sinh/ngày/loại điểm danh.`,
      student_id: row.student_id,
      student_name: row.student_name,
      student_code: row.student_code,
      class_id: row.class_id,
      attendance_date: row.attendance_date,
      attendance_type: row.attendance_type,
    });
  }

  // ==========================================================
  // 2. STUDENT DOES NOT EXIST / WRONG CHURCH
  // ==========================================================

  const [invalidStudentRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type

      FROM attendances a

      LEFT JOIN students s
        ON s.id = a.student_id
       AND s.church_id = a.church_id

      WHERE a.church_id = ?
        AND a.attendance_date BETWEEN ? AND ?
        AND s.id IS NULL

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate],
  );

  for (const row of invalidStudentRows) {
    anomalies.push({
      type: "student_not_found",
      severity: "critical",
      message:
        "Bản ghi điểm danh tham chiếu tới học sinh không tồn tại trong giáo xứ.",
      attendance_id: row.id,
      student_id: row.student_id,
      class_id: row.class_id,
      attendance_date: row.attendance_date,
      attendance_type: row.attendance_type,
    });
  }

  // ==========================================================
  // 3. CLASS DOES NOT EXIST / WRONG CHURCH
  // ==========================================================

  const [invalidClassRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type,

        s.name AS student_name,
        s.code AS student_code

      FROM attendances a

      LEFT JOIN students s
        ON s.id = a.student_id
       AND s.church_id = a.church_id

      LEFT JOIN classes c
        ON c.id = a.class_id
       AND c.church_id = a.church_id

      WHERE a.church_id = ?
        AND a.attendance_date BETWEEN ? AND ?
        AND a.class_id IS NOT NULL
        AND c.id IS NULL

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate],
  );

  for (const row of invalidClassRows) {
    anomalies.push({
      type: "class_not_found",
      severity: "critical",
      message:
        "Bản ghi điểm danh tham chiếu tới lớp không tồn tại trong giáo xứ.",
      attendance_id: row.id,
      student_id: row.student_id,
      student_name: row.student_name,
      student_code: row.student_code,
      class_id: row.class_id,
      attendance_date: row.attendance_date,
      attendance_type: row.attendance_type,
    });
  }

  // ==========================================================
  // 4. CATECHISM WITHOUT CLASS
  // ==========================================================

  const [catechismNoClassRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.attendance_date,
        a.attendance_type,

        s.name AS student_name,
        s.code AS student_code

      FROM attendances a

      LEFT JOIN students s
        ON s.id = a.student_id
       AND s.church_id = a.church_id

      WHERE a.church_id = ?
        AND a.attendance_type = 'catechism'
        AND a.class_id IS NULL
        AND a.attendance_date BETWEEN ? AND ?

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate],
  );

  for (const row of catechismNoClassRows) {
    anomalies.push({
      type: "catechism_missing_class",
      severity: "high",
      message: "Điểm danh học giáo lý nhưng không có class_id.",
      attendance_id: row.id,
      student_id: row.student_id,
      student_name: row.student_name,
      student_code: row.student_code,
      attendance_date: row.attendance_date,
      attendance_type: row.attendance_type,
    });
  }

  // ==========================================================
  // 5. STUDENT NOT IN ATTENDANCE CLASS
  // ==========================================================

  const [studentClassMismatchRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type,

        s.name AS student_name,
        s.code AS student_code,

        c.name AS class_name

      FROM attendances a

      INNER JOIN students s
        ON s.id = a.student_id
       AND s.church_id = a.church_id

      INNER JOIN classes c
        ON c.id = a.class_id
       AND c.church_id = a.church_id

      LEFT JOIN class_students cs
        ON cs.student_id = a.student_id
       AND cs.class_id = a.class_id

      WHERE a.church_id = ?
        AND a.attendance_type = 'catechism'
        AND a.class_id IS NOT NULL
        AND a.attendance_date BETWEEN ? AND ?
        AND cs.student_id IS NULL

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate],
  );

  for (const row of studentClassMismatchRows) {
    anomalies.push({
      type: "student_class_mismatch",
      severity: "high",
      message:
        "Học sinh có bản ghi điểm danh lớp nhưng hiện không thuộc lớp đó.",
      attendance_id: row.id,
      student_id: row.student_id,
      student_name: row.student_name,
      student_code: row.student_code,
      class_id: row.class_id,
      class_name: row.class_name,
      attendance_date: row.attendance_date,
      attendance_type: row.attendance_type,
    });
  }

  // ==========================================================
  // 6. INVALID STATUS
  // ==========================================================

  const [invalidStatusRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type,
        a.status,

        s.name AS student_name,
        s.code AS student_code

      FROM attendances a

      LEFT JOIN students s
        ON s.id = a.student_id
       AND s.church_id = a.church_id

      WHERE a.church_id = ?
        AND a.attendance_date BETWEEN ? AND ?
        AND (
          a.status IS NULL
          OR a.status NOT IN (
            'present',
            'absent',
            'late',
            'excused'
          )
        )

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate],
  );

  for (const row of invalidStatusRows) {
    anomalies.push({
      type: "invalid_status",
      severity: "high",
      message: "Bản ghi điểm danh có trạng thái không hợp lệ.",
      attendance_id: row.id,
      student_id: row.student_id,
      student_name: row.student_name,
      student_code: row.student_code,
      class_id: row.class_id,
      attendance_date: row.attendance_date,
      attendance_type: row.attendance_type,
      status: row.status,
    });
  }

  // ==========================================================
  // 7. MASS WITH CLASS
  //
  // Theo business rule hiện tại:
  // mass không yêu cầu class_id.
  //
  // Chỉ báo warning nếu mass lại gắn lớp.
  // ==========================================================

  const [massClassRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,

        s.name AS student_name,
        s.code AS student_code,

        c.name AS class_name

      FROM attendances a

      LEFT JOIN students s
        ON s.id = a.student_id
       AND s.church_id = a.church_id

      LEFT JOIN classes c
        ON c.id = a.class_id
       AND c.church_id = a.church_id

      WHERE a.church_id = ?
        AND a.attendance_type = 'mass'
        AND a.class_id IS NOT NULL
        AND a.attendance_date BETWEEN ? AND ?

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimitValue}
    `,
    [churchId, range.startDate, range.endDate],
  );

  for (const row of massClassRows) {
    anomalies.push({
      type: "mass_has_class",
      severity: "medium",
      message:
        "Bản ghi điểm danh Thánh lễ đang có class_id mặc dù Thánh lễ không yêu cầu lớp.",
      attendance_id: row.id,
      student_id: row.student_id,
      student_name: row.student_name,
      student_code: row.student_code,
      class_id: row.class_id,
      class_name: row.class_name,
      attendance_date: row.attendance_date,
      attendance_type: "mass",
    });
  }

  // ==========================================================
  // LIMIT FINAL
  // ==========================================================

  const severityOrder = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  anomalies.sort((a, b) => {
    const severityDiff =
      (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);

    if (severityDiff !== 0) {
      return severityDiff;
    }

    return String(b.attendance_date || "").localeCompare(
      String(a.attendance_date || ""),
    );
  });

  return {
    start_date: range.startDate,
    end_date: range.endDate,
    total: anomalies.length,
    anomalies: anomalies.slice(0, safeLimitValue),
  };
}

// ============================================================
// MONTHLY / PERIOD STATISTICS
// ============================================================

async function getMonthlyAttendanceStatistics({
  user,
  classId = null,
  startDate,
  endDate,
  attendanceType = "catechism",
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  const range = normalizeDateRange(startDate, endDate);

  if (type === ATTENDANCE_TYPES.CATECHISM && !classId) {
    throw createAssistantError(
      "Thống kê học giáo lý cần có lớp.",
      "ASSISTANT_CLASS_REQUIRED",
      400,
    );
  }

  let classInfo = null;
  let classCondition = "";
  const params = [churchId, type, range.startDate, range.endDate];

  if (classId) {
    const safeClassId = toPositiveInt(classId, "Class ID");

    classInfo = await assertClassBelongsToChurch(db, churchId, safeClassId);

    await assertTeacherClassAccess({
      user,
      churchId,
      classId: safeClassId,
    });

    classCondition = `
      AND class_id = ?
    `;

    params.push(safeClassId);
  }

  const [rows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_records,

        COUNT(
          DISTINCT attendance_date
        ) AS attendance_days,

        SUM(
          CASE
            WHEN status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused

      FROM attendances

      WHERE church_id = ?
        AND attendance_type = ?
        AND attendance_date BETWEEN ? AND ?
        ${classCondition}
    `,
    params,
  );

  const row = rows[0] || {};

  const totalRecords = Number(row.total_records || 0);

  const present = Number(row.present || 0);

  const late = Number(row.late || 0);

  const attendanceRate =
    totalRecords > 0
      ? Number((((present + late) / totalRecords) * 100).toFixed(2))
      : 0;

  return {
    start_date: range.startDate,
    end_date: range.endDate,

    attendance_type: type,
    attendance_type_label: attendanceTypeLabel(type),

    class: classInfo,

    statistics: {
      total_records: totalRecords,
      attendance_days: Number(row.attendance_days || 0),
      present,
      late,
      absent: Number(row.absent || 0),
      excused: Number(row.excused || 0),
      attendance_rate: attendanceRate,
    },
  };
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  // Helpers
  createAssistantError,
  normalizeText,
  requireChurch,
  requireReadPermission,
  assertTeacherClassAccess,
  toPositiveInt,
  normalizeAttendanceType,
  attendanceTypeLabel,
  isValidDateString,
  formatDateISO,
  normalizeDateInput,
  normalizeDateRange,

  // Student
  searchStudents,
  getStudentDetail,

  // Class
  searchClasses,
  getClassDetail,

  // Attendance
  buildAttendanceStatistics,
  getCatechismAttendanceSummary,
  getMassAttendanceSummary,
  getAttendanceSummary,
  getAttendanceStudents,

  // Student attendance
  getStudentAttendanceHistory,
  getStudentAttendanceRanking,

  // Class attendance
  getClassAttendanceRanking,
  compareClasses,

  // Statistics
  getParishStatistics,
  getStudentsNeedingAttention,
  getUnassignedStudents,
  getMonthlyAttendanceStatistics,

  // Anomaly
  getAttendanceAnomalies,
};

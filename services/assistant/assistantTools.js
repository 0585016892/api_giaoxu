// ============================================================
// FAITHEDU - ASSISTANT TOOLS - PHASE 5
// ============================================================
//
// SMART PARISH ASSISTANT
//
// READ ONLY
// - Không INSERT
// - Không UPDATE
// - Không DELETE
//
// SECURITY
// - church_id luôn lấy từ JWT
// - Không tin church_id từ frontend
// - Tenant isolation
// - Teacher fail-closed nếu chưa có assignment helper
//
// FEATURES
// - Student search/detail
// - Student attendance history
// - Student attendance statistics
// - Class search/detail
// - Class attendance
// - Student attendance ranking
// - Class attendance ranking
// - Class comparison
// - Parish statistics
// - Students needing attention
// - Unassigned students
// - Attendance anomalies
// - Period statistics
//
// ============================================================

const db = require("../../config/db");

// ============================================================
// CONSTANTS
// ============================================================

const CHURCH_WIDE_ROLES = ["admin_catechist", "catechist"];

const MAX_STUDENTS = 100;
const MAX_CLASSES = 100;
const MAX_ATTENDANCE_ROWS = 200;
const MAX_HISTORY_ROWS = 100;

const TEACHER_REQUIRES_ASSIGNMENT_CHECK = true;

// ============================================================
// ERROR
// ============================================================

function createAssistantError(message, code, status = 400) {
  const error = new Error(message);

  error.code = code;
  error.status = status;

  return error;
}

// ============================================================
// NORMALIZE
// ============================================================

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ============================================================
// CHURCH
// ============================================================

function requireChurch(user) {
  const churchId = Number(user?.church_id);

  if (!Number.isInteger(churchId) || churchId <= 0) {
    throw createAssistantError(
      "Không xác định được giáo xứ.",
      "ASSISTANT_CHURCH_REQUIRED",
      403,
    );
  }

  return churchId;
}

// ============================================================
// PERMISSION
// ============================================================

function requireReadPermission(user) {
  const role = String(user?.role || "").trim();

  if (CHURCH_WIDE_ROLES.includes(role)) {
    return role;
  }

  if (role === "teacher") {
    return role;
  }

  throw createAssistantError(
    "Tài khoản của bạn không có quyền tra cứu dữ liệu giáo xứ.",
    "ASSISTANT_READ_FORBIDDEN",
    403,
  );
}

// ============================================================
// TEACHER SCOPE
// ============================================================
//
// KHÔNG đoán schema teacher assignment.
//
// Khi m gửi resolveCatechismClass() thực tế,
// thay implementation này bằng helper đó.
//
// ============================================================

async function assertTeacherClassAccess(user, classId, churchId) {
  const role = String(user?.role || "");

  if (role !== "teacher") {
    return true;
  }

  if (TEACHER_REQUIRES_ASSIGNMENT_CHECK) {
    throw createAssistantError(
      "Trợ lý chưa được cấp phạm vi lớp cho giáo lý viên này.",
      "ASSISTANT_TEACHER_CLASS_SCOPE_REQUIRED",
      403,
    );
  }

  return true;
}

// ============================================================
// INTEGER
// ============================================================

function toPositiveInt(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

// ============================================================
// ATTENDANCE TYPE
// ============================================================

function normalizeAttendanceType(value) {
  const normalized = normalizeText(value);

  if (
    normalized === "mass" ||
    normalized.includes("thanh le") ||
    normalized.includes("di le") ||
    normalized.includes("tham du le")
  ) {
    return "mass";
  }

  return "catechism";
}

function getAttendanceTypeLabel(type) {
  return type === "mass" ? "Thánh lễ" : "Học giáo lý";
}

// ============================================================
// DATE
// ============================================================

function isValidDateString(date) {
  if (typeof date !== "string") {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsed = new Date(year, month - 1, day);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function formatDateISO(date) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatDateISO(new Date());
}

function getDateRange(startDate, endDate) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return null;
  }

  if (startDate > endDate) {
    return {
      startDate: endDate,
      endDate: startDate,
    };
  }

  return {
    startDate,
    endDate,
  };
}

// ============================================================
// CLASS
// ============================================================

async function assertClassBelongsToChurch(classId, churchId, user) {
  const safeClassId = toPositiveInt(classId);

  if (!safeClassId) {
    throw createAssistantError("Mã lớp không hợp lệ.", "INVALID_CLASS_ID", 400);
  }

  const [rows] = await db.query(
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
    [safeClassId, churchId],
  );

  if (!rows.length) {
    throw createAssistantError(
      "Không tìm thấy lớp học trong giáo xứ.",
      "CLASS_NOT_FOUND",
      404,
    );
  }

  await assertTeacherClassAccess(user, safeClassId, churchId);

  return rows[0];
}

// ============================================================
// STUDENT SEARCH
// ============================================================

async function searchStudents({
  user,
  keyword,
  classId,
  limit = MAX_STUDENTS,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), MAX_STUDENTS);

  const search = String(keyword || "").trim();

  const where = ["s.church_id = ?"];

  const params = [churchId];

  if (search) {
    const like = `%${search}%`;

    where.push(`
      (
        s.name LIKE ?
        OR s.code LIKE ?
        OR s.phone LIKE ?
        OR s.email LIKE ?
        OR s.father_name LIKE ?
        OR s.mother_name LIKE ?
        OR s.father_phone LIKE ?
        OR s.mother_phone LIKE ?
      )
    `);

    params.push(like, like, like, like, like, like, like, like);
  }

  if (classId) {
    const safeClassId = toPositiveInt(classId);

    if (!safeClassId) {
      throw createAssistantError(
        "Mã lớp không hợp lệ.",
        "INVALID_CLASS_ID",
        400,
      );
    }

    await assertClassBelongsToChurch(safeClassId, churchId, user);

    where.push(`
      EXISTS (
        SELECT 1
        FROM class_students cs_filter

        INNER JOIN classes c_filter
          ON c_filter.id = cs_filter.class_id
          AND c_filter.church_id = ?

        WHERE cs_filter.student_id = s.id
          AND cs_filter.class_id = ?
      )
    `);

    params.push(churchId, safeClassId);
  }

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,
        s.phone,
        s.email,

        s.gender,
        s.date_of_birth,
        s.status,

        s.father_name,
        s.mother_name,
        s.father_phone,
        s.mother_phone,

        (
          SELECT GROUP_CONCAT(
            DISTINCT c.id
            ORDER BY c.id
            SEPARATOR ','
          )
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
          WHERE cs.student_id = s.id
            AND c.church_id = ?
        ) AS class_ids,

        (
          SELECT GROUP_CONCAT(
            DISTINCT c.name
            ORDER BY c.name
            SEPARATOR ', '
          )
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
          WHERE cs.student_id = s.id
            AND c.church_id = ?
        ) AS class_names

      FROM students s

      WHERE ${where.join(" AND ")}

      ORDER BY
        s.name ASC,
        s.id DESC

      LIMIT ${safeLimit}
    `,
    [churchId, churchId, ...params],
  );

  return rows;
}

// ============================================================
// STUDENT DETAIL
// ============================================================

async function getStudentDetail({ user, studentId, keyword }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  let targetStudentId = toPositiveInt(studentId);

  if (!targetStudentId && keyword) {
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

    targetStudentId = students[0].id;
  }

  if (!targetStudentId) {
    throw createAssistantError(
      "Không xác định được học sinh cần tra cứu.",
      "STUDENT_REQUIRED",
      400,
    );
  }

  const [studentRows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,
        s.phone,
        s.email,

        s.gender,
        s.date_of_birth,
        s.status,

        s.father_name,
        s.mother_name,
        s.father_phone,
        s.mother_phone

      FROM students s

      WHERE s.id = ?
        AND s.church_id = ?

      LIMIT 1
    `,
    [targetStudentId, churchId],
  );

  if (!studentRows.length) {
    return null;
  }

  const student = studentRows[0];

  const [classRows] = await db.query(
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
    [churchId, targetStudentId],
  );

  if (user?.role === "teacher") {
    const accessibleClasses = [];

    for (const classItem of classRows) {
      try {
        await assertTeacherClassAccess(user, classItem.id, churchId);

        accessibleClasses.push(classItem);
      } catch {
        // Không expose class ngoài scope.
      }
    }

    student.classes = accessibleClasses;
  } else {
    student.classes = classRows;
  }

  student.class_names = student.classes
    .map((item) => item.name)
    .filter(Boolean)
    .join(", ");

  student.class_ids = student.classes
    .map((item) => item.id)
    .filter(Boolean)
    .join(",");

  return student;
}

// ============================================================
// SEARCH CLASSES
// ============================================================

async function searchClasses({ user, keyword, limit = MAX_CLASSES }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), MAX_CLASSES);

  const params = [churchId, churchId];

  let sql = `
    SELECT
      c.id,
      c.name,
      c.code,

      (
        SELECT COUNT(*)
        FROM class_students cs
        INNER JOIN students s
          ON s.id = cs.student_id
          AND s.church_id = ?
        WHERE cs.class_id = c.id
      ) AS student_count

    FROM classes c

    WHERE c.church_id = ?
  `;

  if (keyword) {
    const like = `%${String(keyword).trim()}%`;

    sql += `
      AND (
        c.name LIKE ?
        OR c.code LIKE ?
      )
    `;

    params.push(like, like);
  }

  sql += `
    ORDER BY c.name ASC
    LIMIT ${safeLimit}
  `;

  const [rows] = await db.query(sql, params);

  if (user?.role !== "teacher") {
    return rows;
  }

  const accessible = [];

  for (const row of rows) {
    try {
      await assertTeacherClassAccess(user, row.id, churchId);

      accessible.push(row);
    } catch {
      // Ignore.
    }
  }

  return accessible;
}

// ============================================================
// CLASS DETAIL
// ============================================================

async function getClassDetail({ user, classId, keyword }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  let targetClassId = toPositiveInt(classId);

  if (!targetClassId && keyword) {
    const classes = await searchClasses({
      user,
      keyword,
      limit: 10,
    });

    if (!classes.length) {
      return null;
    }

    if (classes.length > 1) {
      return {
        multiple: true,
        classes,
      };
    }

    targetClassId = classes[0].id;
  }

  if (!targetClassId) {
    throw createAssistantError(
      "Không xác định được lớp cần tra cứu.",
      "CLASS_REQUIRED",
      400,
    );
  }

  const classInfo = await assertClassBelongsToChurch(
    targetClassId,
    churchId,
    user,
  );

  const [studentRows] = await db.query(
    `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.status

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id
        AND s.church_id = ?

      WHERE cs.class_id = ?

      ORDER BY s.name ASC
    `,
    [churchId, targetClassId],
  );

  return {
    ...classInfo,
    student_count: studentRows.length,
    students: studentRows,
  };
}

// ============================================================
// ATTENDANCE STATISTICS
// ============================================================

function buildAttendanceStatistics(rows = []) {
  const total = rows.length;

  let present = 0;
  let absent = 0;
  let late = 0;
  let excused = 0;
  let not_attended = 0;

  for (const row of rows) {
    const status = row.attendance_status;

    if (status === "present") {
      present++;
    } else if (status === "absent") {
      absent++;
    } else if (status === "late") {
      late++;
    } else if (status === "excused") {
      excused++;
    } else if (!row.attendance_id) {
      not_attended++;
    }
  }

  const attended = present + late;

  const attendanceRate =
    total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0;

  return {
    total,
    present,
    absent,
    late,
    excused,
    not_attended,
    attended,
    attendance_rate: attendanceRate,
  };
}

// ============================================================
// CATECHISM ATTENDANCE
// ============================================================

async function getCatechismAttendanceSummary({ user, classId, date }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  if (!isValidDateString(date)) {
    throw createAssistantError(
      "Ngày điểm danh không hợp lệ.",
      "INVALID_DATE",
      400,
    );
  }

  const safeClassId = toPositiveInt(classId);

  if (!safeClassId) {
    throw createAssistantError("Vui lòng xác định lớp.", "CLASS_REQUIRED", 400);
  }

  const classInfo = await assertClassBelongsToChurch(
    safeClassId,
    churchId,
    user,
  );

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.status AS student_status,

        a.id AS attendance_id,
        a.attendance_type,
        a.status AS attendance_status,
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
        AND a.attendance_type = 'catechism'

      WHERE cs.class_id = ?

      ORDER BY
        CASE
          WHEN a.status = 'absent' THEN 1
          WHEN a.status = 'late' THEN 2
          WHEN a.status = 'excused' THEN 3
          WHEN a.status = 'present' THEN 4
          ELSE 5
        END,
        s.name ASC
    `,
    [churchId, safeClassId, churchId, date, safeClassId],
  );

  return {
    success: true,

    class: {
      id: classInfo.id,
      name: classInfo.name,
      code: classInfo.code,
    },

    date,

    attendance_type: "catechism",

    attendance_type_label: "Học giáo lý",

    statistics: buildAttendanceStatistics(rows),

    data: rows,
  };
}

// ============================================================
// MASS ATTENDANCE
// ============================================================

async function getMassAttendanceSummary({ user, date }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  if (!isValidDateString(date)) {
    throw createAssistantError(
      "Ngày điểm danh không hợp lệ.",
      "INVALID_DATE",
      400,
    );
  }

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.status AS student_status,

        a.id AS attendance_id,
        a.attendance_type,
        a.status AS attendance_status,
        a.check_in_time,
        a.note,
        a.teacher_id,
        a.class_id,
        a.attendance_date,
        a.created_at,
        a.updated_at

      FROM students s

      LEFT JOIN attendances a
        ON a.student_id = s.id
        AND a.church_id = ?
        AND a.attendance_date = ?
        AND a.attendance_type = 'mass'

      WHERE s.church_id = ?

      ORDER BY
        CASE
          WHEN a.status = 'absent' THEN 1
          WHEN a.status = 'late' THEN 2
          WHEN a.status = 'excused' THEN 3
          WHEN a.status = 'present' THEN 4
          ELSE 5
        END,
        s.name ASC
    `,
    [churchId, date, churchId],
  );

  return {
    success: true,

    class: null,

    date,

    attendance_type: "mass",

    attendance_type_label: "Thánh lễ",

    statistics: buildAttendanceStatistics(rows),

    data: rows.slice(0, MAX_ATTENDANCE_ROWS),
  };
}

// ============================================================
// ATTENDANCE SUMMARY
// ============================================================

async function getAttendanceSummary({ user, classId, date, attendanceType }) {
  const type = normalizeAttendanceType(attendanceType);

  if (type === "mass") {
    return getMassAttendanceSummary({
      user,
      date,
    });
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
  classId,
  date,
  attendanceType,
  status = "all",
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  const normalizedStatus = normalizeText(status).replace(/\s+/g, "_");

  const allowedStatuses = [
    "all",
    "present",
    "absent",
    "late",
    "excused",
    "not_attended",
  ];

  const safeStatus = allowedStatuses.includes(normalizedStatus)
    ? normalizedStatus
    : "all";

  if (!isValidDateString(date)) {
    throw createAssistantError(
      "Ngày điểm danh không hợp lệ.",
      "INVALID_DATE",
      400,
    );
  }

  let rows;

  // ----------------------------------------------------------
  // MASS
  // ----------------------------------------------------------

  if (type === "mass") {
    let sql = `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,

        a.id AS attendance_id,
        a.status AS attendance_status,
        a.check_in_time,
        a.note,
        a.attendance_date

      FROM students s

      LEFT JOIN attendances a
        ON a.student_id = s.id
        AND a.church_id = ?
        AND a.attendance_date = ?
        AND a.attendance_type = 'mass'

      WHERE s.church_id = ?
    `;

    const params = [churchId, date, churchId];

    if (safeStatus === "not_attended") {
      sql += `
        AND a.id IS NULL
      `;
    } else if (safeStatus !== "all") {
      sql += `
        AND a.status = ?
      `;

      params.push(safeStatus);
    }

    sql += `
      ORDER BY s.name ASC
      LIMIT ${MAX_ATTENDANCE_ROWS}
    `;

    [rows] = await db.query(sql, params);
  }

  // ----------------------------------------------------------
  // CATECHISM
  // ----------------------------------------------------------
  else {
    const safeClassId = toPositiveInt(classId);

    if (!safeClassId) {
      throw createAssistantError(
        "Vui lòng xác định lớp.",
        "CLASS_REQUIRED",
        400,
      );
    }

    await assertClassBelongsToChurch(safeClassId, churchId, user);

    let sql = `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,

        a.id AS attendance_id,
        a.status AS attendance_status,
        a.check_in_time,
        a.note,
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
        AND a.attendance_type = 'catechism'

      WHERE cs.class_id = ?
    `;

    const params = [churchId, safeClassId, churchId, date, safeClassId];

    if (safeStatus === "not_attended") {
      sql += `
        AND a.id IS NULL
      `;
    } else if (safeStatus !== "all") {
      sql += `
        AND a.status = ?
      `;

      params.push(safeStatus);
    }

    sql += `
      ORDER BY s.name ASC
      LIMIT ${MAX_ATTENDANCE_ROWS}
    `;

    [rows] = await db.query(sql, params);
  }

  return {
    success: true,

    date,

    attendance_type: type,

    attendance_type_label: getAttendanceTypeLabel(type),

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
  studentId,
  keyword,
  startDate,
  endDate,
  attendanceType,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const range = getDateRange(startDate, endDate);

  if (!range) {
    throw createAssistantError(
      "Khoảng thời gian không hợp lệ.",
      "INVALID_DATE_RANGE",
      400,
    );
  }

  const student = await getStudentDetail({
    user,
    studentId,
    keyword,
  });

  if (!student) {
    return null;
  }

  if (student.multiple) {
    return student;
  }

  const type = normalizeAttendanceType(attendanceType);

  let rows;

  if (type === "mass") {
    [rows] = await db.query(
      `
        SELECT
          a.id,
          a.attendance_date,
          a.attendance_type,
          a.status AS attendance_status,
          a.check_in_time,
          a.note,
          a.class_id,
          NULL AS class_name

        FROM attendances a

        WHERE a.church_id = ?
          AND a.student_id = ?
          AND a.attendance_type = 'mass'
          AND a.attendance_date
            BETWEEN ? AND ?

        ORDER BY
          a.attendance_date DESC,
          a.id DESC

        LIMIT ${MAX_HISTORY_ROWS}
      `,
      [churchId, student.id, range.startDate, range.endDate],
    );
  } else {
    [rows] = await db.query(
      `
        SELECT
          a.id,
          a.attendance_date,
          a.attendance_type,
          a.status AS attendance_status,
          a.check_in_time,
          a.note,
          a.class_id,
          c.name AS class_name

        FROM attendances a

        LEFT JOIN classes c
          ON c.id = a.class_id
          AND c.church_id = ?

        WHERE a.church_id = ?
          AND a.student_id = ?
          AND a.attendance_type = 'catechism'
          AND a.attendance_date
            BETWEEN ? AND ?

        ORDER BY
          a.attendance_date DESC,
          a.id DESC

        LIMIT ${MAX_HISTORY_ROWS}
      `,
      [churchId, churchId, student.id, range.startDate, range.endDate],
    );
  }

  const stats = {
    total_records: rows.length,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  };

  for (const row of rows) {
    if (row.attendance_status === "present") {
      stats.present++;
    }

    if (row.attendance_status === "late") {
      stats.late++;
    }

    if (row.attendance_status === "absent") {
      stats.absent++;
    }

    if (row.attendance_status === "excused") {
      stats.excused++;
    }
  }

  const attended = stats.present + stats.late;

  stats.attended = attended;

  stats.attendance_rate =
    stats.total_records > 0
      ? Number(((attended / stats.total_records) * 100).toFixed(2))
      : 0;

  return {
    student,

    start_date: range.startDate,

    end_date: range.endDate,

    attendance_type: type,

    attendance_type_label: getAttendanceTypeLabel(type),

    statistics: stats,

    data: rows,
  };
}

// ============================================================
// STUDENT ATTENDANCE RANKING
// ============================================================

async function getStudentAttendanceRanking({
  user,
  startDate,
  endDate,
  attendanceType,
  classId,
  minRecords = 1,
  limit = 20,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const range = getDateRange(startDate, endDate);

  if (!range) {
    throw createAssistantError(
      "Khoảng thời gian không hợp lệ.",
      "INVALID_DATE_RANGE",
      400,
    );
  }

  const type = normalizeAttendanceType(attendanceType);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const safeMinRecords = Math.max(Number(minRecords) || 1, 1);

  let classCondition = "";
  const params = [churchId, range.startDate, range.endDate, type, churchId];

  if (classId) {
    const safeClassId = toPositiveInt(classId);

    if (!safeClassId) {
      throw createAssistantError(
        "Mã lớp không hợp lệ.",
        "INVALID_CLASS_ID",
        400,
      );
    }

    await assertClassBelongsToChurch(safeClassId, churchId, user);

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

        COUNT(a.id)
          AS total_records,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1
            ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1
            ELSE 0
          END
        ) AS excused,

        COUNT(
          DISTINCT a.attendance_date
        ) AS attendance_days

      FROM attendances a

      INNER JOIN students s
        ON s.id = a.student_id
        AND s.church_id = ?

      WHERE a.church_id = ?
        AND a.attendance_date
          BETWEEN ? AND ?
        AND a.attendance_type = ?

        ${classCondition}

      GROUP BY
        s.id,
        s.name,
        s.code

      HAVING COUNT(a.id) >= ?

      ORDER BY
        (
          (
            SUM(
              CASE
                WHEN a.status = 'present'
                  OR a.status = 'late'
                THEN 1
                ELSE 0
              END
            )
            /
            COUNT(a.id)
          ) * 100
        ) ASC,

        total_records DESC,

        s.name ASC

      LIMIT ${safeLimit}
    `,
    [
      churchId,
      churchId,
      range.startDate,
      range.endDate,
      type,
      ...(classCondition ? [params[5]] : []),
      safeMinRecords,
    ],
  );

  return rows.map((row) => {
    const total = Number(row.total_records || 0);

    const present = Number(row.present || 0);

    const late = Number(row.late || 0);

    return {
      ...row,

      total_records: total,
      present,
      late,

      absent: Number(row.absent || 0),

      excused: Number(row.excused || 0),

      attendance_days: Number(row.attendance_days || 0),

      attended: present + late,

      attendance_rate:
        total > 0 ? Number((((present + late) / total) * 100).toFixed(2)) : 0,
    };
  });
}

// ============================================================
// CLASS ATTENDANCE RANKING
// ============================================================

async function getClassAttendanceRanking({
  user,
  startDate,
  endDate,
  attendanceType,
  limit = 50,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const range = getDateRange(startDate, endDate);

  if (!range) {
    throw createAssistantError(
      "Khoảng thời gian không hợp lệ.",
      "INVALID_DATE_RANGE",
      400,
    );
  }

  const type = normalizeAttendanceType(attendanceType);

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const [rows] = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.code,

        COUNT(a.id)
          AS total_records,

        COUNT(
          DISTINCT a.attendance_date
        ) AS attendance_days,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1
            ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1
            ELSE 0
          END
        ) AS excused

      FROM classes c

      LEFT JOIN attendances a
        ON a.class_id = c.id
        AND a.church_id = ?
        AND a.attendance_type = ?
        AND a.attendance_date
          BETWEEN ? AND ?

      WHERE c.church_id = ?

      GROUP BY
        c.id,
        c.name,
        c.code

      ORDER BY
        CASE
          WHEN COUNT(a.id) = 0
          THEN 1
          ELSE 0
        END,

        (
          (
            SUM(
              CASE
                WHEN a.status = 'present'
                  OR a.status = 'late'
                THEN 1
                ELSE 0
              END
            )
            /
            NULLIF(COUNT(a.id), 0)
          ) * 100
        ) DESC,

        c.name ASC

      LIMIT ${safeLimit}
    `,
    [churchId, type, range.startDate, range.endDate, churchId],
  );

  return rows.map((row) => {
    const total = Number(row.total_records || 0);

    const present = Number(row.present || 0);

    const late = Number(row.late || 0);

    return {
      ...row,

      total_records: total,
      attendance_days: Number(row.attendance_days || 0),

      present,
      late,

      absent: Number(row.absent || 0),

      excused: Number(row.excused || 0),

      attended: present + late,

      attendance_rate:
        total > 0 ? Number((((present + late) / total) * 100).toFixed(2)) : 0,
    };
  });
}

// ============================================================
// CLASS COMPARISON
// ============================================================

async function compareClasses({
  user,
  classIds,
  startDate,
  endDate,
  attendanceType,
}) {
  requireReadPermission(user);

  if (!Array.isArray(classIds) || classIds.length < 2) {
    throw createAssistantError(
      "Cần ít nhất 2 lớp để so sánh.",
      "CLASS_COMPARISON_REQUIRED",
      400,
    );
  }

  const uniqueIds = [
    ...new Set(classIds.map(toPositiveInt).filter(Boolean)),
  ].slice(0, 10);

  const rows = await getClassAttendanceRanking({
    user,
    startDate,
    endDate,
    attendanceType,
    limit: 100,
  });

  return rows.filter((row) => uniqueIds.includes(Number(row.id)));
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

  const range = getDateRange(startDate, endDate);

  if (!range) {
    throw createAssistantError(
      "Khoảng thời gian không hợp lệ.",
      "INVALID_DATE_RANGE",
      400,
    );
  }

  const type = normalizeAttendanceType(attendanceType);

  const [studentRows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_students,

        SUM(
          CASE
            WHEN status = 'active'
            THEN 1
            ELSE 0
          END
        ) AS active_students

      FROM students

      WHERE church_id = ?
    `,
    [churchId],
  );

  const [classRows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_classes
      FROM classes
      WHERE church_id = ?
    `,
    [churchId],
  );

  const [unassignedRows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_unassigned

      FROM students s

      WHERE s.church_id = ?

        AND NOT EXISTS (
          SELECT 1
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
            AND c.church_id = ?
          WHERE cs.student_id = s.id
        )
    `,
    [churchId, churchId],
  );

  const [attendanceRows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_records,

        COUNT(
          DISTINCT a.attendance_date
        ) AS attendance_days,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1
            ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1
            ELSE 0
          END
        ) AS excused

      FROM attendances a

      WHERE a.church_id = ?
        AND a.attendance_type = ?
        AND a.attendance_date
          BETWEEN ? AND ?
    `,
    [churchId, type, range.startDate, range.endDate],
  );

  const students = studentRows[0] || {};

  const classes = classRows[0] || {};

  const unassigned = unassignedRows[0] || {};

  const attendance = attendanceRows[0] || {};

  const totalRecords = Number(attendance.total_records || 0);

  const present = Number(attendance.present || 0);

  const late = Number(attendance.late || 0);

  const absent = Number(attendance.absent || 0);

  const excused = Number(attendance.excused || 0);

  const attended = present + late;

  return {
    start_date: range.startDate,

    end_date: range.endDate,

    attendance_type: type,

    attendance_type_label: getAttendanceTypeLabel(type),

    students: {
      total: Number(students.total_students || 0),

      active: Number(students.active_students || 0),

      unassigned: Number(unassigned.total_unassigned || 0),
    },

    classes: {
      total: Number(classes.total_classes || 0),
    },

    attendance: {
      total_records: totalRecords,

      attendance_days: Number(attendance.attendance_days || 0),

      present,
      late,
      absent,
      excused,

      attended,

      attendance_rate:
        totalRecords > 0
          ? Number(((attended / totalRecords) * 100).toFixed(2))
          : 0,
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
  limit = 30,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const range = getDateRange(startDate, endDate);

  if (!range) {
    throw createAssistantError(
      "Khoảng thời gian không hợp lệ.",
      "INVALID_DATE_RANGE",
      400,
    );
  }

  const type = normalizeAttendanceType(attendanceType);

  const safeThreshold = Math.min(Math.max(Number(threshold) || 70, 0), 100);

  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,

        COUNT(a.id)
          AS total_records,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1
            ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1
            ELSE 0
          END
        ) AS excused,

        COUNT(
          DISTINCT a.attendance_date
        ) AS attendance_days

      FROM students s

      INNER JOIN attendances a
        ON a.student_id = s.id
        AND a.church_id = ?
        AND a.attendance_type = ?
        AND a.attendance_date
          BETWEEN ? AND ?

      WHERE s.church_id = ?

      GROUP BY
        s.id,
        s.name,
        s.code

      HAVING
        COUNT(a.id) > 0

      ORDER BY
        (
          (
            SUM(
              CASE
                WHEN a.status = 'present'
                  OR a.status = 'late'
                THEN 1
                ELSE 0
              END
            )
            /
            COUNT(a.id)
          ) * 100
        ) ASC,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1
            ELSE 0
          END
        ) DESC,

        s.name ASC

      LIMIT ${safeLimit}
    `,
    [churchId, type, range.startDate, range.endDate, churchId],
  );

  return rows
    .map((row) => {
      const total = Number(row.total_records || 0);

      const present = Number(row.present || 0);

      const late = Number(row.late || 0);

      const absent = Number(row.absent || 0);

      const excused = Number(row.excused || 0);

      const rate =
        total > 0 ? Number((((present + late) / total) * 100).toFixed(2)) : 0;

      return {
        id: row.id,
        name: row.name,
        code: row.code,

        total_records: total,
        present,
        late,
        absent,
        excused,

        attendance_days: Number(row.attendance_days || 0),

        attended: present + late,

        attendance_rate: rate,

        needs_attention: rate < safeThreshold,

        threshold: safeThreshold,
      };
    })
    .filter((row) => row.attendance_rate < safeThreshold);
}

// ============================================================
// UNASSIGNED STUDENTS
// ============================================================

async function getUnassignedStudents({ user, limit = MAX_STUDENTS }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), MAX_STUDENTS);

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.code,
        s.phone,
        s.status

      FROM students s

      WHERE s.church_id = ?

        AND NOT EXISTS (
          SELECT 1
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
            AND c.church_id = ?
          WHERE cs.student_id = s.id
        )

      ORDER BY
        s.name ASC

      LIMIT ${safeLimit}
    `,
    [churchId, churchId],
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

  const range = getDateRange(startDate, endDate);

  if (!range) {
    throw createAssistantError(
      "Khoảng thời gian không hợp lệ.",
      "INVALID_DATE_RANGE",
      400,
    );
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const anomalies = [];

  // ==========================================================
  // 1. DUPLICATE ATTENDANCE
  // ==========================================================

  const [duplicateRows] = await db.query(
    `
      SELECT
        a.student_id,
        s.name AS student_name,
        s.code AS student_code,

        a.attendance_date,
        a.attendance_type,
        a.class_id,

        COUNT(*) AS duplicate_count

      FROM attendances a

      INNER JOIN students s
        ON s.id = a.student_id
        AND s.church_id = ?

      WHERE a.church_id = ?
        AND a.attendance_date
          BETWEEN ? AND ?

      GROUP BY
        a.student_id,
        a.attendance_date,
        a.attendance_type,
        a.class_id

      HAVING COUNT(*) > 1

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimit}
    `,
    [churchId, churchId, range.startDate, range.endDate],
  );

  for (const row of duplicateRows) {
    anomalies.push({
      type: "duplicate_attendance",

      severity: "high",

      student_id: row.student_id,

      student_name: row.student_name,

      student_code: row.student_code,

      attendance_date: row.attendance_date,

      attendance_type: row.attendance_type,

      class_id: row.class_id,

      count: Number(row.duplicate_count),

      message: "Học sinh có nhiều bản ghi điểm danh cùng ngày và cùng loại.",
    });
  }

  // ==========================================================
  // 2. ATTENDANCE WITHOUT STUDENT
  // ==========================================================

  const [orphanRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.attendance_date,
        a.attendance_type

      FROM attendances a

      LEFT JOIN students s
        ON s.id = a.student_id
        AND s.church_id = ?

      WHERE a.church_id = ?
        AND a.attendance_date
          BETWEEN ? AND ?

        AND s.id IS NULL

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimit}
    `,
    [churchId, churchId, range.startDate, range.endDate],
  );

  for (const row of orphanRows) {
    anomalies.push({
      type: "attendance_student_not_found",

      severity: "high",

      attendance_id: row.id,

      student_id: row.student_id,

      attendance_date: row.attendance_date,

      attendance_type: row.attendance_type,

      message:
        "Bản ghi điểm danh không tìm thấy học sinh tương ứng trong giáo xứ.",
    });
  }

  // ==========================================================
  // 3. ATTENDANCE CLASS OUTSIDE CHURCH
  // ==========================================================

  const [invalidClassRows] = await db.query(
    `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type

      FROM attendances a

      LEFT JOIN classes c
        ON c.id = a.class_id
        AND c.church_id = ?

      WHERE a.church_id = ?
        AND a.attendance_date
          BETWEEN ? AND ?

        AND a.class_id IS NOT NULL
        AND c.id IS NULL

      ORDER BY
        a.attendance_date DESC

      LIMIT ${safeLimit}
    `,
    [churchId, churchId, range.startDate, range.endDate],
  );

  for (const row of invalidClassRows) {
    anomalies.push({
      type: "attendance_class_not_found",

      severity: "high",

      attendance_id: row.id,

      student_id: row.student_id,

      class_id: row.class_id,

      attendance_date: row.attendance_date,

      attendance_type: row.attendance_type,

      message: "Bản ghi điểm danh đang tham chiếu lớp không thuộc giáo xứ.",
    });
  }

  return {
    start_date: range.startDate,

    end_date: range.endDate,

    total: anomalies.length,

    anomalies: anomalies.slice(0, safeLimit),
  };
}

// ============================================================
// PERIOD STATISTICS
// ============================================================

async function getMonthlyAttendanceStatistics({
  user,
  classId,
  startDate,
  endDate,
  attendanceType,
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const range = getDateRange(startDate, endDate);

  if (!range) {
    throw createAssistantError(
      "Khoảng thời gian không hợp lệ.",
      "INVALID_DATE_RANGE",
      400,
    );
  }

  const type = normalizeAttendanceType(attendanceType);

  let classCondition = "";

  const params = [churchId, type, range.startDate, range.endDate, churchId];

  let classInfo = null;

  if (type === "catechism") {
    const safeClassId = toPositiveInt(classId);

    if (!safeClassId) {
      throw createAssistantError(
        "Vui lòng xác định lớp.",
        "CLASS_REQUIRED",
        400,
      );
    }

    classInfo = await assertClassBelongsToChurch(safeClassId, churchId, user);

    classCondition = `
      AND a.class_id = ?
    `;

    params.push(safeClassId);
  }

  const [rows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_records,

        COUNT(
          DISTINCT a.attendance_date
        ) AS attendance_days,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1
            ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1
            ELSE 0
          END
        ) AS excused

      FROM attendances a

      INNER JOIN students s
        ON s.id = a.student_id
        AND s.church_id = ?

      WHERE a.church_id = ?
        AND a.attendance_type = ?
        AND a.attendance_date
          BETWEEN ? AND ?

        ${classCondition}
    `,
    [
      churchId,
      churchId,
      type,
      range.startDate,
      range.endDate,
      ...(classCondition ? [params[5]] : []),
    ],
  );

  const row = rows[0] || {};

  const total = Number(row.total_records || 0);

  const present = Number(row.present || 0);

  const late = Number(row.late || 0);

  const absent = Number(row.absent || 0);

  const excused = Number(row.excused || 0);

  const attended = present + late;

  return {
    class: classInfo
      ? {
          id: classInfo.id,
          name: classInfo.name,
          code: classInfo.code,
        }
      : null,

    start_date: range.startDate,

    end_date: range.endDate,

    attendance_type: type,

    attendance_type_label: getAttendanceTypeLabel(type),

    statistics: {
      total_records: total,

      attendance_days: Number(row.attendance_days || 0),

      present,
      late,
      absent,
      excused,

      attended,

      attendance_rate:
        total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0,
    },
  };
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  normalizeText,

  requireChurch,
  requireReadPermission,

  searchStudents,
  getStudentDetail,

  searchClasses,
  getClassDetail,

  getAttendanceSummary,
  getAttendanceStudents,

  getMonthlyAttendanceStatistics,

  getCatechismAttendanceSummary,
  getMassAttendanceSummary,

  getStudentAttendanceHistory,
  getStudentAttendanceRanking,

  getClassAttendanceRanking,
  compareClasses,

  getParishStatistics,

  getStudentsNeedingAttention,

  getUnassignedStudents,

  getAttendanceAnomalies,

  normalizeAttendanceType,
  getAttendanceTypeLabel,

  getToday,
  isValidDateString,
};

// ============================================================
// FAITHEDU - ASSISTANT TOOLS - PHASE 4
// ============================================================
//
// MỤC TIÊU
// - READ ONLY
// - KHÔNG INSERT / UPDATE / DELETE
// - KHÔNG tin church_id từ frontend
// - church_id lấy từ JWT
// - Tenant isolation tuyệt đối
// - Hỗ trợ:
//   + Học sinh
//   + Lớp học
//   + Điểm danh
//   + Thánh lễ
//   + Học giáo lý
//   + Thống kê ngày
//   + Thống kê khoảng thời gian
//   + Thống kê tháng
//   + Chưa điểm danh
//
// ROLE
// - admin_catechist: toàn giáo xứ
// - catechist: toàn giáo xứ
// - teacher: FAIL-CLOSED nếu chưa xác minh được assignment
// - parent: chưa cho dùng tool toàn giáo xứ
//
// ============================================================

const db = require("../../config/db");

// ============================================================
// CONSTANTS
// ============================================================

const CHURCH_WIDE_ROLES = ["admin_catechist", "catechist"];

const MAX_STUDENTS = 100;
const MAX_CLASSES = 50;
const MAX_ATTENDANCE_ROWS = 200;

// Không cho teacher tự ý xem dữ liệu nếu chưa có
// cơ chế xác minh class assignment rõ ràng.
const TEACHER_REQUIRES_ASSIGNMENT_CHECK = true;

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
// ERROR
// ============================================================

function createAssistantError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
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
    if (TEACHER_REQUIRES_ASSIGNMENT_CHECK) {
      return role;
    }
  }

  throw createAssistantError(
    "Tài khoản của bạn không có quyền tra cứu dữ liệu giáo xứ.",
    "ASSISTANT_READ_FORBIDDEN",
    403,
  );
}

// ============================================================
// TEACHER ACCESS
// ============================================================
//
// Phase 4 không tự đoán schema assignment.
//
// Vì chưa có schema/helper assignment trong code được gửi,
// teacher sẽ bị chặn ở những tool cần truy cập dữ liệu lớp.
//
// Khi có helper resolveCatechismClass() thực tế của hệ thống,
// chỉ cần thay implementation này.
//
// ============================================================

async function assertTeacherClassAccess(user, classId, churchId) {
  const role = String(user?.role || "").trim();

  if (role !== "teacher") {
    return true;
  }

  throw createAssistantError(
    "Trợ lý chưa được cấp quyền tra cứu lớp cho tài khoản giáo lý viên này. Vui lòng cấu hình phạm vi lớp phụ trách.",
    "ASSISTANT_TEACHER_CLASS_SCOPE_REQUIRED",
    403,
  );
}

// ============================================================
// BASIC
// ============================================================

function toPositiveInt(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function normalizeAttendanceType(value) {
  const normalized = normalizeText(value);

  if (
    normalized === "mass" ||
    normalized.includes("thanh le") ||
    normalized.includes("di le") ||
    normalized.includes("tham du thanh le") ||
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

  const value = date.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const parsed = new Date(year, month - 1, day);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function formatDateToMysql(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatDateToMysql(new Date());
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
// SEARCH STUDENTS
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
        WHERE cs_filter.student_id = s.id
          AND cs_filter.class_id = ?
          AND c_filter.church_id = ?
      )
    `);

    params.push(safeClassId, churchId);
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

      ORDER BY s.name ASC, s.id DESC

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
      limit: 5,
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

  if (String(user?.role) === "teacher") {
    const accessibleClasses = [];

    for (const classItem of classRows) {
      try {
        await assertTeacherClassAccess(user, classItem.id, churchId);

        accessibleClasses.push(classItem);
      } catch {
        // Không expose lớp ngoài scope.
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

  const params = [churchId];

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

  params.push(churchId);

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

  if (String(user?.role) !== "teacher") {
    return rows;
  }

  const accessible = [];

  for (const row of rows) {
    try {
      await assertTeacherClassAccess(user, row.id, churchId);

      accessible.push(row);
    } catch {
      // Ignore inaccessible classes.
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
// CLASS STUDENTS
// ============================================================

async function getClassStudents({ user, classId, limit = MAX_STUDENTS }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeClassId = toPositiveInt(classId);

  if (!safeClassId) {
    throw createAssistantError("Mã lớp không hợp lệ.", "INVALID_CLASS_ID", 400);
  }

  const classInfo = await assertClassBelongsToChurch(
    safeClassId,
    churchId,
    user,
  );

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), MAX_STUDENTS);

  const [rows] = await db.query(
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

      LIMIT ${safeLimit}
    `,
    [churchId, safeClassId],
  );

  return {
    class: classInfo,
    total: rows.length,
    students: rows,
  };
}

// ============================================================
// ATTENDANCE STATISTICS BUILDER
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

  const safeClassId = toPositiveInt(classId);

  if (!safeClassId) {
    throw createAssistantError("Vui lòng xác định lớp.", "CLASS_REQUIRED", 400);
  }

  if (!isValidDateString(date)) {
    throw createAssistantError(
      "Ngày điểm danh không hợp lệ.",
      "INVALID_DATE",
      400,
    );
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
//
// QUAN TRỌNG:
// Không LIMIT ở query thống kê.
// Nếu giáo xứ có 500 học sinh thì tổng phải tính đủ 500.
//
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

  const statistics = buildAttendanceStatistics(rows);

  return {
    success: true,

    class: null,

    date,

    attendance_type: "mass",
    attendance_type_label: "Thánh lễ",

    statistics,

    data: rows.slice(0, MAX_ATTENDANCE_ROWS),
  };
}

// ============================================================
// ATTENDANCE SUMMARY
// ============================================================

async function getAttendanceSummary({
  user,
  classId,
  date,
  attendanceType = "catechism",
}) {
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
  attendanceType = "catechism",
  status = "all",
}) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const type = normalizeAttendanceType(attendanceType);

  if (!isValidDateString(date)) {
    throw createAssistantError(
      "Ngày điểm danh không hợp lệ.",
      "INVALID_DATE",
      400,
    );
  }

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

  let rows;

  // ==========================================================
  // MASS
  // ==========================================================

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
      sql += ` AND a.id IS NULL `;
    } else if (safeStatus !== "all") {
      sql += ` AND a.status = ? `;
      params.push(safeStatus);
    }

    sql += `
      ORDER BY s.name ASC
      LIMIT ${MAX_ATTENDANCE_ROWS}
    `;

    [rows] = await db.query(sql, params);
  }

  // ==========================================================
  // CATECHISM
  // ==========================================================
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
      sql += ` AND a.id IS NULL `;
    } else if (safeStatus !== "all") {
      sql += ` AND a.status = ? `;
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
// PERIOD STATISTICS
// ============================================================
//
// Tính trên RECORD THỰC TẾ.
// Không gọi LIMIT.
//
// ============================================================

async function getMonthlyAttendanceStatistics({
  user,
  classId,
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

  // ==========================================================
  // MASS
  // ==========================================================

  if (type === "mass") {
    const [rows] = await db.query(
      `
        SELECT
          COUNT(*) AS total_records,

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

          COUNT(DISTINCT a.attendance_date)
            AS attendance_days

        FROM students s

        INNER JOIN attendances a
          ON a.student_id = s.id
          AND a.church_id = ?
          AND a.attendance_type = 'mass'
          AND a.attendance_date BETWEEN ? AND ?

        WHERE s.church_id = ?
      `,
      [churchId, range.startDate, range.endDate, churchId],
    );

    const result = rows[0] || {};

    const totalRecords = Number(result.total_records || 0);

    const present = Number(result.present || 0);

    const late = Number(result.late || 0);

    const absent = Number(result.absent || 0);

    const excused = Number(result.excused || 0);

    const attendanceDays = Number(result.attendance_days || 0);

    const attended = present + late;

    const attendanceRate =
      totalRecords > 0
        ? Number(((attended / totalRecords) * 100).toFixed(2))
        : 0;

    return {
      success: true,

      class: null,

      start_date: range.startDate,
      end_date: range.endDate,

      attendance_type: "mass",
      attendance_type_label: "Thánh lễ",

      statistics: {
        attendance_days: attendanceDays,
        total_records: totalRecords,

        present,
        late,
        absent,
        excused,

        attended,

        attendance_rate: attendanceRate,
      },
    };
  }

  // ==========================================================
  // CATECHISM
  // ==========================================================

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
        COUNT(*) AS total_records,

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

        COUNT(
          DISTINCT a.attendance_date
        ) AS attendance_days

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id
        AND s.church_id = ?

      INNER JOIN attendances a
        ON a.student_id = s.id
        AND a.class_id = ?
        AND a.church_id = ?
        AND a.attendance_type = 'catechism'
        AND a.attendance_date BETWEEN ? AND ?

      WHERE cs.class_id = ?
    `,
    [
      churchId,
      safeClassId,
      churchId,
      range.startDate,
      range.endDate,
      safeClassId,
    ],
  );

  const result = rows[0] || {};

  const totalRecords = Number(result.total_records || 0);

  const present = Number(result.present || 0);

  const late = Number(result.late || 0);

  const absent = Number(result.absent || 0);

  const excused = Number(result.excused || 0);

  const attendanceDays = Number(result.attendance_days || 0);

  const attended = present + late;

  const attendanceRate =
    totalRecords > 0 ? Number(((attended / totalRecords) * 100).toFixed(2)) : 0;

  const [studentCountRows] = await db.query(
    `
      SELECT COUNT(*) AS total
      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id
        AND s.church_id = ?

      WHERE cs.class_id = ?
    `,
    [churchId, safeClassId],
  );

  const totalStudents = Number(studentCountRows[0]?.total || 0);

  return {
    success: true,

    class: {
      id: classInfo.id,
      name: classInfo.name,
      code: classInfo.code,
    },

    start_date: range.startDate,
    end_date: range.endDate,

    attendance_type: "catechism",
    attendance_type_label: "Học giáo lý",

    statistics: {
      total_students: totalStudents,

      attendance_days: attendanceDays,

      total_records: totalRecords,

      present,
      late,
      absent,
      excused,

      attended,

      attendance_rate: attendanceRate,
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
  getClassStudents,

  getAttendanceSummary,
  getAttendanceStudents,

  getMonthlyAttendanceStatistics,

  getCatechismAttendanceSummary,
  getMassAttendanceSummary,

  normalizeAttendanceType,
  getAttendanceTypeLabel,

  getToday,

  isValidDateString,
};

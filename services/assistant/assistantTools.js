// ============================================================
// FAITHEDU - ASSISTANT TOOLS - PHASE 3
// ============================================================
// Mục tiêu:
// - Chỉ đọc dữ liệu
// - Không INSERT / UPDATE / DELETE
// - Luôn giới hạn theo church_id
// - Hỗ trợ:
//   + Học sinh
//   + Lớp học
//   + Điểm danh
//   + Thống kê điểm danh
//   + Thống kê theo tháng
//
// QUAN TRỌNG:
// - Không tin church_id từ frontend.
// - church_id lấy từ JWT/user.
// - Parent chưa được phép dùng các tool dữ liệu toàn giáo xứ.
// ============================================================

const db = require("../../config/db");

// ============================================================
// CONSTANTS
// ============================================================

const READ_ALLOWED_ROLES = ["admin_catechist", "catechist", "teacher"];

const MAX_STUDENTS = 50;
const MAX_CLASSES = 30;
const MAX_ATTENDANCE_ROWS = 100;

// ============================================================
// NORMALIZE TEXT
// ============================================================

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

// ============================================================
// CHURCH
// ============================================================

function requireChurch(user) {
  const churchId = Number(user?.church_id);

  if (!Number.isInteger(churchId) || churchId <= 0) {
    const error = new Error("Không xác định được giáo xứ.");
    error.code = "ASSISTANT_CHURCH_REQUIRED";
    error.status = 403;
    throw error;
  }

  return churchId;
}

// ============================================================
// PERMISSION
// ============================================================

function requireReadPermission(user) {
  const role = String(user?.role || "").trim();

  if (!READ_ALLOWED_ROLES.includes(role)) {
    const error = new Error(
      "Tài khoản của bạn không có quyền tra cứu dữ liệu giáo xứ.",
    );

    error.code = "ASSISTANT_READ_FORBIDDEN";
    error.status = 403;

    throw error;
  }

  return role;
}

// ============================================================
// BASIC VALIDATORS
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
    normalized.includes("tham du thanh le")
  ) {
    return "mass";
  }

  return "catechism";
}

function getAttendanceTypeLabel(type) {
  return type === "mass" ? "Thánh lễ" : "Học giáo lý";
}

// ============================================================
// DATE HELPERS
// ============================================================

function isValidDateString(date) {
  if (!date || typeof date !== "string") {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function formatDateToMysql(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getToday() {
  const now = new Date();

  return formatDateToMysql(now);
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
// CLASS ACCESS
// ============================================================
//
// IMPORTANT:
// Chưa tự đoán schema phân công teacher.
//
// admin_catechist / catechist:
//   được phép xem dữ liệu lớp trong cùng church.
//
// teacher:
//   chỉ nên xem lớp được phân công.
//
// Nếu hệ thống hiện tại đã có helper resolveCatechismClass()
// trong attendance controller thì nên tái sử dụng helper đó ở tầng
// service/controller để enforce assignment.
//
// Ở đây tuyệt đối KHÔNG cho teacher vượt church_id.
// ============================================================

async function assertClassBelongsToChurch(classId, churchId) {
  const [rows] = await db.query(
    `
      SELECT
        id,
        name,
        code,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
    `,
    [classId, churchId],
  );

  if (!rows.length) {
    const error = new Error("Không tìm thấy lớp học trong giáo xứ.");
    error.code = "CLASS_NOT_FOUND";
    error.status = 404;

    throw error;
  }

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

  const params = [churchId];

  const where = ["s.church_id = ?"];

  // ----------------------------------------------------------
  // SEARCH KEYWORD
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // CLASS FILTER
  // ----------------------------------------------------------

  if (classId) {
    const safeClassId = toPositiveInt(classId);

    if (!safeClassId) {
      const error = new Error("Mã lớp không hợp lệ.");
      error.code = "INVALID_CLASS_ID";
      error.status = 400;
      throw error;
    }

    await assertClassBelongsToChurch(safeClassId, churchId);

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

  // ----------------------------------------------------------
  // QUERY
  // ----------------------------------------------------------

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

      ORDER BY s.id DESC

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

  // ----------------------------------------------------------
  // Nếu không có ID thì tìm theo keyword
  // ----------------------------------------------------------

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
    const error = new Error("Không xác định được học sinh cần tra cứu.");

    error.code = "STUDENT_REQUIRED";
    error.status = 400;

    throw error;
  }

  // ----------------------------------------------------------
  // STUDENT
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // CLASSES
  // ----------------------------------------------------------

  const [classRows] = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.code

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.student_id = ?
        AND c.church_id = ?

      ORDER BY c.name ASC
    `,
    [targetStudentId, churchId],
  );

  // ----------------------------------------------------------
  // RETURN
  // ----------------------------------------------------------

  return {
    ...student,

    classes: classRows,

    class_names: classRows
      .map((item) => item.name)
      .filter(Boolean)
      .join(", "),
  };
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

  return rows;
}

// ============================================================
// CLASS DETAIL
// ============================================================

async function getClassDetail({ user, classId, keyword }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  let targetClassId = toPositiveInt(classId);

  // ----------------------------------------------------------
  // Resolve bằng keyword
  // ----------------------------------------------------------

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
    const error = new Error("Không xác định được lớp cần tra cứu.");

    error.code = "CLASS_REQUIRED";
    error.status = 400;

    throw error;
  }

  const classInfo = await assertClassBelongsToChurch(targetClassId, churchId);

  // ----------------------------------------------------------
  // STUDENTS
  // ----------------------------------------------------------

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
// GET CLASS STUDENTS
// ============================================================

async function getClassStudents({ user, classId, limit = MAX_STUDENTS }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeClassId = toPositiveInt(classId);

  if (!safeClassId) {
    const error = new Error("Mã lớp không hợp lệ.");
    error.code = "INVALID_CLASS_ID";
    error.status = 400;

    throw error;
  }

  const classInfo = await assertClassBelongsToChurch(safeClassId, churchId);

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
// ATTENDANCE SUMMARY - CATECHISM
// ============================================================

async function getCatechismAttendanceSummary({ user, classId, date }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  const safeClassId = toPositiveInt(classId);

  if (!safeClassId) {
    const error = new Error("Vui lòng xác định lớp.");
    error.code = "CLASS_REQUIRED";
    error.status = 400;

    throw error;
  }

  if (!isValidDateString(date)) {
    const error = new Error("Ngày điểm danh không hợp lệ.");
    error.code = "INVALID_DATE";
    error.status = 400;

    throw error;
  }

  const classInfo = await assertClassBelongsToChurch(safeClassId, churchId);

  // ----------------------------------------------------------
  // STUDENTS + ATTENDANCE
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // STATISTICS
  // ----------------------------------------------------------

  const statistics = buildAttendanceStatistics(rows);

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

    statistics,

    data: rows,
  };
}

// ============================================================
// ATTENDANCE SUMMARY - MASS
// ============================================================

async function getMassAttendanceSummary({ user, date }) {
  requireReadPermission(user);

  const churchId = requireChurch(user);

  if (!isValidDateString(date)) {
    const error = new Error("Ngày điểm danh không hợp lệ.");
    error.code = "INVALID_DATE";
    error.status = 400;

    throw error;
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

      LIMIT ${MAX_ATTENDANCE_ROWS}
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

    data: rows,
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
      continue;
    }

    if (status === "absent") {
      absent++;
      continue;
    }

    if (status === "late") {
      late++;
      continue;
    }

    if (status === "excused") {
      excused++;
      continue;
    }

    if (!row.attendance_id) {
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
// GET ATTENDANCE SUMMARY
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
// GET ATTENDANCE STUDENTS
// ============================================================
//
// Trả danh sách theo trạng thái:
//
// present
// absent
// late
// excused
// not_attended
// all
//
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

  const normalizedStatus = normalizeText(status).replace(/\s+/g, "_");

  if (!isValidDateString(date)) {
    const error = new Error("Ngày điểm danh không hợp lệ.");
    error.code = "INVALID_DATE";
    error.status = 400;

    throw error;
  }

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

  // ==========================================================
  // CATECHISM
  // ==========================================================
  else {
    const safeClassId = toPositiveInt(classId);

    if (!safeClassId) {
      const error = new Error("Vui lòng xác định lớp.");
      error.code = "CLASS_REQUIRED";
      error.status = 400;

      throw error;
    }

    await assertClassBelongsToChurch(safeClassId, churchId);

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
// MONTHLY ATTENDANCE STATISTICS
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
    const error = new Error("Khoảng thời gian không hợp lệ.");

    error.code = "INVALID_DATE_RANGE";
    error.status = 400;

    throw error;
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
          ) AS excused

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

    const present = Number(result.present || 0);
    const late = Number(result.late || 0);
    const absent = Number(result.absent || 0);
    const excused = Number(result.excused || 0);

    const totalRecords = Number(result.total_records || 0);

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
    const error = new Error("Vui lòng xác định lớp.");
    error.code = "CLASS_REQUIRED";
    error.status = 400;

    throw error;
  }

  const classInfo = await assertClassBelongsToChurch(safeClassId, churchId);

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
        ) AS excused

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

  const present = Number(result.present || 0);
  const late = Number(result.late || 0);
  const absent = Number(result.absent || 0);
  const excused = Number(result.excused || 0);

  const totalRecords = Number(result.total_records || 0);

  const attended = present + late;

  const attendanceRate =
    totalRecords > 0 ? Number(((attended / totalRecords) * 100).toFixed(2)) : 0;

  // ----------------------------------------------------------
  // TOTAL STUDENTS
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // UNIQUE ATTENDANCE DAYS
  // ----------------------------------------------------------

  const [dateRows] = await db.query(
    `
      SELECT COUNT(
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

  const attendanceDays = Number(dateRows[0]?.attendance_days || 0);

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
};

// services/assistant/assistantTools.js

const db = require("../../config/db");

/**
 * ============================================================
 * FAITHEDU ASSISTANT - READ ONLY DATA TOOLS
 * ============================================================
 *
 * Phase 2:
 *
 * - Chỉ đọc dữ liệu
 * - Không INSERT
 * - Không UPDATE
 * - Không DELETE
 * - Không thay đổi dữ liệu
 * - Luôn giới hạn theo church_id từ JWT
 *
 * Không nhận church_id từ frontend.
 */

/**
 * ============================================================
 * NORMALIZE TEXT
 * ============================================================
 */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ============================================================
 * READ ROLES
 * ============================================================
 */

const READ_ALLOWED_ROLES = ["admin_catechist", "catechist", "teacher"];

/**
 * ============================================================
 * CAN READ
 * ============================================================
 */

function canReadSchoolData(user) {
  return READ_ALLOWED_ROLES.includes(user?.role);
}

/**
 * ============================================================
 * REQUIRE CHURCH
 * ============================================================
 */

function requireChurch(user) {
  const churchId = Number(user?.church_id);

  if (!Number.isInteger(churchId) || churchId <= 0) {
    const error = new Error("Tài khoản chưa được gán giáo xứ.");

    error.code = "CHURCH_NOT_FOUND";

    throw error;
  }

  return churchId;
}

/**
 * ============================================================
 * REQUIRE READ PERMISSION
 * ============================================================
 */

function requireReadPermission(user) {
  if (!canReadSchoolData(user)) {
    const error = new Error(
      "Tài khoản hiện tại không có quyền tra cứu dữ liệu.",
    );

    error.code = "ASSISTANT_PERMISSION_DENIED";

    throw error;
  }
}

/**
 * ============================================================
 * SEARCH STUDENTS
 * ============================================================
 *
 * Schema thực tế:
 *
 * students:
 * - id
 * - code
 * - name
 * - phone
 * - email
 * - father_name
 * - mother_name
 * - father_phone
 * - mother_phone
 * - church_id
 *
 * KHÔNG CÓ student_code.
 * ============================================================
 */

async function searchStudents({ user, keyword }) {
  const churchId = requireChurch(user);

  requireReadPermission(user);

  const cleanKeyword = String(keyword || "").trim();

  if (!cleanKeyword) {
    return [];
  }

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("ASSISTANT TOOL: SEARCH STUDENTS");
  console.log("CHURCH ID:", churchId);
  console.log("KEYWORD:", cleanKeyword);
  console.log("------------------------------------------------------------");

  const searchValue = `%${cleanKeyword}%`;

  /**
   * Bám đúng logic GET STUDENTS hiện tại.
   */

  const [rows] = await db.execute(
    `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.father_name,
        s.mother_name,
        s.father_phone,
        s.mother_phone,
        s.status,

        (
          SELECT
            GROUP_CONCAT(
              DISTINCT c.id
              ORDER BY c.id
              SEPARATOR ','
            )

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE
            cs.student_id = s.id
            AND c.church_id = ?
        ) AS class_ids,

        (
          SELECT
            GROUP_CONCAT(
              DISTINCT c.name
              ORDER BY c.name
              SEPARATOR ', '
            )

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE
            cs.student_id = s.id
            AND c.church_id = ?
        ) AS class_names

      FROM students s

      WHERE
        s.church_id = ?

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

      ORDER BY
        s.name ASC,
        s.id ASC

      LIMIT 10
    `,
    [
      churchId,
      churchId,
      churchId,

      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    ],
  );

  console.log("STUDENTS FOUND:", rows.length);

  return rows.map((student) => ({
    id: student.id,

    code: student.code,

    name: student.name,

    gender: student.gender,

    date_of_birth: student.date_of_birth,

    phone: student.phone,

    email: student.email,

    father_name: student.father_name,

    mother_name: student.mother_name,

    father_phone: student.father_phone,

    mother_phone: student.mother_phone,

    status: student.status,

    class_ids: student.class_ids
      ? String(student.class_ids)
          .split(",")
          .map((id) => Number(id))
          .filter(Boolean)
      : [],

    class_names: student.class_names || null,
  }));
}

/**
 * ============================================================
 * SEARCH CLASSES
 * ============================================================
 */

async function searchClasses({ user, keyword }) {
  const churchId = requireChurch(user);

  requireReadPermission(user);

  const cleanKeyword = String(keyword || "").trim();

  if (!cleanKeyword) {
    return [];
  }

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("ASSISTANT TOOL: SEARCH CLASSES");
  console.log("CHURCH ID:", churchId);
  console.log("KEYWORD:", cleanKeyword);
  console.log("------------------------------------------------------------");

  const searchValue = `%${cleanKeyword}%`;

  const [rows] = await db.execute(
    `
      SELECT
        c.id,
        c.name,
        c.code

      FROM classes c

      WHERE
        c.church_id = ?

        AND (
          c.name LIKE ?
          OR c.code LIKE ?
        )

      ORDER BY
        c.name ASC,
        c.id ASC

      LIMIT 10
    `,
    [churchId, searchValue, searchValue],
  );

  console.log("CLASSES FOUND:", rows.length);

  return rows;
}

/**
 * ============================================================
 * GET CLASS STUDENTS
 * ============================================================
 */

async function getClassStudents({ user, classId }) {
  const churchId = requireChurch(user);

  requireReadPermission(user);

  const id = Number(classId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Mã lớp không hợp lệ.");

    error.code = "INVALID_CLASS_ID";

    throw error;
  }

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("ASSISTANT TOOL: GET CLASS STUDENTS");
  console.log("CHURCH ID:", churchId);
  console.log("CLASS ID:", id);
  console.log("------------------------------------------------------------");

  /**
   * Kiểm tra lớp thuộc giáo xứ.
   */

  const [classRows] = await db.execute(
    `
      SELECT
        id,
        name,
        code

      FROM classes

      WHERE
        id = ?
        AND church_id = ?

      LIMIT 1
    `,
    [id, churchId],
  );

  if (!classRows.length) {
    return null;
  }

  /**
   * Danh sách học sinh.
   *
   * Không lấy student_code.
   * Dùng s.code.
   */

  const [students] = await db.execute(
    `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth

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
    [churchId, id],
  );

  return {
    class: classRows[0],

    students: students.map((student) => ({
      id: student.id,
      code: student.code,
      name: student.name,
      gender: student.gender,
      date_of_birth: student.date_of_birth,
    })),

    total: students.length,
  };
}

/**
 * ============================================================
 * ATTENDANCE - CATECHISM
 * ============================================================
 *
 * Dựa đúng getAttendance hiện tại:
 *
 * catechism:
 * - class_id bắt buộc
 * - class_students
 * - attendances
 * ============================================================
 */

async function getCatechismAttendanceSummary({ user, classId, date }) {
  const churchId = requireChurch(user);

  requireReadPermission(user);

  const id = Number(classId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Mã lớp không hợp lệ.");

    error.code = "INVALID_CLASS_ID";

    throw error;
  }

  if (!date) {
    const error = new Error("Chưa xác định ngày điểm danh.");

    error.code = "ATTENDANCE_DATE_REQUIRED";

    throw error;
  }

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("ASSISTANT TOOL: CATECHISM ATTENDANCE");
  console.log("CHURCH ID:", churchId);
  console.log("CLASS ID:", id);
  console.log("DATE:", date);
  console.log("------------------------------------------------------------");

  /**
   * Kiểm tra lớp thuộc giáo xứ.
   */

  const [classRows] = await db.execute(
    `
      SELECT
        id,
        name,
        code

      FROM classes

      WHERE
        id = ?
        AND church_id = ?

      LIMIT 1
    `,
    [id, churchId],
  );

  if (!classRows.length) {
    return null;
  }

  /**
   * Statistics.
   *
   * QUAN TRỌNG:
   *
   * LEFT JOIN attendances để bao gồm
   * cả học sinh chưa điểm danh.
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
        AND a.attendance_type = 'catechism'

      WHERE
        cs.class_id = ?
    `,
    [churchId, id, churchId, date, id],
  );

  const stats = statsRows[0] || {};

  const total = Number(stats.total || 0);

  const present = Number(stats.present || 0);

  const absent = Number(stats.absent || 0);

  const late = Number(stats.late || 0);

  const excused = Number(stats.excused || 0);

  const notAttended = Number(stats.not_attended || 0);

  const attended = present + late;

  const attendanceRate =
    total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0;

  return {
    class: classRows[0],

    date,

    attendance_type: "catechism",

    attendance_type_label: "Học giáo lý",

    statistics: {
      total,
      present,
      absent,
      late,
      excused,
      not_attended: notAttended,
      attendance_rate: attendanceRate,
    },
  };
}

/**
 * ============================================================
 * ATTENDANCE - MASS
 * ============================================================
 *
 * Mass KHÔNG có class_id.
 *
 * Toàn bộ học sinh thuộc church.
 * ============================================================
 */

async function getMassAttendanceSummary({ user, date }) {
  const churchId = requireChurch(user);

  requireReadPermission(user);

  if (!date) {
    const error = new Error("Chưa xác định ngày điểm danh.");

    error.code = "ATTENDANCE_DATE_REQUIRED";

    throw error;
  }

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("ASSISTANT TOOL: MASS ATTENDANCE");
  console.log("CHURCH ID:", churchId);
  console.log("DATE:", date);
  console.log("------------------------------------------------------------");

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

  const total = Number(stats.total || 0);

  const present = Number(stats.present || 0);

  const absent = Number(stats.absent || 0);

  const late = Number(stats.late || 0);

  const excused = Number(stats.excused || 0);

  const notAttended = Number(stats.not_attended || 0);

  const attended = present + late;

  const attendanceRate =
    total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0;

  return {
    class: null,

    date,

    attendance_type: "mass",

    attendance_type_label: "Thánh lễ",

    statistics: {
      total,
      present,
      absent,
      late,
      excused,
      not_attended: notAttended,
      attendance_rate: attendanceRate,
    },
  };
}

/**
 * ============================================================
 * GENERIC ATTENDANCE SUMMARY
 * ============================================================
 */

async function getAttendanceSummary({
  user,
  classId,
  date,
  attendanceType = "catechism",
}) {
  if (attendanceType === "mass") {
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

/**
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = {
  normalizeText,

  canReadSchoolData,

  requireChurch,

  searchStudents,

  searchClasses,

  getClassStudents,

  getCatechismAttendanceSummary,

  getMassAttendanceSummary,

  getAttendanceSummary,
};

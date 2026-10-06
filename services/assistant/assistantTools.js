// services/assistant/assistantTools.js

const db = require("../../config/db");

/**
 * ============================================================
 * FAITHEDU ASSISTANT - READ ONLY TOOLS
 * ============================================================
 *
 * Phase 2:
 * - Chỉ đọc dữ liệu.
 * - Không INSERT.
 * - Không UPDATE.
 * - Không DELETE.
 * - Không ALTER.
 * - Không gọi AI.
 *
 * TẤT CẢ truy vấn đều phải giới hạn theo church_id.
 */

/**
 * ============================================================
 * NORMALIZE
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
 * ROLE HELPERS
 * ============================================================
 */

const READ_ALLOWED_ROLES = ["admin_catechist", "catechist", "teacher"];

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
 * SEARCH STUDENT
 * ============================================================
 */

async function searchStudents({ user, keyword }) {
  const churchId = requireChurch(user);

  if (!canReadSchoolData(user)) {
    const error = new Error(
      "Tài khoản hiện tại không có quyền tra cứu học sinh.",
    );

    error.code = "ASSISTANT_PERMISSION_DENIED";

    throw error;
  }

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

  /**
   * LƯU Ý:
   *
   * Không nhận church_id từ frontend.
   * Luôn lấy từ req.user.
   */

  const searchValue = `%${cleanKeyword}%`;

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.student_code,
        s.qr_token,
        s.class_id,
        c.name AS class_name
      FROM students s

      LEFT JOIN classes c
        ON c.id = s.class_id
        AND c.church_id = s.church_id

      WHERE s.church_id = ?
        AND (
          s.name LIKE ?
          OR s.student_code LIKE ?
        )

      ORDER BY s.name ASC
      LIMIT 10
    `,
    [churchId, searchValue, searchValue],
  );

  return rows.map((item) => ({
    id: item.id,
    name: item.name,
    student_code: item.student_code,
    class_id: item.class_id,
    class_name: item.class_name || null,
  }));
}

/**
 * ============================================================
 * GET STUDENT
 * ============================================================
 */

async function getStudentById({ user, studentId }) {
  const churchId = requireChurch(user);

  if (!canReadSchoolData(user)) {
    const error = new Error(
      "Tài khoản hiện tại không có quyền tra cứu học sinh.",
    );

    error.code = "ASSISTANT_PERMISSION_DENIED";

    throw error;
  }

  const id = Number(studentId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Mã học sinh không hợp lệ.");

    error.code = "INVALID_STUDENT_ID";

    throw error;
  }

  const [rows] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.student_code,
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
    [id, churchId],
  );

  return rows[0] || null;
}

/**
 * ============================================================
 * SEARCH CLASSES
 * ============================================================
 */

async function searchClasses({ user, keyword }) {
  const churchId = requireChurch(user);

  if (!canReadSchoolData(user)) {
    const error = new Error(
      "Tài khoản hiện tại không có quyền tra cứu lớp học.",
    );

    error.code = "ASSISTANT_PERMISSION_DENIED";

    throw error;
  }

  const cleanKeyword = String(keyword || "").trim();

  if (!cleanKeyword) {
    return [];
  }

  const searchValue = `%${cleanKeyword}%`;

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("ASSISTANT TOOL: SEARCH CLASSES");
  console.log("CHURCH ID:", churchId);
  console.log("KEYWORD:", cleanKeyword);
  console.log("------------------------------------------------------------");

  const [rows] = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.code
      FROM classes c
      WHERE c.church_id = ?
        AND (
          c.name LIKE ?
          OR c.code LIKE ?
        )
      ORDER BY c.name ASC
      LIMIT 10
    `,
    [churchId, searchValue, searchValue],
  );

  return rows;
}

/**
 * ============================================================
 * GET CLASS STUDENTS
 * ============================================================
 */

async function getClassStudents({ user, classId }) {
  const churchId = requireChurch(user);

  if (!canReadSchoolData(user)) {
    const error = new Error(
      "Tài khoản hiện tại không có quyền tra cứu lớp học.",
    );

    error.code = "ASSISTANT_PERMISSION_DENIED";

    throw error;
  }

  const id = Number(classId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Mã lớp không hợp lệ.");

    error.code = "INVALID_CLASS_ID";

    throw error;
  }

  const [classRows] = await db.query(
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
    [id, churchId],
  );

  if (!classRows.length) {
    return null;
  }

  const [students] = await db.query(
    `
      SELECT
        s.id,
        s.name,
        s.student_code

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id
        AND s.church_id = ?

      WHERE cs.class_id = ?

      ORDER BY s.name ASC
    `,
    [churchId, id],
  );

  return {
    class: classRows[0],
    students,
    total: students.length,
  };
}

/**
 * ============================================================
 * ATTENDANCE SUMMARY
 * ============================================================
 */

async function getAttendanceSummary({
  user,
  classId,
  date,
  attendanceType = "catechism",
}) {
  const churchId = requireChurch(user);

  if (!canReadSchoolData(user)) {
    const error = new Error(
      "Tài khoản hiện tại không có quyền tra cứu điểm danh.",
    );

    error.code = "ASSISTANT_PERMISSION_DENIED";

    throw error;
  }

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

  if (!["catechism", "mass"].includes(attendanceType)) {
    const error = new Error("Loại điểm danh không hợp lệ.");

    error.code = "INVALID_ATTENDANCE_TYPE";

    throw error;
  }

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("ASSISTANT TOOL: ATTENDANCE SUMMARY");
  console.log("CHURCH ID:", churchId);
  console.log("CLASS ID:", id);
  console.log("DATE:", date);
  console.log("TYPE:", attendanceType);
  console.log("------------------------------------------------------------");

  /**
   * Kiểm tra lớp thuộc đúng giáo xứ.
   */

  const [classRows] = await db.query(
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
    [id, churchId],
  );

  if (!classRows.length) {
    return null;
  }

  /**
   * Chỉ đọc attendance.
   *
   * LƯU Ý:
   * Tên cột phải khớp schema attendance hiện tại.
   */

  const [rows] = await db.query(
    `
      SELECT
        a.status,
        COUNT(*) AS total

      FROM attendances a

      WHERE a.church_id = ?
        AND a.class_id = ?
        AND a.attendance_date = ?
        AND a.attendance_type = ?

      GROUP BY a.status
    `,
    [churchId, id, date, attendanceType],
  );

  const summary = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    total: 0,
  };

  for (const row of rows) {
    const count = Number(row.total) || 0;

    if (Object.prototype.hasOwnProperty.call(summary, row.status)) {
      summary[row.status] += count;
    }

    summary.total += count;
  }

  return {
    class: classRows[0],
    date,
    attendance_type: attendanceType,
    summary,
  };
}

module.exports = {
  searchStudents,
  getStudentById,
  searchClasses,
  getClassStudents,
  getAttendanceSummary,
  canReadSchoolData,
  requireChurch,
  normalizeText,
};

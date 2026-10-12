const db = require("../config/db");
const { writeLog } = require("../utils/activityChurchLogger");

const ALLOWED_STATUS = ["studying", "completed", "transferred", "dropped"];

// =====================================================
// COMMON HELPERS
// =====================================================

const createRequestId = (prefix = "REQ") =>
  `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;

const getChurchId = (req) => req.user?.church_id ?? req.user?.parish_id ?? null;

const toPositiveInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const safeWriteLog = async (payload) => {
  try {
    await writeLog(payload);
  } catch (error) {
    console.error("[ACTIVITY LOG ERROR]", error.message);
  }
};

const safeRollback = async (connection) => {
  if (!connection) return;

  try {
    await connection.rollback();
  } catch (error) {
    console.error("[ROLLBACK ERROR]", error.message);
  }
};

const sendServerError = (res, requestId, error, title) => {
  console.error(`\n[${requestId}] ${title}`);
  console.error("MESSAGE:", error.message);
  console.error("CODE:", error.code);
  console.error("SQL STATE:", error.sqlState);
  console.error("SQL MESSAGE:", error.sqlMessage);

  return res.status(500).json({
    success: false,
    message: "Lỗi máy chủ",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
    request_id: requestId,
  });
};

const normalizeAvatarUrl = (avatar) => {
  if (avatar === null || avatar === undefined) return null;

  let value = String(avatar).trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }

  value = value.replace(/\\/g, "/");
  value = value.split("?")[0].split("#")[0].trim();

  const lower = value.toLowerCase();
  const uploadsIndex = lower.indexOf("/uploads/");

  if (uploadsIndex !== -1) {
    return value.substring(uploadsIndex);
  }

  if (lower.startsWith("uploads/")) {
    return `/${value}`;
  }

  if (lower.startsWith("/students/")) {
    return `/uploads${value}`;
  }

  if (lower.startsWith("students/")) {
    return `/uploads/${value}`;
  }

  if (!value.includes("/")) {
    return `/uploads/students/${value}`;
  }

  const filename = value.split("/").filter(Boolean).pop();
  return filename ? `/uploads/students/${filename}` : null;
};

const formatStudent = (student) => {
  if (!student) return null;

  return {
    ...student,
    avatar_url: normalizeAvatarUrl(student.avatar),
  };
};

const formatStudents = (students = []) => students.map(formatStudent);

// =====================================================
// GET AND LOCK DATA
// =====================================================

// Lock the class row during write operations.
const getClassById = async (
  connection,
  classId,
  churchId,
  forUpdate = false,
) => {
  const sql = `
    SELECT c.*
    FROM classes c
    WHERE c.id = ?
      AND c.church_id = ?
    LIMIT 1
    ${forUpdate ? "FOR UPDATE" : ""}
  `;

  const [rows] = await connection.query(sql, [classId, churchId]);

  return rows[0] || null;
};

// Locking the student row serializes enrollment writes
// for the same student when using InnoDB.
const getStudentById = async (
  connection,
  studentId,
  churchId,
  forUpdate = false,
) => {
  const sql = `
    SELECT s.*
    FROM students s
    WHERE s.id = ?
      AND s.church_id = ?
    LIMIT 1
    ${forUpdate ? "FOR UPDATE" : ""}
  `;

  const [rows] = await connection.query(sql, [studentId, churchId]);

  return formatStudent(rows[0] || null);
};

const getSchedulesByClassId = async (connection, classId, churchId) => {
  const [rows] = await connection.query(
    `
      SELECT cs.*
      FROM class_schedules cs
      INNER JOIN classes c
        ON c.id = cs.class_id
      WHERE cs.class_id = ?
        AND c.church_id = ?
      ORDER BY
        CASE
          WHEN cs.day_of_week = 1 THEN 1
          WHEN cs.day_of_week = 2 THEN 2
          WHEN cs.day_of_week = 3 THEN 3
          WHEN cs.day_of_week = 4 THEN 4
          WHEN cs.day_of_week = 5 THEN 5
          WHEN cs.day_of_week = 6 THEN 6
          WHEN cs.day_of_week = 0 THEN 7
          ELSE 8
        END,
        cs.start_time ASC,
        cs.id ASC
    `,
    [classId, churchId],
  );

  return rows;
};

const getClassStudentRelation = async (
  connection,
  classId,
  studentId,
  churchId,
  forUpdate = false,
) => {
  const [rows] = await connection.query(
    `
      SELECT
        cs.id,
        cs.class_id,
        cs.student_id,
        cs.status,
        cs.joined_at,
        cs.left_at,
        s.name AS student_name,
        s.code AS student_code,
        s.avatar AS student_avatar,
        c.name AS class_name,
        c.code AS class_code,
        c.category AS class_category,
        c.status AS class_status,
        c.academic_year,
        c.church_id
      FROM class_students cs
      INNER JOIN students s
        ON s.id = cs.student_id
      INNER JOIN classes c
        ON c.id = cs.class_id
      WHERE cs.class_id = ?
        AND cs.student_id = ?
        AND c.church_id = ?
        AND s.church_id = ?
      ORDER BY cs.id DESC
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [classId, studentId, churchId, churchId],
  );

  return rows[0] || null;
};

// The key rule: only inspect active classes in the
// target academic year.
const getActiveStudentRelation = async (
  connection,
  studentId,
  churchId,
  academicYear,
  excludeClassId = null,
  forUpdate = false,
) => {
  if (!academicYear) return null;

  let sql = `
    SELECT
      cs.id,
      cs.class_id,
      cs.student_id,
      cs.status,
      cs.joined_at,
      cs.left_at,
      c.name AS class_name,
      c.code AS class_code,
      c.academic_year
    FROM class_students cs
    INNER JOIN classes c
      ON c.id = cs.class_id
    INNER JOIN students s
      ON s.id = cs.student_id
    WHERE cs.student_id = ?
      AND cs.status = 'studying'
      AND cs.left_at IS NULL
      AND c.church_id = ?
      AND s.church_id = ?
      AND c.academic_year = ?
  `;

  const params = [studentId, churchId, churchId, academicYear];

  if (excludeClassId) {
    sql += " AND cs.class_id <> ?";
    params.push(excludeClassId);
  }

  sql += `
    ORDER BY cs.id DESC
    LIMIT 1
    ${forUpdate ? "FOR UPDATE" : ""}
  `;

  const [rows] = await connection.query(sql, params);
  return rows[0] || null;
};

const getStudentRelations = async (connection, studentId, churchId) => {
  const [rows] = await connection.query(
    `
      SELECT
        cs.id,
        cs.class_id,
        cs.student_id,
        cs.status,
        cs.joined_at,
        cs.left_at,
        c.name AS class_name,
        c.code AS class_code,
        c.category AS class_category,
        c.status AS class_status,
        c.academic_year,
        c.church_id
      FROM class_students cs
      INNER JOIN classes c
        ON c.id = cs.class_id
      INNER JOIN students s
        ON s.id = cs.student_id
      WHERE cs.student_id = ?
        AND c.church_id = ?
        AND s.church_id = ?
      ORDER BY c.academic_year DESC, cs.id DESC
    `,
    [studentId, churchId, churchId],
  );

  return rows;
};

// Set an existing enrollment's final status consistently.
const finishRelation = async (
  connection,
  relationId,
  status = "transferred",
) => {
  await connection.query(
    `
      UPDATE class_students
      SET status = ?,
          left_at = COALESCE(left_at, CURRENT_DATE())
      WHERE id = ?
    `,
    [status, relationId],
  );
};

// =====================================================
// 1. GET STUDENTS BY CLASS
// =====================================================

exports.getStudentsByClass = async (req, res) => {
  const { classId } = req.params;
  const churchId = req.user?.church_id;

  if (!classId || !churchId) {
    return res.status(400).json({
      success: false,
      message: "Thiếu thông tin lớp học hoặc giáo xứ",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    // Lấy thông tin lớp học và năm học
    const classInfo = await getClassById(connection, classId, churchId);

    if (!classInfo) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    if (!classInfo.academic_year) {
      return res.status(400).json({
        success: false,
        message: "Lớp học chưa được thiết lập năm học",
      });
    }

    // Lấy lịch học của lớp
    const schedules = await getSchedulesByClassId(
      connection,
      classId,
      churchId,
    );
    // Chỉ lấy học sinh đang học tại lớp trong năm học hiện tại
    const [students] = await connection.execute(
      `
      SELECT
        s.*,
        cs.id AS class_student_id,
        cs.status AS enrollment_status,
        cs.joined_at,
        cs.left_at,
        c.id AS current_class_id,
        c.name AS class_name,
        c.code AS class_code,
        c.category AS class_category,
        c.status AS class_status,
        c.academic_year AS class_academic_year
      FROM class_students cs
      INNER JOIN students s
        ON s.id = cs.student_id
      INNER JOIN classes c
        ON c.id = cs.class_id
      WHERE cs.class_id = ?
        AND c.church_id = ?
        AND s.church_id = ?
        AND c.academic_year = ?
        AND cs.status = 'studying'
        AND cs.left_at IS NULL
      ORDER BY s.name ASC, s.id ASC
      `,
      [classId, churchId, churchId, classInfo.academic_year],
    );

    // Giữ định dạng dữ liệu học sinh theo controller hiện tại
    const formattedStudents = formatStudents(students);

    return res.status(200).json({
      success: true,
      data: {
        class: classInfo,
        schedules,
        students: formattedStudents,
        total: formattedStudents.length,
      },
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách học sinh theo lớp:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách học sinh",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 2. GET CLASSES BY STUDENT
// =====================================================

exports.getClassesByStudent = async (req, res) => {
  const requestId = createRequestId("GET-STUDENT-CLASSES");
  let connection;

  try {
    const studentId = toPositiveInt(req.params.studentId);
    const churchId = toPositiveInt(getChurchId(req));

    if (!studentId || !churchId) {
      return res.status(400).json({
        success: false,
        message: "studentId hoặc giáo xứ không hợp lệ",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();

    const student = await getStudentById(connection, studentId, churchId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
        request_id: requestId,
      });
    }

    const relations = await getStudentRelations(
      connection,
      studentId,
      churchId,
    );

    // Avoid one query per class: load schedules in one query.
    const classIds = [...new Set(relations.map((item) => item.class_id))];

    let schedulesByClass = new Map();

    if (classIds.length > 0) {
      const placeholders = classIds.map(() => "?").join(",");

      const [schedules] = await connection.query(
        `
          SELECT cs.*
          FROM class_schedules cs
          INNER JOIN classes c
            ON c.id = cs.class_id
          WHERE c.church_id = ?
            AND cs.class_id IN (${placeholders})
          ORDER BY cs.day_of_week, cs.start_time, cs.id
        `,
        [churchId, ...classIds],
      );

      schedulesByClass = new Map();

      for (const schedule of schedules) {
        const list = schedulesByClass.get(schedule.class_id) || [];
        list.push(schedule);
        schedulesByClass.set(schedule.class_id, list);
      }
    }

    const classes = relations.map((relation) => ({
      ...relation,
      schedules: schedulesByClass.get(relation.class_id) || [],
    }));

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách lớp của học sinh thành công",
      request_id: requestId,
      data: {
        student,
        classes,
        total: classes.length,
      },
    });
  } catch (error) {
    return sendServerError(
      res,
      requestId,
      error,
      "GET CLASSES BY STUDENT ERROR",
    );
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// 3. ADD STUDENT TO CLASS
// =====================================================

exports.addStudentToClass = async (req, res) => {
  const requestId = createRequestId("ADD-STUDENT-CLASS");
  let connection;

  try {
    const classId = toPositiveInt(req.body.class_id);
    const studentId = toPositiveInt(req.body.student_id);
    const churchId = toPositiveInt(getChurchId(req));
    const status = req.body.status || "studying";

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "class_id và student_id là bắt buộc",
        request_id: requestId,
      });
    }

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
        request_id: requestId,
      });
    }

    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
        allowed_status: ALLOWED_STATUS,
        request_id: requestId,
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const classInfo = await getClassById(connection, classId, churchId, true);

    if (!classInfo) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
        request_id: requestId,
      });
    }

    const student = await getStudentById(connection, studentId, churchId, true);

    if (!student) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
        request_id: requestId,
      });
    }

    const existing = await getClassStudentRelation(
      connection,
      classId,
      studentId,
      churchId,
      true,
    );

    if (
      existing &&
      existing.status === "studying" &&
      existing.left_at === null
    ) {
      await safeRollback(connection);
      return res.status(409).json({
        success: false,
        code: "ALREADY_IN_CLASS",
        message: "Học sinh đã ở trong lớp này",
        request_id: requestId,
      });
    }

    if (status === "studying") {
      if (!classInfo.academic_year) {
        await safeRollback(connection);
        return res.status(400).json({
          success: false,
          code: "CLASS_YEAR_REQUIRED",
          message: "Lớp chưa được cấu hình năm học",
          request_id: requestId,
        });
      }

      const activeOther = await getActiveStudentRelation(
        connection,
        studentId,
        churchId,
        classInfo.academic_year,
        classId,
        true,
      );

      if (activeOther) {
        await safeRollback(connection);
        return res.status(409).json({
          success: false,
          code: "STUDENT_ALREADY_STUDYING",
          message: `Học sinh đang học lớp ${activeOther.class_name} trong năm học ${activeOther.academic_year}`,
          data: activeOther,
          request_id: requestId,
        });
      }
    }

    const joinedAt =
      status === "studying" ? new Date() : existing?.joined_at || null;

    const leftAt = status === "studying" ? null : new Date();

    let relationId;

    if (existing) {
      await connection.query(
        `
          UPDATE class_students
          SET status = ?,
              joined_at = ?,
              left_at = ?
          WHERE id = ?
        `,
        [status, joinedAt, leftAt, existing.id],
      );

      relationId = existing.id;
    } else {
      const [insertResult] = await connection.query(
        `
          INSERT INTO class_students (
            class_id,
            student_id,
            status,
            joined_at,
            left_at
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [classId, studentId, status, joinedAt, leftAt],
      );

      relationId = insertResult.insertId;
    }

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: existing ? "REACTIVATE_STUDENT_CLASS" : "ADD_STUDENT_TO_CLASS",
      description: `Thêm học sinh ${student.name} vào lớp ${classInfo.name}`,
      user_id: req.user?.id || null,
    });

    return res.status(existing ? 200 : 201).json({
      success: true,
      message: existing
        ? "Đã cập nhật quan hệ học sinh trong lớp"
        : "Thêm học sinh vào lớp thành công",
      request_id: requestId,
      data: {
        id: relationId,
        class_id: classId,
        student_id: studentId,
        status,
        academic_year: classInfo.academic_year,
        student,
      },
    });
  } catch (error) {
    await safeRollback(connection);
    return sendServerError(res, requestId, error, "ADD STUDENT TO CLASS ERROR");
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// 4. UPDATE CLASS STUDENT
// =====================================================

exports.updateClassStudent = async (req, res) => {
  const requestId = createRequestId("UPDATE-CLASS-STUDENT");
  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);
    const studentId = toPositiveInt(req.params.studentId);
    const churchId = toPositiveInt(getChurchId(req));

    if (!classId || !studentId || !churchId) {
      return res.status(400).json({
        success: false,
        message: "Thông tin cập nhật không hợp lệ",
        request_id: requestId,
      });
    }

    const hasStatus = req.body.status !== undefined;
    const hasJoinedAt = req.body.joined_at !== undefined;
    const hasLeftAt = req.body.left_at !== undefined;

    if (!hasStatus && !hasJoinedAt && !hasLeftAt) {
      return res.status(400).json({
        success: false,
        message: "Không có dữ liệu cần cập nhật",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const classInfo = await getClassById(connection, classId, churchId, true);

    if (!classInfo) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
        request_id: requestId,
      });
    }

    const student = await getStudentById(connection, studentId, churchId, true);

    if (!student) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
        request_id: requestId,
      });
    }

    const relation = await getClassStudentRelation(
      connection,
      classId,
      studentId,
      churchId,
      true,
    );

    if (!relation) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp",
        request_id: requestId,
      });
    }

    const nextStatus = hasStatus ? req.body.status : relation.status;

    if (!ALLOWED_STATUS.includes(nextStatus)) {
      await safeRollback(connection);
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
        allowed_status: ALLOWED_STATUS,
        request_id: requestId,
      });
    }

    if (nextStatus === "studying") {
      if (!classInfo.academic_year) {
        await safeRollback(connection);
        return res.status(400).json({
          success: false,
          code: "CLASS_YEAR_REQUIRED",
          message: "Lớp chưa được cấu hình năm học",
          request_id: requestId,
        });
      }

      const activeOther = await getActiveStudentRelation(
        connection,
        studentId,
        churchId,
        classInfo.academic_year,
        classId,
        true,
      );

      if (activeOther) {
        await safeRollback(connection);
        return res.status(409).json({
          success: false,
          code: "STUDENT_ALREADY_STUDYING",
          message: `Học sinh đang học lớp ${activeOther.class_name} trong cùng năm học`,
          data: activeOther,
          request_id: requestId,
        });
      }
    }

    let joinedAt = hasJoinedAt
      ? req.body.joined_at || null
      : relation.joined_at;

    let leftAt = hasLeftAt ? req.body.left_at || null : relation.left_at;

    if (nextStatus === "studying") {
      if (relation.status !== "studying" || relation.left_at !== null) {
        joinedAt = hasJoinedAt ? req.body.joined_at || new Date() : new Date();
      }

      // An active relation must not have a leaving date.
      leftAt = null;
    } else if (
      relation.status === "studying" &&
      relation.left_at === null &&
      !hasLeftAt
    ) {
      leftAt = new Date();
    }

    await connection.query(
      `
        UPDATE class_students
        SET status = ?,
            joined_at = ?,
            left_at = ?
        WHERE id = ?
      `,
      [nextStatus, joinedAt, leftAt, relation.id],
    );

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "UPDATE_CLASS_STUDENT",
      description: `Cập nhật quan hệ học sinh ${student.name} trong lớp ${classInfo.name}`,
      user_id: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Cập nhật học sinh thành công",
      request_id: requestId,
    });
  } catch (error) {
    await safeRollback(connection);
    return sendServerError(res, requestId, error, "UPDATE CLASS STUDENT ERROR");
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// 5. CHANGE ONE STUDENT CLASS
// =====================================================

exports.changeClassStudent = async (req, res) => {
  const requestId = createRequestId("CHANGE-CLASS-STUDENT");
  let connection;

  try {
    const oldClassId = toPositiveInt(req.params.classId);
    const studentId = toPositiveInt(req.params.studentId);
    const newClassId = toPositiveInt(
      req.body.new_class_id ?? req.body.newClassId,
    );
    const churchId = toPositiveInt(getChurchId(req));

    if (!oldClassId || !studentId || !newClassId || !churchId) {
      return res.status(400).json({
        success: false,
        message: "Thông tin chuyển lớp không hợp lệ",
        request_id: requestId,
      });
    }

    if (oldClassId === newClassId) {
      return res.status(400).json({
        success: false,
        message: "Lớp mới phải khác lớp hiện tại",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const oldClass = await getClassById(connection, oldClassId, churchId, true);

    const newClass = await getClassById(connection, newClassId, churchId, true);

    if (!oldClass || !newClass) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp hiện tại hoặc lớp mới",
        request_id: requestId,
      });
    }

    // Moving between academic years should be a new enrollment,
    // not a transfer that overwrites the previous year's status.
    if (oldClass.academic_year !== newClass.academic_year) {
      await safeRollback(connection);
      return res.status(400).json({
        success: false,
        code: "ACADEMIC_YEAR_MISMATCH",
        message:
          "Hai lớp khác năm học. Hãy thêm học sinh vào lớp của năm học mới thay vì chuyển lớp.",
        request_id: requestId,
      });
    }

    if (!newClass.academic_year) {
      await safeRollback(connection);
      return res.status(400).json({
        success: false,
        code: "CLASS_YEAR_REQUIRED",
        message: "Lớp chưa được cấu hình năm học",
        request_id: requestId,
      });
    }

    const student = await getStudentById(connection, studentId, churchId, true);

    if (!student) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
        request_id: requestId,
      });
    }

    const oldRelation = await getClassStudentRelation(
      connection,
      oldClassId,
      studentId,
      churchId,
      true,
    );

    if (
      !oldRelation ||
      oldRelation.status !== "studying" ||
      oldRelation.left_at !== null
    ) {
      await safeRollback(connection);
      return res.status(409).json({
        success: false,
        code: "SOURCE_RELATION_NOT_ACTIVE",
        message: "Học sinh không còn đang học tại lớp hiện tại",
        request_id: requestId,
      });
    }

    const targetRelation = await getClassStudentRelation(
      connection,
      newClassId,
      studentId,
      churchId,
      true,
    );

    if (
      targetRelation &&
      targetRelation.status === "studying" &&
      targetRelation.left_at === null
    ) {
      await safeRollback(connection);
      return res.status(409).json({
        success: false,
        code: "ALREADY_IN_TARGET_CLASS",
        message: "Học sinh đã đang học lớp mới",
        request_id: requestId,
      });
    }

    const activeOther = await getActiveStudentRelation(
      connection,
      studentId,
      churchId,
      newClass.academic_year,
      oldClassId,
      true,
    );

    if (activeOther) {
      await safeRollback(connection);
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_ACTIVE_CLASS",
        message: `Học sinh đang học lớp ${activeOther.class_name} trong cùng năm học`,
        data: activeOther,
        request_id: requestId,
      });
    }

    // Preserve the old class relation as transfer history.
    await finishRelation(connection, oldRelation.id, "transferred");

    let newRelationId;

    if (targetRelation) {
      await connection.query(
        `
          UPDATE class_students
          SET status = 'studying',
              joined_at = CURRENT_DATE(),
              left_at = NULL
          WHERE id = ?
        `,
        [targetRelation.id],
      );

      newRelationId = targetRelation.id;
    } else {
      const [insertResult] = await connection.query(
        `
          INSERT INTO class_students (
            class_id,
            student_id,
            status,
            joined_at,
            left_at
          )
          VALUES (?, ?, 'studying', CURRENT_DATE(), NULL)
        `,
        [newClassId, studentId],
      );

      newRelationId = insertResult.insertId;
    }

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "CHANGE_CLASS_STUDENT",
      description: `Chuyển học sinh ${student.name} từ lớp ${oldClass.name} sang lớp ${newClass.name}`,
      user_id: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Chuyển lớp thành công",
      request_id: requestId,
      data: {
        student_id: studentId,
        old_class_id: oldClassId,
        new_class_id: newClassId,
        old_relation_status: "transferred",
        new_relation_id: newRelationId,
        academic_year: newClass.academic_year,
      },
    });
  } catch (error) {
    await safeRollback(connection);
    return sendServerError(res, requestId, error, "CHANGE CLASS STUDENT ERROR");
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// 6. CHANGE MULTIPLE STUDENTS
// =====================================================

exports.changeClassStudents = async (req, res) => {
  const requestId = createRequestId("CHANGE-CLASS-STUDENTS");
  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);
    const churchId = toPositiveInt(getChurchId(req));

    const rawIds = Array.isArray(req.body.student_ids)
      ? req.body.student_ids
      : Array.isArray(req.body.studentIds)
        ? req.body.studentIds
        : [];

    const convertedIds = rawIds.map(toPositiveInt);

    if (convertedIds.some((id) => !id)) {
      return res.status(400).json({
        success: false,
        message: "Danh sách có student_id không hợp lệ",
        request_id: requestId,
      });
    }

    const studentIds = [...new Set(convertedIds)];

    if (!classId || !churchId) {
      return res.status(400).json({
        success: false,
        message: "classId hoặc giáo xứ không hợp lệ",
        request_id: requestId,
      });
    }

    if (studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh không được để trống",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const targetClass = await getClassById(connection, classId, churchId, true);

    if (!targetClass) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp đích",
        request_id: requestId,
      });
    }

    if (!targetClass.academic_year) {
      await safeRollback(connection);
      return res.status(400).json({
        success: false,
        code: "CLASS_YEAR_REQUIRED",
        message: "Lớp đích chưa có năm học",
        request_id: requestId,
      });
    }

    // Lock students in ascending ID order to reduce deadlocks.
    const placeholders = studentIds.map(() => "?").join(",");

    const [studentRows] = await connection.query(
      `
        SELECT s.*
        FROM students s
        WHERE s.church_id = ?
          AND s.id IN (${placeholders})
        ORDER BY s.id
        FOR UPDATE
      `,
      [churchId, ...studentIds],
    );

    const studentMap = new Map(
      studentRows.map((student) => [
        Number(student.id),
        formatStudent(student),
      ]),
    );

    const result = {
      total: studentIds.length,
      success: [],
      alreadyInTarget: [],
      failed: [],
    };

    for (const studentId of studentIds) {
      const student = studentMap.get(studentId);

      if (!student) {
        result.failed.push({
          student_id: studentId,
          reason: "STUDENT_NOT_FOUND",
        });
        continue;
      }

      const targetRelation = await getClassStudentRelation(
        connection,
        classId,
        studentId,
        churchId,
        true,
      );

      if (
        targetRelation &&
        targetRelation.status === "studying" &&
        targetRelation.left_at === null
      ) {
        result.alreadyInTarget.push({
          student_id: studentId,
          student,
        });
        continue;
      }

      const activeRelation = await getActiveStudentRelation(
        connection,
        studentId,
        churchId,
        targetClass.academic_year,
        classId,
        true,
      );

      if (activeRelation) {
        // This is a transfer within the same academic year.
        await finishRelation(connection, activeRelation.id, "transferred");

        if (targetRelation) {
          await connection.query(
            `
              UPDATE class_students
              SET status = 'studying',
                  joined_at = CURRENT_DATE(),
                  left_at = NULL
              WHERE id = ?
            `,
            [targetRelation.id],
          );
        } else {
          await connection.query(
            `
              INSERT INTO class_students (
                class_id,
                student_id,
                status,
                joined_at,
                left_at
              )
              VALUES (?, ?, 'studying', CURRENT_DATE(), NULL)
            `,
            [classId, studentId],
          );
        }

        result.success.push({
          student_id: studentId,
          student,
          action: "transferred",
          old_class_id: activeRelation.class_id,
          old_class_name: activeRelation.class_name,
        });

        continue;
      }

      // No active relation in this academic year:
      // create/reactivate enrollment without touching other years.
      if (targetRelation) {
        await connection.query(
          `
            UPDATE class_students
            SET status = 'studying',
                joined_at = CURRENT_DATE(),
                left_at = NULL
            WHERE id = ?
          `,
          [targetRelation.id],
        );

        result.success.push({
          student_id: studentId,
          student,
          action: "reactivated",
        });
      } else {
        await connection.query(
          `
            INSERT INTO class_students (
              class_id,
              student_id,
              status,
              joined_at,
              left_at
            )
            VALUES (?, ?, 'studying', CURRENT_DATE(), NULL)
          `,
          [classId, studentId],
        );

        result.success.push({
          student_id: studentId,
          student,
          action: "inserted",
        });
      }
    }

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "CHANGE_CLASS_STUDENTS",
      description: `Xử lý chuyển học sinh vào lớp ${targetClass.name}: ${result.success.length} thành công`,
      user_id: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Xử lý danh sách học sinh hoàn tất",
      request_id: requestId,
      data: {
        class: targetClass,
        summary: {
          total: result.total,
          success: result.success.length,
          already_in_target: result.alreadyInTarget.length,
          failed: result.failed.length,
        },
        result,
      },
    });
  } catch (error) {
    await safeRollback(connection);
    return sendServerError(
      res,
      requestId,
      error,
      "CHANGE MULTIPLE STUDENTS ERROR",
    );
  } finally {
    if (connection) connection.release();
  }
};
// =====================================================
// 9. GET ALL STUDENTS BY CHURCH AND ACADEMIC YEAR
// Bao gồm cả học sinh chưa được xếp lớp
// =====================================================

exports.getStudentsByChurch = async (req, res) => {
  const requestId = createRequestId("GET-STUDENTS-BY-CHURCH");
  let connection;

  try {
    const churchId = toPositiveInt(getChurchId(req));
    const academicYear = String(req.query.academic_year || "").trim();

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
        request_id: requestId,
      });
    }

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        code: "ACADEMIC_YEAR_REQUIRED",
        message: "Vui lòng truyền năm học, ví dụ 2026-2027",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();

    // Lấy tất cả học sinh thuộc giáo xứ.
    // LEFT JOIN bảo đảm học sinh chưa có lớp vẫn xuất hiện.
    const [rows] = await connection.query(
      `
        SELECT
          s.*,

          current_relation.id AS class_student_id,
          current_relation.class_id AS current_class_id,
          current_relation.enrollment_status,
          current_relation.joined_at,
          current_relation.left_at,

          current_relation.class_name,
          current_relation.class_code,
          current_relation.class_category,
          current_relation.class_academic_year,

          CASE
            WHEN current_relation.id IS NULL THEN 1
            ELSE 0
          END AS is_unassigned

        FROM students s

        LEFT JOIN (
          SELECT
            cs.id,
            cs.student_id,
            cs.class_id,
            cs.status AS enrollment_status,
            cs.joined_at,
            cs.left_at,

            c.name AS class_name,
            c.code AS class_code,
            c.category AS class_category,
            c.academic_year AS class_academic_year

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE c.church_id = ?
            AND c.academic_year = ?
            AND cs.status = 'studying'
            AND cs.left_at IS NULL

            AND cs.id = (
              SELECT cs2.id
              FROM class_students cs2

              INNER JOIN classes c2
                ON c2.id = cs2.class_id

              WHERE cs2.student_id = cs.student_id
                AND c2.church_id = c.church_id
                AND c2.academic_year = c.academic_year
                AND cs2.status = 'studying'
                AND cs2.left_at IS NULL

              ORDER BY
                cs2.joined_at DESC,
                cs2.id DESC

              LIMIT 1
            )
        ) AS current_relation
          ON current_relation.student_id = s.id

        WHERE s.church_id = ?

        ORDER BY
          is_unassigned DESC,
          s.name ASC,
          s.id ASC
      `,
      [churchId, academicYear, churchId],
    );

    const students = formatStudents(rows);

    const unassignedStudents = students.filter(
      (student) => Number(student.is_unassigned) === 1,
    );

    const assignedStudents = students.filter(
      (student) => Number(student.is_unassigned) === 0,
    );

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách học sinh theo năm học thành công",
      request_id: requestId,

      data: {
        academic_year: academicYear,

        summary: {
          total_students: students.length,
          assigned_students: assignedStudents.length,
          unassigned_students: unassignedStudents.length,
        },

        students,
        assigned_students: assignedStudents,
        unassigned_students: unassignedStudents,
      },
    });
  } catch (error) {
    return sendServerError(
      res,
      requestId,
      error,
      "GET STUDENTS BY CHURCH ERROR",
    );
  } finally {
    if (connection) connection.release();
  }
};
// =====================================================
// 7. REMOVE STUDENT FROM CLASS
// =====================================================

exports.removeStudentFromClass = async (req, res) => {
  const requestId = createRequestId("REMOVE-STUDENT-CLASS");
  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);
    const studentId = toPositiveInt(req.params.studentId);
    const churchId = toPositiveInt(getChurchId(req));

    if (!classId || !studentId || !churchId) {
      return res.status(400).json({
        success: false,
        message: "Thông tin không hợp lệ",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const classInfo = await getClassById(connection, classId, churchId, true);

    if (!classInfo) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
        request_id: requestId,
      });
    }

    const student = await getStudentById(connection, studentId, churchId, true);

    if (!student) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
        request_id: requestId,
      });
    }

    const relation = await getClassStudentRelation(
      connection,
      classId,
      studentId,
      churchId,
      true,
    );

    if (!relation) {
      await safeRollback(connection);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp",
        request_id: requestId,
      });
    }

    // Preserve history: do not hard-delete the relation.
    await finishRelation(connection, relation.id, "dropped");

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "REMOVE_STUDENT_FROM_CLASS",
      description: `Cho học sinh ${student.name} thôi học lớp ${classInfo.name}`,
      user_id: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái học sinh trong lớp",
      request_id: requestId,
      data: {
        class_student_id: relation.id,
        class_id: classId,
        student_id: studentId,
        status: "dropped",
      },
    });
  } catch (error) {
    await safeRollback(connection);
    return sendServerError(
      res,
      requestId,
      error,
      "REMOVE STUDENT FROM CLASS ERROR",
    );
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// 8. CLEAN DUPLICATE ACTIVE CLASSES
// =====================================================

exports.cleanupDuplicateActiveClasses = async (req, res) => {
  const requestId = createRequestId("CLEAN-DUPLICATE-CLASS");
  let connection;

  try {
    const churchId = toPositiveInt(getChurchId(req));

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Group by academic year, not only student_id.
    const [duplicates] = await connection.query(
      `
        SELECT
          cs.student_id,
          c.academic_year,
          COUNT(*) AS total_active
        FROM class_students cs
        INNER JOIN classes c
          ON c.id = cs.class_id
        INNER JOIN students s
          ON s.id = cs.student_id
        WHERE cs.status = 'studying'
          AND cs.left_at IS NULL
          AND c.church_id = ?
          AND s.church_id = ?
        GROUP BY cs.student_id, c.academic_year
        HAVING COUNT(*) > 1
        ORDER BY cs.student_id, c.academic_year
      `,
      [churchId, churchId],
    );

    const cleaned = [];

    for (const duplicate of duplicates) {
      // Lock the student row before modifying their enrollments.
      const student = await getStudentById(
        connection,
        duplicate.student_id,
        churchId,
        true,
      );

      if (!student) continue;

      const [activeRelations] = await connection.query(
        `
          SELECT
            cs.id,
            cs.class_id,
            cs.student_id,
            cs.joined_at,
            c.name AS class_name,
            c.academic_year
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
          INNER JOIN students s
            ON s.id = cs.student_id
          WHERE cs.student_id = ?
            AND cs.status = 'studying'
            AND cs.left_at IS NULL
            AND c.church_id = ?
            AND s.church_id = ?
            AND c.academic_year = ?
          ORDER BY
            cs.joined_at DESC,
            cs.id DESC
          FOR UPDATE
        `,
        [duplicate.student_id, churchId, churchId, duplicate.academic_year],
      );

      if (activeRelations.length <= 1) continue;

      // Keep the most recently joined relation.
      // Mark the rest transferred instead of deleting them.
      const keep = activeRelations[0];
      const toClose = activeRelations.slice(1);

      for (const relation of toClose) {
        await finishRelation(connection, relation.id, "transferred");
      }

      cleaned.push({
        student_id: duplicate.student_id,
        student_name: student.name,
        academic_year: duplicate.academic_year,
        kept: {
          id: keep.id,
          class_id: keep.class_id,
          class_name: keep.class_name,
        },
        cleaned: toClose.map((relation) => ({
          id: relation.id,
          class_id: relation.class_id,
          class_name: relation.class_name,
          status: "transferred",
        })),
      });
    }

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "CLEAN_DUPLICATE_ACTIVE_CLASSES",
      description: `Dọn liên kết lớp đang học bị trùng: ${cleaned.length} nhóm`,
      user_id: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Đã kiểm tra và xử lý các nhóm lớp đang học trùng",
      request_id: requestId,
      data: {
        duplicate_groups_found: duplicates.length,
        cleaned_groups: cleaned.length,
        cleaned,
      },
    });
  } catch (error) {
    await safeRollback(connection);
    return sendServerError(
      res,
      requestId,
      error,
      "CLEAN DUPLICATE ACTIVE CLASSES ERROR",
    );
  } finally {
    if (connection) connection.release();
  }
};

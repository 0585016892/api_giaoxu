const db = require("../config/db");
const { writeLog } = require("../utils/activityChurchLogger");

// =====================================================
// CONSTANTS
// =====================================================

const ALLOWED_STATUS = ["studying", "completed", "transferred", "dropped"];

// =====================================================
// REQUEST ID
// =====================================================

const createRequestId = (prefix = "REQ") => {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;
};

// =====================================================
// HELPERS
// =====================================================

const getChurchId = (req) => {
  return req.user?.church_id ?? req.user?.parish_id ?? null;
};

const toPositiveInt = (value) => {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
};

const safeWriteLog = async (payload) => {
  try {
    await writeLog(payload);
  } catch (error) {
    console.error("⚠️ WRITE ACTIVITY LOG ERROR:", error.message);
  }
};

const safeRollback = async (connection) => {
  if (!connection) return;

  try {
    await connection.rollback();
  } catch (error) {
    console.error("⚠️ ROLLBACK ERROR:", error.message);
  }
};

// =====================================================
// AVATAR URL
// =====================================================

const getApiPublicUrl = () => {
  return (
    process.env.API_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    process.env.BASE_URL ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");
};

const getUploadsPath = () => {
  return (process.env.UPLOADS_PATH || "/uploads")
    .replace(/^\/?/, "/")
    .replace(/\/+$/, "");
};

const normalizeAvatarUrl = (avatar) => {
  if (!avatar) {
    return null;
  }

  let value = String(avatar).trim();

  if (!value) {
    return null;
  }

  // URL đầy đủ
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Data URL
  if (value.startsWith("data:")) {
    return value;
  }

  const baseUrl = getApiPublicUrl();
  const uploadsPath = getUploadsPath();

  // Chuẩn hóa slash
  value = value.replace(/^\/+/, "");

  // Nếu DB đã lưu uploads/...
  if (value.toLowerCase().startsWith("uploads/")) {
    value = value.substring("uploads/".length);
  }

  // Nếu DB lưu đường dẫn có /uploads/...
  if (
    value
      .toLowerCase()
      .startsWith(uploadsPath.replace(/^\/+/, "").toLowerCase() + "/")
  ) {
    value = value.substring(uploadsPath.replace(/^\/+/, "").length + 1);
  }

  return `${baseUrl}${uploadsPath}/${value}`;
};

// =====================================================
// ADD AVATAR URL TO STUDENT
// =====================================================

const formatStudent = (student) => {
  if (!student) {
    return null;
  }

  return {
    ...student,

    avatar_url: normalizeAvatarUrl(student.avatar),
  };
};

// =====================================================
// FORMAT STUDENTS
// =====================================================

const formatStudents = (students = []) => {
  return students.map(formatStudent);
};

// =====================================================
// SERVER ERROR
// =====================================================

const sendServerError = (res, requestId, error, title) => {
  console.error("");
  console.error(
    "================================================================",
  );
  console.error(`💥 [${requestId}] ${title}`);
  console.error(
    "================================================================",
  );
  console.error("MESSAGE:", error.message);
  console.error("CODE:", error.code);
  console.error("ERRNO:", error.errno);
  console.error("SQL STATE:", error.sqlState);
  console.error("SQL MESSAGE:", error.sqlMessage);
  console.error(
    "================================================================",
  );

  return res.status(500).json({
    success: false,
    message: "Lỗi máy chủ",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
    request_id: requestId,
  });
};

// =====================================================
// GET CLASS
// =====================================================

const getClassById = async (connection, classId, churchId) => {
  const [rows] = await connection.query(
    `
      SELECT
        c.*
      FROM classes c
      WHERE c.id = ?
        AND c.church_id = ?
      LIMIT 1
    `,
    [classId, churchId],
  );

  return rows[0] || null;
};

// =====================================================
// GET STUDENT
// =====================================================

const getStudentById = async (connection, studentId, churchId) => {
  const [rows] = await connection.query(
    `
      SELECT
        s.*
      FROM students s
      WHERE s.id = ?
        AND s.church_id = ?
      LIMIT 1
    `,
    [studentId, churchId],
  );

  return formatStudent(rows[0] || null);
};

// =====================================================
// GET SCHEDULES BY CLASS
// =====================================================

const getSchedulesByClassId = async (connection, classId, churchId) => {
  const [rows] = await connection.query(
    `
      SELECT
        cs.*
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

// =====================================================
// GET CLASS STUDENT RELATION
// =====================================================

const getClassStudentRelation = async (
  connection,
  classId,
  studentId,
  churchId,
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
    `,
    [classId, studentId, churchId, churchId],
  );

  return rows[0] || null;
};

// =====================================================
// GET ALL RELATIONS OF STUDENT
// =====================================================

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

      ORDER BY
        c.academic_year DESC,
        cs.id DESC
    `,
    [studentId, churchId, churchId],
  );

  return rows;
};

// =====================================================
// GET ACTIVE RELATION
// =====================================================

const getActiveStudentRelation = async (
  connection,
  studentId,
  churchId,
  excludeClassId = null,
) => {
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

    WHERE
      cs.student_id = ?
      AND cs.status = 'studying'
      AND cs.left_at IS NULL
      AND c.church_id = ?
      AND s.church_id = ?
  `;

  const params = [studentId, churchId, churchId];

  if (excludeClassId) {
    sql += `
      AND cs.class_id <> ?
    `;

    params.push(excludeClassId);
  }

  sql += `
    ORDER BY cs.id DESC
    LIMIT 1
  `;

  const [rows] = await connection.query(sql, params);

  return rows[0] || null;
};

// =====================================================
// GET ALL ACTIVE RELATIONS
// =====================================================

const getAllActiveStudentRelations = async (
  connection,
  studentId,
  churchId,
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

        c.name AS class_name,
        c.code AS class_code,
        c.academic_year

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      INNER JOIN students s
        ON s.id = cs.student_id

      WHERE
        cs.student_id = ?
        AND cs.status = 'studying'
        AND cs.left_at IS NULL
        AND c.church_id = ?
        AND s.church_id = ?

      ORDER BY cs.id DESC
    `,
    [studentId, churchId, churchId],
  );

  return rows;
};

// =====================================================
// 1. GET STUDENTS BY CLASS
// =====================================================

exports.getStudentsByClass = async (req, res) => {
  const requestId = createRequestId("GET-CLASS-STUDENTS");

  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);

    const churchId = toPositiveInt(getChurchId(req));

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
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

    connection = await db.getConnection();

    // ================================
    // LẤY LỚP
    // ================================

    const classInfo = await getClassById(connection, classId, churchId);

    if (!classInfo) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
        request_id: requestId,
      });
    }

    // ================================
    // LẤY LỊCH HỌC
    // ================================

    const schedules = await getSchedulesByClassId(
      connection,
      classId,
      churchId,
    );

    // ================================
    // LẤY FULL HỌC SINH
    // ================================

    const [rows] = await connection.query(
      `
          SELECT
            s.*,

            -- ==========================
            -- QUAN HỆ LỚP
            -- ==========================

            cs.id AS class_student_id,
            cs.class_id,
            cs.student_id,

            cs.status AS enrollment_status,
            cs.joined_at,
            cs.left_at,

            -- ==========================
            -- THÔNG TIN LỚP
            -- ==========================

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

          WHERE
            cs.class_id = ?
            AND c.id = ?
            AND c.church_id = ?
            AND s.church_id = ?

          ORDER BY
            CASE cs.status
              WHEN 'studying' THEN 1
              WHEN 'completed' THEN 2
              WHEN 'transferred' THEN 3
              WHEN 'dropped' THEN 4
              ELSE 5
            END,

            s.name ASC,
            s.id ASC
        `,
      [classId, classId, churchId, churchId],
    );

    const students = formatStudents(rows);

    console.log("");
    console.log("==========================================================");
    console.log(`📚 [${requestId}] GET STUDENTS BY CLASS`);
    console.log("==========================================================");
    console.log("CLASS ID:", classId);
    console.log("CLASS:", classInfo.name);
    console.log("ACADEMIC YEAR:", classInfo.academic_year);
    console.log("STUDENT COUNT:", students.length);
    console.log("==========================================================");

    return res.status(200).json({
      success: true,

      message:
        students.length > 0
          ? `Lấy danh sách học sinh lớp "${classInfo.name}" thành công`
          : `Lớp "${classInfo.name}" hiện chưa có học sinh`,

      request_id: requestId,

      data: {
        class: classInfo,
        schedules,

        students,

        total: students.length,
      },
    });
  } catch (error) {
    return sendServerError(
      res,
      requestId,
      error,
      "GET STUDENTS BY CLASS ERROR",
    );
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

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
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

    const classes = [];

    for (const relation of relations) {
      const schedules = await getSchedulesByClassId(
        connection,
        relation.class_id,
        churchId,
      );

      classes.push({
        ...relation,
        schedules,
      });
    }

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
    if (connection) {
      connection.release();
    }
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

    const classInfo = await getClassById(connection, classId, churchId);

    if (!classInfo) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
        request_id: requestId,
      });
    }

    const student = await getStudentById(connection, studentId, churchId);

    if (!student) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
        request_id: requestId,
      });
    }

    const existingRelation = await getClassStudentRelation(
      connection,
      classId,
      studentId,
      churchId,
    );

    // ĐÃ CÓ QUAN HỆ VỚI LỚP
    if (existingRelation) {
      if (
        existingRelation.status === "studying" &&
        existingRelation.left_at === null
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
        const activeOther = await getActiveStudentRelation(
          connection,
          studentId,
          churchId,
          classId,
        );

        if (activeOther) {
          await safeRollback(connection);

          return res.status(409).json({
            success: false,
            code: "STUDENT_ALREADY_STUDYING",
            message: `Học sinh đang học lớp ${activeOther.class_name}`,
            data: activeOther,
            request_id: requestId,
          });
        }
      }

      const joinedAt =
        status === "studying" ? new Date() : existingRelation.joined_at;

      const leftAt = status === "studying" ? null : new Date();

      await connection.query(
        `
          UPDATE class_students
          SET
            status = ?,
            joined_at = ?,
            left_at = ?
          WHERE id = ?
        `,
        [status, joinedAt, leftAt, existingRelation.id],
      );

      await connection.commit();

      await safeWriteLog({
        church_id: churchId,
        action: "REACTIVATE_STUDENT_CLASS",
        description: `Thêm lại học sinh ${student.name} vào lớp ${classInfo.name}`,
        user_id: req.user?.id || null,
      });

      return res.status(200).json({
        success: true,
        message: "Đã cập nhật học sinh vào lớp",
        request_id: requestId,
      });
    }

    // KIỂM TRA LỚP ĐANG HỌC
    if (status === "studying") {
      const activeRelation = await getActiveStudentRelation(
        connection,
        studentId,
        churchId,
      );

      if (activeRelation) {
        await safeRollback(connection);

        return res.status(409).json({
          success: false,
          code: "STUDENT_ALREADY_STUDYING",
          message: `Học sinh đang học lớp ${activeRelation.class_name}`,
          data: activeRelation,
          request_id: requestId,
        });
      }
    }

    const joinedAt = status === "studying" ? new Date() : null;

    const leftAt = status === "studying" ? null : new Date();

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

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "ADD_STUDENT_TO_CLASS",
      description: `Thêm học sinh ${student.name} vào lớp ${classInfo.name}`,
      user_id: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Thêm học sinh vào lớp thành công",
      request_id: requestId,

      data: {
        id: insertResult.insertId,
        class_id: classId,
        student_id: studentId,
        status,
        student,
      },
    });
  } catch (error) {
    await safeRollback(connection);

    return sendServerError(res, requestId, error, "ADD STUDENT TO CLASS ERROR");
  } finally {
    if (connection) {
      connection.release();
    }
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

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "classId hoặc studentId không hợp lệ",
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

    connection = await db.getConnection();

    await connection.beginTransaction();

    const relation = await getClassStudentRelation(
      connection,
      classId,
      studentId,
      churchId,
    );

    if (!relation) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp",
        request_id: requestId,
      });
    }

    const nextStatus =
      req.body.status !== undefined ? req.body.status : relation.status;

    if (!ALLOWED_STATUS.includes(nextStatus)) {
      await safeRollback(connection);

      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
        allowed_status: ALLOWED_STATUS,
        request_id: requestId,
      });
    }

    if (
      nextStatus === "studying" &&
      (relation.status !== "studying" || relation.left_at !== null)
    ) {
      const activeOther = await getActiveStudentRelation(
        connection,
        studentId,
        churchId,
        classId,
      );

      if (activeOther) {
        await safeRollback(connection);

        return res.status(409).json({
          success: false,
          code: "STUDENT_ALREADY_STUDYING",
          message: `Học sinh đang học lớp ${activeOther.class_name}`,
          data: activeOther,
          request_id: requestId,
        });
      }
    }

    const updates = [];
    const values = [];

    if (req.body.status !== undefined) {
      updates.push("status = ?");
      values.push(nextStatus);
    }

    if (req.body.joined_at !== undefined) {
      updates.push("joined_at = ?");
      values.push(req.body.joined_at || null);
    }

    if (req.body.left_at !== undefined) {
      updates.push("left_at = ?");
      values.push(req.body.left_at || null);
    }

    if (nextStatus === "studying" && relation.status !== "studying") {
      if (req.body.joined_at === undefined) {
        updates.push("joined_at = ?");
        values.push(new Date());
      }

      if (req.body.left_at === undefined) {
        updates.push("left_at = ?");
        values.push(null);
      }
    }

    if (
      nextStatus !== "studying" &&
      relation.status === "studying" &&
      req.body.left_at === undefined
    ) {
      updates.push("left_at = ?");
      values.push(new Date());
    }

    if (updates.length === 0) {
      await safeRollback(connection);

      return res.status(400).json({
        success: false,
        message: "Không có dữ liệu cần cập nhật",
        request_id: requestId,
      });
    }

    values.push(relation.id);

    await connection.query(
      `
        UPDATE class_students
        SET
          ${updates.join(", ")}
        WHERE id = ?
      `,
      values,
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Cập nhật học sinh thành công",
      request_id: requestId,
    });
  } catch (error) {
    await safeRollback(connection);

    return sendServerError(res, requestId, error, "UPDATE CLASS STUDENT ERROR");
  } finally {
    if (connection) {
      connection.release();
    }
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

    if (!oldClassId || !studentId || !newClassId) {
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

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    const oldClass = await getClassById(connection, oldClassId, churchId);

    const newClass = await getClassById(connection, newClassId, churchId);

    if (!oldClass) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp hiện tại",
        request_id: requestId,
      });
    }

    if (!newClass) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp mới",
        request_id: requestId,
      });
    }

    const student = await getStudentById(connection, studentId, churchId);

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
    );

    if (!oldRelation) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc lớp hiện tại",
        request_id: requestId,
      });
    }

    const activeOther = await getActiveStudentRelation(
      connection,
      studentId,
      churchId,
      oldClassId,
    );

    if (activeOther) {
      await safeRollback(connection);

      return res.status(409).json({
        success: false,
        code: "DUPLICATE_ACTIVE_CLASS",
        message: `Học sinh đang đồng thời học lớp ${oldClass.name} và lớp ${activeOther.class_name}`,
        data: activeOther,
        request_id: requestId,
      });
    }

    const targetRelation = await getClassStudentRelation(
      connection,
      newClassId,
      studentId,
      churchId,
    );

    if (targetRelation) {
      await safeRollback(connection);

      return res.status(409).json({
        success: false,
        code: "ALREADY_IN_TARGET_CLASS",
        message: "Học sinh đã có quan hệ với lớp mới",
        data: targetRelation,
        request_id: requestId,
      });
    }

    await connection.query(
      `
        UPDATE class_students
        SET
          class_id = ?,
          status = 'studying',
          joined_at = ?,
          left_at = NULL
        WHERE id = ?
      `,
      [newClassId, new Date(), oldRelation.id],
    );

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
        student,
        student_id: studentId,
        old_class_id: oldClassId,
        new_class_id: newClassId,
      },
    });
  } catch (error) {
    await safeRollback(connection);

    return sendServerError(res, requestId, error, "CHANGE CLASS STUDENT ERROR");
  } finally {
    if (connection) {
      connection.release();
    }
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

    const rawStudentIds = Array.isArray(req.body.student_ids)
      ? req.body.student_ids
      : Array.isArray(req.body.studentIds)
        ? req.body.studentIds
        : [];

    const studentIds = rawStudentIds.map(toPositiveInt).filter(Boolean);

    const uniqueStudentIds = [...new Set(studentIds)];

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "classId không hợp lệ",
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

    if (uniqueStudentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh không được để trống",
        request_id: requestId,
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    const targetClass = await getClassById(connection, classId, churchId);

    if (!targetClass) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp đích",
        request_id: requestId,
      });
    }

    const placeholders = uniqueStudentIds.map(() => "?").join(",");

    const [students] = await connection.query(
      `
          SELECT *
          FROM students
          WHERE church_id = ?
            AND id IN (${placeholders})
        `,
      [churchId, ...uniqueStudentIds],
    );

    const studentMap = new Map(
      students.map((student) => [Number(student.id), formatStudent(student)]),
    );

    const result = {
      total: uniqueStudentIds.length,
      success: [],
      alreadyInTarget: [],
      failed: [],
    };

    for (const studentId of uniqueStudentIds) {
      const student = studentMap.get(studentId);

      if (!student) {
        result.failed.push({
          student_id: studentId,
          reason: "STUDENT_NOT_FOUND",
        });

        continue;
      }

      try {
        const targetRelation = await getClassStudentRelation(
          connection,
          classId,
          studentId,
          churchId,
        );

        if (targetRelation) {
          if (
            targetRelation.status === "studying" &&
            targetRelation.left_at === null
          ) {
            result.alreadyInTarget.push({
              student_id: studentId,
              student,
            });

            continue;
          }

          const activeOther = await getActiveStudentRelation(
            connection,
            studentId,
            churchId,
            classId,
          );

          if (activeOther) {
            result.failed.push({
              student_id: studentId,
              student,
              reason: "STUDENT_ALREADY_STUDYING",
              class_id: activeOther.class_id,
              class_name: activeOther.class_name,
            });

            continue;
          }

          await connection.query(
            `
              UPDATE class_students
              SET
                status = 'studying',
                joined_at = ?,
                left_at = NULL
              WHERE id = ?
            `,
            [new Date(), targetRelation.id],
          );

          result.success.push({
            student_id: studentId,
            student,
            action: "reactivated",
          });

          continue;
        }

        const activeRelation = await getActiveStudentRelation(
          connection,
          studentId,
          churchId,
        );

        if (activeRelation) {
          await connection.query(
            `
              UPDATE class_students
              SET
                class_id = ?,
                status = 'studying',
                joined_at = ?,
                left_at = NULL
              WHERE id = ?
            `,
            [classId, new Date(), activeRelation.id],
          );

          result.success.push({
            student_id: studentId,
            student,
            action: "moved",
            old_class_id: activeRelation.class_id,
            old_class_name: activeRelation.class_name,
          });

          continue;
        }

        await connection.query(
          `
            INSERT INTO class_students (
              class_id,
              student_id,
              status,
              joined_at,
              left_at
            )
            VALUES (
              ?,
              ?,
              'studying',
              ?,
              NULL
            )
          `,
          [classId, studentId, new Date()],
        );

        result.success.push({
          student_id: studentId,
          student,
          action: "inserted",
        });
      } catch (studentError) {
        console.error(`❌ STUDENT ${studentId} ERROR:`, studentError.message);

        result.failed.push({
          student_id: studentId,
          student,
          reason: studentError.message,
        });
      }
    }

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "CHANGE_CLASS_STUDENTS",
      description: `Chuyển ${result.success.length} học sinh vào lớp ${targetClass.name}`,
      user_id: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Xử lý chuyển lớp hoàn tất",
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
    if (connection) {
      connection.release();
    }
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

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "classId hoặc studentId không hợp lệ",
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

    connection = await db.getConnection();

    await connection.beginTransaction();

    const relation = await getClassStudentRelation(
      connection,
      classId,
      studentId,
      churchId,
    );

    if (!relation) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp",
        request_id: requestId,
      });
    }

    await connection.query(
      `
          DELETE FROM class_students
          WHERE id = ?
        `,
      [relation.id],
    );

    await connection.commit();

    await safeWriteLog({
      church_id: churchId,
      action: "REMOVE_STUDENT_FROM_CLASS",
      description: `Xóa học sinh ${relation.student_name} khỏi lớp ${relation.class_name}`,
      user_id: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Xóa học sinh khỏi lớp thành công",
      request_id: requestId,

      data: {
        class_student_id: relation.id,
        class_id: classId,
        student_id: studentId,
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
    if (connection) {
      connection.release();
    }
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

    const [duplicates] = await connection.query(
      `
            SELECT
              cs.student_id,
              COUNT(*) AS total_active

            FROM class_students cs

            INNER JOIN classes c
              ON c.id = cs.class_id

            INNER JOIN students s
              ON s.id = cs.student_id

            WHERE
              cs.status = 'studying'
              AND cs.left_at IS NULL
              AND c.church_id = ?
              AND s.church_id = ?

            GROUP BY cs.student_id

            HAVING COUNT(*) > 1
          `,
      [churchId, churchId],
    );

    const cleaned = [];

    for (const item of duplicates) {
      const activeRelations = await getAllActiveStudentRelations(
        connection,
        item.student_id,
        churchId,
      );

      if (activeRelations.length <= 1) {
        continue;
      }

      const keep = activeRelations[0];

      const removeIds = activeRelations.slice(1).map((relation) => relation.id);

      if (removeIds.length > 0) {
        const placeholders = removeIds.map(() => "?").join(",");

        await connection.query(
          `
              UPDATE class_students
              SET
                status = 'transferred',
                left_at = ?
              WHERE id IN (${placeholders})
            `,
          [new Date(), ...removeIds],
        );
      }

      cleaned.push({
        student_id: item.student_id,

        kept: {
          id: keep.id,
          class_id: keep.class_id,
          class_name: keep.class_name,
        },

        cleaned: activeRelations.slice(1).map((relation) => ({
          id: relation.id,
          class_id: relation.class_id,
          class_name: relation.class_name,
        })),
      });
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Đã dọn dữ liệu học sinh bị trùng lớp",

      request_id: requestId,

      data: {
        duplicate_students: duplicates.length,

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
    if (connection) {
      connection.release();
    }
  }
};

const db = require("../config/db");
const { writeLog } = require("../utils/activityChurchLogger");

// =====================================================
// CONSTANTS
// =====================================================

const ALLOWED_STATUS = ["studying", "completed", "transferred", "dropped"];

// =====================================================
// DEBUG / REQUEST ID
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
  try {
    await connection.rollback();
  } catch (error) {
    console.error("⚠️ ROLLBACK ERROR:", error.message);
  }
};

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
    error: error.message,
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
        c.id,
        c.name,
        c.code,
        c.category,
        c.status,
        c.academic_year,
        c.church_id
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
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.address,
        s.parish,
        s.avatar,
        s.status,
        s.church_id
      FROM students s
      WHERE s.id = ?
        AND s.church_id = ?
      LIMIT 1
    `,
    [studentId, churchId],
  );

  return rows[0] || null;
};

// =====================================================
// GET SCHEDULES BY CLASS
//
// IMPORTANT:
// class_schedules KHÔNG sử dụng:
// - start_date
// - end_date
// - status
//
// academic_year nằm ở classes.academic_year
// =====================================================

const getSchedulesByClassId = async (connection, classId, churchId) => {
  console.log("");
  console.log(
    "---------------------------------------------------------------",
  );
  console.log("📅 GET CLASS SCHEDULES");
  console.log("CLASS ID:", classId);
  console.log("CHURCH ID:", churchId);
  console.log(
    "---------------------------------------------------------------",
  );

  const [rows] = await connection.query(
    `
      SELECT
        cs.id,
        cs.class_id,
        cs.day_of_week,
        cs.start_time,
        cs.end_time,
        cs.room
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

  console.log("📅 SCHEDULE COUNT:", rows.length);

  return rows;
};

// =====================================================
// GET CLASS-STUDENT RELATION
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

        s.code AS student_code,
        s.name AS student_name,
        s.gender AS student_gender,
        s.date_of_birth AS student_date_of_birth,
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

      ORDER BY
        cs.id DESC

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
// GET ACTIVE STUDENT RELATION
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

    WHERE cs.student_id = ?
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
// 1. GET STUDENTS BY CLASS
// =====================================================

exports.getStudentsByClass = async (req, res) => {
  const requestId = createRequestId("GET-CLASS-STUDENTS");

  console.log("");
  console.log(
    "================================================================",
  );
  console.log(`📚 [${requestId}] GET STUDENTS BY CLASS`);
  console.log(
    "================================================================",
  );

  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);
    const churchId = toPositiveInt(getChurchId(req));

    console.log("CLASS ID:", classId);
    console.log("CHURCH ID:", churchId);

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

    const classInfo = await getClassById(connection, classId, churchId);

    if (!classInfo) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
        request_id: requestId,
      });
    }

    const schedules = await getSchedulesByClassId(
      connection,
      classId,
      churchId,
    );

    const [students] = await connection.query(
      `
        SELECT
          cs.id AS class_student_id,
          cs.class_id,
          cs.student_id,
          cs.status AS enrollment_status,
          cs.joined_at,
          cs.left_at,

          s.id,
          s.code,
          s.name,
          s.gender,
          s.date_of_birth,
          s.phone,
          s.email,
          s.address,
          s.parish,
          s.avatar,
          s.status AS student_status,

          c.name AS class_name,
          c.code AS class_code,
          c.category AS class_category,
          c.status AS class_status,
          c.academic_year

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.class_id = ?
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
      [classId, churchId, churchId],
    );

    console.log("STUDENT COUNT:", students.length);
    console.log("ACADEMIC YEAR:", classInfo.academic_year);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách học sinh thành công",
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

  console.log("");
  console.log(
    "================================================================",
  );
  console.log(`📚 [${requestId}] GET CLASSES BY STUDENT`);
  console.log(
    "================================================================",
  );

  let connection;

  try {
    const studentId = toPositiveInt(req.params.studentId);
    const churchId = toPositiveInt(getChurchId(req));

    console.log("STUDENT ID:", studentId);
    console.log("CHURCH ID:", churchId);

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

    console.log("CLASS COUNT:", classes.length);

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

  console.log("");
  console.log(
    "================================================================",
  );
  console.log(`➕ [${requestId}] ADD STUDENT TO CLASS`);
  console.log(
    "================================================================",
  );

  let connection;

  try {
    const classId = toPositiveInt(req.body.class_id);
    const studentId = toPositiveInt(req.body.student_id);
    const churchId = toPositiveInt(getChurchId(req));

    const status = req.body.status || "studying";

    console.log("CLASS ID:", classId);
    console.log("STUDENT ID:", studentId);
    console.log("CHURCH ID:", churchId);
    console.log("STATUS:", status);

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

    // ---------------------------------------------------
    // ĐÃ ĐANG HỌC LỚP NÀY
    // ---------------------------------------------------

    if (
      existingRelation &&
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

    // ---------------------------------------------------
    // THÊM LẠI QUAN HỆ CŨ
    // ---------------------------------------------------

    if (existingRelation) {
      if (status === "studying") {
        const activeRelation = await getActiveStudentRelation(
          connection,
          studentId,
          churchId,
          classId,
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

      const joinedAt =
        status === "studying" ? new Date() : existingRelation.joined_at;

      const leftAt = status === "studying" ? null : existingRelation.left_at;

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

    // ---------------------------------------------------
    // CHECK ĐANG HỌC LỚP KHÁC
    // ---------------------------------------------------

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

    // ---------------------------------------------------
    // INSERT
    // ---------------------------------------------------

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

    console.log("CREATED RELATION ID:", insertResult.insertId);

    return res.status(201).json({
      success: true,
      message: "Thêm học sinh vào lớp thành công",
      request_id: requestId,

      data: {
        id: insertResult.insertId,
        class_id: classId,
        student_id: studentId,
        status,
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
// 4. UPDATE CLASS-STUDENT
// =====================================================

exports.updateClassStudent = async (req, res) => {
  const requestId = createRequestId("UPDATE-CLASS-STUDENT");

  console.log("");
  console.log(
    "================================================================",
  );
  console.log(`✏️ [${requestId}] UPDATE CLASS STUDENT`);
  console.log(
    "================================================================",
  );

  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);
    const studentId = toPositiveInt(req.params.studentId);
    const churchId = toPositiveInt(getChurchId(req));

    console.log("CLASS ID:", classId);
    console.log("STUDENT ID:", studentId);
    console.log("CHURCH ID:", churchId);

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

    // ---------------------------------------------------
    // CHUYỂN SANG STUDYING
    // ---------------------------------------------------

    if (
      nextStatus === "studying" &&
      (relation.status !== "studying" || relation.left_at !== null)
    ) {
      const activeRelation = await getActiveStudentRelation(
        connection,
        studentId,
        churchId,
        classId,
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

    // Nếu chuyển về studying mà không truyền joined_at
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

    // Nếu chuyển khỏi studying mà không truyền left_at
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

    await safeWriteLog({
      church_id: churchId,
      action: "UPDATE_CLASS_STUDENT",
      description: `Cập nhật học sinh ${relation.student_name} trong lớp ${relation.class_name}`,
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
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 5. CHANGE ONE STUDENT TO ANOTHER CLASS
// =====================================================

exports.changeClassStudent = async (req, res) => {
  const requestId = createRequestId("CHANGE-CLASS-STUDENT");

  console.log("");
  console.log(
    "================================================================",
  );
  console.log(`🔄 [${requestId}] CHANGE CLASS STUDENT`);
  console.log(
    "================================================================",
  );

  let connection;

  try {
    const oldClassId = toPositiveInt(req.params.classId);
    const studentId = toPositiveInt(req.params.studentId);
    const newClassId = toPositiveInt(req.body.new_class_id);
    const churchId = toPositiveInt(getChurchId(req));

    console.log("OLD CLASS ID:", oldClassId);
    console.log("NEW CLASS ID:", newClassId);
    console.log("STUDENT ID:", studentId);
    console.log("CHURCH ID:", churchId);

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

    if (!oldClass) {
      await safeRollback(connection);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp hiện tại",
        request_id: requestId,
      });
    }

    const newClass = await getClassById(connection, newClassId, churchId);

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

    const newRelation = await getClassStudentRelation(
      connection,
      newClassId,
      studentId,
      churchId,
    );

    if (newRelation) {
      await safeRollback(connection);

      return res.status(409).json({
        success: false,
        code: "ALREADY_IN_TARGET_CLASS",
        message: "Học sinh đã từng/đang thuộc lớp mới",
        request_id: requestId,
      });
    }

    const activeRelation = await getActiveStudentRelation(
      connection,
      studentId,
      churchId,
      oldClassId,
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
// 6. CHANGE MULTIPLE STUDENTS TO CLASS
// =====================================================

exports.changeClassStudents = async (req, res) => {
  const requestId = createRequestId("CHANGE-CLASS-STUDENTS");

  console.log("");
  console.log(
    "================================================================",
  );
  console.log(`🔄 [${requestId}] CHANGE MULTIPLE STUDENTS`);
  console.log(
    "================================================================",
  );

  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);
    const churchId = toPositiveInt(getChurchId(req));

    const studentIds = Array.isArray(req.body.student_ids)
      ? req.body.student_ids.map(toPositiveInt).filter(Boolean)
      : [];

    console.log("TARGET CLASS ID:", classId);
    console.log("CHURCH ID:", churchId);
    console.log("STUDENT COUNT:", studentIds.length);

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

    if (studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh không được để trống",
        request_id: requestId,
      });
    }

    const uniqueStudentIds = [...new Set(studentIds)];

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

    // ---------------------------------------------------
    // LOAD STUDENTS
    // ---------------------------------------------------

    const placeholders = uniqueStudentIds.map(() => "?").join(",");

    const [students] = await connection.query(
      `
        SELECT
          id,
          code,
          name
        FROM students
        WHERE church_id = ?
          AND id IN (${placeholders})
      `,
      [churchId, ...uniqueStudentIds],
    );

    const studentMap = new Map(
      students.map((student) => [Number(student.id), student]),
    );

    const result = {
      total: uniqueStudentIds.length,
      success: [],
      alreadyInTarget: [],
      failed: [],
    };

    // ---------------------------------------------------
    // PROCESS EACH STUDENT
    // ---------------------------------------------------

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

        // ---------------------------------------------
        // ĐANG Ở LỚP ĐÍCH
        // ---------------------------------------------

        if (
          targetRelation &&
          targetRelation.status === "studying" &&
          targetRelation.left_at === null
        ) {
          result.alreadyInTarget.push({
            student_id: studentId,
            student_name: student.name,
          });

          continue;
        }

        // ---------------------------------------------
        // QUAN HỆ CŨ Ở LỚP ĐÍCH
        // ---------------------------------------------

        if (targetRelation) {
          const activeOther = await getActiveStudentRelation(
            connection,
            studentId,
            churchId,
            classId,
          );

          if (activeOther) {
            result.failed.push({
              student_id: studentId,
              student_name: student.name,
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
            student_name: student.name,
            action: "reactivated",
          });

          continue;
        }

        // ---------------------------------------------
        // TÌM LỚP ĐANG HỌC
        // ---------------------------------------------

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
            student_name: student.name,
            action: "moved",
            old_class_id: activeRelation.class_id,
            old_class_name: activeRelation.class_name,
          });

          continue;
        }

        // ---------------------------------------------
        // INSERT MỚI
        // ---------------------------------------------

        await connection.query(
          `
            INSERT INTO class_students (
              class_id,
              student_id,
              status,
              joined_at,
              left_at
            )
            VALUES (?, ?, 'studying', ?, NULL)
          `,
          [classId, studentId, new Date()],
        );

        result.success.push({
          student_id: studentId,
          student_name: student.name,
          action: "inserted",
        });
      } catch (studentError) {
        console.error(`❌ STUDENT ${studentId} ERROR:`, studentError.message);

        result.failed.push({
          student_id: studentId,
          student_name: student.name,
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

    console.log("");
    console.log("MULTI CHANGE RESULT");
    console.log("--------------------");
    console.log("TOTAL:", result.total);
    console.log("SUCCESS:", result.success.length);
    console.log("ALREADY IN TARGET:", result.alreadyInTarget.length);
    console.log("FAILED:", result.failed.length);

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

  console.log("");
  console.log(
    "================================================================",
  );
  console.log(`🗑️ [${requestId}] REMOVE STUDENT FROM CLASS`);
  console.log(
    "================================================================",
  );

  let connection;

  try {
    const classId = toPositiveInt(req.params.classId);
    const studentId = toPositiveInt(req.params.studentId);
    const churchId = toPositiveInt(getChurchId(req));

    console.log("CLASS ID:", classId);
    console.log("STUDENT ID:", studentId);
    console.log("CHURCH ID:", churchId);

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

    console.log("REMOVED RELATION ID:", relation.id);

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

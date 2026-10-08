const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");

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
// SAFE POSITIVE INTEGER
// =====================================================

const toPositiveInt = (value) => {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
};

// =====================================================
// SAFE ACTIVITY LOG
// =====================================================

const safeWriteLog = async (req, data) => {
  try {
    const payload = {
      admin_id: req.user?.id || null,

      action: data?.action || null,

      target_type: data?.target_type || null,

      target_id: data?.target_id || null,

      description: data?.description || null,

      ip_address:
        req.ip ||
        req.headers?.["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        null,
    };

    console.log("");
    console.log("------------------------------------------------------------");
    console.log("📝 ACTIVITY LOG");
    console.log("------------------------------------------------------------");
    console.log(payload);

    await writeLog(payload);

    console.log("✅ ACTIVITY LOG SUCCESS");
    console.log("------------------------------------------------------------");
  } catch (error) {
    console.error("");
    console.error(
      "------------------------------------------------------------",
    );
    console.error("⚠️ ACTIVITY LOG ERROR");
    console.error(
      "------------------------------------------------------------",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL:", error.sqlMessage);
    console.error(
      "------------------------------------------------------------",
    );
  }
};

// =====================================================
// SAFE ROLLBACK
// =====================================================

const safeRollback = async (connection, transactionStarted, requestId) => {
  if (!connection || !transactionStarted) {
    return;
  }

  try {
    await connection.rollback();

    console.log(`🔄 [${requestId}] ROLLBACK SUCCESS`);
  } catch (rollbackError) {
    console.error(`❌ [${requestId}] ROLLBACK ERROR:`, rollbackError.message);
  }
};

// =====================================================
// GET CLASS BY ID + CHURCH
//
// IMPORTANT:
// academic_year lấy trực tiếp từ classes.
// =====================================================

const getClassById = async (classId, churchId, connection = db) => {
  const [rows] = await connection.query(
    `
      SELECT
        id,
        name,
        code,
        category,
        status,
        academic_year,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
    `,
    [classId, churchId],
  );

  return rows[0] || null;
};

// =====================================================
// GET STUDENT BY ID + CHURCH
//
// KHÔNG CÓ diocese.
// =====================================================

const getStudentById = async (studentId, churchId, connection = db) => {
  const [rows] = await connection.query(
    `
      SELECT
        id,
        code,
        name,
        gender,
        date_of_birth,
        phone,
        email,
        address,
        parish,
        avatar,
        status,
        church_id
      FROM students
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
    `,
    [studentId, churchId],
  );

  return rows[0] || null;
};

// =====================================================
// GET SCHEDULES BY CLASS
//
// Không dùng cs.church_id.
// Bảo vệ bằng classes.church_id.
// =====================================================

const getSchedulesByClassId = async (classId, churchId, connection = db) => {
  const [rows] = await connection.query(
    `
      SELECT
        cs.id,
        cs.class_id,
        cs.day_of_week,
        cs.start_time,
        cs.end_time,
        cs.room,
        cs.start_date,
        cs.end_date,
        cs.status

      FROM class_schedules cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.class_id = ?
        AND c.church_id = ?

      ORDER BY
        CASE cs.day_of_week
          WHEN 1 THEN 1
          WHEN 2 THEN 2
          WHEN 3 THEN 3
          WHEN 4 THEN 4
          WHEN 5 THEN 5
          WHEN 6 THEN 6
          WHEN 7 THEN 7
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
// GET RELATION
// =====================================================

const getClassStudentRelation = async (
  classId,
  studentId,
  churchId,
  connection = db,
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

        c.name AS class_name,
        c.code AS class_code,
        c.category AS class_category,
        c.status AS class_status,
        c.academic_year,
        c.church_id AS class_church_id

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.class_id = ?
        AND cs.student_id = ?

        AND s.church_id = ?
        AND c.church_id = ?

      ORDER BY cs.id DESC

      LIMIT 1
    `,
    [classId, studentId, churchId, churchId],
  );

  return rows[0] || null;
};

// =====================================================
// GET ALL STUDENT RELATIONS
// =====================================================

const getStudentRelations = async (studentId, churchId, connection = db) => {
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

        c.church_id AS class_church_id

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      INNER JOIN students s
        ON s.id = cs.student_id

      WHERE cs.student_id = ?

        AND c.church_id = ?
        AND s.church_id = ?

      ORDER BY
        cs.id DESC
    `,
    [studentId, churchId, churchId],
  );

  return rows;
};

// =====================================================
// GET ACTIVE STUDENT RELATION
//
// Một học sinh chỉ được studying ở một lớp.
// =====================================================

const getActiveStudentRelation = async (
  studentId,
  churchId,
  connection = db,
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
      c.category AS class_category,
      c.status AS class_status,
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
      AND cs.class_id != ?
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
//
// GET /api/class-students/class/:classId
// =====================================================

exports.getStudentsByClass = async (req, res) => {
  const requestId = createRequestId("GET-CLASS-STUDENTS");

  try {
    const classId = toPositiveInt(req.params.classId);

    const churchId = toPositiveInt(req.user?.church_id);

    console.log("");
    console.log(
      "================================================================",
    );
    console.log(`📚 [${requestId}] GET STUDENTS BY CLASS`);
    console.log(
      "================================================================",
    );

    console.log("USER:", {
      id: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      church_id: req.user?.church_id,
    });

    console.log("PARAMS:", {
      classId,
      churchId,
    });

    // =====================================================
    // AUTH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE
    // =====================================================

    if (!classId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CLASS_ID",
        message: "classId không hợp lệ",
      });
    }

    // =====================================================
    // CLASS
    // =====================================================

    const classData = await getClassById(classId, churchId);

    if (!classData) {
      return res.status(404).json({
        success: false,
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp hoặc lớp không thuộc giáo xứ",
      });
    }

    console.log(`📚 [${requestId}] CLASS:`, classData);

    // =====================================================
    // SCHEDULE
    // =====================================================

    const schedules = await getSchedulesByClassId(classId, churchId);

    console.log(`📅 [${requestId}] SCHEDULE COUNT:`, schedules.length);

    // =====================================================
    // STUDENTS
    // =====================================================

    const [rows] = await db.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,

          cs.status,
          cs.joined_at,
          cs.left_at,

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
          c.academic_year,

          c.church_id AS class_church_id

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.class_id = ?

          AND s.church_id = ?
          AND c.church_id = ?

        ORDER BY
          CASE
            WHEN cs.status = 'studying' THEN 0
            WHEN cs.status = 'completed' THEN 1
            WHEN cs.status = 'transferred' THEN 2
            WHEN cs.status = 'dropped' THEN 3
            ELSE 4
          END,

          s.name ASC,
          s.id ASC
      `,
      [classId, churchId, churchId],
    );

    console.log(`📊 [${requestId}] STUDENT COUNT:`, rows.length);

    console.table(
      rows.map((row) => ({
        relation_id: row.id,
        class_id: row.class_id,
        student_id: row.student_id,
        name: row.name,
        code: row.code,
        academic_year: row.academic_year,
        status: row.status,
        joined_at: row.joined_at,
        left_at: row.left_at,
      })),
    );

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: rows,

      class: {
        ...classData,
        schedules,
      },

      schedules,

      academic_year: classData.academic_year || null,

      debug: {
        request_id: requestId,
        class_id: classId,
        church_id: churchId,
        academic_year: classData.academic_year || null,
        student_count: rows.length,
        schedule_count: schedules.length,
      },
    });
  } catch (error) {
    console.error("");
    console.error(
      "================================================================",
    );
    console.error(`💥 [${requestId}] GET STUDENTS BY CLASS ERROR`);
    console.error(
      "================================================================",
    );

    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("ERRNO:", error.errno);
    console.error("SQL STATE:", error.sqlState);
    console.error("SQL MESSAGE:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      code: "GET_STUDENTS_BY_CLASS_ERROR",
      message: "Không thể lấy danh sách học sinh trong lớp",
      debug: {
        request_id: requestId,
      },
    });
  }
};

// =====================================================
// 2. GET CLASSES BY STUDENT
//
// GET /api/class-students/student/:studentId
// =====================================================

exports.getClassesByStudent = async (req, res) => {
  const requestId = createRequestId("GET-STUDENT-CLASSES");

  try {
    const studentId = toPositiveInt(req.params.studentId);

    const churchId = toPositiveInt(req.user?.church_id);

    console.log("");
    console.log(
      "================================================================",
    );
    console.log(`👨‍🎓 [${requestId}] GET CLASSES BY STUDENT`);
    console.log(
      "================================================================",
    );

    console.log({
      studentId,
      churchId,
    });

    // =====================================================
    // AUTH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STUDENT_ID",
        message: "studentId không hợp lệ",
      });
    }

    // =====================================================
    // STUDENT
    // =====================================================

    const student = await getStudentById(studentId, churchId);

    if (!student) {
      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message: "Không tìm thấy học sinh hoặc học sinh không thuộc giáo xứ",
      });
    }

    // =====================================================
    // RELATIONS
    // =====================================================

    const rows = await getStudentRelations(studentId, churchId);

    // =====================================================
    // SCHEDULES
    // =====================================================

    const classes = [];

    for (const classItem of rows) {
      const schedules = await getSchedulesByClassId(
        classItem.class_id,
        churchId,
      );

      classes.push({
        ...classItem,
        schedules,
      });
    }

    console.log(`📚 [${requestId}] CLASS COUNT:`, classes.length);

    console.table(
      classes.map((item) => ({
        relation_id: item.id,
        class_id: item.class_id,
        student_id: item.student_id,
        class_name: item.class_name,
        class_code: item.class_code,
        academic_year: item.academic_year,
        status: item.status,
        schedule_count: item.schedules?.length || 0,
      })),
    );

    return res.json({
      success: true,

      data: classes,

      student,

      debug: {
        request_id: requestId,
        student_id: studentId,
        church_id: churchId,
        class_count: classes.length,
      },
    });
  } catch (error) {
    console.error("");
    console.error(
      "================================================================",
    );
    console.error(`💥 [${requestId}] GET CLASSES BY STUDENT ERROR`);
    console.error(
      "================================================================",
    );

    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("ERRNO:", error.errno);
    console.error("SQL MESSAGE:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      code: "GET_CLASSES_BY_STUDENT_ERROR",
      message: "Không thể lấy danh sách lớp của học sinh",
      debug: {
        request_id: requestId,
      },
    });
  }
};

// =====================================================
// 3. ADD STUDENT TO CLASS
//
// POST /api/class-students
//
// BODY:
// {
//   class_id: 190,
//   student_id: 1903,
//   status: "studying",
//   joined_at: null
// }
// =====================================================

exports.addStudentToClass = async (req, res) => {
  const requestId = createRequestId("ADD-STUDENT");

  let connection = null;
  let transactionStarted = false;

  try {
    const churchId = toPositiveInt(req.user?.church_id);

    const classId = toPositiveInt(req.body?.class_id);

    const studentId = toPositiveInt(req.body?.student_id);

    const status = req.body?.status || "studying";

    const joinedAt = req.body?.joined_at ?? null;

    console.log("");
    console.log(
      "================================================================",
    );
    console.log(`🚀 [${requestId}] ADD STUDENT TO CLASS`);
    console.log(
      "================================================================",
    );

    console.log("USER:", {
      id: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      church_id: req.user?.church_id,
    });

    console.log("BODY:", {
      class_id: req.body?.class_id,
      student_id: req.body?.student_id,
      status,
      joined_at: joinedAt,
    });

    // =====================================================
    // AUTH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE
    // =====================================================

    if (!classId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CLASS_ID",
        message: "class_id không hợp lệ",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STUDENT_ID",
        message: "student_id không hợp lệ",
      });
    }

    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STATUS",
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    // =====================================================
    // CONNECTION
    // =====================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // CLASS
    // =====================================================

    const targetClass = await getClassById(classId, churchId, connection);

    if (!targetClass) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp hoặc lớp không thuộc giáo xứ",
      });
    }

    // =====================================================
    // STUDENT
    // =====================================================

    const student = await getStudentById(studentId, churchId, connection);

    if (!student) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message: "Không tìm thấy học sinh hoặc học sinh không thuộc giáo xứ",
      });
    }

    // =====================================================
    // EXACT RELATION
    // =====================================================

    const relation = await getClassStudentRelation(
      classId,
      studentId,
      churchId,
      connection,
    );

    // =====================================================
    // TARGET RELATION EXISTS
    // =====================================================

    if (relation) {
      // ---------------------------------------------------
      // ACTIVE
      // ---------------------------------------------------

      if (relation.status === "studying" && !relation.left_at) {
        await safeRollback(connection, transactionStarted, requestId);

        transactionStarted = false;

        return res.status(409).json({
          success: false,

          code: "ALREADY_IN_CLASS",

          message:
            `Học sinh "${student.name}" ` +
            `đang học tại lớp "${relation.class_name}"`,

          data: {
            relation_id: Number(relation.id),

            class_id: Number(relation.class_id),

            student_id: Number(relation.student_id),

            status: relation.status,

            joined_at: relation.joined_at,

            left_at: relation.left_at,

            academic_year: relation.academic_year,

            class_name: relation.class_name,

            class_code: relation.class_code,
          },

          debug: {
            request_id: requestId,
            reason: "EXACT_ACTIVE_RELATION_EXISTS",
          },
        });
      }

      // ---------------------------------------------------
      // REACTIVATE OLD RELATION
      // ---------------------------------------------------

      console.log(`♻️ [${requestId}] REACTIVATE OLD RELATION`);

      const [result] = await connection.query(
        `
            UPDATE class_students
            SET
              status = ?,
              joined_at = COALESCE(?, NOW()),
              left_at = NULL
            WHERE id = ?
          `,
        [status, joinedAt, relation.id],
      );

      if (!result.affectedRows) {
        await safeRollback(connection, transactionStarted, requestId);

        transactionStarted = false;

        return res.status(400).json({
          success: false,
          code: "REACTIVATE_FAILED",
          message: "Không thể kích hoạt lại quan hệ lớp - học sinh",
        });
      }

      // ---------------------------------------------------
      // COMMIT
      // ---------------------------------------------------

      await connection.commit();

      transactionStarted = false;

      await safeWriteLog(req, {
        action: "REACTIVATE_STUDENT_CLASS",

        target_type: "class_students",

        target_id: relation.id,

        description:
          `Kích hoạt lại học sinh "${student.name}" ` +
          `(${student.code || "—"}) ` +
          `trong lớp "${targetClass.name}" ` +
          `(${targetClass.code || "—"}) ` +
          `- năm học ${targetClass.academic_year || "—"}`,
      });

      return res.status(200).json({
        success: true,

        code: "RELATION_REACTIVATED",

        message: "Học sinh đã được đưa trở lại lớp",

        data: {
          id: Number(relation.id),

          class_id: classId,

          student_id: studentId,

          status,

          joined_at: joinedAt || new Date(),

          left_at: null,

          academic_year: targetClass.academic_year,

          class: targetClass,

          student,
        },

        debug: {
          request_id: requestId,
        },
      });
    }

    // =====================================================
    // CHECK OTHER ACTIVE CLASS
    // =====================================================

    if (status === "studying") {
      const activeRelation = await getActiveStudentRelation(
        studentId,
        churchId,
        connection,
      );

      if (activeRelation) {
        await safeRollback(connection, transactionStarted, requestId);

        transactionStarted = false;

        return res.status(409).json({
          success: false,

          code: "STUDENT_ALREADY_STUDYING",

          message:
            `Học sinh "${student.name}" ` +
            `đang học tại lớp "${activeRelation.class_name}"`,

          data: {
            student_id: studentId,

            current_class: {
              id: Number(activeRelation.class_id),

              name: activeRelation.class_name,

              code: activeRelation.class_code,

              academic_year: activeRelation.academic_year,

              relation_id: Number(activeRelation.id),

              status: activeRelation.status,

              joined_at: activeRelation.joined_at,

              left_at: activeRelation.left_at,
            },

            target_class: {
              id: Number(targetClass.id),

              name: targetClass.name,

              code: targetClass.code,

              academic_year: targetClass.academic_year,
            },
          },

          debug: {
            request_id: requestId,
            reason: "ACTIVE_RELATION_IN_OTHER_CLASS",
          },
        });
      }
    }

    // =====================================================
    // INSERT
    // =====================================================

    const [insertResult] = await connection.query(
      `
          INSERT INTO class_students
          (
            class_id,
            student_id,
            status,
            joined_at,
            left_at
          )
          VALUES
          (
            ?,
            ?,
            ?,
            COALESCE(?, NOW()),
            NULL
          )
        `,
      [classId, studentId, status, joinedAt],
    );

    // =====================================================
    // VERIFY
    // =====================================================

    const [verifyRows] = await connection.query(
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

          WHERE cs.id = ?

            AND c.church_id = ?
            AND s.church_id = ?

          LIMIT 1
        `,
      [insertResult.insertId, churchId, churchId],
    );

    if (!verifyRows.length) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(500).json({
        success: false,
        code: "INSERT_VERIFY_FAILED",
        message: "Đã thêm nhưng không thể xác nhận dữ liệu trong database",
        debug: {
          request_id: requestId,
          inserted_id: insertResult.insertId,
        },
      });
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    transactionStarted = false;

    // =====================================================
    // LOG
    // =====================================================

    await safeWriteLog(req, {
      action: "ADD_STUDENT_TO_CLASS",

      target_type: "class_students",

      target_id: insertResult.insertId,

      description:
        `Thêm học sinh "${student.name}" ` +
        `(${student.code || "—"}) ` +
        `vào lớp "${targetClass.name}" ` +
        `(${targetClass.code || "—"}) ` +
        `- năm học ${targetClass.academic_year || "—"}`,
    });

    return res.status(201).json({
      success: true,

      code: "STUDENT_ADDED",

      message: "Thêm học sinh vào lớp thành công",

      data: {
        id: Number(insertResult.insertId),

        class_id: classId,

        student_id: studentId,

        status,

        joined_at: verifyRows[0]?.joined_at || joinedAt || new Date(),

        left_at: null,

        academic_year: targetClass.academic_year,

        class: targetClass,

        student,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted, requestId);

    transactionStarted = false;

    console.error("");
    console.error(`💥 [${requestId}] ADD STUDENT ERROR`);

    console.error("MESSAGE:", error.message);

    console.error("CODE:", error.code);

    console.error("SQL:", error.sqlMessage);

    // =====================================================
    // DUPLICATE
    // =====================================================

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        code: "DUPLICATE_RELATION",

        message: "Quan hệ học sinh - lớp đã tồn tại",

        error: error.sqlMessage,

        debug: {
          request_id: requestId,
          class_id: req.body?.class_id,
          student_id: req.body?.student_id,
          church_id: req.user?.church_id,
        },
      });
    }

    // =====================================================
    // FOREIGN KEY
    // =====================================================

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,

        code: "FOREIGN_KEY_ERROR",

        message: "Lớp hoặc học sinh không tồn tại",

        error: error.sqlMessage,

        debug: {
          request_id: requestId,
        },
      });
    }

    // =====================================================
    // UNKNOWN COLUMN
    // =====================================================

    if (error.code === "ER_BAD_FIELD_ERROR") {
      return res.status(500).json({
        success: false,

        code: "DATABASE_COLUMN_ERROR",

        message: "Cấu trúc database không khớp với code backend",

        error: error.sqlMessage,

        debug: {
          request_id: requestId,

          hint: "Kiểm tra classes.academic_year và các cột của class_students",
        },
      });
    }

    return res.status(500).json({
      success: false,

      code: "ADD_STUDENT_TO_CLASS_ERROR",

      message: "Không thể thêm học sinh vào lớp",

      debug: {
        request_id: requestId,
      },
    });
  } finally {
    if (connection) {
      connection.release();
    }

    console.log(`🏁 [${requestId}] ADD STUDENT REQUEST FINISHED`);
  }
};

// =====================================================
// 4. UPDATE CLASS STUDENT
//
// PUT /api/class-students/update/:classId/:studentId
// =====================================================

exports.updateClassStudent = async (req, res) => {
  const requestId = createRequestId("UPDATE-CLASS-STUDENT");

  let connection = null;
  let transactionStarted = false;

  try {
    const classId = toPositiveInt(req.params.classId);

    const studentId = toPositiveInt(req.params.studentId);

    const churchId = toPositiveInt(req.user?.church_id);

    const { status, joined_at, left_at } = req.body;

    console.log("");
    console.log(
      "================================================================",
    );
    console.log(`✏️ [${requestId}] UPDATE CLASS STUDENT`);
    console.log(
      "================================================================",
    );

    // =====================================================
    // AUTH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ID",
        message: "classId và studentId không hợp lệ",
      });
    }

    if (status !== undefined && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STATUS",
        message: "Trạng thái không hợp lệ",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // RELATION
    // =====================================================

    const relation = await getClassStudentRelation(
      classId,
      studentId,
      churchId,
      connection,
    );

    if (!relation) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "RELATION_NOT_FOUND",
        message: "Không tìm thấy học sinh trong lớp của giáo xứ",
      });
    }

    // =====================================================
    // CHECK OTHER ACTIVE CLASS
    // =====================================================

    if (status === "studying") {
      const otherActive = await getActiveStudentRelation(
        studentId,
        churchId,
        connection,
        classId,
      );

      if (otherActive) {
        await safeRollback(connection, transactionStarted, requestId);

        transactionStarted = false;

        return res.status(409).json({
          success: false,

          code: "STUDENT_ALREADY_STUDYING",

          message: `Học sinh đang học tại lớp "${otherActive.class_name}"`,

          data: {
            current_class: {
              id: Number(otherActive.class_id),

              name: otherActive.class_name,

              code: otherActive.class_code,

              academic_year: otherActive.academic_year,

              relation_id: Number(otherActive.id),
            },
          },

          debug: {
            request_id: requestId,
          },
        });
      }
    }

    // =====================================================
    // BUILD UPDATE
    // =====================================================

    const fields = [];
    const values = [];

    if (status !== undefined) {
      fields.push("status = ?");
      values.push(status);
    }

    if (joined_at !== undefined) {
      fields.push("joined_at = ?");
      values.push(joined_at);
    }

    if (left_at !== undefined) {
      fields.push("left_at = ?");
      values.push(left_at);
    }

    if (!fields.length) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        code: "NO_UPDATE_DATA",
        message: "Không có dữ liệu cần cập nhật",
      });
    }

    values.push(relation.id);

    // =====================================================
    // UPDATE BY RELATION ID
    //
    // An toàn hơn class_id + student_id.
    // =====================================================

    const [result] = await connection.query(
      `
          UPDATE class_students
          SET ${fields.join(", ")}
          WHERE id = ?
        `,
      values,
    );

    if (!result.affectedRows) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        code: "UPDATE_FAILED",
        message: "Không thể cập nhật quan hệ lớp - học sinh",
      });
    }

    await connection.commit();

    transactionStarted = false;

    // =====================================================
    // LOG
    // =====================================================

    await safeWriteLog(req, {
      action: "UPDATE_CLASS_STUDENT",

      target_type: "class_students",

      target_id: relation.id,

      description:
        `Cập nhật học sinh "${relation.student_name}" ` +
        `(${relation.student_code || "—"}) ` +
        `trong lớp "${relation.class_name}" ` +
        `(${relation.class_code || "—"}) ` +
        `- năm học ${relation.academic_year || "—"}`,
    });

    return res.json({
      success: true,

      message: "Cập nhật quan hệ lớp - học sinh thành công",

      data: {
        relation_id: Number(relation.id),

        class_id: Number(relation.class_id),

        student_id: Number(relation.student_id),

        academic_year: relation.academic_year,

        affectedRows: result.affectedRows,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted, requestId);

    transactionStarted = false;

    console.error(`💥 [${requestId}] UPDATE CLASS STUDENT ERROR`);

    console.error("MESSAGE:", error.message);

    console.error("CODE:", error.code);

    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      code: "UPDATE_CLASS_STUDENT_ERROR",
      message: "Không thể cập nhật quan hệ lớp - học sinh",
      debug: {
        request_id: requestId,
      },
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 5. CHANGE ONE STUDENT CLASS
//
// PUT /api/class-students/:classId/:studentId/change-class
//
// BODY:
// {
//   new_class_id: 5
// }
// =====================================================

exports.changeClassStudent = async (req, res) => {
  const requestId = createRequestId("CHANGE-CLASS");

  let connection = null;
  let transactionStarted = false;

  try {
    const oldClassId = toPositiveInt(req.params.classId);

    const studentId = toPositiveInt(req.params.studentId);

    const newClassId = toPositiveInt(
      req.body?.new_class_id ?? req.body?.newClassId,
    );

    const churchId = toPositiveInt(req.user?.church_id);

    console.log("");
    console.log(
      "================================================================",
    );
    console.log(`🔄 [${requestId}] CHANGE ONE STUDENT CLASS`);
    console.log(
      "================================================================",
    );

    console.log({
      oldClassId,
      studentId,
      newClassId,
      churchId,
    });

    // =====================================================
    // VALIDATE
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!oldClassId || !studentId || !newClassId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_DATA",
        message: "classId, studentId và new_class_id là bắt buộc",
      });
    }

    if (oldClassId === newClassId) {
      return res.status(400).json({
        success: false,
        code: "SAME_CLASS",
        message: "Lớp mới phải khác lớp hiện tại",
      });
    }

    // =====================================================
    // CONNECTION
    // =====================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // OLD CLASS
    // =====================================================

    const oldClass = await getClassById(oldClassId, churchId, connection);

    if (!oldClass) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "OLD_CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp hiện tại",
      });
    }

    // =====================================================
    // NEW CLASS
    // =====================================================

    const newClass = await getClassById(newClassId, churchId, connection);

    if (!newClass) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "NEW_CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp mới",
      });
    }

    // =====================================================
    // STUDENT
    // =====================================================

    const student = await getStudentById(studentId, churchId, connection);

    if (!student) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message: "Không tìm thấy học sinh",
      });
    }

    // =====================================================
    // OLD RELATION
    // =====================================================

    const relation = await getClassStudentRelation(
      oldClassId,
      studentId,
      churchId,
      connection,
    );

    if (!relation) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "OLD_RELATION_NOT_FOUND",
        message: "Học sinh không thuộc lớp hiện tại",
      });
    }

    // =====================================================
    // NEW RELATION
    // =====================================================

    const targetRelation = await getClassStudentRelation(
      newClassId,
      studentId,
      churchId,
      connection,
    );

    if (targetRelation) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(409).json({
        success: false,

        code: "ALREADY_IN_TARGET_CLASS",

        message: `Học sinh đã có quan hệ với lớp "${newClass.name}"`,

        data: {
          relation: targetRelation,

          academic_year: newClass.academic_year,
        },

        debug: {
          request_id: requestId,
        },
      });
    }

    // =====================================================
    // OTHER ACTIVE CLASS
    // =====================================================

    const otherActive = await getActiveStudentRelation(
      studentId,
      churchId,
      connection,
      oldClassId,
    );

    if (otherActive && Number(otherActive.class_id) !== Number(newClassId)) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(409).json({
        success: false,

        code: "STUDENT_ALREADY_STUDYING",

        message: `Học sinh đang học tại lớp "${otherActive.class_name}"`,

        data: {
          current_class: otherActive,
        },

        debug: {
          request_id: requestId,
        },
      });
    }

    // =====================================================
    // CHANGE CLASS
    //
    // Giữ nguyên relation ID.
    // =====================================================

    const [result] = await connection.query(
      `
          UPDATE class_students
          SET
            class_id = ?,
            status = 'studying',
            left_at = NULL
          WHERE id = ?
        `,
      [newClassId, relation.id],
    );

    if (!result.affectedRows) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        code: "CHANGE_CLASS_FAILED",
        message: "Không thể chuyển lớp",
      });
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    transactionStarted = false;

    // =====================================================
    // LOG
    // =====================================================

    await safeWriteLog(req, {
      action: "CHANGE_CLASS_STUDENT",

      target_type: "class_students",

      target_id: relation.id,

      description:
        `Chuyển học sinh "${student.name}" ` +
        `(${student.code || "—"}) ` +
        `từ lớp "${oldClass.name}" ` +
        `(${oldClass.code || "—"}) ` +
        `năm học ${oldClass.academic_year || "—"} ` +
        `sang lớp "${newClass.name}" ` +
        `(${newClass.code || "—"}) ` +
        `năm học ${newClass.academic_year || "—"}`,
    });

    return res.json({
      success: true,

      code: "CLASS_CHANGED",

      message: "Chuyển lớp thành công",

      data: {
        relation_id: Number(relation.id),

        student_id: studentId,

        old_class_id: oldClassId,

        new_class_id: newClassId,

        old_class_name: oldClass.name,

        new_class_name: newClass.name,

        old_academic_year: oldClass.academic_year,

        new_academic_year: newClass.academic_year,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted, requestId);

    transactionStarted = false;

    console.error(`💥 [${requestId}] CHANGE CLASS ERROR`);

    console.error("MESSAGE:", error.message);

    console.error("CODE:", error.code);

    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      code: "CHANGE_CLASS_ERROR",
      message: "Không thể chuyển lớp",
      debug: {
        request_id: requestId,
      },
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 6. CHANGE MANY STUDENTS
//
// PUT /api/class-students/classes/:classId/change-students
//
// :classId = LỚP MỚI
//
// BODY:
// {
//   studentIds: [1,2,3]
// }
// =====================================================

exports.changeClassStudents = async (req, res) => {
  const requestId = createRequestId("BULK-CHANGE");

  let connection = null;
  let transactionStarted = false;

  try {
    const newClassId = toPositiveInt(req.params.classId);

    const churchId = toPositiveInt(req.user?.church_id);

    const { studentIds } = req.body;

    console.log("");
    console.log(
      "================================================================",
    );
    console.log(`👥 [${requestId}] BULK CHANGE STUDENTS`);
    console.log(
      "================================================================",
    );

    // =====================================================
    // AUTH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE CLASS
    // =====================================================

    if (!newClassId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CLASS_ID",
        message: "classId không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE STUDENTS
    // =====================================================

    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STUDENT_IDS",
        message: "studentIds phải là mảng và không được rỗng",
      });
    }

    const uniqueStudentIds = [
      ...new Set(
        studentIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (!uniqueStudentIds.length) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STUDENT_IDS",
        message: "Danh sách học sinh không hợp lệ",
      });
    }

    // =====================================================
    // CONNECTION
    // =====================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // TARGET CLASS
    // =====================================================

    const newClass = await getClassById(newClassId, churchId, connection);

    if (!newClass) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "TARGET_CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp mới",
      });
    }

    // =====================================================
    // STUDENTS
    // =====================================================

    const placeholders = uniqueStudentIds.map(() => "?").join(",");

    const [students] = await connection.query(
      `
          SELECT
            id,
            code,
            name,
            status,
            church_id
          FROM students
          WHERE id IN (${placeholders})
            AND church_id = ?
        `,
      [...uniqueStudentIds, churchId],
    );

    const foundIds = new Set(students.map((student) => Number(student.id)));

    const notFoundIds = uniqueStudentIds.filter(
      (id) => !foundIds.has(Number(id)),
    );

    if (notFoundIds.length) {
      await safeRollback(connection, transactionStarted, requestId);

      transactionStarted = false;

      return res.status(404).json({
        success: false,

        code: "STUDENTS_NOT_FOUND",

        message: "Một số học sinh không thuộc giáo xứ",

        data: {
          not_found_student_ids: notFoundIds,
        },
      });
    }

    // =====================================================
    // CURRENT RELATIONS
    // =====================================================

    const [relations] = await connection.query(
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
            c.academic_year,

            c.church_id AS class_church_id

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          INNER JOIN students s
            ON s.id = cs.student_id

          WHERE cs.student_id IN (${placeholders})

            AND c.church_id = ?
            AND s.church_id = ?

          ORDER BY cs.id DESC
        `,
      [...uniqueStudentIds, churchId, churchId],
    );

    // =====================================================
    // MAP
    // =====================================================

    const relationMap = new Map();

    for (const relation of relations) {
      const studentId = Number(relation.student_id);

      if (!relationMap.has(studentId)) {
        relationMap.set(studentId, []);
      }

      relationMap.get(studentId).push(relation);
    }

    // =====================================================
    // RESULT
    // =====================================================

    const updated = [];
    const inserted = [];
    const alreadyInTarget = [];

    // =====================================================
    // PROCESS
    // =====================================================

    for (const studentId of uniqueStudentIds) {
      console.log("");
      console.log(`👤 [${requestId}] PROCESS STUDENT ${studentId}`);

      const studentRelations = relationMap.get(studentId) || [];

      // ===================================================
      // TARGET RELATION
      // ===================================================

      const targetRelation = studentRelations.find(
        (relation) => Number(relation.class_id) === Number(newClassId),
      );

      if (targetRelation) {
        // -------------------------------------------------
        // ACTIVE TARGET
        // -------------------------------------------------

        if (targetRelation.status === "studying" && !targetRelation.left_at) {
          alreadyInTarget.push(studentId);

          continue;
        }

        // -------------------------------------------------
        // REACTIVATE TARGET
        // -------------------------------------------------

        const [reactivateResult] = await connection.query(
          `
            UPDATE class_students
            SET
              status = 'studying',
              joined_at = NOW(),
              left_at = NULL
            WHERE id = ?
          `,
          [targetRelation.id],
        );

        if (!reactivateResult.affectedRows) {
          throw new Error(
            `Không thể kích hoạt lại relation ${targetRelation.id}`,
          );
        }

        updated.push({
          student_id: studentId,

          relation_id: Number(targetRelation.id),

          old_class_id: Number(targetRelation.class_id),

          new_class_id: newClassId,

          academic_year: newClass.academic_year,

          type: "reactivated",
        });

        continue;
      }

      // ===================================================
      // ACTIVE CLASS
      // ===================================================

      const activeRelation = studentRelations.find(
        (relation) => relation.status === "studying" && !relation.left_at,
      );

      if (activeRelation) {
        // -------------------------------------------------
        // MOVE EXISTING RELATION
        // -------------------------------------------------

        const [updateResult] = await connection.query(
          `
            UPDATE class_students
            SET
              class_id = ?,
              status = 'studying',
              left_at = NULL
            WHERE id = ?
          `,
          [newClassId, activeRelation.id],
        );

        if (!updateResult.affectedRows) {
          throw new Error(`Không thể chuyển relation ${activeRelation.id}`);
        }

        updated.push({
          student_id: studentId,

          relation_id: Number(activeRelation.id),

          old_class_id: Number(activeRelation.class_id),

          new_class_id: newClassId,

          old_academic_year: activeRelation.academic_year,

          new_academic_year: newClass.academic_year,

          type: "transferred",
        });

        continue;
      }

      // ===================================================
      // NO ACTIVE CLASS
      // ===================================================

      const [insertResult] = await connection.query(
        `
          INSERT INTO class_students
          (
            class_id,
            student_id,
            status,
            joined_at,
            left_at
          )
          VALUES
          (
            ?,
            ?,
            'studying',
            NOW(),
            NULL
          )
        `,
        [newClassId, studentId],
      );

      inserted.push({
        student_id: studentId,

        relation_id: Number(insertResult.insertId),

        new_class_id: newClassId,

        academic_year: newClass.academic_year,
      });
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    transactionStarted = false;

    // =====================================================
    // LOG
    // =====================================================

    const studentMap = new Map(
      students.map((student) => [Number(student.id), student]),
    );

    const studentNames = uniqueStudentIds
      .map((id) => {
        const student = studentMap.get(Number(id));

        return student ? `${student.name} (${student.code || "—"})` : `#${id}`;
      })
      .join(", ");

    await safeWriteLog(req, {
      action: "CHANGE_CLASS_STUDENTS",

      target_type: "class_students",

      target_id: newClassId,

      description:
        `Xếp/chuyển ${uniqueStudentIds.length} học sinh ` +
        `sang lớp "${newClass.name}" ` +
        `(${newClass.code || "—"}) ` +
        `- năm học ${newClass.academic_year || "—"}: ` +
        `${studentNames}`,
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      message: "Đã xử lý danh sách học sinh",

      data: {
        student_ids: uniqueStudentIds,

        total: uniqueStudentIds.length,

        updated,

        inserted,

        already_in_target: alreadyInTarget,

        updated_count: updated.length,

        inserted_count: inserted.length,

        already_in_target_count: alreadyInTarget.length,

        new_class_id: newClassId,

        new_class_name: newClass.name,

        new_class_code: newClass.code || null,

        new_academic_year: newClass.academic_year || null,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    await safeRollback(connection, transactionStarted, requestId);

    transactionStarted = false;

    console.error("");
    console.error(`💥 [${requestId}] BULK CHANGE ERROR`);

    console.error("MESSAGE:", error.message);

    console.error("CODE:", error.code);

    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,

      code: "BULK_CHANGE_CLASS_ERROR",

      message: "Không thể chuyển học sinh sang lớp mới",

      debug: {
        request_id: requestId,
      },
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 7. REMOVE STUDENT FROM CLASS
//
// DELETE /api/class-students/:classId/:studentId
// =====================================================

exports.removeStudentFromClass = async (req, res) => {
  const requestId = createRequestId("REMOVE-STUDENT");

  let connection = null;

  try {
    const classId = toPositiveInt(req.params.classId);

    const studentId = toPositiveInt(req.params.studentId);

    const churchId = toPositiveInt(req.user?.church_id);

    console.log("");
    console.log(
      "================================================================",
    );
    console.log(`🗑️ [${requestId}] REMOVE STUDENT FROM CLASS`);
    console.log(
      "================================================================",
    );

    console.log({
      classId,
      studentId,
      churchId,
    });

    // =====================================================
    // AUTH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ID",
        message: "classId và studentId không hợp lệ",
      });
    }

    connection = await db.getConnection();

    // =====================================================
    // RELATION
    // =====================================================

    const relation = await getClassStudentRelation(
      classId,
      studentId,
      churchId,
      connection,
    );

    if (!relation) {
      return res.status(404).json({
        success: false,
        code: "RELATION_NOT_FOUND",
        message: "Học sinh không thuộc lớp này hoặc không thuộc giáo xứ",
      });
    }

    // =====================================================
    // DELETE
    // =====================================================

    const [result] = await connection.query(
      `
          DELETE FROM class_students
          WHERE id = ?
        `,
      [relation.id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        code: "DELETE_FAILED",
        message: "Không thể xóa học sinh khỏi lớp",
      });
    }

    // =====================================================
    // LOG
    // =====================================================

    await safeWriteLog(req, {
      action: "DELETE_CLASS_STUDENT",

      target_type: "class_students",

      target_id: relation.id,

      description:
        `Xóa học sinh "${relation.student_name}" ` +
        `(${relation.student_code || "—"}) ` +
        `khỏi lớp "${relation.class_name}" ` +
        `(${relation.class_code || "—"}) ` +
        `- năm học ${relation.academic_year || "—"}`,
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      message: `Đã xóa học sinh "${relation.student_name}" khỏi lớp`,

      data: {
        id: Number(relation.id),

        class_id: classId,

        student_id: studentId,

        student_name: relation.student_name,

        class_name: relation.class_name,

        class_code: relation.class_code,

        academic_year: relation.academic_year,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    console.error("");
    console.error(`💥 [${requestId}] REMOVE STUDENT ERROR`);

    console.error("MESSAGE:", error.message);

    console.error("CODE:", error.code);

    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,

      code: "REMOVE_CLASS_STUDENT_ERROR",

      message: "Không thể xóa học sinh khỏi lớp",

      debug: {
        request_id: requestId,
      },
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

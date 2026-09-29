const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");

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
// SAFE NUMBER
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
    await writeLog(req, data);
  } catch (error) {
    console.error("⚠️ ACTIVITY LOG ERROR:", error.message);
  }
};

// =====================================================
// GET CLASS BY ID + CHURCH
// =====================================================

const getClassById = async (classId, churchId) => {
  const [rows] = await db.query(
    `
    SELECT
      id,
      name,
      code,
      category,
      status,
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
// =====================================================

const getStudentById = async (studentId, churchId) => {
  const [rows] = await db.query(
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
      diocese,
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
// GET CLASS SCHEDULES
//
// Lưu ý:
// Không dùng cs.church_id.
// Bảo vệ giáo xứ thông qua classes.church_id.
//
// Điều này tránh lỗi nếu class_schedules hiện tại
// chưa có cột church_id.
// =====================================================

const getSchedulesByClassId = async (classId, churchId) => {
  const [rows] = await db.query(
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
    // CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // CLASS ID
    // =====================================================

    if (!classId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CLASS_ID",
        message: "classId không hợp lệ",
      });
    }

    // =====================================================
    // GET CLASS
    // =====================================================

    const classData = await getClassById(classId, churchId);

    if (!classData) {
      console.log(`❌ [${requestId}] CLASS NOT FOUND`);

      return res.status(404).json({
        success: false,
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp hoặc lớp không thuộc giáo xứ",
      });
    }

    // =====================================================
    // GET SCHEDULE
    // =====================================================

    let schedules = [];

    try {
      schedules = await getSchedulesByClassId(classId, churchId);
    } catch (scheduleError) {
      console.error(
        `❌ [${requestId}] GET SCHEDULE ERROR:`,
        scheduleError.message,
      );

      throw scheduleError;
    }

    // =====================================================
    // GET STUDENTS
    //
    // QUAN TRỌNG:
    // Kiểm tra cả:
    // - class_id
    // - student church
    // - class church
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
        s.diocese,
        s.avatar,

        s.status AS student_status,

        c.name AS class_name,
        c.code AS class_code,
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

    console.log("");
    console.log(`📊 [${requestId}] STUDENT COUNT:`, rows.length);

    console.table(
      rows.map((row) => ({
        relation_id: row.id,
        class_id: row.class_id,
        student_id: row.student_id,
        name: row.name,
        code: row.code,
        status: row.status,
        joined_at: row.joined_at,
        left_at: row.left_at,
        class_church_id: row.class_church_id,
      })),
    );

    console.log(`📅 [${requestId}] SCHEDULE COUNT:`, schedules.length);

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

      debug: {
        request_id: requestId,
        class_id: classId,
        church_id: churchId,
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
    console.error("SQL MESSAGE:", error.sqlMessage);
    console.error("STACK:", error.stack);

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

    console.log("studentId:", studentId);
    console.log("churchId:", churchId);

    // =====================================================
    // CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // STUDENT
    // =====================================================

    if (!studentId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_STUDENT_ID",
        message: "studentId không hợp lệ",
      });
    }

    const student = await getStudentById(studentId, churchId);

    if (!student) {
      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message: "Không tìm thấy học sinh hoặc học sinh không thuộc giáo xứ",
      });
    }

    // =====================================================
    // CLASSES
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

        c.name,
        c.code,
        c.category,

        c.status AS class_status,

        c.church_id

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.student_id = ?
        AND c.church_id = ?

      ORDER BY
        CASE
          WHEN cs.status = 'studying' THEN 0
          WHEN cs.status = 'completed' THEN 1
          WHEN cs.status = 'transferred' THEN 2
          WHEN cs.status = 'dropped' THEN 3
          ELSE 4
        END,

        cs.joined_at DESC,
        cs.id DESC
      `,
      [studentId, churchId],
    );

    // =====================================================
    // ATTACH SCHEDULES
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
        class_name: item.name,
        class_code: item.code,
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

    // =====================================================
    // REQUEST LOG
    // =====================================================

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

    console.log("PARSED:", {
      classId,
      studentId,
      churchId,
    });

    // =====================================================
    // AUTH
    // =====================================================

    if (!churchId) {
      console.log(`❌ [${requestId}] NO CHURCH ID`);

      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE IDS
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

    // =====================================================
    // VALIDATE STATUS
    // =====================================================

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

    console.log(`🔄 [${requestId}] TRANSACTION START`);

    // =====================================================
    // 1. CHECK CLASS
    // =====================================================

    const [classRows] = await connection.query(
      `
      SELECT
        id,
        name,
        code,
        category,
        status,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, churchId],
    );

    console.log(`📚 [${requestId}] CLASS RESULT:`, classRows);

    if (!classRows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp hoặc lớp không thuộc giáo xứ",
      });
    }

    const targetClass = classRows[0];

    // =====================================================
    // 2. CHECK STUDENT
    // =====================================================

    const [studentRows] = await connection.query(
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
          diocese,
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

    console.log(`👨‍🎓 [${requestId}] STUDENT RESULT:`, studentRows);

    if (!studentRows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message: "Không tìm thấy học sinh hoặc học sinh không thuộc giáo xứ",
      });
    }

    const student = studentRows[0];

    // =====================================================
    // 3. LẤY TẤT CẢ QUAN HỆ CỦA STUDENT
    //
    // Đây là phần quan trọng để debug.
    // =====================================================

    const [allRelations] = await connection.query(
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
          c.church_id AS class_church_id

        FROM class_students cs

        LEFT JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.student_id = ?

        ORDER BY cs.id DESC
        `,
      [studentId],
    );

    console.log("");
    console.log(`🔎 [${requestId}] ALL RELATIONS OF STUDENT`);

    console.table(
      allRelations.map((item) => ({
        relation_id: item.id,
        class_id: item.class_id,
        student_id: item.student_id,
        status: item.status,
        joined_at: item.joined_at,
        left_at: item.left_at,
        class_name: item.class_name,
        class_code: item.class_code,
        class_church_id: item.class_church_id,
      })),
    );

    // =====================================================
    // 4. CHECK EXACT RELATION
    //
    // QUAN TRỌNG:
    // Kiểm tra class + student + church.
    // =====================================================

    const [existingRelations] = await connection.query(
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
          c.church_id AS class_church_id

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.class_id = ?
          AND cs.student_id = ?
          AND c.church_id = ?

        ORDER BY cs.id DESC
        `,
      [classId, studentId, churchId],
    );

    console.log("");
    console.log(`🔎 [${requestId}] EXACT RELATION`);

    console.table(existingRelations);

    // =====================================================
    // 5. NẾU ĐÃ CÓ QUAN HỆ
    // =====================================================

    if (existingRelations.length) {
      const relation = existingRelations[0];

      console.log("");
      console.log(`⚠️ [${requestId}] EXACT RELATION EXISTS`);

      console.log({
        relationId: relation.id,
        classId: relation.class_id,
        studentId: relation.student_id,
        status: relation.status,
        joinedAt: relation.joined_at,
        leftAt: relation.left_at,
        className: relation.class_name,
      });

      // ===================================================
      // NẾU ĐANG STUDYING
      // THỰC SỰ ĐANG Ở LỚP NÀY
      // ===================================================

      if (relation.status === "studying" && !relation.left_at) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,

          code: "ALREADY_IN_CLASS",

          message: `Học sinh "${student.name}" đang học tại lớp "${relation.class_name}"`,

          data: {
            relation_id: Number(relation.id),

            class_id: Number(relation.class_id),

            student_id: Number(relation.student_id),

            status: relation.status,

            joined_at: relation.joined_at,

            left_at: relation.left_at,

            class_name: relation.class_name,

            class_code: relation.class_code,
          },

          debug: {
            request_id: requestId,
            reason: "EXACT_ACTIVE_RELATION_EXISTS",
          },
        });
      }

      // ===================================================
      // NẾU QUAN HỆ CŨ ĐÃ KẾT THÚC
      //
      // Không tạo thêm relation.
      // Reactivate relation cũ.
      // ===================================================

      console.log(`♻️ [${requestId}] REACTIVATE OLD RELATION`);

      const [reactivateResult] = await connection.query(
        `
          UPDATE class_students
          SET
            status = 'studying',
            joined_at = COALESCE(?, NOW()),
            left_at = NULL
          WHERE id = ?
          `,
        [joinedAt, relation.id],
      );

      if (!reactivateResult.affectedRows) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          code: "REACTIVATE_FAILED",
          message: "Không thể kích hoạt lại quan hệ lớp - học sinh",
        });
      }

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
          `(${targetClass.code || "—"})`,
      });

      return res.status(200).json({
        success: true,

        code: "RELATION_REACTIVATED",

        message: "Học sinh đã được đưa trở lại lớp",

        data: {
          id: Number(relation.id),

          class_id: classId,

          student_id: studentId,

          status: "studying",

          class: targetClass,

          student,
        },

        debug: {
          request_id: requestId,
        },
      });
    }

    // =====================================================
    // 6. CHECK STUDYING CLASS KHÁC
    // =====================================================

    const [activeRelations] = await connection.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,
          cs.status,
          cs.joined_at,
          cs.left_at,

          c.name AS class_name,
          c.code AS class_code

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.student_id = ?
          AND cs.status = 'studying'
          AND cs.left_at IS NULL
          AND c.church_id = ?

        ORDER BY cs.id DESC
        `,
      [studentId, churchId],
    );

    console.log("");
    console.log(`🔎 [${requestId}] ACTIVE RELATIONS`);

    console.table(
      activeRelations.map((item) => ({
        relation_id: item.id,
        class_id: item.class_id,
        student_id: item.student_id,
        status: item.status,
        class_name: item.class_name,
        class_code: item.class_code,
      })),
    );

    if (status === "studying" && activeRelations.length) {
      const current = activeRelations[0];

      await connection.rollback();
      transactionStarted = false;

      console.log(`⚠️ [${requestId}] STUDENT ALREADY STUDYING`);

      return res.status(409).json({
        success: false,

        code: "STUDENT_ALREADY_STUDYING",

        message: `Học sinh "${student.name}" đang học tại lớp "${current.class_name}"`,

        data: {
          student_id: studentId,

          current_class: {
            id: Number(current.class_id),

            name: current.class_name,

            code: current.class_code,

            relation_id: Number(current.id),
          },

          target_class: {
            id: Number(targetClass.id),

            name: targetClass.name,

            code: targetClass.code,
          },
        },

        debug: {
          request_id: requestId,
        },
      });
    }

    // =====================================================
    // 7. INSERT
    // =====================================================

    console.log("");
    console.log(`➕ [${requestId}] INSERT class_students`);

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

    console.log(`INSERT ID: ${insertResult.insertId}`);

    // =====================================================
    // 8. VERIFY INSERT
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
          c.church_id AS class_church_id

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.id = ?

        LIMIT 1
        `,
      [insertResult.insertId],
    );

    console.log("");
    console.log(`🔍 [${requestId}] VERIFY INSERT`);

    console.table(verifyRows);

    if (!verifyRows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(500).json({
        success: false,
        code: "INSERT_VERIFY_FAILED",
        message: "Đã thêm nhưng không thể xác nhận dữ liệu trong database",
        debug: {
          request_id: requestId,
        },
      });
    }

    // =====================================================
    // 9. COMMIT
    // =====================================================

    await connection.commit();

    transactionStarted = false;

    console.log("");
    console.log(`✅ [${requestId}] COMMIT SUCCESS`);

    // =====================================================
    // 10. LOG
    // =====================================================

    await safeWriteLog(req, {
      action: "ADD_STUDENT_TO_CLASS",

      target_type: "class_students",

      target_id: insertResult.insertId,

      description:
        `Thêm học sinh "${student.name}" ` +
        `(${student.code || "—"}) ` +
        `vào lớp "${targetClass.name}" ` +
        `(${targetClass.code || "—"})`,
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(201).json({
      success: true,

      code: "STUDENT_ADDED",

      message: "Thêm học sinh vào lớp thành công",

      data: {
        id: insertResult.insertId,

        class_id: classId,

        student_id: studentId,

        status,

        joined_at: joinedAt || new Date(),

        class: targetClass,

        student,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    // =====================================================
    // ROLLBACK
    // =====================================================

    if (connection && transactionStarted) {
      try {
        await connection.rollback();

        console.log(`🔄 [${requestId}] ROLLBACK`);
      } catch (rollbackError) {
        console.error(
          `❌ [${requestId}] ROLLBACK ERROR:`,
          rollbackError.message,
        );
      }
    }

    // =====================================================
    // ERROR LOG
    // =====================================================

    console.error("");
    console.error(
      "================================================================",
    );
    console.error(`💥 [${requestId}] ADD STUDENT ERROR`);
    console.error(
      "================================================================",
    );

    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("ERRNO:", error.errno);
    console.error("SQL STATE:", error.sqlState);
    console.error("SQL MESSAGE:", error.sqlMessage);

    console.error("BODY:", req.body);
    console.error("USER:", req.user);

    // =====================================================
    // DUPLICATE
    // =====================================================

    if (error.code === "ER_DUP_ENTRY") {
      console.error(`🚨 [${requestId}] DATABASE DUPLICATE`);

      // ---------------------------------------------------
      // KIỂM TRA LẠI DB
      // ---------------------------------------------------

      try {
        const [duplicateRows] = await db.query(
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
            c.church_id AS class_church_id

          FROM class_students cs

          LEFT JOIN classes c
            ON c.id = cs.class_id

          WHERE
            (
              cs.class_id = ?
              AND cs.student_id = ?
            )

            OR cs.student_id = ?

          ORDER BY cs.id DESC
          `,
          [
            Number(req.body?.class_id),

            Number(req.body?.student_id),

            Number(req.body?.student_id),
          ],
        );

        console.log("");
        console.log(`🔍 [${requestId}] DB AFTER DUPLICATE`);

        console.table(duplicateRows);
      } catch (debugError) {
        console.error("DUPLICATE DEBUG ERROR:", debugError.message);
      }

      return res.status(409).json({
        success: false,

        code: "DUPLICATE_RELATION",

        message: "Database từ chối vì quan hệ học sinh - lớp đã tồn tại",

        error: error.sqlMessage,

        debug: {
          request_id: requestId,

          class_id: req.body?.class_id,

          student_id: req.body?.student_id,
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
    // DEFAULT
    // =====================================================

    return res.status(500).json({
      success: false,

      code: "ADD_STUDENT_TO_CLASS_ERROR",

      message: "Không thể thêm học sinh vào lớp",

      error: process.env.NODE_ENV === "production" ? undefined : error.message,

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

    console.log({
      classId,
      studentId,
      churchId,
      status,
      joined_at,
      left_at,
    });

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

    // =====================================================
    // GET RELATION
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

          s.name AS student_name,
          s.code AS student_code,

          c.name AS class_name,
          c.code AS class_code,
          c.church_id

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.class_id = ?
          AND cs.student_id = ?
          AND s.church_id = ?
          AND c.church_id = ?

        LIMIT 1
        `,
      [classId, studentId, churchId, churchId],
    );

    if (!relations.length) {
      return res.status(404).json({
        success: false,
        code: "RELATION_NOT_FOUND",
        message: "Không tìm thấy học sinh trong lớp của giáo xứ",
      });
    }

    const oldRelation = relations[0];

    // =====================================================
    // CHECK OTHER ACTIVE CLASS
    // =====================================================

    if (status === "studying") {
      const [otherClass] = await connection.query(
        `
          SELECT
            cs.id,
            cs.class_id,
            c.name AS class_name,
            c.code AS class_code

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE cs.student_id = ?
            AND cs.status = 'studying'
            AND cs.left_at IS NULL

            AND c.church_id = ?

            AND cs.class_id != ?

          LIMIT 1
          `,
        [studentId, churchId, classId],
      );

      if (otherClass.length) {
        return res.status(409).json({
          success: false,

          code: "STUDENT_ALREADY_STUDYING",

          message: `Học sinh đang học tại lớp "${otherClass[0].class_name}"`,

          data: {
            current_class: otherClass[0],
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
      return res.status(400).json({
        success: false,
        code: "NO_UPDATE_DATA",
        message: "Không có dữ liệu cần cập nhật",
      });
    }

    values.push(classId);
    values.push(studentId);

    // =====================================================
    // UPDATE
    // =====================================================

    const [result] = await connection.query(
      `
        UPDATE class_students
        SET ${fields.join(", ")}
        WHERE class_id = ?
          AND student_id = ?
        `,
      values,
    );

    // =====================================================
    // LOG
    // =====================================================

    if (result.affectedRows) {
      await safeWriteLog(req, {
        action: "UPDATE_CLASS_STUDENT",

        target_type: "class_students",

        target_id: oldRelation.id,

        description:
          `Cập nhật học sinh "${oldRelation.student_name}" ` +
          `(${oldRelation.student_code || "—"}) ` +
          `trong lớp "${oldRelation.class_name}" ` +
          `(${oldRelation.class_code || "—"})`,
      });
    }

    return res.json({
      success: true,

      message: "Cập nhật quan hệ lớp - học sinh thành công",

      affectedRows: result.affectedRows,

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] updateClassStudent ERROR:`, error);

    return res.status(500).json({
      success: false,
      code: "UPDATE_CLASS_STUDENT_ERROR",
      message: "Không thể cập nhật quan hệ lớp - học sinh",
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
// Body:
// {
//   "new_class_id": 5
// }
// =====================================================

exports.changeClassStudent = async (req, res) => {
  const requestId = createRequestId("CHANGE-CLASS");

  let connection = null;
  let transactionStarted = false;

  try {
    const classId = toPositiveInt(req.params.classId);

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
      classId,
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

    if (!classId || !studentId || !newClassId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_DATA",
        message: "classId, studentId và new_class_id là bắt buộc",
      });
    }

    if (classId === newClassId) {
      return res.status(400).json({
        success: false,
        code: "SAME_CLASS",
        message: "Lớp mới phải khác lớp hiện tại",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // OLD CLASS
    // =====================================================

    const [oldClasses] = await connection.query(
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

    if (!oldClasses.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "OLD_CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp hiện tại",
      });
    }

    const oldClass = oldClasses[0];

    // =====================================================
    // NEW CLASS
    // =====================================================

    const [newClasses] = await connection.query(
      `
        SELECT
          id,
          name,
          code,
          category,
          status,
          church_id
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
      [newClassId, churchId],
    );

    if (!newClasses.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "NEW_CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp mới",
      });
    }

    const newClass = newClasses[0];

    // =====================================================
    // STUDENT
    // =====================================================

    const student = await getStudentById(studentId, churchId);

    if (!student) {
      await connection.rollback();
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

    const [relations] = await connection.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,
          cs.status,
          cs.joined_at,
          cs.left_at

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        INNER JOIN students s
          ON s.id = cs.student_id

        WHERE cs.class_id = ?
          AND cs.student_id = ?

          AND c.church_id = ?
          AND s.church_id = ?

        LIMIT 1
        `,
      [classId, studentId, churchId, churchId],
    );

    if (!relations.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "OLD_RELATION_NOT_FOUND",
        message: "Học sinh không thuộc lớp hiện tại",
      });
    }

    const relation = relations[0];

    // =====================================================
    // NEW RELATION
    // =====================================================

    const [newRelations] = await connection.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,
          cs.status,
          cs.joined_at,
          cs.left_at

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.class_id = ?
          AND cs.student_id = ?
          AND c.church_id = ?

        LIMIT 1
        `,
      [newClassId, studentId, churchId],
    );

    if (newRelations.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "ALREADY_IN_TARGET_CLASS",
        message: `Học sinh đã có trong lớp "${newClass.name}"`,
        data: {
          relation: newRelations[0],
        },
      });
    }

    // =====================================================
    // CHANGE
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
      await connection.rollback();
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
        `sang lớp "${newClass.name}" ` +
        `(${newClass.code || "—"})`,
    });

    return res.json({
      success: true,

      message: "Chuyển lớp thành công",

      data: {
        relation_id: relation.id,

        student_id: studentId,

        old_class_id: classId,

        new_class_id: newClassId,

        old_class_name: oldClass.name,

        new_class_name: newClass.name,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error("");
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
// ROUTE HIỆN TẠI:
//
// PUT /api/class-students/classes/:classId/change-students
//
// Body:
// {
//   "studentIds": [1,2,3]
// }
//
// classId trong URL = LỚP MỚI
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

    console.log({
      newClassId,
      churchId,
      studentIds,
    });

    // =====================================================
    // CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        code: "NO_CHURCH_ID",
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // CLASS
    // =====================================================

    if (!newClassId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CLASS_ID",
        message: "classId không hợp lệ",
      });
    }

    // =====================================================
    // STUDENTS
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

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // TARGET CLASS
    // =====================================================

    const [classRows] = await connection.query(
      `
        SELECT
          id,
          name,
          code,
          category,
          status,
          church_id
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
      [newClassId, churchId],
    );

    if (!classRows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        code: "TARGET_CLASS_NOT_FOUND",
        message: "Không tìm thấy lớp mới",
      });
    }

    const newClass = classRows[0];

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
      await connection.rollback();
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
    // GET ALL RELATIONS
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
        c.code AS class_code

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.student_id IN (${placeholders})
        AND c.church_id = ?

      ORDER BY cs.id DESC
      `,
      [...uniqueStudentIds, churchId],
    );

    console.log("");
    console.log(`🔎 [${requestId}] CURRENT RELATIONS`);

    console.table(relations);

    // =====================================================
    // MAP
    // =====================================================

    const relationMap = new Map();

    for (const relation of relations) {
      const sid = Number(relation.student_id);

      if (!relationMap.has(sid)) {
        relationMap.set(sid, []);
      }

      relationMap.get(sid).push(relation);
    }

    const updated = [];
    const inserted = [];
    const alreadyInTarget = [];

    // =====================================================
    // PROCESS
    // =====================================================

    for (const studentId of uniqueStudentIds) {
      const studentRelations = relationMap.get(studentId) || [];

      // -----------------------------------------------
      // ĐÃ CÓ TRONG TARGET
      // -----------------------------------------------

      const targetRelation = studentRelations.find(
        (relation) => Number(relation.class_id) === newClassId,
      );

      if (targetRelation) {
        // Nếu relation cũ nhưng không active
        // thì kích hoạt lại.

        if (targetRelation.status !== "studying" || targetRelation.left_at) {
          await connection.query(
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

          updated.push({
            student_id: studentId,

            relation_id: targetRelation.id,

            old_class_id: newClassId,

            new_class_id: newClassId,

            type: "reactivated",
          });
        } else {
          alreadyInTarget.push(studentId);
        }

        continue;
      }

      // -----------------------------------------------
      // TÌM ACTIVE CLASS
      // -----------------------------------------------

      const activeRelation = studentRelations.find(
        (relation) => relation.status === "studying" && !relation.left_at,
      );

      // -----------------------------------------------
      // CÓ ACTIVE CLASS
      // → UPDATE
      // -----------------------------------------------

      if (activeRelation) {
        await connection.query(
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

        updated.push({
          student_id: studentId,

          relation_id: activeRelation.id,

          old_class_id: Number(activeRelation.class_id),

          new_class_id: newClassId,

          type: "transferred",
        });

        continue;
      }

      // -----------------------------------------------
      // KHÔNG CÓ ACTIVE CLASS
      // → INSERT
      // -----------------------------------------------

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

        relation_id: insertResult.insertId,

        new_class_id: newClassId,
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
        `Xếp/chuyển ${uniqueStudentIds.length} ` +
        `học sinh sang lớp "${newClass.name}" ` +
        `(${newClass.code || "—"}): ` +
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

        updated: updated,

        inserted: inserted,

        already_in_target: alreadyInTarget,

        updated_count: updated.length,

        inserted_count: inserted.length,

        already_in_target_count: alreadyInTarget.length,

        new_class_id: newClassId,

        new_class_name: newClass.name,

        new_class_code: newClass.code || null,
      },

      debug: {
        request_id: requestId,
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

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
    // GET RELATION
    // =====================================================

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

        LIMIT 1
        `,
      [classId, studentId, churchId, churchId],
    );

    console.log(`🔎 [${requestId}] RELATION:`, rows);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        code: "RELATION_NOT_FOUND",
        message: "Học sinh không thuộc lớp này hoặc không thuộc giáo xứ",
      });
    }

    const relation = rows[0];

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
        `(${relation.class_code || "—"})`,
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      message: `Đã xóa học sinh "${relation.student_name}" khỏi lớp`,

      data: {
        id: relation.id,

        class_id: classId,

        student_id: studentId,

        student_name: relation.student_name,

        class_name: relation.class_name,
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

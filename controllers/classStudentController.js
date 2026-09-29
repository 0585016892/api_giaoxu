const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");

// =====================================================
// HELPERS
// =====================================================

const ALLOWED_STATUS = ["studying", "completed", "transferred", "dropped"];

/**
 * =====================================================
 * LẤY LỚP THEO ID + GIÁO XỨ
 * =====================================================
 */
const getClassById = async (classId, churchId = null) => {
  let sql = `
    SELECT
      id,
      name,
      code,
      category,
      status,
      church_id
    FROM classes
    WHERE id = ?
  `;

  const params = [classId];

  if (churchId) {
    sql += ` AND church_id = ? `;
    params.push(churchId);
  }

  sql += `
    LIMIT 1
  `;

  const [rows] = await db.query(sql, params);

  return rows[0] || null;
};

/**
 * =====================================================
 * LẤY HỌC SINH THEO ID + GIÁO XỨ
 * =====================================================
 */
const getStudentById = async (studentId, churchId = null) => {
  let sql = `
    SELECT *
    FROM students
    WHERE id = ?
  `;

  const params = [studentId];

  if (churchId) {
    sql += ` AND church_id = ? `;
    params.push(churchId);
  }

  sql += `
    LIMIT 1
  `;

  const [rows] = await db.query(sql, params);

  return rows[0] || null;
};

/**
 * =====================================================
 * LẤY LỊCH HỌC CỦA LỚP
 *
 * class_students KHÔNG còn chứa thông tin lịch học.
 * Tất cả lấy từ class_schedules.
 * =====================================================
 */
const getSchedulesByClassId = async (classId, churchId = null) => {
  let sql = `
    SELECT
      cs.id,
      cs.class_id,
      cs.day_of_week,
      cs.start_time,
      cs.end_time,
      cs.room,
      cs.start_date,
      cs.end_date,
      cs.status,
      cs.church_id
    FROM class_schedules cs
    INNER JOIN classes c
      ON c.id = cs.class_id
    WHERE cs.class_id = ?
  `;

  const params = [classId];

  if (churchId) {
    sql += `
      AND cs.church_id = ?
      AND c.church_id = ?
    `;

    params.push(churchId);
    params.push(churchId);
  }

  sql += `
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
  `;

  const [rows] = await db.query(sql, params);

  return rows;
};

// =====================================================
// 1. LẤY HỌC SINH TRONG LỚP
// GET /api/class-students/class/:classId
// =====================================================

exports.getStudentsByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const church_id = req.user?.church_id;

    console.log("");
    console.log("============================================================");
    console.log("              GET STUDENTS BY CLASS");
    console.log("============================================================");
    console.log("🏠 church_id:", church_id);
    console.log("📚 classId:", classId);

    // =====================================================
    // KIỂM TRA GIÁO XỨ
    // =====================================================

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE
    // =====================================================

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "classId là bắt buộc",
      });
    }

    // =====================================================
    // KIỂM TRA LỚP
    // =====================================================

    const classData = await getClassById(classId, church_id);

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ",
      });
    }

    // =====================================================
    // LẤY LỊCH HỌC
    // =====================================================

    const schedules = await getSchedulesByClassId(classId, church_id);

    // =====================================================
    // LẤY HỌC SINH
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
        s.status AS student_status

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id

      WHERE cs.class_id = ?
        AND s.church_id = ?

      ORDER BY
        CASE
          WHEN cs.status = 'studying' THEN 0
          ELSE 1
        END,
        s.name ASC
      `,
      [classId, church_id],
    );

    console.log("👨‍🎓 students:", rows.length);
    console.log("📅 schedules:", schedules.length);

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
    });
  } catch (error) {
    console.error("getStudentsByClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách học sinh trong lớp",
    });
  }
};

// =====================================================
// 2. LẤY CÁC LỚP CỦA HỌC SINH
// GET /api/class-students/student/:studentId
// =====================================================

exports.getClassesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const church_id = req.user?.church_id;

    console.log("");
    console.log("============================================================");
    console.log("              GET CLASSES BY STUDENT");
    console.log("============================================================");
    console.log("🏠 church_id:", church_id);
    console.log("👨‍🎓 studentId:", studentId);

    // =====================================================
    // KIỂM TRA GIÁO XỨ
    // =====================================================

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId là bắt buộc",
      });
    }

    // =====================================================
    // KIỂM TRA HỌC SINH
    // =====================================================

    const student = await getStudentById(studentId, church_id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ",
      });
    }

    // =====================================================
    // LẤY CÁC LỚP
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
          ELSE 1
        END,
        cs.joined_at DESC
      `,
      [studentId, church_id],
    );

    // =====================================================
    // GẮN SCHEDULE CHO TỪNG LỚP
    // =====================================================

    const classes = [];

    for (const classItem of rows) {
      const schedules = await getSchedulesByClassId(
        classItem.class_id,
        church_id,
      );

      classes.push({
        ...classItem,
        schedules,
      });
    }

    return res.json({
      success: true,
      data: classes,
      student,
    });
  } catch (error) {
    console.error("getClassesByStudent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lớp của học sinh",
    });
  }
};

// =====================================================
// 3. THÊM HỌC SINH VÀO LỚP
// POST /api/class-students
// =====================================================

// =========================================================
// THÊM HỌC SINH VÀO LỚP
// POST /api/class-students
// =========================================================
exports.addStudentToClass = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const church_id = req.user?.church_id;

    const {
      class_id,
      student_id,
      status = "studying",
      joined_at = null,
    } = req.body;

    console.log("");
    console.log("============================================================");
    console.log("              POST /api/class-students");
    console.log("============================================================");
    console.log("CHURCH ID:", church_id);
    console.log("CLASS ID:", class_id);
    console.log("STUDENT ID:", student_id);
    console.log("STATUS:", status);
    console.log("JOINED AT:", joined_at);

    // =====================================================
    // AUTH
    // =====================================================
    if (!church_id) {
      console.log("❌ Không có church_id");

      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE ID
    // =====================================================
    const classId = Number(class_id);
    const studentId = Number(student_id);

    if (
      !Number.isInteger(classId) ||
      classId <= 0 ||
      !Number.isInteger(studentId) ||
      studentId <= 0
    ) {
      console.log("❌ class_id hoặc student_id không hợp lệ");

      return res.status(400).json({
        success: false,
        message: "class_id hoặc student_id không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE STATUS
    // =====================================================
    const ALLOWED_STATUS = ["studying", "completed", "dropped", "transferred"];

    if (!ALLOWED_STATUS.includes(status)) {
      console.log("❌ STATUS không hợp lệ:", status);

      return res.status(400).json({
        success: false,
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
    // 1. KIỂM TRA LỚP
    // =====================================================
    const [classes] = await connection.query(
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
      [classId, church_id],
    );

    console.log("CLASS RESULT:", classes);

    if (!classes.length) {
      console.log("❌ Không tìm thấy lớp trong giáo xứ");

      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp hoặc lớp không thuộc giáo xứ",
      });
    }

    const targetClass = classes[0];

    // =====================================================
    // 2. KIỂM TRA HỌC SINH
    // =====================================================
    const [students] = await connection.query(
      `
        SELECT
          id,
          code,
          name,
          status,
          church_id
        FROM students
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [studentId, church_id],
    );

    console.log("STUDENT RESULT:", students);

    if (!students.length) {
      console.log("❌ Không tìm thấy học sinh trong giáo xứ");

      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh hoặc học sinh không thuộc giáo xứ",
      });
    }

    const student = students[0];

    // =====================================================
    // 3. KIỂM TRA QUAN HỆ ĐÃ TỒN TẠI
    // =====================================================
    const [existingRelation] = await connection.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,
          cs.status,
          c.name AS class_name,
          c.code AS class_code
        FROM class_students cs
        INNER JOIN classes c
          ON c.id = cs.class_id
        WHERE cs.class_id = ?
          AND cs.student_id = ?
          AND c.church_id = ?
        LIMIT 1
      `,
      [classId, studentId, church_id],
    );

    console.log("EXISTING RELATION:", existingRelation);

    if (existingRelation.length) {
      const relation = existingRelation[0];

      console.log("⚠️ HỌC SINH ĐÃ CÓ TRONG LỚP NÀY");
      console.log("Relation ID:", relation.id);
      console.log("Class:", relation.class_name);
      console.log("Status:", relation.status);

      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "ALREADY_IN_CLASS",
        message: `Học sinh "${student.name}" đã có trong lớp "${relation.class_name}"`,
        data: {
          relation_id: relation.id,
          class_id: relation.class_id,
          student_id: relation.student_id,
          status: relation.status,
          class_name: relation.class_name,
          class_code: relation.class_code,
        },
      });
    }

    // =====================================================
    // 4. NẾU ĐANG GÁN STUDYING
    //    KIỂM TRA HỌC SINH CÓ ĐANG Ở LỚP KHÁC KHÔNG
    // =====================================================
    if (status === "studying") {
      const [currentClass] = await connection.query(
        `
          SELECT
            cs.id,
            cs.class_id,
            cs.student_id,
            cs.status,
            c.name AS class_name,
            c.code AS class_code
          FROM class_students cs
          INNER JOIN classes c
            ON c.id = cs.class_id
          WHERE cs.student_id = ?
            AND cs.status = 'studying'
            AND c.church_id = ?
          LIMIT 1
        `,
        [studentId, church_id],
      );

      console.log("CURRENT STUDYING CLASS:", currentClass);

      if (currentClass.length) {
        const current = currentClass[0];

        console.log("⚠️ HỌC SINH ĐANG HỌC LỚP KHÁC");
        console.log("Current class ID:", current.class_id);
        console.log("Current class:", current.class_name);
        console.log("Target class ID:", classId);
        console.log("Target class:", targetClass.name);

        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          code: "STUDENT_ALREADY_STUDYING",
          message: `Học sinh "${student.name}" đang học tại lớp "${current.class_name}"`,
          data: {
            student_id: studentId,

            current_class: {
              id: current.class_id,
              name: current.class_name,
              code: current.class_code,
              relation_id: current.id,
            },

            target_class: {
              id: targetClass.id,
              name: targetClass.name,
              code: targetClass.code,
            },
          },
        });
      }
    }

    // =====================================================
    // 5. INSERT
    // =====================================================
    console.log("➡️ INSERT class_students");

    const [result] = await connection.query(
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
          ?,
          COALESCE(?, NOW()),
          NULL
        )
      `,
      [classId, studentId, status, joined_at],
    );

    console.log("INSERT RESULT:", result);

    // =====================================================
    // 6. COMMIT
    // =====================================================
    await connection.commit();
    transactionStarted = false;

    console.log("✅ THÊM HỌC SINH VÀO LỚP THÀNH CÔNG");
    console.log("Relation ID:", result.insertId);

    // =====================================================
    // LOG
    // =====================================================
    try {
      await writeLog(req, {
        action: "ADD_STUDENT_TO_CLASS",
        entity: "class_students",
        entityId: result.insertId,
        description: `Thêm học sinh ${student.name} (${student.code}) vào lớp ${targetClass.name}`,
      });
    } catch (logError) {
      console.error("⚠️ writeLog error:", logError);
    }

    // =====================================================
    // RESPONSE
    // =====================================================
    return res.status(201).json({
      success: true,
      message: "Thêm học sinh vào lớp thành công",
      data: {
        id: result.insertId,
        class_id: classId,
        student_id: studentId,
        status,
        joined_at: joined_at || new Date(),
        class: targetClass,
        student,
      },
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("❌ ADD STUDENT TO CLASS ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("ERRNO:", error.errno);
    console.error("SQL STATE:", error.sqlState);
    console.error("SQL MESSAGE:", error.sqlMessage);
    console.error("STACK:", error.stack);

    // =====================================================
    // ROLLBACK
    // =====================================================
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("ROLLBACK ERROR:", rollbackError.message);
      }
    }

    // =====================================================
    // DUPLICATE KEY
    // =====================================================
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_RELATION",
        message: "Học sinh đã tồn tại trong lớp",
        error: error.sqlMessage,
      });
    }

    // =====================================================
    // FK ERROR
    // =====================================================
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        code: "FOREIGN_KEY_ERROR",
        message: "Không thể thêm học sinh vì lớp hoặc học sinh không tồn tại",
        error: error.sqlMessage,
      });
    }

    // =====================================================
    // DEFAULT ERROR
    // =====================================================
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi thêm học sinh vào lớp",
      error: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
// =====================================================
// 4. CẬP NHẬT QUAN HỆ LỚP - HỌC SINH
// PUT /api/class-students/update/:classId/:studentId
// =====================================================

exports.updateClassStudent = async (req, res) => {
  let connection;

  try {
    const { classId, studentId } = req.params;

    const { status, joined_at, left_at } = req.body;

    const church_id = req.user?.church_id;

    // =====================================================
    // KIỂM TRA GIÁO XỨ
    // =====================================================

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "classId và studentId là bắt buộc",
      });
    }

    if (status && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
      });
    }

    connection = await db.getConnection();

    // =====================================================
    // KIỂM TRA QUAN HỆ
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
        AND c.church_id = ?

      LIMIT 1
      `,
      [classId, studentId, church_id],
    );

    if (!relations.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp của giáo xứ",
      });
    }

    const oldRelation = relations[0];

    // =====================================================
    // NẾU CHUYỂN SANG STUDYING
    // =====================================================

    if (status === "studying") {
      const [otherClass] = await connection.query(
        `
        SELECT
          cs.id,
          cs.class_id,
          c.name AS class_name

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.student_id = ?
          AND cs.status = 'studying'
          AND c.church_id = ?
          AND cs.class_id != ?

        LIMIT 1
        `,
        [studentId, church_id, classId],
      );

      if (otherClass.length) {
        return res.status(409).json({
          success: false,
          message:
            `Học sinh đang học tại lớp ` + `"${otherClass[0].class_name}"`,
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
      try {
        await writeLog({
          admin_id: req.user?.id || null,
          action: "UPDATE_CLASS_STUDENT",
          target_type: "class_students",
          target_id: oldRelation.id,
          description:
            `Cập nhật học sinh "${oldRelation.student_name}" ` +
            `(${oldRelation.student_code || "—"}) trong lớp ` +
            `"${oldRelation.class_name}" ` +
            `(${oldRelation.class_code || "—"}): ` +
            `trạng thái ${oldRelation.status} → ` +
            `${status !== undefined ? status : oldRelation.status}, ` +
            `thuộc giáo xứ #${church_id}`,
          ip_address: req.ip,
        });
      } catch (logError) {
        console.error("⚠️ Activity log UPDATE_CLASS_STUDENT error:", logError);
      }
    }

    return res.json({
      success: true,
      message: "Cập nhật quan hệ lớp - học sinh thành công",
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("updateClassStudent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật quan hệ lớp - học sinh",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 5. CHUYỂN 1 HỌC SINH SANG LỚP KHÁC
// PUT /api/class-students/:classId/:studentId/change-class
// =====================================================

exports.changeClassStudent = async (req, res) => {
  let connection;

  try {
    const { classId, studentId } = req.params;
    const { newClassId } = req.body;

    const church_id = req.user?.church_id;

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!classId || !studentId || !newClassId) {
      return res.status(400).json({
        success: false,
        message: "classId, studentId và newClassId là bắt buộc",
      });
    }

    if (String(classId) === String(newClassId)) {
      return res.status(400).json({
        success: false,
        message: "Lớp mới phải khác lớp hiện tại",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =====================================================
    // KIỂM TRA LỚP CŨ
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
      [classId, church_id],
    );

    if (!oldClasses.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp hiện tại trong giáo xứ",
      });
    }

    const oldClass = oldClasses[0];

    // =====================================================
    // KIỂM TRA LỚP MỚI
    // =====================================================

    const [newClasses] = await connection.query(
      `
        SELECT
          id,
          name,
          code,
          church_id,
          status
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
      [newClassId, church_id],
    );

    if (!newClasses.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp mới trong giáo xứ",
      });
    }

    const newClass = newClasses[0];

    // =====================================================
    // KIỂM TRA HỌC SINH
    // =====================================================

    const [students] = await connection.query(
      `
        SELECT
          id,
          code,
          name,
          status
        FROM students
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
      [studentId, church_id],
    );

    if (!students.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ",
      });
    }

    const student = students[0];

    // =====================================================
    // QUAN HỆ HIỆN TẠI
    // =====================================================

    const [relation] = await connection.query(
      `
        SELECT
          id,
          class_id,
          student_id,
          status
        FROM class_students
        WHERE class_id = ?
          AND student_id = ?
        LIMIT 1
        `,
      [classId, studentId],
    );

    if (!relation.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc lớp hiện tại",
      });
    }

    const relationData = relation[0];

    // =====================================================
    // KIỂM TRA LỚP MỚI
    // =====================================================

    const [existingNewRelation] = await connection.query(
      `
        SELECT
          id,
          status
        FROM class_students
        WHERE class_id = ?
          AND student_id = ?
        LIMIT 1
        `,
      [newClassId, studentId],
    );

    if (existingNewRelation.length) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Học sinh đã tồn tại trong lớp mới",
      });
    }

    // =====================================================
    // CHUYỂN
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
      [newClassId, relationData.id],
    );

    if (!result.affectedRows) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Không thể chuyển lớp",
      });
    }

    await connection.commit();

    // =====================================================
    // LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,
        action: "CHANGE_CLASS_STUDENT",
        target_type: "class_students",
        target_id: relationData.id,
        description:
          `Chuyển học sinh "${student.name}" ` +
          `(${student.code || "—"}) từ lớp ` +
          `"${oldClass.name}" ` +
          `(${oldClass.code || "—"}) sang lớp ` +
          `"${newClass.name}" ` +
          `(${newClass.code || "—"}), ` +
          `thuộc giáo xứ #${church_id}`,
        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log CHANGE_CLASS_STUDENT error:", logError);
    }

    return res.json({
      success: true,
      message: "Chuyển lớp thành công",
      data: {
        student_id: Number(studentId),
        old_class_id: Number(classId),
        new_class_id: Number(newClassId),
        old_class_name: oldClass.name,
        new_class_name: newClass.name,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error("changeClassStudent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể chuyển lớp",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 6. CHUYỂN NHIỀU HỌC SINH SANG LỚP KHÁC
// PUT /api/class-students/change-class-bulk
// =====================================================

exports.changeClassStudents = async (req, res) => {
  let connection = null;

  try {
    const { studentIds, newClassId } = req.body;

    const church_id = req.user?.church_id;

    console.log("");
    console.log("============================================================");
    console.log("              BULK CHANGE STUDENTS CLASS");
    console.log("============================================================");
    console.log("🏠 church_id:", church_id);
    console.log("📚 studentIds:", studentIds);
    console.log("➡️ newClassId:", newClassId);

    // =====================================================
    // GIÁO XỨ
    // =====================================================

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE CLASS
    // =====================================================

    const targetClassId = Number(newClassId);

    if (!Number.isInteger(targetClassId) || targetClassId <= 0) {
      return res.status(400).json({
        success: false,
        message: "newClassId không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE STUDENTS
    // =====================================================

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "studentIds phải là một mảng và không được rỗng",
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
        message: "Danh sách học sinh không hợp lệ",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =====================================================
    // LỚP MỚI
    // =====================================================

    const [newClasses] = await connection.query(
      `
        SELECT
          id,
          name,
          code,
          church_id,
          status
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        `,
      [targetClassId, church_id],
    );

    if (!newClasses.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp mới trong giáo xứ",
      });
    }

    const newClass = newClasses[0];

    // =====================================================
    // HỌC SINH
    // =====================================================

    const placeholders = uniqueStudentIds.map(() => "?").join(",");

    const [students] = await connection.query(
      `
        SELECT
          id,
          code,
          name,
          status
        FROM students
        WHERE id IN (${placeholders})
          AND church_id = ?
        `,
      [...uniqueStudentIds, church_id],
    );

    const foundStudentIds = new Set(
      students.map((student) => Number(student.id)),
    );

    const notFoundStudentIds = uniqueStudentIds.filter(
      (id) => !foundStudentIds.has(Number(id)),
    );

    if (notFoundStudentIds.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Một số học sinh không tồn tại trong giáo xứ",
        data: {
          not_found_student_ids: notFoundStudentIds,
        },
      });
    }

    // =====================================================
    // QUAN HỆ
    // =====================================================

    const [relations] = await connection.query(
      `
        SELECT
          id,
          student_id,
          class_id,
          status,
          joined_at,
          left_at
        FROM class_students
        WHERE student_id IN (${placeholders})
        `,
      uniqueStudentIds,
    );

    const relationMap = new Map();

    for (const relation of relations) {
      const studentId = Number(relation.student_id);

      if (!relationMap.has(studentId)) {
        relationMap.set(studentId, []);
      }

      relationMap.get(studentId).push(relation);
    }

    const toUpdate = [];
    const toInsert = [];
    const alreadyInTarget = [];

    for (const studentId of uniqueStudentIds) {
      const studentRelations = relationMap.get(studentId) || [];

      const targetRelation = studentRelations.find(
        (relation) => Number(relation.class_id) === targetClassId,
      );

      if (targetRelation) {
        alreadyInTarget.push(studentId);
        continue;
      }

      const activeRelation = studentRelations.find(
        (relation) => relation.status === "studying" && !relation.left_at,
      );

      if (activeRelation) {
        toUpdate.push({
          studentId,
          relationId: Number(activeRelation.id),
          oldClassId: Number(activeRelation.class_id),
        });

        continue;
      }

      toInsert.push(studentId);
    }

    // =====================================================
    // UPDATE
    // =====================================================

    for (const item of toUpdate) {
      await connection.query(
        `
        UPDATE class_students
        SET
          class_id = ?,
          status = 'studying',
          left_at = NULL
        WHERE id = ?
        `,
        [targetClassId, item.relationId],
      );
    }

    // =====================================================
    // INSERT
    // =====================================================

    for (const studentId of toInsert) {
      await connection.query(
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
        [targetClassId, studentId],
      );
    }

    await connection.commit();

    // =====================================================
    // LOG
    // =====================================================

    try {
      const studentMap = new Map(
        students.map((student) => [Number(student.id), student]),
      );

      const studentNames = uniqueStudentIds
        .map((studentId) => {
          const student = studentMap.get(Number(studentId));

          if (!student) {
            return `#${studentId}`;
          }

          return `${student.name} ` + `(${student.code || "—"})`;
        })
        .join(", ");

      await writeLog({
        admin_id: req.user?.id || null,
        action: "CHANGE_CLASS_STUDENTS",
        target_type: "class_students",
        target_id: targetClassId,
        description:
          `Xếp/chuyển ${uniqueStudentIds.length} ` +
          `học sinh sang lớp "${newClass.name}" ` +
          `(${newClass.code || "—"}): ` +
          `${studentNames}. ` +
          `Cập nhật: ${toUpdate.length}; ` +
          `thêm mới: ${toInsert.length}; ` +
          `đã có trong lớp: ${alreadyInTarget.length}. ` +
          `Thuộc giáo xứ #${church_id}`,
        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log CHANGE_CLASS_STUDENTS error:", logError);
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      message:
        alreadyInTarget.length > 0
          ? `Đã xử lý ${uniqueStudentIds.length} học sinh`
          : `Đã chuyển/xếp ${uniqueStudentIds.length} học sinh vào lớp mới`,

      data: {
        student_ids: uniqueStudentIds,

        total_students: uniqueStudentIds.length,

        updated_students: toUpdate.map((item) => item.studentId),

        inserted_students: toInsert,

        already_in_target: alreadyInTarget,

        updated_count: toUpdate.length,

        inserted_count: toInsert.length,

        already_in_target_count: alreadyInTarget.length,

        new_class_id: targetClassId,

        new_class_name: newClass.name,

        new_class_code: newClass.code || null,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error(
      "============================================================",
    );
    console.error("❌ changeClassStudents ERROR");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Không thể chuyển học sinh sang lớp mới",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// 7. XÓA HỌC SINH KHỎI LỚP
// DELETE /api/class-students/:classId/:studentId
// =====================================================

exports.removeStudentFromClass = async (req, res) => {
  try {
    const { classId, studentId } = req.params;

    const church_id = req.user?.church_id;

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "classId và studentId là bắt buộc",
      });
    }

    // =====================================================
    // LẤY THÔNG TIN TRƯỚC KHI XÓA
    // =====================================================

    const [rows] = await db.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,
          cs.status,

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
          AND c.church_id = ?

        LIMIT 1
        `,
      [classId, studentId, church_id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc lớp này hoặc không thuộc giáo xứ",
      });
    }

    const relationData = rows[0];

    // =====================================================
    // XÓA
    // =====================================================

    const [result] = await db.query(
      `
        DELETE FROM class_students
        WHERE class_id = ?
          AND student_id = ?
        `,
      [classId, studentId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không thể xóa học sinh khỏi lớp",
      });
    }

    // =====================================================
    // LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,
        action: "DELETE_CLASS_STUDENT",
        target_type: "class_students",
        target_id: relationData.id,
        description:
          `Xóa học sinh "${relationData.student_name}" ` +
          `(${relationData.student_code || "—"}) khỏi lớp ` +
          `"${relationData.class_name}" ` +
          `(${relationData.class_code || "—"}), ` +
          `trạng thái trước khi xóa: ${relationData.status}, ` +
          `thuộc giáo xứ #${church_id}`,
        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log DELETE_CLASS_STUDENT error:", logError);
    }

    return res.json({
      success: true,
      message: `Đã xóa học sinh "${relationData.student_name}" khỏi lớp`,
      data: {
        id: relationData.id,
        class_id: Number(classId),
        student_id: Number(studentId),
        student_name: relationData.student_name,
        class_name: relationData.class_name,
      },
    });
  } catch (error) {
    console.error("removeStudentFromClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa học sinh khỏi lớp",
    });
  }
};

const db = require("../config/db");

// =====================================================
// HELPERS
// =====================================================

const ALLOWED_STATUS = ["studying", "completed", "transferred", "dropped"];

const getClassById = async (classId) => {
  const [rows] = await db.query(
    `
    SELECT
      id,
      name,
      code,
      category,
      room,
      day_of_week,
      start_time,
      end_time,
      start_date,
      end_date,
      status,
      parish_id
    FROM classes
    WHERE id = ?
    LIMIT 1
    `,
    [classId],
  );

  return rows[0] || null;
};

const getStudentById = async (studentId) => {
  const [rows] = await db.query(
    `
    SELECT
   *
    FROM students
    WHERE id = ?
    LIMIT 1
    `,
    [studentId],
  );

  return rows[0] || null;
};

// =====================================================
// 1. LẤY HỌC SINH TRONG LỚP
// GET /api/class-students/class/:classId
// =====================================================

exports.getStudentsByClass = async (req, res) => {
  try {
    const { classId } = req.params;

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: "classId là bắt buộc",
      });
    }

    // Kiểm tra lớp
    const classData = await getClassById(classId);

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

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

      ORDER BY
        CASE
          WHEN cs.status = 'studying' THEN 0
          ELSE 1
        END,
        s.name ASC
      `,
      [classId],
    );

    return res.json({
      success: true,
      data: rows,
      class: classData,
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

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId là bắt buộc",
      });
    }

    // Kiểm tra học sinh
    const student = await getStudentById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

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
        c.room,
        c.day_of_week,
        c.start_time,
        c.end_time,
        c.start_date,
        c.end_date,
        c.status AS class_status,
        c.parish_id

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.student_id = ?

      ORDER BY
        CASE
          WHEN cs.status = 'studying' THEN 0
          ELSE 1
        END,
        cs.joined_at DESC
      `,
      [studentId],
    );

    return res.json({
      success: true,
      data: rows,
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

exports.addStudentToClass = async (req, res) => {
  let connection;

  try {
    const {
      class_id,
      student_id,
      status = "studying",
      joined_at = null,
    } = req.body;

    if (!class_id || !student_id) {
      return res.status(400).json({
        success: false,
        message: "class_id và student_id là bắt buộc",
      });
    }

    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =================================================
    // KIỂM TRA LỚP
    // =================================================

    const [classes] = await connection.query(
      `
      SELECT
        id,
        name,
        parish_id,
        status
      FROM classes
      WHERE id = ?
      LIMIT 1
      `,
      [class_id],
    );

    if (!classes.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    const classData = classes[0];

    // =================================================
    // KIỂM TRA HỌC SINH
    // =================================================

    const [students] = await connection.query(
      `
      SELECT
        id,
        code,
        name,
        status
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [student_id],
    );

    if (!students.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    const student = students[0];

    // =================================================
    // KIỂM TRA ĐÃ CÓ QUAN HỆ NÀY CHƯA
    // =================================================

    const [existingRelation] = await connection.query(
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
      [class_id, student_id],
    );

    if (existingRelation.length) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Học sinh đã có trong lớp này",
        data: existingRelation[0],
      });
    }

    // =================================================
    // KHÔNG CHO 1 HỌC SINH ĐANG HỌC 2 LỚP
    // =================================================

    if (status === "studying") {
      const [currentClass] = await connection.query(
        `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,
          cs.status,
          c.name AS class_name

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.student_id = ?
          AND cs.status = 'studying'

        LIMIT 1
        `,
        [student_id],
      );

      if (currentClass.length) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message: `Học sinh đang học tại lớp "${currentClass[0].class_name}"`,
          data: currentClass[0],
        });
      }
    }

    // =================================================
    // THÊM
    // =================================================

    const [result] = await connection.query(
      `
      INSERT INTO class_students (
        class_id,
        student_id,
        status,
        joined_at,
        left_at
      )
      VALUES (?, ?, ?, COALESCE(?, NOW()), NULL)
      `,
      [class_id, student_id, status, joined_at],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Thêm học sinh vào lớp thành công",
      data: {
        id: result.insertId,
        class_id: Number(class_id),
        student_id: Number(student_id),
        status,
        class_name: classData.name,
        student_name: student.name,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error("addStudentToClass error:", error);

    // Duplicate key
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Học sinh đã tồn tại trong lớp này",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể thêm học sinh vào lớp",
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

    // =================================================
    // KIỂM TRA QUAN HỆ
    // =================================================

    const [relations] = await connection.query(
      `
      SELECT
        id,
        class_id,
        student_id,
        status,
        joined_at,
        left_at
      FROM class_students
      WHERE class_id = ?
        AND student_id = ?
      LIMIT 1
      `,
      [classId, studentId],
    );

    if (!relations.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp",
      });
    }

    // =================================================
    // NẾU CHUYỂN SANG STUDYING
    // KIỂM TRA HỌC SINH ĐANG Ở LỚP KHÁC
    // =================================================

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
          AND NOT (
            cs.class_id = ?
          )

        LIMIT 1
        `,
        [studentId, classId],
      );

      if (otherClass.length) {
        return res.status(409).json({
          success: false,
          message: `Học sinh đang học tại lớp "${otherClass[0].class_name}"`,
        });
      }
    }

    // =================================================
    // UPDATE
    // =================================================

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

    const [result] = await connection.query(
      `
      UPDATE class_students

      SET
        ${fields.join(", ")}

      WHERE class_id = ?
        AND student_id = ?
      `,
      values,
    );

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
// 5. CHUYỂN HỌC SINH SANG LỚP KHÁC
// PUT /api/class-students/:classId/:studentId/change-class
// =====================================================

exports.changeClassStudent = async (req, res) => {
  let connection;

  try {
    const { classId, studentId } = req.params;

    const { newClassId } = req.body;

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

    // =================================================
    // KIỂM TRA LỚP CŨ
    // =================================================

    const [oldClasses] = await connection.query(
      `
      SELECT
        id,
        name,
        parish_id
      FROM classes
      WHERE id = ?
      LIMIT 1
      `,
      [classId],
    );

    if (!oldClasses.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp hiện tại",
      });
    }

    // =================================================
    // KIỂM TRA LỚP MỚI
    // =================================================

    const [newClasses] = await connection.query(
      `
      SELECT
        id,
        name,
        parish_id,
        status
      FROM classes
      WHERE id = ?
      LIMIT 1
      `,
      [newClassId],
    );

    if (!newClasses.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp mới",
      });
    }

    // =================================================
    // KIỂM TRA HỌC SINH
    // =================================================

    const [students] = await connection.query(
      `
      SELECT
        id,
        name,
        status
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [studentId],
    );

    if (!students.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =================================================
    // KIỂM TRA QUAN HỆ CŨ
    // =================================================

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

    // =================================================
    // KIỂM TRA ĐÃ CÓ TRONG LỚP MỚI
    // =================================================

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

    // =================================================
    // CHUYỂN LỚP
    // =================================================

    const [result] = await connection.query(
      `
      UPDATE class_students

      SET
        class_id = ?,
        status = 'studying',
        left_at = NULL

      WHERE class_id = ?
        AND student_id = ?
      `,
      [newClassId, classId, studentId],
    );

    if (!result.affectedRows) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Không thể chuyển lớp",
      });
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Chuyển lớp thành công",
      data: {
        student_id: Number(studentId),
        old_class_id: Number(classId),
        new_class_id: Number(newClassId),
        old_class_name: oldClasses[0].name,
        new_class_name: newClasses[0].name,
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
// 6. XÓA HỌC SINH KHỎI LỚP
// DELETE /api/class-students/:classId/:studentId
// =====================================================

exports.removeStudentFromClass = async (req, res) => {
  try {
    const { classId, studentId } = req.params;

    if (!classId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "classId và studentId là bắt buộc",
      });
    }

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
        message: "Học sinh không thuộc lớp này",
      });
    }

    return res.json({
      success: true,
      message: "Đã xóa học sinh khỏi lớp",
    });
  } catch (error) {
    console.error("removeStudentFromClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa học sinh khỏi lớp",
    });
  }
};

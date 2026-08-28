const db = require("../config/db");

// =====================================================
// LẤY DANH SÁCH HỌC SINH TRONG LỚP
// GET /api/class-students/class/:classId
// =====================================================
exports.getStudentsByClass = async (req, res) => {
  try {
    const { classId } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        cs.class_id,
        cs.student_id,
        cs.status,
        cs.joined_at,
        cs.left_at,

        s.student_code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.address,
        s.parish,
        s.diocese,
        s.avatar

      FROM class_students cs

      INNER JOIN students s
        ON s.id = cs.student_id

      WHERE cs.class_id = ?

      ORDER BY s.name ASC
      `,
      [classId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("getStudentsByClass error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách học sinh trong lớp",
    });
  }
};

// =====================================================
// LẤY DANH SÁCH LỚP CỦA HỌC SINH
// GET /api/class-students/student/:studentId
// =====================================================
exports.getClassesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [rows] = await db.query(
      `
      SELECT
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
        c.status AS class_status

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.student_id = ?

      ORDER BY cs.joined_at DESC
      `,
      [studentId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("getClassesByStudent error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lớp của học sinh",
    });
  }
};

// =====================================================
// THÊM HỌC SINH VÀO LỚP
// POST /api/class-students
// =====================================================
exports.addStudentToClass = async (req, res) => {
  try {
    const { class_id, student_id, joined_at } = req.body;

    if (!class_id || !student_id) {
      return res.status(400).json({
        success: false,
        message: "class_id và student_id là bắt buộc",
      });
    }

    // Kiểm tra lớp
    const [classes] = await db.query(`SELECT id FROM classes WHERE id = ?`, [
      class_id,
    ]);

    if (!classes.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    // Kiểm tra học sinh
    const [students] = await db.query(`SELECT id FROM students WHERE id = ?`, [
      student_id,
    ]);

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // Kiểm tra đã tồn tại trong lớp
    const [exists] = await db.query(
      `
      SELECT *
      FROM class_students
      WHERE class_id = ?
        AND student_id = ?
      `,
      [class_id, student_id],
    );

    if (exists.length) {
      return res.status(409).json({
        success: false,
        message: "Học sinh đã có trong lớp này",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO class_students (
        class_id,
        student_id,
        status,
        joined_at
      )
      VALUES (?, ?, 'studying', ?)
      `,
      [class_id, student_id, joined_at || null],
    );

    res.status(201).json({
      success: true,
      message: "Thêm học sinh vào lớp thành công",
      data: {
        id: result.insertId,
        class_id,
        student_id,
      },
    });
  } catch (error) {
    console.error("addStudentToClass error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể thêm học sinh vào lớp",
    });
  }
};

// =====================================================
// CẬP NHẬT TRẠNG THÁI HỌC SINH TRONG LỚP
// PUT /api/class-students/:classId/:studentId
// =====================================================
exports.updateClassStudent = async (req, res) => {
  try {
    console.log("========== UPDATE CLASS STUDENT ==========");

    console.log("req.params:", req.params);
    console.log("req.body:", req.body);

    const { classId, studentId } = req.params;

    const { class_id, status, joined_at, left_at } = req.body;

    console.log("classId cũ:", classId);
    console.log("studentId:", studentId);
    console.log("class_id mới:", class_id);
    console.log("status:", status);

    const allowedStatus = ["studying", "completed", "transferred", "dropped"];

    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
      });
    }

    const query = `
      UPDATE class_students
      SET
        class_id = COALESCE(?, class_id),
        status = COALESCE(?, status),
        joined_at = COALESCE(?, joined_at),
        left_at = ?
      WHERE class_id = ?
        AND student_id = ?
    `;

    const values = [
      class_id || null,
      status || null,
      joined_at || null,
      left_at || null,
      classId,
      studentId,
    ];

    console.log("VALUES:", values);

    const [result] = await db.query(query, values);

    console.log("MYSQL RESULT:", result);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật học sinh trong lớp thành công",
    });
  } catch (error) {
    console.error("updateClassStudent error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật học sinh trong lớp",
      error: error.message,
    });
  }
};

exports.changeClassStudent = async (req, res) => {
  try {
    const { classId, studentId } = req.params;
    const { newClassId } = req.body;

    console.log("Chuyển lớp:");
    console.log({
      oldClassId: classId,
      studentId,
      newClassId,
    });

    const [result] = await db.query(
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
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong lớp cũ",
      });
    }

    res.json({
      success: true,
      message: "Chuyển lớp thành công",
    });
  } catch (error) {
    console.error("changeClassStudent error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// =====================================================
// XÓA HỌC SINH KHỎI LỚP
// DELETE /api/class-students/:classId/:studentId
// =====================================================
exports.removeStudentFromClass = async (req, res) => {
  try {
    const { classId, studentId } = req.params;

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

    res.json({
      success: true,
      message: "Đã xóa học sinh khỏi lớp",
    });
  } catch (error) {
    console.error("removeStudentFromClass error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể xóa học sinh khỏi lớp",
    });
  }
};

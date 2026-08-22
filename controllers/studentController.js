const db = require("../config/db");

// =====================================================
// STUDENTS
// =====================================================

// GET /api/students
exports.getStudents = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

    const offset = (pageNumber - 1) * limitNumber;
    const keyword = `%${search.trim()}%`;

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM students
      WHERE
        full_name LIKE ?
        OR student_code LIKE ?
        OR saint_name LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
      `,
      [keyword, keyword, keyword, keyword, keyword],
    );

    const total = countRows[0].total;

    const [rows] = await db.query(
      `
      SELECT
        s.*,

        (
          SELECT sc.class_name
          FROM student_classes sc
          WHERE sc.student_id = s.id
          ORDER BY sc.school_year DESC, sc.id DESC
          LIMIT 1
        ) AS current_class,

        (
          SELECT sc.school_year
          FROM student_classes sc
          WHERE sc.student_id = s.id
          ORDER BY sc.school_year DESC, sc.id DESC
          LIMIT 1
        ) AS current_school_year

      FROM students s

      WHERE
        s.full_name LIKE ?
        OR s.student_code LIKE ?
        OR s.saint_name LIKE ?
        OR s.phone LIKE ?
        OR s.email LIKE ?

      ORDER BY s.id DESC

      LIMIT ? OFFSET ?
      `,
      [keyword, keyword, keyword, keyword, keyword, limitNumber, offset],
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("GET STUDENTS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách học sinh",
    });
  }
};

// GET /api/students/:id
exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const [studentRows] = await db.query(
      `
      SELECT *
      FROM students
      WHERE id = ?
      `,
      [id],
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    const [classes] = await db.query(
      `
      SELECT *
      FROM student_classes
      WHERE student_id = ?
      ORDER BY school_year DESC, id DESC
      `,
      [id],
    );

    const [exams] = await db.query(
      `
      SELECT *
      FROM student_exams
      WHERE student_id = ?
      ORDER BY exam_date DESC, id DESC
      `,
      [id],
    );

    res.json({
      success: true,
      data: {
        ...studentRows[0],
        classes,
        exams,
      },
    });
  } catch (error) {
    console.error("GET STUDENT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi lấy thông tin học sinh",
    });
  }
};

// POST /api/students
exports.createStudent = async (req, res) => {
  try {
    const {
      full_name,
      saint_name,
      gender,
      date_of_birth,
      place_of_birth,
      phone,
      email,
      address,
      father_name,
      father_phone,
      mother_name,
      mother_phone,
      guardian_name,
      guardian_phone,
    } = req.body;

    if (!full_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập họ tên học viên",
      });
    }

    // Lấy học viên cuối cùng
    const [rows] = await db.query(`
      SELECT student_code
      FROM students
      ORDER BY id DESC
      LIMIT 1
    `);

    let nextNumber = 1;

    if (rows.length && rows[0].student_code) {
      const match = rows[0].student_code.match(/\d+$/);

      if (match) {
        nextNumber = parseInt(match[0], 10) + 1;
      }
    }

    const student_code = `HV${String(nextNumber).padStart(5, "0")}`;

    const [result] = await db.query(
      `
      INSERT INTO students (
        student_code,
        full_name,
        saint_name,
        gender,
        date_of_birth,
        place_of_birth,
        phone,
        email,
        address,
        father_name,
        father_phone,
        mother_name,
        mother_phone,
        guardian_name,
        guardian_phone
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        student_code,
        full_name.trim(),
        saint_name || null,
        gender || null,
        date_of_birth || null,
        place_of_birth || null,
        phone || null,
        email || null,
        address || null,
        father_name || null,
        father_phone || null,
        mother_name || null,
        mother_phone || null,
        guardian_name || null,
        guardian_phone || null,
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Thêm học viên thành công",
      data: {
        id: result.insertId,
        student_code,
      },
    });
  } catch (error) {
    console.error("createStudent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tạo học viên",
    });
  }
};

// PUT /api/students/:id
exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      student_code,
      full_name,
      saint_name,
      gender,
      date_of_birth,
      place_of_birth,
      phone,
      email,
      address,
      father_name,
      father_phone,
      mother_name,
      mother_phone,
      guardian_name,
      guardian_phone,
    } = req.body;

    if (!full_name) {
      return res.status(400).json({
        success: false,
        message: "Họ tên là bắt buộc",
      });
    }

    const [result] = await db.query(
      `
      UPDATE students
      SET
        student_code = ?,
        full_name = ?,
        saint_name = ?,
        gender = ?,
        date_of_birth = ?,
        place_of_birth = ?,
        phone = ?,
        email = ?,
        address = ?,
        father_name = ?,
        father_phone = ?,
        mother_name = ?,
        mother_phone = ?,
        guardian_name = ?,
        guardian_phone = ?
      WHERE id = ?
      `,
      [
        student_code,
        full_name,
        saint_name || null,
        gender || null,
        date_of_birth || null,
        place_of_birth || null,
        phone || null,
        email || null,
        address || null,
        father_name || null,
        father_phone || null,
        mother_name || null,
        mother_phone || null,
        guardian_name || null,
        guardian_phone || null,
        id,
      ],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật học sinh thành công",
    });
  } catch (error) {
    console.error("UPDATE STUDENT ERROR:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        message: "Mã học sinh đã tồn tại",
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi cập nhật học sinh",
    });
  }
};

// DELETE /api/students/:id
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      `
      DELETE FROM students
      WHERE id = ?
      `,
      [id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    res.json({
      success: true,
      message: "Xóa học sinh thành công",
    });
  } catch (error) {
    console.error("DELETE STUDENT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi xóa học sinh",
    });
  }
};

// =====================================================
// STUDENT CLASSES
// =====================================================

exports.getStudentClasses = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [rows] = await db.query(
      `
      SELECT *
      FROM student_classes
      WHERE student_id = ?
      ORDER BY school_year DESC, id DESC
      `,
      [studentId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("GET STUDENT CLASSES ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi lấy lịch sử lớp",
    });
  }
};

exports.createStudentClass = async (req, res) => {
  try {
    const { student_id, class_name, school_year, status, note } = req.body;

    if (!student_id || !class_name || !school_year) {
      return res.status(400).json({
        success: false,
        message: "student_id, class_name và school_year là bắt buộc",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO student_classes (
        student_id,
        class_name,
        school_year,
        status,
        note
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [student_id, class_name, school_year, status || "studying", note || null],
    );

    res.status(201).json({
      success: true,
      message: "Thêm lớp học thành công",
      data: {
        id: result.insertId,
      },
    });
  } catch (error) {
    console.error("CREATE STUDENT CLASS ERROR:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        message: "Học sinh đã có lớp trong năm học này",
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi thêm lớp học",
    });
  }
};

exports.updateStudentClass = async (req, res) => {
  try {
    const { id } = req.params;

    const { class_name, school_year, status, note } = req.body;

    const [result] = await db.query(
      `
      UPDATE student_classes
      SET
        class_name = ?,
        school_year = ?,
        status = ?,
        note = ?
      WHERE id = ?
      `,
      [class_name, school_year, status, note || null, id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật lớp học thành công",
    });
  } catch (error) {
    console.error("UPDATE STUDENT CLASS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi cập nhật lớp học",
    });
  }
};

exports.deleteStudentClass = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      `
      DELETE FROM student_classes
      WHERE id = ?
      `,
      [id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    res.json({
      success: true,
      message: "Xóa lịch sử lớp thành công",
    });
  } catch (error) {
    console.error("DELETE STUDENT CLASS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi xóa lịch sử lớp",
    });
  }
};

// =====================================================
// STUDENT EXAMS
// =====================================================

exports.getStudentExams = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [rows] = await db.query(
      `
      SELECT *
      FROM student_exams
      WHERE student_id = ?
      ORDER BY exam_date DESC, id DESC
      `,
      [studentId],
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("GET STUDENT EXAMS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi lấy kết quả kiểm tra",
    });
  }
};

exports.createStudentExam = async (req, res) => {
  try {
    const { student_id, exam_name, exam_date, score, result, note } = req.body;

    if (!student_id || !exam_name) {
      return res.status(400).json({
        success: false,
        message: "student_id và exam_name là bắt buộc",
      });
    }

    const [resultDb] = await db.query(
      `
      INSERT INTO student_exams (
        student_id,
        exam_name,
        exam_date,
        score,
        result,
        note
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        student_id,
        exam_name,
        exam_date || null,
        score ?? null,
        result || "pending",
        note || null,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Thêm kết quả kiểm tra thành công",
      data: {
        id: resultDb.insertId,
      },
    });
  } catch (error) {
    console.error("CREATE STUDENT EXAM ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi thêm kết quả kiểm tra",
    });
  }
};

exports.updateStudentExam = async (req, res) => {
  try {
    const { id } = req.params;

    const { exam_name, exam_date, score, result, note } = req.body;

    const [resultDb] = await db.query(
      `
      UPDATE student_exams
      SET
        exam_name = ?,
        exam_date = ?,
        score = ?,
        result = ?,
        note = ?
      WHERE id = ?
      `,
      [
        exam_name,
        exam_date || null,
        score ?? null,
        result || "pending",
        note || null,
        id,
      ],
    );

    if (resultDb.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả kiểm tra",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật kết quả kiểm tra thành công",
    });
  } catch (error) {
    console.error("UPDATE STUDENT EXAM ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi cập nhật kết quả kiểm tra",
    });
  }
};

exports.deleteStudentExam = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      `
      DELETE FROM student_exams
      WHERE id = ?
      `,
      [id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả kiểm tra",
      });
    }

    res.json({
      success: true,
      message: "Xóa kết quả kiểm tra thành công",
    });
  } catch (error) {
    console.error("DELETE STUDENT EXAM ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi xóa kết quả kiểm tra",
    });
  }
};

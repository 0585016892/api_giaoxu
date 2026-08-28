const db = require("../config/db");

// =====================================================
// LẤY DANH SÁCH HỌC SINH
// GET /api/students
// =====================================================
exports.getStudents = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM students
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("getStudents error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách học sinh",
    });
  }
};

// =====================================================
// CHI TIẾT HỌC SINH
// GET /api/students/:id
// =====================================================
exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT *
      FROM students
      WHERE id = ?
      `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("getStudentById error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin học sinh",
    });
  }
};

// =====================================================
// TẠO HỌC SINH
// POST /api/students
// =====================================================
exports.createStudent = async (req, res) => {
  try {
    // =====================================================
    // LẤY DỮ LIỆU TỪ REQUEST
    // =====================================================
    const {
      name,
      gender,
      date_of_birth,
      birth_place,
      nationality,

      phone,
      email,
      address,
      parish,

      father_name,
      father_phone,

      mother_name,
      mother_phone,

      guardian_name,
      guardian_phone,
      guardian_relationship,

      baptism_name,
      baptism_date,
      baptism_place,
      baptism_parish,
      baptism_certificate_no,

      saint_name,

      first_communion_date,
      first_communion_place,

      confirmation_date,
      confirmation_place,
      confirmation_saint_name,

      catechism_level,
      catechism_status,
      enrollment_date,

      note,
      avatar,
      status,
    } = req.body;

    console.log("========== CREATE STUDENT ==========");
    console.log("BODY:", req.body);

    // =====================================================
    // VALIDATE HỌ TÊN
    // =====================================================
    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    // =====================================================
    // VALIDATE GIỚI TÍNH
    // =====================================================
    const allowedGender = ["Nam", "Nữ", "Khác"];

    if (gender && !allowedGender.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE TRẠNG THÁI HỌC GIÁO LÝ
    // =====================================================
    const allowedCatechismStatus = [
      "new",
      "studying",
      "completed",
      "graduated",
      "dropped",
    ];

    if (
      catechism_status &&
      !allowedCatechismStatus.includes(catechism_status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái học giáo lý không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE TRẠNG THÁI HỌC SINH
    // =====================================================
    const allowedStatus = [
      "active",
      "inactive",
      "graduated",
      "transferred",
      "dropped",
    ];

    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    // =====================================================
    // TỰ ĐỘNG TẠO MÃ HỌC SINH
    //
    // HS000001
    // HS000002
    // HS000003
    // =====================================================
    const [lastStudent] = await db.query(`
      SELECT id
      FROM students
      ORDER BY id DESC
      LIMIT 1
    `);

    const nextId = lastStudent.length ? Number(lastStudent[0].id) + 1 : 1;

    const studentCode = `HS${String(nextId).padStart(6, "0")}`;

    console.log("Mã học sinh tự tạo:", studentCode);

    // =====================================================
    // INSERT HỌC SINH
    // =====================================================
    const [result] = await db.query(
      `
      INSERT INTO students (
        code,
        name,
        gender,
        date_of_birth,
        birth_place,
        nationality,

        phone,
        email,
        address,
        parish,

        father_name,
        father_phone,

        mother_name,
        mother_phone,

        guardian_name,
        guardian_phone,
        guardian_relationship,

        baptism_name,
        baptism_date,
        baptism_place,
        baptism_parish,
        baptism_certificate_no,

        saint_name,

        first_communion_date,
        first_communion_place,

        confirmation_date,
        confirmation_place,
        confirmation_saint_name,

        catechism_level,
        catechism_status,
        enrollment_date,

        note,
        avatar,
        status
      )
      VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
      `,
      [
        // Thông tin cơ bản
        studentCode,
        String(name).trim(),
        gender || null,
        date_of_birth || null,
        birth_place || null,
        nationality || "Việt Nam",

        // Liên hệ
        phone || null,
        email || null,
        address || null,
        parish || null,

        // Cha
        father_name || null,
        father_phone || null,

        // Mẹ
        mother_name || null,
        mother_phone || null,

        // Người giám hộ
        guardian_name || null,
        guardian_phone || null,
        guardian_relationship || null,

        // Bí tích Rửa tội
        baptism_name || null,
        baptism_date || null,
        baptism_place || null,
        baptism_parish || null,
        baptism_certificate_no || null,

        // Thánh bổn mạng
        saint_name || null,

        // Rước lễ lần đầu
        first_communion_date || null,
        first_communion_place || null,

        // Thêm sức
        confirmation_date || null,
        confirmation_place || null,
        confirmation_saint_name || null,

        // Thông tin giáo lý
        catechism_level || null,
        catechism_status || "new",
        enrollment_date || null,

        // Khác
        note || null,
        avatar || null,
        status || "active",
      ],
    );

    console.log("INSERT RESULT:", result);
    console.log("====================================");

    return res.status(201).json({
      success: true,
      message: "Thêm học sinh thành công",
      data: {
        id: result.insertId,
        code: studentCode,
      },
    });
  } catch (error) {
    console.error("========== CREATE STUDENT ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL Message:", error.sqlMessage);
    console.error("==========================================");

    return res.status(500).json({
      success: false,
      message: "Không thể thêm học sinh",
      error: error.message,
    });
  }
};

// =====================================================
// CẬP NHẬT HỌC SINH
// PUT /api/students/:id
// =====================================================
exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      gender,
      date_of_birth,
      birth_place,
      nationality,

      phone,
      email,
      address,
      parish,

      father_name,
      father_phone,

      mother_name,
      mother_phone,

      guardian_name,
      guardian_phone,
      guardian_relationship,

      baptism_name,
      baptism_date,
      baptism_place,
      baptism_parish,
      baptism_certificate_no,

      saint_name,

      first_communion_date,
      first_communion_place,

      confirmation_date,
      confirmation_place,
      confirmation_saint_name,

      catechism_level,
      catechism_status,
      enrollment_date,

      note,
      avatar,
      status,
    } = req.body;

    console.log("========== UPDATE STUDENT ==========");
    console.log("Student ID:", id);
    console.log("BODY:", req.body);

    // ==========================================
    // VALIDATE HỌ TÊN
    // ==========================================
    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    // ==========================================
    // VALIDATE GIỚI TÍNH
    // ==========================================
    const allowedGender = ["Nam", "Nữ", "Khác"];

    if (gender && !allowedGender.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ",
      });
    }

    // ==========================================
    // VALIDATE TRẠNG THÁI GIÁO LÝ
    // ==========================================
    const allowedCatechismStatus = [
      "new",
      "studying",
      "completed",
      "graduated",
      "dropped",
    ];

    if (
      catechism_status &&
      !allowedCatechismStatus.includes(catechism_status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái học giáo lý không hợp lệ",
      });
    }

    // ==========================================
    // VALIDATE TRẠNG THÁI HỌC SINH
    // ==========================================
    const allowedStatus = [
      "active",
      "inactive",
      "graduated",
      "transferred",
      "dropped",
    ];

    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    // ==========================================
    // UPDATE
    // KHÔNG UPDATE CODE
    // ==========================================
    const [result] = await db.query(
      `
      UPDATE students
      SET
        name = ?,
        gender = ?,
        date_of_birth = ?,
        birth_place = ?,
        nationality = ?,

        phone = ?,
        email = ?,
        address = ?,
        parish = ?,

        father_name = ?,
        father_phone = ?,

        mother_name = ?,
        mother_phone = ?,

        guardian_name = ?,
        guardian_phone = ?,
        guardian_relationship = ?,

        baptism_name = ?,
        baptism_date = ?,
        baptism_place = ?,
        baptism_parish = ?,
        baptism_certificate_no = ?,

        saint_name = ?,

        first_communion_date = ?,
        first_communion_place = ?,

        confirmation_date = ?,
        confirmation_place = ?,
        confirmation_saint_name = ?,

        catechism_level = ?,
        catechism_status = ?,
        enrollment_date = ?,

        note = ?,
        avatar = ?,
        status = ?,

        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
      [
        name.trim(),
        gender || null,
        date_of_birth || null,
        birth_place || null,
        nationality || "Việt Nam",

        phone || null,
        email || null,
        address || null,
        parish || null,

        father_name || null,
        father_phone || null,

        mother_name || null,
        mother_phone || null,

        guardian_name || null,
        guardian_phone || null,
        guardian_relationship || null,

        baptism_name || null,
        baptism_date || null,
        baptism_place || null,
        baptism_parish || null,
        baptism_certificate_no || null,

        saint_name || null,

        first_communion_date || null,
        first_communion_place || null,

        confirmation_date || null,
        confirmation_place || null,
        confirmation_saint_name || null,

        catechism_level || null,
        catechism_status || "new",
        enrollment_date || null,

        note || null,
        avatar || null,
        status || "active",

        id,
      ],
    );

    console.log("MYSQL RESULT:", result);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    console.log("✅ UPDATE STUDENT SUCCESS");

    return res.json({
      success: true,
      message: "Cập nhật học sinh thành công",
    });
  } catch (error) {
    console.error("========== UPDATE STUDENT ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL Message:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật học sinh",
      error: error.message,
    });
  }
};
// =====================================================
// XÓA HỌC SINH
// DELETE /api/students/:id
// =====================================================
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra tồn tại
    const [students] = await db.query(
      `
      SELECT id
      FROM students
      WHERE id = ?
      `,
      [id],
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // Xóa quan hệ lớp trước nếu có
    await db.query(
      `
      DELETE FROM class_students
      WHERE student_id = ?
      `,
      [id],
    );

    // Xóa học sinh
    await db.query(
      `
      DELETE FROM students
      WHERE id = ?
      `,
      [id],
    );

    res.json({
      success: true,
      message: "Đã xóa học sinh thành công",
    });
  } catch (error) {
    console.error("deleteStudent error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể xóa học sinh",
    });
  }
};

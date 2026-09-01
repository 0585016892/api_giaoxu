const db = require("../config/db");
const XLSX = require("xlsx");
// =====================================================
// HELPER: LẤY CHURCH ID TỪ TOKEN
// =====================================================
const getChurchId = (req) => {
  return req.user?.church_id;
};

// =====================================================
// HELPER: KIỂM TRA LỚP THUỘC GIÁO XỨ
// =====================================================
const checkClassBelongsToChurch = async (classId, churchId) => {
  const [rows] = await db.query(
    `
    SELECT id
    FROM classes
    WHERE id = ?
      AND church_id = ?
    LIMIT 1
    `,
    [classId, churchId],
  );

  return rows.length > 0;
};

// =====================================================
// HELPER: KIỂM TRA HỌC SINH THUỘC GIÁO XỨ
//
// Quan hệ:
//
// church
//   ↓
// classes
//   ↓
// class_students
//   ↓
// students
// =====================================================
const checkStudentBelongsToChurch = async (studentId, churchId) => {
  const [rows] = await db.query(
    `
    SELECT s.id
    FROM students s

    INNER JOIN class_students cs
      ON cs.student_id = s.id

    INNER JOIN classes c
      ON c.id = cs.class_id

    WHERE s.id = ?
      AND c.church_id = ?

    LIMIT 1
    `,
    [studentId, churchId],
  );

  return rows.length > 0;
};

// =====================================================
// GET /api/students
//
// LẤY HỌC SINH CỦA GIÁO XỨ ĐANG ĐĂNG NHẬP
//
// church
//   ↓
// classes
//   ↓
// class_students
//   ↓
// students
// =====================================================
exports.getStudents = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    console.log("========== GET STUDENTS ==========");
    console.log("USER:", req.user);
    console.log("CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT DISTINCT
        s.*,

        c.id AS class_id,
        c.name AS class_name,
        c.code AS class_code,

        cs.status AS class_student_status,
        cs.joined_at

      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE c.church_id = ?

      ORDER BY s.created_at DESC
      `,
      [churchId],
    );

    return res.json({
      success: true,
      church_id: Number(churchId),
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("========== GET STUDENTS ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách học sinh",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// =====================================================
// GET /api/students/:id
//
// CHI TIẾT HỌC SINH
//
// Chỉ xem được nếu học sinh thuộc lớp của giáo xứ hiện tại
// =====================================================
exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        s.*,

        c.id AS class_id,
        c.name AS class_name,
        c.code AS class_code,

        cs.status AS class_student_status,
        cs.joined_at

      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE s.id = ?
        AND c.church_id = ?

      LIMIT 1
      `,
      [id, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ này",
      });
    }

    return res.json({
      success: true,
      church_id: Number(churchId),
      data: rows[0],
    });
  } catch (error) {
    console.error("========== GET STUDENT ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin học sinh",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// =====================================================
// POST /api/students
//
// TẠO HỌC SINH
//
// Request bắt buộc:
// {
//   name,
//   class_id
// }
//
// church_id KHÔNG lấy từ body
// church_id lấy từ req.user.church_id
// =====================================================
exports.createStudent = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const churchId = getChurchId(req);
    console.log(churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

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

      // Lớp học sinh thuộc về
      class_id,
    } = req.body;

    console.log("========== CREATE STUDENT ==========");
    console.log("CHURCH ID:", churchId);
    console.log("CLASS ID:", class_id);
    console.log("BODY:", req.body);

    // =====================================================
    // VALIDATE TÊN
    // =====================================================

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    // =====================================================
    // VALIDATE CLASS
    // =====================================================

    if (!class_id) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn lớp cho học sinh",
      });
    }

    const classBelongsToChurch = await checkClassBelongsToChurch(
      class_id,
      churchId,
    );

    if (!classBelongsToChurch) {
      return res.status(403).json({
        success: false,
        message: "Lớp không thuộc giáo xứ của tài khoản",
      });
    }

    // =====================================================
    // VALIDATE GENDER
    // =====================================================

    const allowedGender = ["Nam", "Nữ", "Khác"];

    if (gender && !allowedGender.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE CATECHISM STATUS
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
    // VALIDATE STUDENT STATUS
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
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    // =====================================================
    // TẠO CODE
    //
    // HS000001
    // HS000002
    // ...
    // =====================================================

    const [lastStudent] = await connection.query(
      `
      SELECT id
      FROM students
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
    );

    const nextId = lastStudent.length ? Number(lastStudent[0].id) + 1 : 1;

    const studentCode = `HS${String(nextId).padStart(6, "0")}`;

    // =====================================================
    // INSERT STUDENT
    // =====================================================

    const [result] = await connection.query(
      `
      INSERT INTO students (
      church_id,
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
        ?, ?, ?, ?
      )
      `,
      [
        churchId,
        studentCode,
        String(name).trim(),
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
      ],
    );

    const studentId = result.insertId;

    // =====================================================
    // GÁN HỌC SINH VÀO LỚP
    // =====================================================

    await connection.query(
      `
      INSERT INTO class_students (
        class_id,
        student_id
      )
      VALUES (?, ?)
      `,
      [class_id, studentId],
    );

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    console.log("✅ CREATE STUDENT SUCCESS");
    console.log("Student ID:", studentId);
    console.log("Code:", studentCode);
    console.log("Class ID:", class_id);
    console.log("Church ID:", churchId);

    return res.status(201).json({
      success: true,
      message: "Thêm học sinh thành công",
      data: {
        id: studentId,
        code: studentCode,
        class_id: Number(class_id),
        church_id: Number(churchId),
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("========== CREATE STUDENT ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      message: "Không thể thêm học sinh",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

// =====================================================
// PUT /api/students/:id
//
// CẬP NHẬT HỌC SINH
//
// Nếu có class_id:
// - Kiểm tra lớp thuộc church
// - Xóa quan hệ lớp cũ
// - Gán lớp mới
//
// KHÔNG UPDATE code
// KHÔNG UPDATE church_id
// =====================================================
exports.updateStudent = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // KIỂM TRA HỌC SINH THUỘC GIÁO XỨ
    // =====================================================

    const belongsToChurch = await checkStudentBelongsToChurch(id, churchId);

    if (!belongsToChurch) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ này",
      });
    }

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

      class_id,
    } = req.body;

    // =====================================================
    // VALIDATE NAME
    // =====================================================

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    // =====================================================
    // VALIDATE GENDER
    // =====================================================

    const allowedGender = ["Nam", "Nữ", "Khác"];

    if (gender && !allowedGender.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE CATECHISM STATUS
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
    // VALIDATE STATUS
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
    // KIỂM TRA LỚP MỚI
    // =====================================================

    if (class_id) {
      const classBelongsToChurch = await checkClassBelongsToChurch(
        class_id,
        churchId,
      );

      if (!classBelongsToChurch) {
        return res.status(403).json({
          success: false,
          message: "Lớp mới không thuộc giáo xứ của tài khoản",
        });
      }
    }

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    // =====================================================
    // UPDATE STUDENT
    // =====================================================

    const [result] = await connection.query(
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
        String(name).trim(),
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

    if (!result.affectedRows) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =====================================================
    // NẾU CÓ class_id → ĐỔI LỚP
    // =====================================================

    if (class_id) {
      // Xóa quan hệ lớp cũ
      await connection.query(
        `
        DELETE FROM class_students
        WHERE student_id = ?
        `,
        [id],
      );

      // Gán lớp mới
      await connection.query(
        `
        INSERT INTO class_students (
          class_id,
          student_id
        )
        VALUES (?, ?)
        `,
        [class_id, id],
      );
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    console.log("✅ UPDATE STUDENT SUCCESS");
    console.log("Student ID:", id);
    console.log("Church ID:", churchId);
    console.log("New Class ID:", class_id || "Không đổi");

    return res.json({
      success: true,
      message: "Cập nhật học sinh thành công",
    });
  } catch (error) {
    await connection.rollback();

    console.error("========== UPDATE STUDENT ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật học sinh",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};
// =====================================================
// IMPORT STUDENTS FROM EXCEL
// Chỉ import thông tin vào bảng students
// Không gán lớp
// Không import id
// Không import created_at / updated_at
// =====================================================
exports.importStudentsExcel = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // =====================================================
    // CHURCH
    // =====================================================

    const churchId = getChurchId(req);

    console.log("========================================");
    console.log("IMPORT STUDENTS EXCEL");
    console.log("CHURCH ID:", churchId);
    console.log("========================================");

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // CHECK FILE
    // =====================================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn file Excel",
      });
    }

    const fileName = String(req.file.originalname || "").toLowerCase();

    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return res.status(400).json({
        success: false,
        message: "Chỉ hỗ trợ file Excel .xlsx hoặc .xls",
      });
    }

    // =====================================================
    // READ EXCEL
    // =====================================================

    let workbook;

    try {
      workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
        cellDates: true,
      });
    } catch (excelError) {
      console.error("❌ EXCEL READ ERROR:", excelError);

      return res.status(400).json({
        success: false,
        message: "Không thể đọc file Excel",
      });
    }

    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({
        success: false,
        message: "File Excel không có sheet",
      });
    }

    const worksheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: false,
    });

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "File Excel không có dữ liệu",
      });
    }

    // =====================================================
    // LIMIT
    // =====================================================

    if (rows.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Mỗi lần chỉ được import tối đa 1000 học sinh",
      });
    }

    console.log("FILE:", req.file.originalname);
    console.log("SHEET:", sheetName);
    console.log("TOTAL:", rows.length);

    // =====================================================
    // DATE PARSER
    // =====================================================

    const parseDate = (value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      // -----------------------------------------------
      // Date object
      // -----------------------------------------------

      if (value instanceof Date && !isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
      }

      const str = String(value).trim();

      if (!str) {
        return null;
      }

      // -----------------------------------------------
      // YYYY-MM-DD
      // -----------------------------------------------

      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
        const [year, month, day] = str.split("-");

        const date = new Date(Number(year), Number(month) - 1, Number(day));

        if (
          date.getFullYear() !== Number(year) ||
          date.getMonth() !== Number(month) - 1 ||
          date.getDate() !== Number(day)
        ) {
          return null;
        }

        return `${year}-${String(month).padStart(2, "0")}-${String(
          day,
        ).padStart(2, "0")}`;
      }

      // -----------------------------------------------
      // DD/MM/YYYY
      // -----------------------------------------------

      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const [day, month, year] = str.split("/");

        const date = new Date(Number(year), Number(month) - 1, Number(day));

        if (
          date.getFullYear() !== Number(year) ||
          date.getMonth() !== Number(month) - 1 ||
          date.getDate() !== Number(day)
        ) {
          return null;
        }

        return `${year}-${String(month).padStart(2, "0")}-${String(
          day,
        ).padStart(2, "0")}`;
      }

      // -----------------------------------------------
      // Excel serial date
      // -----------------------------------------------

      if (/^\d+(\.\d+)?$/.test(str)) {
        const serial = Number(str);

        if (serial > 0) {
          const excelDate = XLSX.SSF.parse_date_code(serial);

          if (excelDate) {
            const year = excelDate.y;
            const month = excelDate.m;
            const day = excelDate.d;

            return `${year}-${String(month).padStart(2, "0")}-${String(
              day,
            ).padStart(2, "0")}`;
          }
        }
      }

      return null;
    };

    // =====================================================
    // VALID VALUES
    // =====================================================

    const allowedGender = ["Nam", "Nữ", "Khác"];

    const allowedCatechismStatus = [
      "new",
      "studying",
      "completed",
      "graduated",
      "dropped",
    ];

    const allowedStatus = [
      "active",
      "inactive",
      "graduated",
      "transferred",
      "dropped",
    ];

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    const successRows = [];
    const errorRows = [];

    // =====================================================
    // LẤY ID CUỐI
    // =====================================================

    const [lastStudentRows] = await connection.query(
      `
        SELECT id
        FROM students
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `,
    );

    let nextStudentId = lastStudentRows.length
      ? Number(lastStudentRows[0].id) + 1
      : 1;

    // =====================================================
    // CODE ĐÃ SỬ DỤNG TRONG FILE
    // =====================================================

    const usedCodes = new Set();

    // =====================================================
    // IMPORT TỪNG DÒNG
    // =====================================================

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      // Excel:
      // dòng 1 = header
      // dòng 2 = data đầu tiên

      const excelRow = index + 2;

      try {
        console.log("----------------------------------------");
        console.log("EXCEL ROW:", excelRow);
        console.log("DATA:", row);

        // =================================================
        // NAME
        // =================================================

        const name = row.name ? String(row.name).trim() : "";

        if (!name) {
          throw new Error("Thiếu họ tên học sinh");
        }

        // =================================================
        // CLASS ID
        // =================================================

        const classId = row.class_id
          ? Number(String(row.class_id).trim())
          : null;

        if (!classId || !Number.isInteger(classId) || classId <= 0) {
          throw new Error("class_id không hợp lệ");
        }

        // =================================================
        // CHECK CLASS
        // =================================================

        const [classRows] = await connection.query(
          `
            SELECT
              id,
              name,
              church_id
            FROM classes
            WHERE id = ?
              AND church_id = ?
            LIMIT 1
          `,
          [classId, churchId],
        );

        if (!classRows.length) {
          throw new Error(
            `Lớp ID ${classId} không tồn tại hoặc không thuộc giáo xứ`,
          );
        }

        const classInfo = classRows[0];

        // =================================================
        // GENDER
        // =================================================

        const gender = row.gender ? String(row.gender).trim() : null;

        if (gender && !allowedGender.includes(gender)) {
          throw new Error(`Giới tính "${gender}" không hợp lệ`);
        }

        // =================================================
        // CATECHISM STATUS
        // =================================================

        const catechismStatus = row.catechism_status
          ? String(row.catechism_status).trim()
          : "new";

        if (!allowedCatechismStatus.includes(catechismStatus)) {
          throw new Error(`catechism_status "${catechismStatus}" không hợp lệ`);
        }

        // =================================================
        // STUDENT STATUS
        // =================================================

        const studentStatus = row.status ? String(row.status).trim() : "active";

        if (!allowedStatus.includes(studentStatus)) {
          throw new Error(`status "${studentStatus}" không hợp lệ`);
        }

        // =================================================
        // CODE
        // =================================================

        let code = row.code ? String(row.code).trim() : null;

        // -----------------------------------------------
        // Nếu Excel không có code
        // tự sinh HS000001...
        // -----------------------------------------------

        if (!code) {
          code = `HS${String(nextStudentId).padStart(6, "0")}`;

          // Tránh trường hợp code tự sinh bị trùng
          while (usedCodes.has(code)) {
            nextStudentId++;

            code = `HS${String(nextStudentId).padStart(6, "0")}`;
          }
        }

        // =================================================
        // CHECK CODE TRÙNG TRONG FILE
        // =================================================

        if (usedCodes.has(code)) {
          throw new Error(`Mã học sinh "${code}" bị trùng trong file Excel`);
        }

        // =================================================
        // CHECK CODE TRÙNG DATABASE
        // =================================================

        const [existingCodeRows] = await connection.query(
          `
              SELECT id, name
              FROM students
              WHERE code = ?
              LIMIT 1
            `,
          [code],
        );

        if (existingCodeRows.length) {
          throw new Error(`Mã học sinh "${code}" đã tồn tại trong hệ thống`);
        }

        usedCodes.add(code);

        // =================================================
        // DATE
        // =================================================

        const dateOfBirth = parseDate(row.date_of_birth);

        const baptismDate = parseDate(row.baptism_date);

        const firstCommunionDate = parseDate(row.first_communion_date);

        const confirmationDate = parseDate(row.confirmation_date);

        const enrollmentDate = parseDate(row.enrollment_date);

        // =================================================
        // VALIDATE DATE
        // =================================================

        if (row.date_of_birth && !dateOfBirth) {
          throw new Error(`date_of_birth không hợp lệ: ${row.date_of_birth}`);
        }

        if (row.baptism_date && !baptismDate) {
          throw new Error(`baptism_date không hợp lệ: ${row.baptism_date}`);
        }

        if (row.first_communion_date && !firstCommunionDate) {
          throw new Error(
            `first_communion_date không hợp lệ: ${row.first_communion_date}`,
          );
        }

        if (row.confirmation_date && !confirmationDate) {
          throw new Error(
            `confirmation_date không hợp lệ: ${row.confirmation_date}`,
          );
        }

        if (row.enrollment_date && !enrollmentDate) {
          throw new Error(
            `enrollment_date không hợp lệ: ${row.enrollment_date}`,
          );
        }

        // =================================================
        // INSERT STUDENT
        // =================================================

        const [result] = await connection.query(
          `
              INSERT INTO students (
                church_id,
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
                ?, ?, ?, ?, ?, ?, ?,
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
            churchId,
            code,
            name,
            gender,

            dateOfBirth,
            row.birth_place || null,
            row.nationality || "Việt Nam",

            row.phone || null,
            row.email || null,
            row.address || null,
            row.parish || null,

            row.father_name || null,
            row.father_phone || null,

            row.mother_name || null,
            row.mother_phone || null,

            row.guardian_name || null,
            row.guardian_phone || null,
            row.guardian_relationship || null,

            row.baptism_name || null,
            baptismDate,
            row.baptism_place || null,
            row.baptism_parish || null,
            row.baptism_certificate_no || null,

            row.saint_name || null,

            firstCommunionDate,
            row.first_communion_place || null,

            confirmationDate,
            row.confirmation_place || null,
            row.confirmation_saint_name || null,

            row.catechism_level || null,
            catechismStatus,
            enrollmentDate,

            row.note || null,
            row.avatar || null,
            studentStatus,
          ],
        );

        const studentId = result.insertId;

        // =================================================
        // GÁN HỌC SINH VÀO LỚP
        // =================================================

        await connection.query(
          `
            INSERT INTO class_students (
              class_id,
              student_id
            )
            VALUES (?, ?)
          `,
          [classId, studentId],
        );

        // =================================================
        // SUCCESS
        // =================================================

        successRows.push({
          row: excelRow,
          id: studentId,
          code,
          name,
          class_id: classId,
          class_name: classInfo.name,
        });

        nextStudentId++;

        console.log("✅ IMPORT SUCCESS:", {
          row: excelRow,
          studentId,
          code,
          name,
          classId,
          className: classInfo.name,
        });
      } catch (error) {
        console.error(`❌ IMPORT ERROR ROW ${excelRow}:`, error.message);

        errorRows.push({
          row: excelRow,
          name: row.name || null,
          code: row.code || null,
          class_id: row.class_id || null,
          error: error.message,
        });
      }
    }

    // =====================================================
    // CÓ LỖI → ROLLBACK
    // =====================================================

    if (errorRows.length > 0) {
      await connection.rollback();

      console.error("========================================");
      console.error("❌ IMPORT FAILED");
      console.error("ROLLBACK ALL DATA");
      console.error("TOTAL:", rows.length);
      console.error("FAILED:", errorRows.length);
      console.error("ERRORS:", errorRows);
      console.error("========================================");

      return res.status(400).json({
        success: false,
        message: "Import thất bại. Không có dữ liệu nào được thêm.",
        total: rows.length,
        success_count: 0,
        failed_count: errorRows.length,
        errors: errorRows,
      });
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    console.log("========================================");
    console.log(`✅ IMPORT SUCCESS: ${successRows.length} STUDENTS`);
    console.log("========================================");

    return res.status(201).json({
      success: true,
      message: `Import thành công ${successRows.length} học sinh`,
      total: rows.length,
      success_count: successRows.length,
      failed_count: 0,
      data: successRows,
    });
  } catch (error) {
    // =====================================================
    // ROLLBACK
    // =====================================================

    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR:", rollbackError.message);
    }

    console.error("========== IMPORT STUDENTS EXCEL ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL Message:", error.sqlMessage);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Không thể import học sinh từ Excel",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    // =====================================================
    // RELEASE CONNECTION
    // =====================================================

    connection.release();
  }
};
// =====================================================
// DELETE /api/students/:id
//
// XÓA HỌC SINH
//
// Chỉ được xóa nếu học sinh thuộc giáo xứ hiện tại.
// =====================================================
exports.deleteStudent = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // KIỂM TRA QUYỀN TRUY CẬP
    // =====================================================

    const belongsToChurch = await checkStudentBelongsToChurch(id, churchId);

    if (!belongsToChurch) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ này",
      });
    }

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    // =====================================================
    // XÓA QUAN HỆ LỚP
    // =====================================================

    await connection.query(
      `
      DELETE FROM class_students
      WHERE student_id = ?
      `,
      [id],
    );

    // =====================================================
    // XÓA STUDENT
    // =====================================================

    const [result] = await connection.query(
      `
      DELETE FROM students
      WHERE id = ?
      `,
      [id],
    );

    if (!result.affectedRows) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    console.log("✅ DELETE STUDENT SUCCESS");
    console.log("Student ID:", id);
    console.log("Church ID:", churchId);

    return res.json({
      success: true,
      message: "Đã xóa học sinh thành công",
    });
  } catch (error) {
    await connection.rollback();

    console.error("========== DELETE STUDENT ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa học sinh",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

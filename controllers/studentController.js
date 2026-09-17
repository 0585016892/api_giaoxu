const db = require("../config/db");
const XLSX = require("xlsx");
const crypto = require("crypto");
const { writeLog } = require("../utils/activityLogger");

// =====================================================
// HELPER: LẤY CHURCH ID TỪ TOKEN
// =====================================================

const getChurchId = (req) => {
  return req.user?.church_id;
};
const fs = require("fs");
const path = require("path");

// =====================================================
// HELPER: XÓA FILE UPLOAD
// =====================================================

const deleteUploadedFile = (file) => {
  if (!file) return;

  try {
    const filePath = file.path;

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);

      console.log("🗑️ Đã xóa file upload:", filePath);
    }
  } catch (error) {
    console.error("❌ DELETE UPLOADED FILE ERROR:", error.message);
  }
};
// =====================================================
// HELPER: TẠO QR TOKEN
// 32 bytes = 64 ký tự HEX
// =====================================================

const generateQrToken = () => {
  return crypto.randomBytes(32).toString("hex");
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
// QUAN TRỌNG:
// Không kiểm tra qua class_students.
//
// Vì học sinh có thể:
// - Đã có lớp
// - Chưa có lớp
//
// students.church_id mới là nguồn xác định giáo xứ.
// =====================================================

const checkStudentBelongsToChurch = async (studentId, churchId) => {
  const [rows] = await db.query(
    `
      SELECT id
      FROM students
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
    `,
    [studentId, churchId],
  );

  return rows.length > 0;
};

// =====================================================
// GET /api/students
// LẤY DANH SÁCH HỌC SINH
// =====================================================

exports.getStudents = async (req, res) => {
  const startedAt = Date.now();

  try {
    // =========================================================
    // 1. GET CHURCH
    // =========================================================

    const churchId = getChurchId(req);

    const rawClassId = req.query.class_id;

    console.log("");
    console.log("============================================================");
    console.log("                    GET STUDENTS");
    console.log("============================================================");

    console.log("CHURCH ID:", churchId);
    console.log("RAW CLASS ID:", rawClassId);

    // =========================================================
    // 2. VALIDATE CHURCH
    // =========================================================

    if (!churchId) {
      console.error("❌ ACCOUNT HAS NO CHURCH");

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const numericChurchId = Number(churchId);

    if (!Number.isInteger(numericChurchId) || numericChurchId <= 0) {
      console.error("❌ INVALID CHURCH ID:", churchId);

      return res.status(400).json({
        success: false,
        message: "Church ID không hợp lệ",
      });
    }

    // =========================================================
    // 3. VALIDATE CLASS ID
    // =========================================================

    let classId = null;

    if (
      rawClassId !== undefined &&
      rawClassId !== null &&
      String(rawClassId).trim() !== ""
    ) {
      classId = Number(String(rawClassId).trim());

      if (!Number.isInteger(classId) || classId <= 0) {
        console.error("❌ INVALID CLASS ID:", rawClassId);

        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ",
        });
      }
    }

    console.log("NORMALIZED CLASS ID:", classId);

    // =========================================================
    // 4. SQL
    //
    // LEFT JOIN:
    // - Có lớp -> lấy thông tin lớp
    // - Không lớp -> class_id/name/code = NULL
    //
    // students.church_id:
    // - Xác định học sinh thuộc giáo xứ
    // =========================================================

    let sql = `
      SELECT
        s.*,

        cs.class_id AS class_id,
        c.name AS class_name,
        c.code AS class_code,

        cs.status AS class_student_status,
        cs.joined_at

      FROM students s

      LEFT JOIN class_students cs
        ON cs.student_id = s.id

      LEFT JOIN classes c
        ON c.id = cs.class_id
        AND c.church_id = s.church_id

      WHERE s.church_id = ?
    `;

    const params = [numericChurchId];

    // =========================================================
    // 5. FILTER CLASS
    // =========================================================

    if (classId !== null) {
      sql += `
        AND cs.class_id = ?
      `;

      params.push(classId);
    }

    // =========================================================
    // 6. ORDER
    // =========================================================

    sql += `
      ORDER BY
        s.created_at DESC,
        s.id DESC
    `;

    // =========================================================
    // 7. LOG
    // =========================================================

    console.log("");
    console.log("---------------- SQL ----------------");
    console.log(sql);
    console.log("--------------------------------------");

    console.log("PARAMS:", params);
    console.log("PARAM COUNT:", params.length);

    // =========================================================
    // 8. EXECUTE
    // =========================================================

    console.log("EXECUTING QUERY...");

    const [rows] = await db.query(sql, params);

    // =========================================================
    // 9. RESULT
    // =========================================================

    console.log("✅ QUERY SUCCESS");
    console.log("TOTAL:", rows.length);

    // =========================================================
    // 10. COUNT CÓ / KHÔNG CÓ LỚP
    // =========================================================

    let assignedCount = 0;
    let unassignedCount = 0;

    for (const student of rows) {
      if (student.class_id) {
        assignedCount++;
      } else {
        unassignedCount++;
      }
    }

    console.log("ASSIGNED:", assignedCount);
    console.log("UNASSIGNED:", unassignedCount);

    // =========================================================
    // 11. FINAL RESPONSE
    // =========================================================

    const duration = Date.now() - startedAt;

    console.log("DURATION:", `${duration} ms`);

    console.log("============================================================");

    return res.status(200).json({
      success: true,

      church_id: numericChurchId,

      class_id: classId,

      total: rows.length,

      assigned_count: assignedCount,

      unassigned_count: unassignedCount,

      data: rows,

      duration_ms: duration,
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("❌ GET STUDENTS ERROR");
    console.error(
      "============================================================",
    );

    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("ERRNO:", error.errno);
    console.error("SQL MESSAGE:", error.sqlMessage);
    console.error("SQL STATE:", error.sqlState);
    console.error("STACK:", error.stack);

    console.error(
      "============================================================",
    );

    return res.status(500).json({
      success: false,

      message: "Không thể lấy danh sách học sinh",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,

      mysql_code:
        process.env.NODE_ENV === "development" ? error.code : undefined,

      mysql_errno:
        process.env.NODE_ENV === "development" ? error.errno : undefined,

      mysql_sql_state:
        process.env.NODE_ENV === "development" ? error.sqlState : undefined,
    });
  }
};

// =====================================================
// GET /api/students/:id
// CHI TIẾT HỌC SINH
//
// HỖ TRỢ:
// - Học sinh có lớp
// - Học sinh chưa có lớp
// =====================================================

exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const churchId = getChurchId(req);

    const studentId = Number(id);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID học sinh không hợp lệ",
      });
    }

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

        LEFT JOIN class_students cs
          ON cs.student_id = s.id

        LEFT JOIN classes c
          ON c.id = cs.class_id
          AND c.church_id = s.church_id

        WHERE s.id = ?
          AND s.church_id = ?

        LIMIT 1
      `,
      [studentId, churchId],
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
// GET /api/students/teacher
// LẤY HỌC SINH CỦA GIÁO LÝ VIÊN
// =====================================================

exports.getStudentsByTeacher = async (req, res) => {
  try {
    const adminId = req.user?.id;

    const churchId = req.user?.church_id;

    if (!adminId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản giáo viên",
      });
    }

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =================================================
    // TÌM GIÁO LÝ VIÊN
    // =================================================

    const [teacherRows] = await db.query(
      `
        SELECT
          a.id AS admin_id,
          a.username,
          a.role,
          a.church_id,

          ct.id AS catechist_id,
          ct.catechist_code,
          ct.full_name

        FROM admins a

        LEFT JOIN catechists ct
          ON ct.catechist_code = a.username
         AND ct.church_id = a.church_id

        WHERE a.id = ?
          AND a.church_id = ?

        LIMIT 1
      `,
      [adminId, churchId],
    );

    if (!teacherRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản giáo viên",
      });
    }

    const teacher = teacherRows[0];

    if (!teacher.catechist_id) {
      return res.status(404).json({
        success: false,
        message: "Tài khoản giáo viên chưa được liên kết với Giáo lý viên",
      });
    }

    const catechistId = teacher.catechist_id;

    // =================================================
    // LẤY HỌC SINH
    // =================================================

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

        INNER JOIN catechist_classes cc
          ON cc.class_id = c.id

        WHERE cc.catechist_id = ?
          AND c.church_id = ?
          AND s.church_id = ?
          AND cs.status = 'studying'

        ORDER BY
          c.name ASC,
          s.name ASC
      `,
      [catechistId, churchId, churchId],
    );

    return res.status(200).json({
      success: true,

      teacher: {
        admin_id: teacher.admin_id,
        catechist_id: teacher.catechist_id,
        catechist_code: teacher.catechist_code,
        full_name: teacher.full_name,
      },

      total: rows.length,

      data: rows,
    });
  } catch (error) {
    console.error("========== GET STUDENTS BY TEACHER ERROR ==========");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL:", error.sqlMessage);

    return res.status(500).json({
      success: false,

      message: "Không thể lấy danh sách học sinh của giáo viên",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// =====================================================
// POST /api/students
// TẠO HỌC SINH
//
// TỰ ĐỘNG:
// - Sinh code HS000001...
// - Sinh QR token
// - Có thể gán lớp
// - Có thể KHÔNG gán lớp
// =====================================================

// =====================================================
// CREATE STUDENT
// =====================================================

exports.createStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;
  let studentCreated = false;

  try {
    const churchId = getChurchId(req);

    console.log("========================================");
    console.log("CREATE STUDENT");
    console.log("========================================");
    console.log("CHURCH ID:", churchId);
    console.log("USER ID:", req.user?.id);
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    // =================================================
    // CHECK CHURCH
    // =================================================

    if (!churchId) {
      deleteUploadedFile(req.file);

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =================================================
    // LẤY DATA
    // =================================================

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
      status,
      class_id,
    } = req.body;

    // =================================================
    // VALIDATE NAME
    // =================================================

    if (!name || !String(name).trim()) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    const studentName = String(name).trim();

    // =================================================
    // VALIDATE GENDER
    //
    // Frontend có thể gửi:
    // male / female / other
    //
    // DB:
    // Nam / Nữ / Khác
    // =================================================

    let normalizedGender = null;

    if (
      gender !== undefined &&
      gender !== null &&
      String(gender).trim() !== ""
    ) {
      const genderValue = String(gender).trim().toLowerCase();

      const genderMap = {
        male: "Nam",
        female: "Nữ",
        other: "Khác",

        nam: "Nam",
        nữ: "Nữ",
        nu: "Nữ",
        khác: "Khác",
        khac: "Khác",
      };

      normalizedGender = genderMap[genderValue];

      if (!normalizedGender) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Giới tính không hợp lệ. Chỉ chấp nhận Nam, Nữ hoặc Khác",
        });
      }
    }

    // =================================================
    // VALIDATE CATECHISM STATUS
    // =================================================

    const allowedCatechismStatus = [
      "new",
      "studying",
      "completed",
      "graduated",
      "dropped",
    ];

    let normalizedCatechismStatus = catechism_status || "new";

    normalizedCatechismStatus = String(normalizedCatechismStatus)
      .trim()
      .toLowerCase();

    if (!allowedCatechismStatus.includes(normalizedCatechismStatus)) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Trạng thái học giáo lý không hợp lệ",
      });
    }

    // =================================================
    // VALIDATE STUDENT STATUS
    // =================================================

    const allowedStatus = [
      "active",
      "inactive",
      "graduated",
      "transferred",
      "dropped",
    ];

    let normalizedStatus = status || "active";

    normalizedStatus = String(normalizedStatus).trim().toLowerCase();

    if (!allowedStatus.includes(normalizedStatus)) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    // =================================================
    // VALIDATE CLASS
    // =================================================

    let classId = null;

    if (
      class_id !== undefined &&
      class_id !== null &&
      String(class_id).trim() !== ""
    ) {
      classId = Number(class_id);

      if (!Number.isInteger(classId) || classId <= 0) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ",
        });
      }

      const classBelongsToChurch = await checkClassBelongsToChurch(
        classId,
        churchId,
      );

      if (!classBelongsToChurch) {
        deleteUploadedFile(req.file);

        return res.status(403).json({
          success: false,
          message: "Lớp không thuộc giáo xứ của tài khoản",
        });
      }
    }

    // =================================================
    // VALIDATE AVATAR
    // =================================================

    if (req.file) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Ảnh đại diện chỉ hỗ trợ JPG, JPEG, PNG hoặc WEBP",
        });
      }

      // 5MB
      if (req.file.size > 5 * 1024 * 1024) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Ảnh đại diện không được vượt quá 5MB",
        });
      }
    }

    // =================================================
    // AVATAR PATH
    // =================================================

    let avatar = null;

    if (req.file) {
      avatar = `/uploads/students/${req.file.filename}`;
    }

    // =================================================
    // TRANSACTION
    // =================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // =================================================
    // TẠO STUDENT CODE
    // =================================================

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

    // =================================================
    // TẠO QR TOKEN
    // =================================================

    const qrToken = generateQrToken();

    // =================================================
    // INSERT STUDENT
    // =================================================

    const [result] = await connection.query(
      `
        INSERT INTO students (
          church_id,
          code,
          qr_token,
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
        studentCode,
        qrToken,
        studentName,

        normalizedGender,

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
        normalizedCatechismStatus,
        enrollment_date || null,

        note || null,
        avatar,
        normalizedStatus,
      ],
    );

    const studentId = result.insertId;

    studentCreated = true;

    // =================================================
    // GÁN HỌC SINH VÀO LỚP
    // =================================================

    if (classId !== null) {
      // -----------------------------------------------
      // CHECK ĐÃ TỒN TẠI CHƯA
      // -----------------------------------------------

      const [existingClassStudent] = await connection.query(
        `
            SELECT id
            FROM class_students
            WHERE class_id = ?
              AND student_id = ?
            LIMIT 1
          `,
        [classId, studentId],
      );

      if (existingClassStudent.length === 0) {
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
      }
    }

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    transactionStarted = false;

    // =================================================
    // ACTIVITY LOG
    //
    // LOG LỖI KHÔNG ĐƯỢC XÓA ẢNH
    // vì học sinh đã tạo thành công
    // =================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "CREATE_STUDENT",

        target_type: "students",

        target_id: studentId,

        description:
          `Tạo học sinh "${studentName}" (${studentCode})` +
          (classId !== null
            ? `, thuộc lớp #${classId}`
            : ", chưa được phân lớp") +
          `, giáo xứ #${churchId}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ CREATE STUDENT ACTIVITY LOG ERROR:", logError.message);
    }

    // =================================================
    // AVATAR URL
    // =================================================

    const baseUrl =
      process.env.API_URL || `${req.protocol}://${req.get("host")}`;

    const avatarUrl = avatar ? `${baseUrl}${avatar}` : null;

    // =================================================
    // LOG
    // =================================================

    console.log("========================================");
    console.log("✅ CREATE STUDENT SUCCESS");
    console.log("========================================");

    console.log("Student ID:", studentId);
    console.log("Code:", studentCode);
    console.log("Name:", studentName);
    console.log("Gender:", normalizedGender);
    console.log("QR:", qrToken);
    console.log("Class ID:", classId);
    console.log("Church ID:", churchId);
    console.log("Avatar:", avatarUrl);

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,

      message: "Thêm học sinh thành công",

      data: {
        id: studentId,

        code: studentCode,

        qr_token: qrToken,

        name: studentName,

        gender: normalizedGender,

        class_id: classId,

        church_id: Number(churchId),

        avatar: avatarUrl,
      },
    });
  } catch (error) {
    // =================================================
    // ROLLBACK
    // =================================================

    if (transactionStarted) {
      try {
        await connection.rollback();

        console.log("↩️ TRANSACTION ROLLBACK");
      } catch (rollbackError) {
        console.error("❌ ROLLBACK ERROR:", rollbackError.message);
      }
    }

    // =================================================
    // NẾU CREATE THẤT BẠI
    // → XÓA FILE ĐÃ UPLOAD
    // =================================================

    if (!studentCreated) {
      deleteUploadedFile(req.file);
    }

    // =================================================
    // ERROR LOG
    // =================================================

    console.error("========================================");
    console.error("❌ CREATE STUDENT ERROR");
    console.error("========================================");

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("SQL:", error.sqlMessage);

    console.error("Stack:", error.stack);

    // =================================================
    // DUPLICATE
    // =================================================

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Dữ liệu học sinh đã tồn tại",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    // =================================================
    // DATA TRUNCATED
    // =================================================

    if (error.code === "WARN_DATA_TRUNCATED") {
      return res.status(400).json({
        success: false,
        message: "Một số dữ liệu không đúng định dạng của cơ sở dữ liệu",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    // =================================================
    // DEFAULT ERROR
    // =================================================

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
// CẬP NHẬT HỌC SINH
//
// KHÔNG UPDATE:
// - id
// - code
// - qr_token
// - church_id
//
// class_id:
// - Có -> đổi/gán lớp
// - Không có -> giữ nguyên lớp
// - Có thể gửi null/"" để bỏ lớp
// =====================================================

exports.updateStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  // =====================================================
  // HELPER
  // =====================================================

  const deleteFile = (filePath) => {
    if (!filePath) return;

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("🗑️ Deleted file:", filePath);
      }
    } catch (error) {
      console.error("❌ DELETE FILE ERROR:", error.message);
    }
  };

  // Xóa file vừa upload nếu request thất bại
  const deleteUploadedFile = () => {
    if (!req.file?.path) return;

    deleteFile(req.file.path);
  };

  // =====================================================
  // DB AVATAR PATH -> FILE PATH
  // =====================================================

  const getAvatarFilePath = (avatar) => {
    if (!avatar) return null;

    let cleanPath = String(avatar).trim();

    // Nếu lưu dạng URL đầy đủ:
    // http://domain.com/uploads/...
    // thì chỉ lấy phần pathname
    try {
      if (/^https?:\/\//i.test(cleanPath)) {
        const url = new URL(cleanPath);
        cleanPath = url.pathname;
      }
    } catch (error) {
      // Không làm gì, tiếp tục xử lý path bình thường
    }

    // Chuẩn hóa slash
    cleanPath = cleanPath.replace(/\\/g, "/");

    // Bỏ slash đầu
    cleanPath = cleanPath.replace(/^\/+/, "");

    // Chỉ cho phép xóa file nằm trong uploads
    if (!cleanPath.startsWith("uploads/")) {
      console.warn("⚠️ Avatar path không hợp lệ:", cleanPath);

      return null;
    }

    const absolutePath = path.resolve(process.cwd(), cleanPath);

    const uploadsRoot = path.resolve(process.cwd(), "uploads");

    // Chống path traversal
    if (
      absolutePath !== uploadsRoot &&
      !absolutePath.startsWith(`${uploadsRoot}${path.sep}`)
    ) {
      console.warn("⚠️ Không cho phép xóa file ngoài uploads:", absolutePath);

      return null;
    }

    return absolutePath;
  };

  // =====================================================
  // EMPTY STRING -> NULL
  // =====================================================

  const valueOrNull = (value) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return null;
    }

    return String(value).trim();
  };

  try {
    const { id } = req.params;

    const churchId = getChurchId(req);

    const studentId = Number(id);

    console.log("========== UPDATE STUDENT ==========");

    console.log("STUDENT ID:", studentId);
    console.log("CHURCH ID:", churchId);
    console.log("BODY:", req.body);

    console.log(
      "FILE:",
      req.file
        ? {
            filename: req.file.filename,
            path: req.file.path,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        : null,
    );

    // =====================================================
    // VALIDATE ID
    // =====================================================

    if (!Number.isInteger(studentId) || studentId <= 0) {
      deleteUploadedFile();

      return res.status(400).json({
        success: false,
        message: "ID học sinh không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE CHURCH
    // =====================================================

    if (!churchId) {
      deleteUploadedFile();

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // CHECK STUDENT
    // =====================================================

    const belongsToChurch = await checkStudentBelongsToChurch(
      studentId,
      churchId,
    );

    if (!belongsToChurch) {
      deleteUploadedFile();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ này",
      });
    }

    // =====================================================
    // GET OLD STUDENT
    // =====================================================

    const [oldStudentRows] = await connection.query(
      `
          SELECT
            id,
            name,
            avatar,
            class_id
          FROM students
          WHERE id = ?
            AND church_id = ?
          LIMIT 1
        `,
      [studentId, churchId],
    );

    if (!oldStudentRows.length) {
      deleteUploadedFile();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    const oldStudent = oldStudentRows[0];

    const oldAvatar = oldStudent.avatar || null;

    // =====================================================
    // BODY
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
      status,

      class_id,

      // avatar:
      // ""
      // null
      // hoặc không gửi
      avatar,
    } = req.body;

    // =====================================================
    // NAME
    // =====================================================

    if (!name || !String(name).trim()) {
      deleteUploadedFile();

      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    const studentName = String(name).trim();

    // =====================================================
    // GENDER
    // =====================================================

    const genderMap = {
      male: "Nam",
      female: "Nữ",
      other: "Khác",

      Nam: "Nam",
      Nữ: "Nữ",
      Khác: "Khác",
    };

    let normalizedGender = null;

    if (
      gender !== undefined &&
      gender !== null &&
      String(gender).trim() !== ""
    ) {
      normalizedGender = genderMap[String(gender).trim()];

      if (!normalizedGender) {
        deleteUploadedFile();

        return res.status(400).json({
          success: false,
          message: "Giới tính không hợp lệ",
        });
      }
    } else {
      // Nếu không gửi gender thì giữ gender cũ
      const [genderRows] = await connection.query(
        `
            SELECT gender
            FROM students
            WHERE id = ?
              AND church_id = ?
            LIMIT 1
          `,
        [studentId, churchId],
      );

      normalizedGender = genderRows[0]?.gender || "Khác";
    }

    // =====================================================
    // CATECHISM STATUS
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
      deleteUploadedFile();

      return res.status(400).json({
        success: false,
        message: "Trạng thái học giáo lý không hợp lệ",
      });
    }

    // =====================================================
    // STUDENT STATUS
    // =====================================================

    const allowedStatus = [
      "active",
      "inactive",
      "graduated",
      "transferred",
      "dropped",
    ];

    if (status && !allowedStatus.includes(status)) {
      deleteUploadedFile();

      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    // =====================================================
    // CLASS
    //
    // undefined -> không đổi
    // "" / null -> bỏ lớp
    // number -> đổi/gán lớp
    // =====================================================

    let classId = undefined;

    if (class_id !== undefined) {
      if (class_id === null || String(class_id).trim() === "") {
        classId = null;
      } else {
        classId = Number(class_id);

        if (!Number.isInteger(classId) || classId <= 0) {
          deleteUploadedFile();

          return res.status(400).json({
            success: false,
            message: "class_id không hợp lệ",
          });
        }

        const classBelongsToChurch = await checkClassBelongsToChurch(
          classId,
          churchId,
        );

        if (!classBelongsToChurch) {
          deleteUploadedFile();

          return res.status(403).json({
            success: false,
            message: "Lớp mới không thuộc giáo xứ của tài khoản",
          });
        }
      }
    }

    // =====================================================
    // AVATAR
    // =====================================================

    let avatarValue = oldAvatar;

    let removeOldAvatar = false;

    let newAvatarPath = null;

    // -----------------------------------------------------
    // CÓ ẢNH MỚI
    // -----------------------------------------------------

    if (req.file) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        deleteUploadedFile();

        return res.status(400).json({
          success: false,
          message: "Chỉ hỗ trợ JPG, JPEG, PNG hoặc WEBP",
        });
      }

      if (req.file.size > 5 * 1024 * 1024) {
        deleteUploadedFile();

        return res.status(400).json({
          success: false,
          message: "Ảnh không được vượt quá 5MB",
        });
      }

      newAvatarPath = `/uploads/students/${req.file.filename}`;

      avatarValue = newAvatarPath;

      if (oldAvatar && oldAvatar !== newAvatarPath) {
        removeOldAvatar = true;
      }
    }

    // -----------------------------------------------------
    // XÓA AVATAR
    // -----------------------------------------------------
    else if (avatar === null || avatar === "") {
      avatarValue = null;

      if (oldAvatar) {
        removeOldAvatar = true;
      }
    }

    // -----------------------------------------------------
    // KHÔNG GỬI GÌ
    //
    // => GIỮ AVATAR CŨ
    // -----------------------------------------------------

    // =====================================================
    // NORMALIZE DATA
    // =====================================================

    const normalizedName = studentName;

    const normalizedBirthDate = valueOrNull(date_of_birth);

    const normalizedBirthPlace = valueOrNull(birth_place);

    const normalizedNationality = valueOrNull(nationality) || "Việt Nam";

    const normalizedPhone = valueOrNull(phone);

    const normalizedEmail = valueOrNull(email);

    const normalizedAddress = valueOrNull(address);

    const normalizedParish = valueOrNull(parish);

    const normalizedFatherName = valueOrNull(father_name);

    const normalizedFatherPhone = valueOrNull(father_phone);

    const normalizedMotherName = valueOrNull(mother_name);

    const normalizedMotherPhone = valueOrNull(mother_phone);

    const normalizedGuardianName = valueOrNull(guardian_name);

    const normalizedGuardianPhone = valueOrNull(guardian_phone);

    const normalizedGuardianRelationship = valueOrNull(guardian_relationship);

    const normalizedBaptismName = valueOrNull(baptism_name);

    const normalizedBaptismDate = valueOrNull(baptism_date);

    const normalizedBaptismPlace = valueOrNull(baptism_place);

    const normalizedBaptismParish = valueOrNull(baptism_parish);

    const normalizedBaptismCertificateNo = valueOrNull(baptism_certificate_no);

    const normalizedSaintName = valueOrNull(saint_name);

    const normalizedFirstCommunionDate = valueOrNull(first_communion_date);

    const normalizedFirstCommunionPlace = valueOrNull(first_communion_place);

    const normalizedConfirmationDate = valueOrNull(confirmation_date);

    const normalizedConfirmationPlace = valueOrNull(confirmation_place);

    const normalizedConfirmationSaintName = valueOrNull(
      confirmation_saint_name,
    );

    const normalizedCatechismLevel = valueOrNull(catechism_level);

    const normalizedCatechismStatus = catechism_status || "new";

    const normalizedEnrollmentDate = valueOrNull(enrollment_date);

    const normalizedNote = valueOrNull(note);

    const normalizedStatus = status || "active";

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // UPDATE STUDENT
    // =====================================================

    const [result] = await connection.execute(
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
            status = ?,
            avatar = ?

          WHERE id = ?
            AND church_id = ?
        `,
      [
        normalizedName,
        normalizedGender,
        normalizedBirthDate,
        normalizedBirthPlace,
        normalizedNationality,
        normalizedPhone,
        normalizedEmail,
        normalizedAddress,
        normalizedParish,

        normalizedFatherName,
        normalizedFatherPhone,

        normalizedMotherName,
        normalizedMotherPhone,

        normalizedGuardianName,
        normalizedGuardianPhone,
        normalizedGuardianRelationship,

        normalizedBaptismName,
        normalizedBaptismDate,
        normalizedBaptismPlace,
        normalizedBaptismParish,
        normalizedBaptismCertificateNo,

        normalizedSaintName,

        normalizedFirstCommunionDate,
        normalizedFirstCommunionPlace,

        normalizedConfirmationDate,
        normalizedConfirmationPlace,
        normalizedConfirmationSaintName,

        normalizedCatechismLevel,
        normalizedCatechismStatus,
        normalizedEnrollmentDate,

        normalizedNote,
        normalizedStatus,
        avatarValue,

        studentId,
        churchId,
      ],
    );

    // =====================================================
    // CHECK UPDATE
    // =====================================================

    if (!result.affectedRows) {
      await connection.rollback();

      transactionStarted = false;

      deleteUploadedFile();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =====================================================
    // CLASS
    // =====================================================

    if (classId !== undefined) {
      // Xóa phân lớp hiện tại
      await connection.query(
        `
          DELETE FROM class_students
          WHERE student_id = ?
        `,
        [studentId],
      );

      // Gán lớp mới
      if (classId !== null) {
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
      }
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    transactionStarted = false;

    // =====================================================
    // XÓA AVATAR CŨ SAU COMMIT
    // =====================================================

    if (removeOldAvatar && oldAvatar && oldAvatar !== avatarValue) {
      const oldAvatarPath = getAvatarFilePath(oldAvatar);

      if (oldAvatarPath) {
        deleteFile(oldAvatarPath);
      }
    }

    // =====================================================
    // ACTIVITY LOG
    // =====================================================

    try {
      let classDescription = "";

      if (classId === undefined) {
        classDescription = "";
      } else if (classId === null) {
        classDescription = ", bỏ phân lớp";
      } else {
        classDescription = `, chuyển sang lớp #${classId}`;
      }

      let avatarDescription = "";

      if (req.file) {
        avatarDescription = ", cập nhật ảnh đại diện";
      } else if (avatar === null || avatar === "") {
        avatarDescription = ", xóa ảnh đại diện";
      }

      await writeLog({
        admin_id: req.user?.id || null,

        action: "UPDATE_STUDENT",

        target_type: "students",

        target_id: studentId,

        description:
          `Cập nhật học sinh "${studentName}" (#${studentId})` +
          `${classDescription}` +
          `${avatarDescription}, giáo xứ #${churchId}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ UPDATE STUDENT ACTIVITY LOG ERROR:", logError.message);
    }

    // =====================================================
    // AVATAR URL
    // =====================================================

    const avatarUrl = avatarValue
      ? /^https?:\/\//i.test(String(avatarValue))
        ? avatarValue
        : `${req.protocol}://${req.get("host")}${avatarValue}`
      : null;

    // =====================================================
    // SUCCESS
    // =====================================================

    console.log("✅ UPDATE STUDENT SUCCESS");

    console.log("Student ID:", studentId);

    console.log("Church ID:", churchId);

    console.log("Avatar:", avatarValue);

    console.log(
      "New Class ID:",
      classId === undefined
        ? "Không đổi"
        : classId === null
          ? "Bỏ lớp"
          : classId,
    );

    return res.json({
      success: true,

      message: "Cập nhật học sinh thành công",

      data: {
        id: studentId,

        name: studentName,

        avatar: avatarValue,

        avatar_url: avatarUrl,

        class_id: classId === undefined ? undefined : classId,

        church_id: Number(churchId),
      },
    });
  } catch (error) {
    // =====================================================
    // ROLLBACK
    // =====================================================

    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("ROLLBACK ERROR:", rollbackError.message);
      }
    }

    // =====================================================
    // XÓA FILE MỚI NẾU UPDATE THẤT BẠI
    // =====================================================

    deleteUploadedFile();

    // =====================================================
    // LOG
    // =====================================================

    console.error("========== UPDATE STUDENT ERROR ==========");

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("SQL:", error.sqlMessage);

    console.error("Stack:", error.stack);

    // =====================================================
    // RESPONSE
    // =====================================================

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
//
// Excel:
// - name bắt buộc
// - class_id có thể trống
// - code có thể trống
//
// Backend:
// - church_id tự sinh
// - qr_token tự sinh
// - code tự sinh nếu Excel không có
//
// Nếu 1 dòng lỗi:
// => ROLLBACK TOÀN BỘ
// =====================================================

exports.importStudentsExcel = async (req, res) => {
  const startedAt = Date.now();

  let connection = null;
  let transactionStarted = false;

  try {
    // =========================================================
    // 0. GET DATABASE CONNECTION
    // =========================================================

    connection = await db.getConnection();

    console.log("");
    console.log("============================================================");
    console.log("              IMPORT STUDENTS EXCEL");
    console.log("============================================================");

    // =========================================================
    // 1. GET CHURCH
    // =========================================================

    console.log("[1/15] CHECK CHURCH");

    const churchId = getChurchId(req);

    console.log("CHURCH ID:", churchId);

    if (!churchId) {
      console.error("❌ CHURCH ID NOT FOUND");

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const numericChurchId = Number(churchId);

    if (!Number.isInteger(numericChurchId) || numericChurchId <= 0) {
      console.error("❌ INVALID CHURCH ID:", churchId);

      return res.status(403).json({
        success: false,
        message: "Church ID không hợp lệ",
      });
    }

    // =========================================================
    // 2. CHECK FILE
    // =========================================================

    console.log("[2/15] CHECK FILE");

    if (!req.file) {
      console.error("❌ NO EXCEL FILE");

      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn file Excel",
      });
    }

    const originalFileName = String(req.file.originalname || "");

    const fileName = originalFileName.toLowerCase();

    console.log("FILE NAME:", originalFileName);
    console.log("FILE SIZE:", req.file.size, "bytes");

    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      console.error("❌ INVALID EXCEL EXTENSION");

      return res.status(400).json({
        success: false,
        message: "Chỉ hỗ trợ file Excel .xlsx hoặc .xls",
      });
    }

    if (!req.file.buffer || !Buffer.isBuffer(req.file.buffer)) {
      console.error("❌ FILE BUFFER NOT FOUND");

      return res.status(400).json({
        success: false,
        message: "Không đọc được dữ liệu file Excel",
      });
    }

    // =========================================================
    // 3. READ EXCEL
    // =========================================================

    console.log("[3/15] READ EXCEL");

    let workbook;

    try {
      workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
        cellDates: true,
      });
    } catch (excelError) {
      console.error("❌ EXCEL READ ERROR");
      console.error("MESSAGE:", excelError.message);
      console.error("STACK:", excelError.stack);

      return res.status(400).json({
        success: false,
        message: "Không thể đọc file Excel",

        error:
          process.env.NODE_ENV === "development"
            ? excelError.message
            : undefined,
      });
    }

    const sheetName = workbook.SheetNames?.[0];

    if (!sheetName) {
      console.error("❌ NO SHEET FOUND");

      return res.status(400).json({
        success: false,
        message: "File Excel không có sheet",
      });
    }

    console.log("SHEET:", sheetName);

    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      console.error("❌ WORKSHEET NOT FOUND");

      return res.status(400).json({
        success: false,
        message: "Không tìm thấy worksheet",
      });
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: false,
    });

    console.log("TOTAL DATA ROWS:", rows.length);

    if (!rows.length) {
      console.error("❌ EXCEL HAS NO DATA");

      return res.status(400).json({
        success: false,
        message: "File Excel không có dữ liệu",
      });
    }

    // =========================================================
    // 4. LIMIT
    // =========================================================

    console.log("[4/15] CHECK LIMIT");

    if (rows.length > 1000) {
      console.error("❌ TOO MANY STUDENTS:", rows.length);

      return res.status(400).json({
        success: false,
        message: "Mỗi lần chỉ được import tối đa 1000 học sinh",
        total: rows.length,
      });
    }

    // =========================================================
    // 5. VALIDATE EXCEL HEADERS
    // =========================================================

    console.log("[5/15] VALIDATE EXCEL HEADERS");

    const requiredHeaders = [
      "name",
      "class_id",
      "code",
      "gender",
      "date_of_birth",
      "birth_place",
      "nationality",
      "phone",
      "email",
      "address",
      "parish",
      "father_name",
      "father_phone",
      "mother_name",
      "mother_phone",
      "guardian_name",
      "guardian_phone",
      "guardian_relationship",
      "baptism_name",
      "baptism_date",
      "baptism_place",
      "baptism_parish",
      "baptism_certificate_no",
      "saint_name",
      "first_communion_date",
      "first_communion_place",
      "confirmation_date",
      "confirmation_place",
      "confirmation_saint_name",
      "catechism_level",
      "catechism_status",
      "enrollment_date",
      "note",
      "avatar",
      "status",
    ];

    const actualHeaders = Object.keys(rows[0] || {});

    console.log("EXPECTED HEADERS:", requiredHeaders.length);
    console.log("ACTUAL HEADERS:", actualHeaders.length);
    console.log("HEADERS:", actualHeaders);

    const missingHeaders = requiredHeaders.filter(
      (header) => !actualHeaders.includes(header),
    );

    if (missingHeaders.length > 0) {
      console.error("❌ MISSING HEADERS:", missingHeaders);

      return res.status(400).json({
        success: false,

        message: "File Excel thiếu cột",

        missing_headers: missingHeaders,

        expected_headers: requiredHeaders,

        actual_headers: actualHeaders,
      });
    }

    console.log("✅ ALL REQUIRED HEADERS VALID");

    // =========================================================
    // 6. DATE PARSER
    // =========================================================

    console.log("[6/15] INITIALIZE DATE PARSER");

    const parseDate = (value) => {
      // -------------------------------------------------------
      // Empty
      // -------------------------------------------------------

      if (value === null || value === undefined || value === "") {
        return null;
      }

      // -------------------------------------------------------
      // Date object
      // -------------------------------------------------------

      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();

        const month = String(value.getMonth() + 1).padStart(2, "0");

        const day = String(value.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
      }

      const str = String(value).trim();

      if (!str) {
        return null;
      }

      // -------------------------------------------------------
      // YYYY-MM-DD
      // -------------------------------------------------------

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

      // -------------------------------------------------------
      // DD/MM/YYYY
      // -------------------------------------------------------

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

      // -------------------------------------------------------
      // Excel serial date
      // -------------------------------------------------------

      if (/^\d+(\.\d+)?$/.test(str)) {
        const serial = Number(str);

        if (serial > 0) {
          const excelDate = XLSX.SSF.parse_date_code(serial);

          if (excelDate) {
            return `${excelDate.y}-${String(excelDate.m).padStart(
              2,
              "0",
            )}-${String(excelDate.d).padStart(2, "0")}`;
          }
        }
      }

      return null;
    };

    // =========================================================
    // 7. VALID VALUES
    // =========================================================

    console.log("[7/15] VALID VALUES");

    const allowedGender = ["male", "female", "other"];

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

    console.log("ALLOWED GENDER:", allowedGender);
    console.log("ALLOWED CATECHISM STATUS:", allowedCatechismStatus);
    console.log("ALLOWED STATUS:", allowedStatus);

    // =========================================================
    // 8. START TRANSACTION
    // =========================================================

    console.log("[8/15] START TRANSACTION");

    await connection.beginTransaction();

    transactionStarted = true;

    console.log("✅ TRANSACTION STARTED");

    const successRows = [];
    const errorRows = [];

    // =========================================================
    // 9. LOAD CLASSES
    // =========================================================

    console.log("[9/15] LOAD CLASSES");

    const classCache = new Map();

    const classIds = [
      ...new Set(
        rows
          .map((row) => {
            if (
              row.class_id === null ||
              row.class_id === undefined ||
              String(row.class_id).trim() === ""
            ) {
              return null;
            }

            const id = Number(String(row.class_id).trim());

            return Number.isInteger(id) && id > 0 ? id : null;
          })
          .filter(Boolean),
      ),
    ];

    console.log("CLASS IDS:", classIds);

    if (classIds.length > 0) {
      const placeholders = classIds.map(() => "?").join(",");

      const classSql = `
        SELECT
          id,
          name,
          code,
          church_id
        FROM classes
        WHERE church_id = ?
          AND id IN (${placeholders})
      `;

      console.log("LOADING CLASSES...");

      const [classRows] = await connection.execute(classSql, [
        numericChurchId,
        ...classIds,
      ]);

      console.log("CLASSES FOUND:", classRows.length);

      for (const classItem of classRows) {
        classCache.set(Number(classItem.id), classItem);
      }
    }

    // =========================================================
    // 10. GET LAST STUDENT ID
    // =========================================================

    console.log("[10/15] GET LAST STUDENT ID");

    const [lastStudentRows] = await connection.execute(
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

    console.log("NEXT STUDENT ID:", nextStudentId);

    // =========================================================
    // 11. CODE CACHE
    // =========================================================

    console.log("[11/15] PREPARE CODE CACHE");

    const usedCodes = new Set();

    // =========================================================
    // 12. IMPORT ROWS
    // =========================================================

    console.log("[12/15] IMPORT ROWS");

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const excelRow = index + 2;

      console.log("");
      console.log(
        "------------------------------------------------------------",
      );

      console.log(`PROCESSING EXCEL ROW ${excelRow}`);

      console.log(
        "------------------------------------------------------------",
      );

      try {
        // =====================================================
        // NAME
        // =====================================================

        const name = row.name ? String(row.name).trim() : "";

        console.log("NAME:", name);

        if (!name) {
          throw new Error("Thiếu họ tên học sinh");
        }

        if (name.length > 255) {
          throw new Error("Họ tên học sinh không được vượt quá 255 ký tự");
        }

        // =====================================================
        // CLASS
        // =====================================================

        let classId = null;

        let classInfo = null;

        const rawClassId =
          row.class_id !== null && row.class_id !== undefined
            ? String(row.class_id).trim()
            : "";

        if (rawClassId !== "") {
          classId = Number(rawClassId);

          console.log("CLASS ID:", classId);

          if (!Number.isInteger(classId) || classId <= 0) {
            throw new Error(`class_id không hợp lệ: ${rawClassId}`);
          }

          classInfo = classCache.get(classId);

          if (!classInfo) {
            throw new Error(
              `Lớp ID ${classId} không tồn tại hoặc không thuộc giáo xứ`,
            );
          }

          console.log("CLASS NAME:", classInfo.name);
          console.log("CLASS CODE:", classInfo.code);
        } else {
          console.log("CLASS: Không gán lớp");
        }

        // =====================================================
        // GENDER
        // =====================================================

        const gender =
          row.gender !== null &&
          row.gender !== undefined &&
          String(row.gender).trim() !== ""
            ? String(row.gender).trim()
            : null;

        console.log("GENDER:", gender);

        if (gender && !allowedGender.includes(gender)) {
          throw new Error(
            `Giới tính "${gender}" không hợp lệ. Cho phép: ${allowedGender.join(
              ", ",
            )}`,
          );
        }

        // =====================================================
        // CATECHISM STATUS
        // =====================================================

        const catechismStatus =
          row.catechism_status !== null &&
          row.catechism_status !== undefined &&
          String(row.catechism_status).trim() !== ""
            ? String(row.catechism_status).trim()
            : "new";

        console.log("CATECHISM STATUS:", catechismStatus);

        if (!allowedCatechismStatus.includes(catechismStatus)) {
          throw new Error(
            `catechism_status "${catechismStatus}" không hợp lệ. Cho phép: ${allowedCatechismStatus.join(
              ", ",
            )}`,
          );
        }

        // =====================================================
        // STUDENT STATUS
        // =====================================================

        const studentStatus =
          row.status !== null &&
          row.status !== undefined &&
          String(row.status).trim() !== ""
            ? String(row.status).trim()
            : "active";

        console.log("STATUS:", studentStatus);

        if (!allowedStatus.includes(studentStatus)) {
          throw new Error(
            `status "${studentStatus}" không hợp lệ. Cho phép: ${allowedStatus.join(
              ", ",
            )}`,
          );
        }

        // =====================================================
        // CODE
        // =====================================================

        let code =
          row.code !== null &&
          row.code !== undefined &&
          String(row.code).trim() !== ""
            ? String(row.code).trim()
            : null;

        const codeWasGenerated = !code;

        if (!code) {
          do {
            code = `HS${String(nextStudentId).padStart(6, "0")}`;

            nextStudentId++;
          } while (usedCodes.has(code));
        }

        console.log("CODE:", code);

        console.log("CODE SOURCE:", codeWasGenerated ? "AUTO" : "EXCEL");

        if (code.length > 100) {
          throw new Error("Mã học sinh không được vượt quá 100 ký tự");
        }

        // =====================================================
        // DUPLICATE CODE IN FILE
        // =====================================================

        if (usedCodes.has(code)) {
          throw new Error(`Mã học sinh "${code}" bị trùng trong file Excel`);
        }

        // =====================================================
        // CHECK CODE DATABASE
        // =====================================================

        console.log("CHECK CODE DATABASE...");

        const [existingCodeRows] = await connection.execute(
          `
            SELECT id
            FROM students
            WHERE church_id = ?
              AND code = ?
            LIMIT 1
          `,
          [numericChurchId, code],
        );

        if (existingCodeRows.length > 0) {
          throw new Error(`Mã học sinh "${code}" đã tồn tại trong hệ thống`);
        }

        usedCodes.add(code);

        console.log("✅ CODE AVAILABLE");

        // =====================================================
        // QR TOKEN
        // =====================================================

        const qrToken = generateQrToken();

        if (!qrToken) {
          throw new Error("Không thể tạo QR token");
        }

        console.log("QR TOKEN GENERATED: YES");

        // =====================================================
        // DATES
        // =====================================================

        const dateOfBirth = parseDate(row.date_of_birth);

        const baptismDate = parseDate(row.baptism_date);

        const firstCommunionDate = parseDate(row.first_communion_date);

        const confirmationDate = parseDate(row.confirmation_date);

        const enrollmentDate = parseDate(row.enrollment_date);

        console.log("DATES:", {
          dateOfBirth,
          baptismDate,
          firstCommunionDate,
          confirmationDate,
          enrollmentDate,
        });

        // =====================================================
        // VALIDATE DATES
        // =====================================================

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

        // =====================================================
        // PREPARE PARAMS
        // =====================================================

        const params = [
          numericChurchId,
          code,
          qrToken,
          name,
          gender,
          dateOfBirth,

          row.birth_place ? String(row.birth_place).trim() : null,

          row.nationality ? String(row.nationality).trim() : "Việt Nam",

          row.phone ? String(row.phone).trim() : null,

          row.email ? String(row.email).trim() : null,

          row.address ? String(row.address).trim() : null,

          row.parish ? String(row.parish).trim() : null,

          row.father_name ? String(row.father_name).trim() : null,

          row.father_phone ? String(row.father_phone).trim() : null,

          row.mother_name ? String(row.mother_name).trim() : null,

          row.mother_phone ? String(row.mother_phone).trim() : null,

          row.guardian_name ? String(row.guardian_name).trim() : null,

          row.guardian_phone ? String(row.guardian_phone).trim() : null,

          row.guardian_relationship
            ? String(row.guardian_relationship).trim()
            : null,

          row.baptism_name ? String(row.baptism_name).trim() : null,

          baptismDate,

          row.baptism_place ? String(row.baptism_place).trim() : null,

          row.baptism_parish ? String(row.baptism_parish).trim() : null,

          row.baptism_certificate_no
            ? String(row.baptism_certificate_no).trim()
            : null,

          row.saint_name ? String(row.saint_name).trim() : null,

          firstCommunionDate,

          row.first_communion_place
            ? String(row.first_communion_place).trim()
            : null,

          confirmationDate,

          row.confirmation_place ? String(row.confirmation_place).trim() : null,

          row.confirmation_saint_name
            ? String(row.confirmation_saint_name).trim()
            : null,

          row.catechism_level ? String(row.catechism_level).trim() : null,

          catechismStatus,

          enrollmentDate,

          row.note ? String(row.note).trim() : null,

          row.avatar ? String(row.avatar).trim() : null,

          studentStatus,
        ];

        // =====================================================
        // INSERT SQL
        // =====================================================

        const sql = `
          INSERT INTO students (
            church_id,
            code,
            qr_token,
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
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `;

        // =====================================================
        // VALIDATE SQL
        // =====================================================

        const placeholderCount = (sql.match(/\?/g) || []).length;

        console.log("SQL PLACEHOLDERS:", placeholderCount);

        console.log("SQL PARAMS:", params.length);

        if (placeholderCount !== 36) {
          throw new Error(
            `INSERT students phải có đúng 36 placeholders, hiện tại có ${placeholderCount}`,
          );
        }

        if (params.length !== 36) {
          throw new Error(
            `INSERT students phải có đúng 36 params, hiện tại có ${params.length}`,
          );
        }

        if (placeholderCount !== params.length) {
          throw new Error(
            `SQL placeholder mismatch: ${placeholderCount} placeholders nhưng ${params.length} params`,
          );
        }

        console.log("✅ SQL VALID: 36 COLUMNS / 36 PLACEHOLDERS / 36 PARAMS");

        // =====================================================
        // INSERT STUDENT
        // =====================================================

        console.log("EXECUTING INSERT students...");

        const [result] = await connection.execute(sql, params);

        const studentId = result.insertId;

        console.log("INSERT RESULT:", {
          insertId: studentId,
          affectedRows: result.affectedRows,
        });

        if (!studentId) {
          throw new Error("INSERT students không trả về insertId");
        }

        // =====================================================
        // INSERT CLASS STUDENT
        // =====================================================

        if (classId) {
          console.log("INSERT class_students:", {
            classId,
            studentId,
          });

          const [classResult] = await connection.execute(
            `
                INSERT INTO class_students (
                  class_id,
                  student_id
                )
                VALUES (?, ?)
              `,
            [classId, studentId],
          );

          console.log("CLASS INSERT RESULT:", {
            affectedRows: classResult.affectedRows,

            insertId: classResult.insertId,
          });

          if (classResult.affectedRows !== 1) {
            throw new Error("Không thể gán học sinh vào lớp");
          }
        } else {
          console.log("CLASS STUDENT: SKIPPED");
        }

        // =====================================================
        // SUCCESS
        // =====================================================

        successRows.push({
          row: excelRow,

          id: studentId,

          code,

          name,

          class_id: classId,

          class_name: classInfo?.name || null,

          qr_token: qrToken,
        });

        console.log(`✅ ROW ${excelRow} IMPORT SUCCESS`);
      } catch (error) {
        // =====================================================
        // ROW ERROR
        // =====================================================

        console.error("");

        console.error(
          "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
        );

        console.error(`❌ IMPORT ERROR - EXCEL ROW ${excelRow}`);

        console.error(
          "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
        );

        console.error("MESSAGE:", error.message);

        console.error("CODE:", error.code);

        console.error("ERRNO:", error.errno);

        console.error("SQL MESSAGE:", error.sqlMessage);

        console.error("SQL STATE:", error.sqlState);

        console.error("STACK:", error.stack);

        console.error("ROW DATA:", {
          name: row.name || null,
          code: row.code || null,
          class_id: row.class_id || null,
          gender: row.gender || null,
          date_of_birth: row.date_of_birth || null,
          catechism_status: row.catechism_status || null,
          status: row.status || null,
        });

        errorRows.push({
          row: excelRow,

          name: row.name || null,

          code: row.code || null,

          class_id: row.class_id || null,

          error: error.message,

          mysql_code: error.code || null,

          mysql_errno: error.errno || null,

          mysql_sql_state: error.sqlState || null,
        });
      }
    }

    // =========================================================
    // 13. CHECK RESULT
    // =========================================================

    console.log("[13/15] CHECK IMPORT RESULT");

    console.log("TOTAL:", rows.length);

    console.log("SUCCESS:", successRows.length);

    console.log("FAILED:", errorRows.length);

    // =========================================================
    // ROLLBACK IF ANY ERROR
    // =========================================================

    if (errorRows.length > 0) {
      console.error("");

      console.error(
        "============================================================",
      );

      console.error("❌ IMPORT FAILED");

      console.error("❌ ROLLBACK ALL DATA");

      console.error(
        "============================================================",
      );

      await connection.rollback();

      transactionStarted = false;

      console.error("✅ ROLLBACK SUCCESS");

      console.error("FAILED ROWS:", JSON.stringify(errorRows, null, 2));

      console.error("DURATION:", `${Date.now() - startedAt} ms`);

      return res.status(400).json({
        success: false,

        message: "Import thất bại. Không có dữ liệu nào được thêm.",

        total: rows.length,

        success_count: 0,

        failed_count: errorRows.length,

        errors: errorRows,

        duration_ms: Date.now() - startedAt,
      });
    }

    // =========================================================
    // 14. COMMIT
    // =========================================================

    console.log("[14/15] COMMIT TRANSACTION");

    await connection.commit();

    transactionStarted = false;

    console.log("✅ COMMIT SUCCESS");

    // =========================================================
    // ACTIVITY LOG
    //
    // Chỉ 1 log cho toàn bộ file.
    // Không tạo 1000 log nếu import 1000 học sinh.
    // =========================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "IMPORT_STUDENTS",

        target_type: "students",

        target_id: null,

        description: `Import thành công ${successRows.length} học sinh từ file "${originalFileName}", giáo xứ #${numericChurchId}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ IMPORT STUDENTS ACTIVITY LOG ERROR:", logError.message);
    }

    // =========================================================
    // 15. RESPONSE
    // =========================================================

    console.log("[15/15] FINAL RESPONSE");

    const duration = Date.now() - startedAt;

    console.log("");

    console.log("============================================================");

    console.log("✅ IMPORT STUDENTS SUCCESS");

    console.log("TOTAL:", rows.length);

    console.log("SUCCESS:", successRows.length);

    console.log("FAILED:", 0);

    console.log("DURATION:", `${duration} ms`);

    console.log("============================================================");

    return res.status(201).json({
      success: true,

      message: `Import thành công ${successRows.length} học sinh`,

      total: rows.length,

      success_count: successRows.length,

      failed_count: 0,

      data: successRows,

      duration_ms: duration,
    });
  } catch (error) {
    // =========================================================
    // GLOBAL ERROR
    // =========================================================

    console.error("");

    console.error(
      "============================================================",
    );

    console.error("❌ IMPORT STUDENTS EXCEL GLOBAL ERROR");

    console.error(
      "============================================================",
    );

    console.error("MESSAGE:", error.message);

    console.error("CODE:", error.code);

    console.error("ERRNO:", error.errno);

    console.error("SQL MESSAGE:", error.sqlMessage);

    console.error("SQL STATE:", error.sqlState);

    console.error("STACK:", error.stack);

    // =========================================================
    // ROLLBACK
    // =========================================================

    if (transactionStarted && connection) {
      try {
        console.error("ROLLBACK GLOBAL TRANSACTION...");

        await connection.rollback();

        transactionStarted = false;

        console.error("✅ GLOBAL ROLLBACK SUCCESS");
      } catch (rollbackError) {
        console.error("❌ ROLLBACK ERROR:", rollbackError.message);
      }
    }

    const duration = Date.now() - startedAt;

    console.error("DURATION:", `${duration} ms`);

    console.error(
      "============================================================",
    );

    return res.status(500).json({
      success: false,

      message: "Không thể import học sinh từ Excel",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,

      mysql_code:
        process.env.NODE_ENV === "development" ? error.code : undefined,

      mysql_errno:
        process.env.NODE_ENV === "development" ? error.errno : undefined,

      mysql_sql_state:
        process.env.NODE_ENV === "development" ? error.sqlState : undefined,

      duration_ms: duration,
    });
  } finally {
    // =========================================================
    // RELEASE CONNECTION
    // =========================================================

    if (connection) {
      try {
        connection.release();

        console.log("🔓 DATABASE CONNECTION RELEASED");
      } catch (releaseError) {
        console.error("❌ CONNECTION RELEASE ERROR:", releaseError.message);
      }
    }

    console.log("============================================================");

    console.log("IMPORT REQUEST FINISHED");

    console.log("============================================================");
  }
};

// =====================================================
// DELETE /api/students/:id
// XÓA HỌC SINH
// =====================================================

exports.deleteStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  try {
    const { id } = req.params;

    const churchId = getChurchId(req);

    const studentId = Number(id);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID học sinh không hợp lệ",
      });
    }

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =================================================
    // KIỂM TRA QUYỀN
    // =================================================

    const belongsToChurch = await checkStudentBelongsToChurch(
      studentId,
      churchId,
    );

    if (!belongsToChurch) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ này",
      });
    }

    // =================================================
    // LẤY THÔNG TIN HỌC SINH TRƯỚC KHI XÓA
    // =================================================

    const [studentRows] = await db.query(
      `
          SELECT
            id,
            code,
            name
          FROM students
          WHERE id = ?
            AND church_id = ?
          LIMIT 1
        `,
      [studentId, churchId],
    );

    if (!studentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ này",
      });
    }

    const studentData = studentRows[0];

    // =================================================
    // TRANSACTION
    // =================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // =================================================
    // XÓA QUAN HỆ LỚP
    // =================================================

    await connection.query(
      `
        DELETE FROM class_students
        WHERE student_id = ?
      `,
      [studentId],
    );

    // =================================================
    // XÓA STUDENT
    // =================================================

    const [result] = await connection.query(
      `
          DELETE FROM students
          WHERE id = ?
            AND church_id = ?
        `,
      [studentId, churchId],
    );

    if (!result.affectedRows) {
      await connection.rollback();

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =================================================
    // COMMIT
    // =================================================

    await connection.commit();

    transactionStarted = false;

    // =================================================
    // ACTIVITY LOG
    // =================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "DELETE_STUDENT",

        target_type: "students",

        target_id: studentId,

        description: `Xóa học sinh "${studentData.name}" (${studentData.code}), giáo xứ #${churchId}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ DELETE STUDENT ACTIVITY LOG ERROR:", logError.message);
    }

    console.log("✅ DELETE STUDENT SUCCESS");

    console.log("Student ID:", studentId);

    console.log("Church ID:", churchId);

    return res.json({
      success: true,

      message: "Đã xóa học sinh thành công",
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("ROLLBACK ERROR:", rollbackError.message);
      }
    }

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

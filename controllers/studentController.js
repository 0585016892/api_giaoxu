const db = require("../config/db");
const XLSX = require("xlsx");
const crypto = require("crypto");
const { writeLog } = require("../utils/activityLogger");
const fs = require("fs");
const path = require("path");

// =====================================================
// CONSTANTS
// =====================================================

const ALLOWED_GENDERS = ["male", "female", "other"];

const ALLOWED_CATECHISM_STATUS = [
  "new",
  "studying",
  "completed",
  "graduated",
  "dropped",
];

const ALLOWED_STUDENT_STATUS = [
  "active",
  "inactive",
  "graduated",
  "transferred",
  "dropped",
];

const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// =====================================================
// HELPER: LẤY CHURCH ID TỪ TOKEN
// =====================================================

const getChurchId = (req) => {
  return req.user?.church_id;
};

// =====================================================
// HELPER: DELETE FILE
// =====================================================

const deleteFile = (filePath) => {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);

      console.log("🗑️ Đã xóa file:", filePath);
    }
  } catch (error) {
    console.error("❌ DELETE FILE ERROR:", error.message);
  }
};

// =====================================================
// HELPER: DELETE UPLOADED FILE
// =====================================================

const deleteUploadedFile = (file) => {
  if (!file?.path) return;

  deleteFile(file.path);
};

// =====================================================
// HELPER: AVATAR DB PATH -> ABSOLUTE PATH
// =====================================================

const getAvatarFilePath = (avatar) => {
  if (!avatar) return null;

  let cleanPath = String(avatar).trim();

  if (!cleanPath) {
    return null;
  }

  // DB có thể đang lưu full URL
  if (/^https?:\/\//i.test(cleanPath)) {
    try {
      const url = new URL(cleanPath);
      cleanPath = url.pathname;
    } catch (error) {
      return null;
    }
  }

  cleanPath = cleanPath.replace(/\\/g, "/");
  cleanPath = cleanPath.replace(/^\/+/, "");

  // Chỉ cho phép file trong uploads
  if (!cleanPath.startsWith("uploads/")) {
    console.warn("⚠️ Avatar path không hợp lệ:", cleanPath);

    return null;
  }

  const uploadsRoot = path.resolve(process.cwd(), "uploads");

  const absolutePath = path.resolve(process.cwd(), cleanPath);

  // Chống path traversal
  if (
    absolutePath !== uploadsRoot &&
    !absolutePath.startsWith(`${uploadsRoot}${path.sep}`)
  ) {
    console.warn("⚠️ Avatar path nằm ngoài uploads:", absolutePath);

    return null;
  }

  return absolutePath;
};

// =====================================================
// HELPER: GENERATE QR TOKEN
// =====================================================

const generateQrToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// =====================================================
// HELPER: NORMALIZE EMPTY VALUE
// =====================================================

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const result = String(value).trim();

  return result === "" ? null : result;
};

// =====================================================
// HELPER: NORMALIZE GENDER
//
// DB:
// male
// female
// other
//
// Frontend cũng đang gửi:
// male
// female
// other
//
// Hỗ trợ thêm dữ liệu cũ:
// Nam / Nữ / Khác
// =====================================================

const normalizeGender = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const raw = String(value).trim();

  const map = {
    male: "male",
    female: "female",
    other: "other",

    Nam: "male",
    Nữ: "female",
    Khác: "other",

    nam: "male",
    nữ: "female",
    khác: "other",

    nu: "female",
    khac: "other",
  };

  return map[raw] || null;
};

// =====================================================
// HELPER: NORMALIZE CATECHISM STATUS
// =====================================================

const normalizeCatechismStatus = (value, defaultValue = "new") => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }

  return String(value).trim().toLowerCase();
};

// =====================================================
// HELPER: NORMALIZE STUDENT STATUS
// =====================================================

const normalizeStudentStatus = (value, defaultValue = "active") => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }

  return String(value).trim().toLowerCase();
};

// =====================================================
// HELPER: CHECK CLASS BELONGS TO CHURCH
// =====================================================

const checkClassBelongsToChurch = async (
  classId,
  churchId,
  connection = db,
) => {
  const [rows] = await connection.query(
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
// HELPER: CHECK STUDENT BELONGS TO CHURCH
// =====================================================

const checkStudentBelongsToChurch = async (
  studentId,
  churchId,
  connection = db,
) => {
  const [rows] = await connection.query(
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
// HELPER: AVATAR URL
// =====================================================

const getAvatarUrl = (req, avatar) => {
  if (!avatar) {
    return null;
  }

  if (/^https?:\/\//i.test(String(avatar))) {
    return avatar;
  }

  const baseUrl = process.env.API_URL || `${req.protocol}://${req.get("host")}`;

  return `${baseUrl}${String(avatar).startsWith("/") ? "" : "/"}${avatar}`;
};

// =====================================================
// GET /api/students
// =====================================================

exports.getStudents = async (req, res) => {
  const startedAt = Date.now();

  try {
    const churchId = getChurchId(req);

    const rawClassId = req.query.class_id;

    console.log("");
    console.log("============================================================");
    console.log("                       GET STUDENTS");
    console.log("============================================================");

    console.log("CHURCH ID:", churchId);

    console.log("RAW CLASS ID:", rawClassId);

    // =====================================================
    // CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const numericChurchId = Number(churchId);

    if (!Number.isInteger(numericChurchId) || numericChurchId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Church ID không hợp lệ",
      });
    }

    // =====================================================
    // CLASS
    // =====================================================

    let classId = null;

    if (
      rawClassId !== undefined &&
      rawClassId !== null &&
      String(rawClassId).trim() !== ""
    ) {
      classId = Number(String(rawClassId).trim());

      if (!Number.isInteger(classId) || classId <= 0) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ",
        });
      }

      const classBelongsToChurch = await checkClassBelongsToChurch(
        classId,
        numericChurchId,
      );

      if (!classBelongsToChurch) {
        return res.status(403).json({
          success: false,
          message: "Lớp không thuộc giáo xứ",
        });
      }
    }

    // =====================================================
    // SQL
    // =====================================================

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

    if (classId !== null) {
      sql += `
        AND cs.class_id = ?
      `;

      params.push(classId);
    }

    sql += `
      ORDER BY
        s.created_at DESC,
        s.id DESC
    `;

    const [rows] = await db.query(sql, params);

    let assignedCount = 0;
    let unassignedCount = 0;

    for (const student of rows) {
      if (student.class_id) {
        assignedCount++;
      } else {
        unassignedCount++;
      }

      student.avatar_url = getAvatarUrl(req, student.avatar);
    }

    const duration = Date.now() - startedAt;

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
    console.error("========== GET STUDENTS ERROR ==========");

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("SQL:", error.sqlMessage);

    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,

      message: "Không thể lấy danh sách học sinh",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// =====================================================
// GET /api/students/:id
// =====================================================

exports.getStudentById = async (req, res) => {
  try {
    const studentId = Number(req.params.id);

    const churchId = getChurchId(req);

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

    const student = rows[0];

    student.avatar_url = getAvatarUrl(req, student.avatar);

    return res.json({
      success: true,

      church_id: Number(churchId),

      data: student,
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

          ORDER BY
            c.name ASC,
            s.name ASC
        `,
      [teacher.catechist_id, churchId, churchId],
    );

    for (const student of rows) {
      student.avatar_url = getAvatarUrl(req, student.avatar);
    }

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
// CREATE STUDENT
// =====================================================

exports.createStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  let studentCreated = false;

  try {
    const churchId = getChurchId(req);

    const body = req.body || {};

    console.log("========================================");

    console.log("CREATE STUDENT");

    console.log("CHURCH ID:", churchId);

    console.log("BODY:", body);

    console.log("FILE:", req.file);

    if (!churchId) {
      deleteUploadedFile(req.file);

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

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
    } = body;

    // =====================================================
    // NAME
    // =====================================================

    if (name === undefined || name === null || !String(name).trim()) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    const studentName = String(name).trim();

    // =====================================================
    // GENDER
    // =====================================================

    let normalizedGender = normalizeGender(gender);

    if (
      gender !== undefined &&
      gender !== null &&
      String(gender).trim() !== "" &&
      !normalizedGender
    ) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message:
          "Giới tính không hợp lệ. Chỉ chấp nhận male, female hoặc other",
      });
    }

    // =====================================================
    // CATECHISM STATUS
    // =====================================================

    const normalizedCatechismStatus = normalizeCatechismStatus(
      catechism_status,
      "new",
    );

    if (!ALLOWED_CATECHISM_STATUS.includes(normalizedCatechismStatus)) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Trạng thái học giáo lý không hợp lệ",
      });
    }

    // =====================================================
    // STUDENT STATUS
    // =====================================================

    const normalizedStatus = normalizeStudentStatus(status, "active");

    if (!ALLOWED_STUDENT_STATUS.includes(normalizedStatus)) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    // =====================================================
    // CLASS
    // =====================================================

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

    // =====================================================
    // AVATAR
    // =====================================================

    if (req.file) {
      if (!ALLOWED_AVATAR_MIME_TYPES.includes(req.file.mimetype)) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Ảnh đại diện chỉ hỗ trợ JPG, JPEG, PNG hoặc WEBP",
        });
      }

      if (req.file.size > MAX_AVATAR_SIZE) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Ảnh đại diện không được vượt quá 5MB",
        });
      }
    }

    const avatar = req.file ? `/uploads/students/${req.file.filename}` : null;

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // GET LAST ID
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

    const nextId = lastStudentRows.length
      ? Number(lastStudentRows[0].id) + 1
      : 1;

    const studentCode = `HS${String(nextId).padStart(6, "0")}`;

    // =====================================================
    // QR
    // =====================================================

    const qrToken = generateQrToken();

    // =====================================================
    // INSERT
    // =====================================================

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

        normalizeValue(date_of_birth),

        normalizeValue(birth_place),

        normalizeValue(nationality) || "Việt Nam",

        normalizeValue(phone),

        normalizeValue(email),

        normalizeValue(address),

        normalizeValue(parish),

        normalizeValue(father_name),

        normalizeValue(father_phone),

        normalizeValue(mother_name),

        normalizeValue(mother_phone),

        normalizeValue(guardian_name),

        normalizeValue(guardian_phone),

        normalizeValue(guardian_relationship),

        normalizeValue(baptism_name),

        normalizeValue(baptism_date),

        normalizeValue(baptism_place),

        normalizeValue(baptism_parish),

        normalizeValue(baptism_certificate_no),

        normalizeValue(saint_name),

        normalizeValue(first_communion_date),

        normalizeValue(first_communion_place),

        normalizeValue(confirmation_date),

        normalizeValue(confirmation_place),

        normalizeValue(confirmation_saint_name),

        normalizeValue(catechism_level),

        normalizedCatechismStatus,

        normalizeValue(enrollment_date),

        normalizeValue(note),

        avatar,

        normalizedStatus,
      ],
    );

    const studentId = result.insertId;

    studentCreated = true;

    // =====================================================
    // CLASS STUDENT
    // =====================================================

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

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    transactionStarted = false;

    // =====================================================
    // ACTIVITY LOG
    // =====================================================

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

    const avatarUrl = getAvatarUrl(req, avatar);

    console.log("========================================");

    console.log("✅ CREATE STUDENT SUCCESS");

    console.log("Student ID:", studentId);

    console.log("Code:", studentCode);

    console.log("Gender:", normalizedGender);

    console.log("Class ID:", classId);

    console.log("Avatar:", avatarUrl);

    console.log("========================================");

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
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ ROLLBACK ERROR:", rollbackError.message);
      }
    }

    if (!studentCreated) {
      deleteUploadedFile(req.file);
    }

    console.error("========================================");

    console.error("❌ CREATE STUDENT ERROR");

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("SQL:", error.sqlMessage);

    console.error("Stack:", error.stack);

    console.error("========================================");

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Dữ liệu học sinh đã tồn tại",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    if (error.code === "WARN_DATA_TRUNCATED") {
      return res.status(400).json({
        success: false,
        message: "Một số dữ liệu không đúng định dạng của cơ sở dữ liệu",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

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
// UPDATE STUDENT
// =====================================================

exports.updateStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  const removeNewUpload = () => {
    deleteUploadedFile(req.file);
  };

  try {
    const studentId = Number(req.params.id);

    const churchId = getChurchId(req);

    // =====================================================
    // BODY
    //
    // QUAN TRỌNG:
    // multipart/form-data có thể khiến req.body undefined
    // =====================================================

    const body = req.body || {};

    console.log("==========================================");

    console.log("========== UPDATE STUDENT ==========");

    console.log("STUDENT ID:", studentId);

    console.log("CHURCH ID:", churchId);

    console.log("CONTENT-TYPE:", req.headers["content-type"]);

    console.log("BODY:", body);

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
      removeNewUpload();

      return res.status(400).json({
        success: false,
        message: "ID học sinh không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE CHURCH
    // =====================================================

    if (!churchId) {
      removeNewUpload();

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // GET OLD STUDENT
    // =====================================================

    const [oldStudentRows] = await connection.execute(
      `
        SELECT
          id,
          name,
          avatar,
          gender,
          status,
          catechism_status
        FROM students
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [studentId, churchId],
    );

    if (!oldStudentRows.length) {
      removeNewUpload();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh trong giáo xứ này",
      });
    }

    const oldStudent = oldStudentRows[0];

    const oldAvatar = oldStudent.avatar || null;

    // =====================================================
    // BODY DATA
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

      avatar,
    } = body;

    // =====================================================
    // NAME
    // =====================================================

    if (name === undefined || name === null || !String(name).trim()) {
      removeNewUpload();

      return res.status(400).json({
        success: false,
        message: "Họ tên học sinh là bắt buộc",
      });
    }

    const studentName = String(name).trim();

    // =====================================================
    // GENDER
    //
    // DB:
    // enum('male','female','other')
    // =====================================================

    let normalizedGender = oldStudent.gender || "other";

    if (
      gender !== undefined &&
      gender !== null &&
      String(gender).trim() !== ""
    ) {
      normalizedGender = normalizeGender(gender);

      if (!normalizedGender) {
        removeNewUpload();

        return res.status(400).json({
          success: false,
          message:
            "Giới tính không hợp lệ. Chỉ chấp nhận male, female hoặc other",
        });
      }
    }

    // =====================================================
    // CATECHISM STATUS
    // =====================================================

    const normalizedCatechismStatus = normalizeCatechismStatus(
      catechism_status,
      oldStudent.catechism_status || "new",
    );

    if (!ALLOWED_CATECHISM_STATUS.includes(normalizedCatechismStatus)) {
      removeNewUpload();

      return res.status(400).json({
        success: false,
        message: "Trạng thái học giáo lý không hợp lệ",
      });
    }

    // =====================================================
    // STUDENT STATUS
    // =====================================================

    const normalizedStatus = normalizeStudentStatus(
      status,
      oldStudent.status || "active",
    );

    if (!ALLOWED_STUDENT_STATUS.includes(normalizedStatus)) {
      removeNewUpload();

      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    // =====================================================
    // CLASS
    //
    // undefined:
    //   Không thay đổi lớp
    //
    // null / "":
    //   Bỏ lớp
    //
    // number:
    //   Đổi / gán lớp
    // =====================================================

    let classId;

    if (class_id !== undefined) {
      if (class_id === null || String(class_id).trim() === "") {
        classId = null;
      } else {
        classId = Number(class_id);

        if (!Number.isInteger(classId) || classId <= 0) {
          removeNewUpload();

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
          removeNewUpload();

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

    // =====================================================
    // NEW AVATAR
    // =====================================================

    if (req.file) {
      if (!ALLOWED_AVATAR_MIME_TYPES.includes(req.file.mimetype)) {
        removeNewUpload();

        return res.status(400).json({
          success: false,
          message: "Chỉ hỗ trợ JPG, JPEG, PNG hoặc WEBP",
        });
      }

      if (req.file.size > MAX_AVATAR_SIZE) {
        removeNewUpload();

        return res.status(400).json({
          success: false,
          message: "Ảnh không được vượt quá 5MB",
        });
      }

      avatarValue = `/uploads/students/${req.file.filename}`;

      if (oldAvatar && oldAvatar !== avatarValue) {
        removeOldAvatar = true;
      }
    }

    // =====================================================
    // REMOVE AVATAR
    // =====================================================
    else if (avatar === null || avatar === "") {
      avatarValue = null;

      if (oldAvatar) {
        removeOldAvatar = true;
      }
    }

    // =====================================================
    // NORMALIZE FIELDS
    // =====================================================

    const normalizedBirthDate = normalizeValue(date_of_birth);

    const normalizedBirthPlace = normalizeValue(birth_place);

    const normalizedNationality = normalizeValue(nationality) || "Việt Nam";

    const normalizedPhone = normalizeValue(phone);

    const normalizedEmail = normalizeValue(email);

    const normalizedAddress = normalizeValue(address);

    const normalizedParish = normalizeValue(parish);

    const normalizedFatherName = normalizeValue(father_name);

    const normalizedFatherPhone = normalizeValue(father_phone);

    const normalizedMotherName = normalizeValue(mother_name);

    const normalizedMotherPhone = normalizeValue(mother_phone);

    const normalizedGuardianName = normalizeValue(guardian_name);

    const normalizedGuardianPhone = normalizeValue(guardian_phone);

    const normalizedGuardianRelationship = normalizeValue(
      guardian_relationship,
    );

    const normalizedBaptismName = normalizeValue(baptism_name);

    const normalizedBaptismDate = normalizeValue(baptism_date);

    const normalizedBaptismPlace = normalizeValue(baptism_place);

    const normalizedBaptismParish = normalizeValue(baptism_parish);

    const normalizedBaptismCertificateNo = normalizeValue(
      baptism_certificate_no,
    );

    const normalizedSaintName = normalizeValue(saint_name);

    const normalizedFirstCommunionDate = normalizeValue(first_communion_date);

    const normalizedFirstCommunionPlace = normalizeValue(first_communion_place);

    const normalizedConfirmationDate = normalizeValue(confirmation_date);

    const normalizedConfirmationPlace = normalizeValue(confirmation_place);

    const normalizedConfirmationSaintName = normalizeValue(
      confirmation_saint_name,
    );

    const normalizedCatechismLevel = normalizeValue(catechism_level);

    const normalizedEnrollmentDate = normalizeValue(enrollment_date);

    const normalizedNote = normalizeValue(note);

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // UPDATE STUDENTS
    //
    // KHÔNG CÓ class_id
    // =====================================================

    const [updateResult] = await connection.execute(
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
        studentName,

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
    // UPDATE FAILED
    // =====================================================

    if (!updateResult.affectedRows) {
      await connection.rollback();

      transactionStarted = false;

      removeNewUpload();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =====================================================
    // UPDATE CLASS
    // =====================================================

    if (classId !== undefined) {
      await connection.execute(
        `
          DELETE FROM class_students
          WHERE student_id = ?
        `,
        [studentId],
      );

      if (classId !== null) {
        await connection.execute(
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
    // DELETE OLD AVATAR
    // ONLY AFTER COMMIT
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
          classDescription +
          avatarDescription +
          `, giáo xứ #${churchId}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ UPDATE STUDENT ACTIVITY LOG ERROR:", logError.message);
    }

    // =====================================================
    // AVATAR URL
    // =====================================================

    const avatarUrl = getAvatarUrl(req, avatarValue);

    // =====================================================
    // SUCCESS
    // =====================================================

    console.log("==========================================");

    console.log("✅ UPDATE STUDENT SUCCESS");

    console.log("Student ID:", studentId);

    console.log("Church ID:", churchId);

    console.log("Gender:", normalizedGender);

    console.log("Avatar:", avatarValue);

    console.log(
      "Class:",
      classId === undefined
        ? "Không đổi"
        : classId === null
          ? "Bỏ lớp"
          : classId,
    );

    console.log("==========================================");

    return res.json({
      success: true,

      message: "Cập nhật học sinh thành công",

      data: {
        id: studentId,

        name: studentName,

        gender: normalizedGender,

        avatar: avatarValue,

        avatar_url: avatarUrl,

        class_id: classId === undefined ? undefined : classId,

        church_id: Number(churchId),
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ ROLLBACK ERROR:", rollbackError.message);
      }
    }

    // Chỉ xóa file mới upload.
    // Không đụng file avatar cũ.
    removeNewUpload();

    console.error("==========================================");

    console.error("========== UPDATE STUDENT ERROR ==========");

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("SQL:", error.sqlMessage);

    console.error("Stack:", error.stack);

    console.error("==========================================");

    if (error.code === "WARN_DATA_TRUNCATED") {
      return res.status(400).json({
        success: false,

        message: "Một số dữ liệu không đúng định dạng của cơ sở dữ liệu",

        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        message: "Dữ liệu học sinh đã tồn tại",

        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

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
// =====================================================

exports.importStudentsExcel = async (req, res) => {
  const startedAt = Date.now();

  let connection = null;
  let transactionStarted = false;

  try {
    console.log("");
    console.log("============================================================");
    console.log("              IMPORT STUDENTS EXCEL");
    console.log("============================================================");

    // =========================================================
    // DEBUG REQUEST
    // =========================================================

    console.log("👤 req.user:", req.user);

    console.log("📁 req.file:", {
      exists: !!req.file,
      originalname: req.file?.originalname || null,
      mimetype: req.file?.mimetype || null,
      size: req.file?.size || 0,
      hasBuffer: !!req.file?.buffer,
    });

    // =========================================================
    // CHURCH
    // =========================================================

    const churchId = getChurchId(req);

    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const numericChurchId = Number(churchId);

    if (!Number.isInteger(numericChurchId) || numericChurchId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Church ID không hợp lệ",
      });
    }

    // =========================================================
    // FILE
    // =========================================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn file Excel",
      });
    }

    const originalFileName = String(req.file.originalname || "").trim();

    const fileName = originalFileName.toLowerCase();

    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return res.status(400).json({
        success: false,
        message: "Chỉ hỗ trợ file Excel .xlsx hoặc .xls",
      });
    }

    if (!req.file.buffer || !Buffer.isBuffer(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        message: "Không đọc được dữ liệu file Excel",
      });
    }

    // =========================================================
    // READ EXCEL
    // =========================================================

    let workbook;

    try {
      workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
        cellDates: true,
      });
    } catch (excelError) {
      console.error("❌ XLSX READ ERROR:", excelError);

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
      return res.status(400).json({
        success: false,
        message: "File Excel không có sheet",
      });
    }

    console.log("📄 SHEET:", sheetName);

    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return res.status(400).json({
        success: false,
        message: "Không tìm thấy dữ liệu trong sheet",
      });
    }

    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: false,
      blankrows: false,
    });

    if (!rawRows.length) {
      return res.status(400).json({
        success: false,
        message: "File Excel không có dữ liệu",
      });
    }

    if (rawRows.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Mỗi lần chỉ được import tối đa 1000 học sinh",
        total: rawRows.length,
      });
    }

    console.log("📊 TOTAL ROWS:", rawRows.length);

    // =========================================================
    // NORMALIZE HEADER
    // =========================================================

    const normalizeHeader = (value) => {
      return String(value || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    };

    const rows = rawRows.map((rawRow) => {
      const normalizedRow = {};

      Object.entries(rawRow).forEach(([key, value]) => {
        const normalizedKey = normalizeHeader(key);

        if (normalizedKey) {
          normalizedRow[normalizedKey] = value;
        }
      });

      return normalizedRow;
    });

    // =========================================================
    // HEADERS
    //
    // CHỈ NAME BẮT BUỘC
    // Các cột khác có thể không tồn tại
    // =========================================================

    const requiredHeaders = ["name"];

    const actualHeaders = Object.keys(rows[0] || {});

    const missingHeaders = requiredHeaders.filter(
      (header) => !actualHeaders.includes(header),
    );

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        message: "File Excel thiếu cột bắt buộc",
        missing_headers: missingHeaders,
        expected_required_headers: requiredHeaders,
        actual_headers: actualHeaders,
      });
    }

    console.log("📋 ACTUAL HEADERS:", actualHeaders);

    // =========================================================
    // DATE PARSER
    // =========================================================

    const parseDate = (value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      // -------------------------------------------------------
      // JS Date
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
      // Excel serial
      // -------------------------------------------------------

      if (/^\d+(?:\.\d+)?$/.test(str)) {
        const serial = Number(str);

        if (Number.isFinite(serial) && serial > 0) {
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
    // TRANSACTION
    // =========================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    console.log("🔐 TRANSACTION STARTED");

    const successRows = [];
    const errorRows = [];

    // =========================================================
    // CLASS CACHE
    // =========================================================

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

    if (classIds.length > 0) {
      const placeholders = classIds.map(() => "?").join(",");

      const [classRows] = await connection.execute(
        `
            SELECT
              id,
              name,
              code,
              church_id
            FROM classes
            WHERE church_id = ?
              AND id IN (${placeholders})
          `,
        [numericChurchId, ...classIds],
      );

      for (const classItem of classRows) {
        classCache.set(Number(classItem.id), classItem);
      }
    }

    console.log("📚 CLASS CACHE:", classCache.size);

    // =========================================================
    // LAST STUDENT ID
    // =========================================================

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

    // =========================================================
    // USED CODES
    // =========================================================

    const usedCodes = new Set();

    // =========================================================
    // PROCESS ROWS
    // =========================================================

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      // Excel row bắt đầu từ dòng 2
      const excelRow = index + 2;

      try {
        // =====================================================
        // NAME
        // =====================================================

        const name =
          row.name !== null && row.name !== undefined
            ? String(row.name).trim()
            : "";

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

        if (rawClassId) {
          classId = Number(rawClassId);

          if (!Number.isInteger(classId) || classId <= 0) {
            throw new Error(`class_id không hợp lệ: ${rawClassId}`);
          }

          classInfo = classCache.get(classId);

          if (!classInfo) {
            throw new Error(
              `Lớp ID ${classId} không tồn tại hoặc không thuộc giáo xứ`,
            );
          }
        }

        // =====================================================
        // GENDER
        // =====================================================

        let gender = null;

        if (
          row.gender !== null &&
          row.gender !== undefined &&
          String(row.gender).trim() !== ""
        ) {
          gender = normalizeGender(row.gender);

          if (!gender) {
            throw new Error(
              `Giới tính "${row.gender}" không hợp lệ. Cho phép: male, female, other`,
            );
          }
        }

        // =====================================================
        // CATECHISM STATUS
        // =====================================================

        const catechismStatus = normalizeCatechismStatus(
          row.catechism_status,
          "new",
        );

        if (!ALLOWED_CATECHISM_STATUS.includes(catechismStatus)) {
          throw new Error(`catechism_status "${catechismStatus}" không hợp lệ`);
        }

        // =====================================================
        // STUDENT STATUS
        // =====================================================

        const studentStatus = normalizeStudentStatus(row.status, "active");

        if (!ALLOWED_STUDENT_STATUS.includes(studentStatus)) {
          throw new Error(`status "${studentStatus}" không hợp lệ`);
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

        // Không có code → tự sinh
        if (!code) {
          do {
            code = `HS${String(nextStudentId).padStart(6, "0")}`;

            nextStudentId++;
          } while (usedCodes.has(code));
        }

        if (code.length > 100) {
          throw new Error("Mã học sinh không được vượt quá 100 ký tự");
        }

        // =====================================================
        // DUPLICATE CODE TRONG FILE
        // =====================================================

        if (usedCodes.has(code)) {
          throw new Error(`Mã học sinh "${code}" bị trùng trong file Excel`);
        }

        // =====================================================
        // CHECK CODE DATABASE
        // =====================================================

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

        // =====================================================
        // QR
        // =====================================================

        const qrToken = generateQrToken();

        if (!qrToken) {
          throw new Error("Không thể tạo QR token");
        }

        // =====================================================
        // DATES
        // =====================================================

        const dateOfBirth = parseDate(row.date_of_birth);

        const baptismDate = parseDate(row.baptism_date);

        const firstCommunionDate = parseDate(row.first_communion_date);

        const confirmationDate = parseDate(row.confirmation_date);

        const enrollmentDate = parseDate(row.enrollment_date);

        // =====================================================
        // DATE VALIDATION
        // =====================================================

        if (row.date_of_birth && !dateOfBirth) {
          throw new Error(`date_of_birth không hợp lệ: ${row.date_of_birth}`);
        }

        if (row.baptism_date && !baptismDate) {
          throw new Error(`baptism_date không hợp lệ: ${row.baptism_date}`);
        }

        if (row.first_communion_date && !firstCommunionDate) {
          throw new Error(
            `first_communion_date không hợp lệ: ${row.firstCommunionDate}`,
          );
        }

        if (row.confirmation_date && !confirmationDate) {
          throw new Error(
            `confirmation_date không hợp lệ: ${row.confirmationDate}`,
          );
        }

        if (row.enrollment_date && !enrollmentDate) {
          throw new Error(
            `enrollment_date không hợp lệ: ${row.enrollmentDate}`,
          );
        }

        // =====================================================
        // PARAMS
        // =====================================================

        const params = [
          numericChurchId,
          code,
          qrToken,

          name,
          gender,
          dateOfBirth,

          normalizeValue(row.birth_place),

          normalizeValue(row.nationality) || "Việt Nam",

          normalizeValue(row.phone),

          normalizeValue(row.email),

          normalizeValue(row.address),

          normalizeValue(row.parish),

          normalizeValue(row.father_name),

          normalizeValue(row.father_phone),

          normalizeValue(row.mother_name),

          normalizeValue(row.mother_phone),

          normalizeValue(row.guardian_name),

          normalizeValue(row.guardian_phone),

          normalizeValue(row.guardian_relationship),

          normalizeValue(row.baptism_name),

          baptismDate,

          normalizeValue(row.baptism_place),

          normalizeValue(row.baptism_parish),

          normalizeValue(row.baptism_certificate_no),

          normalizeValue(row.saint_name),

          firstCommunionDate,

          normalizeValue(row.first_communion_place),

          confirmationDate,

          normalizeValue(row.confirmation_place),

          normalizeValue(row.confirmation_saint_name),

          normalizeValue(row.catechism_level),

          catechismStatus,

          enrollmentDate,

          normalizeValue(row.note),

          normalizeValue(row.avatar),

          studentStatus,
        ];

        // =====================================================
        // INSERT STUDENT
        // =====================================================

        // =====================================================
        // INSERT STUDENT
        // =====================================================

        const [result] = await connection.execute(
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
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `,
          params,
        );

        const studentId = result.insertId;

        if (!studentId) {
          throw new Error("INSERT students không trả về insertId");
        }

        // =====================================================
        // INSERT CLASS
        // =====================================================

        if (classId !== null) {
          await connection.execute(
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

        // =====================================================
        // SUCCESS
        // =====================================================

        successRows.push({
          row: excelRow,
          id: studentId,
          code,
          name,
          gender,
          class_id: classId,
          class_name: classInfo?.name || null,
          qr_token: qrToken,
        });

        console.log(`✅ ROW ${excelRow}: ${name} (${code})`);
      } catch (error) {
        // =====================================================
        // ROW ERROR
        // =====================================================

        console.error(`❌ IMPORT ERROR ROW ${excelRow}:`, error.message);

        errorRows.push({
          row: excelRow,

          name: row.name || null,

          code: row.code || null,

          class_id: row.class_id || null,

          gender: row.gender || null,

          error: error.message,

          mysql_code: error.code || null,

          mysql_errno: error.errno || null,

          mysql_sql_state: error.sqlState || null,

          mysql_message: error.sqlMessage || null,
        });
      }
    }

    // =========================================================
    // ROLLBACK IF ERROR
    // =========================================================

    if (errorRows.length > 0) {
      console.log("❌ IMPORT FAILED → ROLLBACK");

      await connection.rollback();

      transactionStarted = false;

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
    // COMMIT
    // =========================================================

    await connection.commit();

    transactionStarted = false;

    console.log("✅ TRANSACTION COMMITTED");

    // =========================================================
    // LOG
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
      console.error("⚠️ IMPORT LOG ERROR:", logError.message);
    }

    // =========================================================
    // SUCCESS RESPONSE
    // =========================================================

    return res.status(201).json({
      success: true,

      message: `Import thành công ${successRows.length} học sinh`,

      total: rows.length,

      success_count: successRows.length,

      failed_count: 0,

      data: successRows,

      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    // =========================================================
    // GLOBAL ROLLBACK
    // =========================================================

    if (transactionStarted && connection) {
      try {
        await connection.rollback();

        transactionStarted = false;
      } catch (rollbackError) {
        console.error("❌ IMPORT ROLLBACK ERROR:", rollbackError.message);
      }
    }

    // =========================================================
    // ERROR LOG
    // =========================================================

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("❌ IMPORT STUDENTS EXCEL ERROR");
    console.error(
      "============================================================",
    );

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("Errno:", error.errno);

    console.error("SQL Message:", error.sqlMessage);

    console.error("SQL State:", error.sqlState);

    console.error("Stack:", error.stack);

    console.error(
      "============================================================",
    );

    // =========================================================
    // DUPLICATE
    // =========================================================

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        message: "Dữ liệu bị trùng. Có thể mã học sinh đã tồn tại.",

        errorCode: error.code,

        mysql_message: error.sqlMessage || error.message,
      });
    }

    // =========================================================
    // FOREIGN KEY
    // =========================================================

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,

        message:
          "Dữ liệu tham chiếu không tồn tại. Vui lòng kiểm tra lớp học sinh.",

        errorCode: error.code,

        mysql_message: error.sqlMessage || error.message,
      });
    }

    // =========================================================
    // DATA TOO LONG
    // =========================================================

    if (error.code === "ER_DATA_TOO_LONG") {
      return res.status(400).json({
        success: false,

        message: "Một trong các dữ liệu Excel vượt quá độ dài cho phép.",

        errorCode: error.code,

        mysql_message: error.sqlMessage || error.message,
      });
    }

    // =========================================================
    // INVALID DATE
    // =========================================================

    if (error.code === "ER_TRUNCATED_WRONG_VALUE") {
      return res.status(400).json({
        success: false,

        message: "Dữ liệu ngày tháng trong Excel không hợp lệ.",

        errorCode: error.code,

        mysql_message: error.sqlMessage || error.message,
      });
    }

    // =========================================================
    // GENERAL ERROR
    // =========================================================

    return res.status(500).json({
      success: false,

      message: "Không thể import học sinh từ Excel",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,

      mysql_code:
        process.env.NODE_ENV === "development" ? error.code : undefined,

      duration_ms: Date.now() - startedAt,
    });
  } finally {
    // =========================================================
    // RELEASE CONNECTION
    // =========================================================

    if (connection) {
      connection.release();
    }
  }
};

// =====================================================
// DELETE /api/students/:id
// DELETE STUDENT
// =====================================================

exports.deleteStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  try {
    const studentId = Number(req.params.id);

    const churchId = getChurchId(req);

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

    // =====================================================
    // GET STUDENT
    // =====================================================

    const [studentRows] = await connection.query(
      `
        SELECT
          id,
          code,
          name,
          avatar
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

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    transactionStarted = true;

    // =====================================================
    // DELETE CLASS RELATION
    // =====================================================

    await connection.execute(
      `
        DELETE FROM class_students
        WHERE student_id = ?
      `,
      [studentId],
    );

    // =====================================================
    // DELETE STUDENT
    // =====================================================

    const [result] = await connection.execute(
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

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    transactionStarted = false;

    // =====================================================
    // DELETE AVATAR
    // ONLY AFTER COMMIT
    // =====================================================

    if (studentData.avatar) {
      const avatarPath = getAvatarFilePath(studentData.avatar);

      if (avatarPath) {
        deleteFile(avatarPath);
      }
    }

    // =====================================================
    // LOG
    // =====================================================

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
      console.error("⚠️ DELETE STUDENT LOG ERROR:", logError.message);
    }

    console.log("✅ DELETE STUDENT SUCCESS");

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

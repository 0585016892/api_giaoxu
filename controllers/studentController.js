const db = require("../config/db");
const bcrypt = require("bcryptjs");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

const getChurchId = (req) => {
  return req.user?.church_id || req.user?.parish_id || null;
};

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const result = String(value).trim();

  return result === "" ? null : result;
};

const normalizeParentPhone = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const phone = String(value).trim();

  return phone || null;
};

const toInt = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    return null;
  }

  return number;
};

const isValidId = (value) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0;
};

const deleteFileSafe = (filePath) => {
  try {
    if (!filePath) return;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);

      console.log("🗑️ Đã xóa file:", filePath);
    }
  } catch (error) {
    console.error("⚠️ Không thể xóa file:", error.message);
  }
};

const getUploadedFilePath = (file) => {
  if (!file) {
    return null;
  }

  return file.path || file.destination
    ? path.join(file.destination || "", file.filename || "")
    : null;
};

/**
 * ---------------------------------------------------------
 * DATE
 * ---------------------------------------------------------
 */

const normalizeDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const excelDate = XLSX.SSF.parse_date_code(value);

    if (excelDate) {
      const year = String(excelDate.y).padStart(4, "0");
      const month = String(excelDate.m).padStart(2, "0");
      const day = String(excelDate.d).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return null;
  }

  /**
   * YYYY-MM-DD
   */
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  /**
   * DD/MM/YYYY
   */
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(stringValue)) {
    const [day, month, year] = stringValue.split("/");

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0",
    )}`;
  }

  /**
   * DD-MM-YYYY
   */
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(stringValue)) {
    const [day, month, year] = stringValue.split("-");

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0",
    )}`;
  }

  const date = new Date(stringValue);

  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return null;
};

const isValidDateString = (value) => {
  if (!value) return true;

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
};

/**
 * ---------------------------------------------------------
 * ENUM
 * ---------------------------------------------------------
 */

const VALID_GENDERS = ["male", "female", "other"];

const VALID_CATECHISM_STATUS = [
  "new",
  "studying",
  "completed",
  "graduated",
  "dropped",
];

const VALID_STUDENT_STATUS = ["active", "inactive", "graduated", "transferred"];

/**
 * ---------------------------------------------------------
 * CLASS
 * ---------------------------------------------------------
 */

const checkClassBelongsToChurch = async (connection, classId, churchId) => {
  if (!classId) {
    return null;
  }

  const [rows] = await connection.execute(
    `
      SELECT id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
    `,
    [classId, churchId],
  );

  return rows.length > 0 ? Number(rows[0].id) : null;
};

/**
 * =========================================================
 * PARENT ACCOUNT
 * =========================================================
 */

const getOrCreateParentAccount = async ({
  connection,
  churchId,
  phone,
  fullName,
}) => {
  const normalizedPhone = normalizeParentPhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("             GET / CREATE PARENT ACCOUNT");
  console.log("------------------------------------------------------------");

  console.log("PHONE:", normalizedPhone);

  console.log("FULL NAME:", fullName);

  console.log("CHURCH ID:", churchId);

  // ========================================================
  // TÌM ACCOUNT
  // ========================================================

  const [existingRows] = await connection.execute(
    `
        SELECT
          id,
          church_id,
          username,
          password,
          role,
          account_type,
          is_active,
          full_name,
          phone
        FROM admins
        WHERE username = ?
        LIMIT 1
        FOR UPDATE
      `,
    [normalizedPhone],
  );

  // ========================================================
  // ACCOUNT ĐÃ TỒN TẠI
  // ========================================================

  if (existingRows.length > 0) {
    const existing = existingRows[0];

    console.log("EXISTING ACCOUNT:", {
      id: existing.id,
      username: existing.username,
      role: existing.role,
      church_id: existing.church_id,
    });

    // ------------------------------------------------------
    // KHÔNG PHẢI PARENT
    // ------------------------------------------------------

    if (existing.role !== "parent") {
      throw new Error(
        `Số điện thoại ${normalizedPhone} đã được sử dụng cho tài khoản ${existing.role}`,
      );
    }

    // ------------------------------------------------------
    // KHÁC GIÁO XỨ
    // ------------------------------------------------------

    if (
      existing.church_id !== null &&
      Number(existing.church_id) !== Number(churchId)
    ) {
      throw new Error(
        `Số điện thoại ${normalizedPhone} đã thuộc tài khoản phụ huynh của giáo xứ khác`,
      );
    }

    // ------------------------------------------------------
    // UPDATE THÔNG TIN
    // ------------------------------------------------------

    await connection.execute(
      `
        UPDATE admins

        SET
          church_id = ?,

          full_name =
            COALESCE(
              NULLIF(full_name, ''),
              ?
            ),

          phone =
            COALESCE(
              NULLIF(phone, ''),
              ?
            )

        WHERE id = ?
      `,
      [churchId, fullName || normalizedPhone, normalizedPhone, existing.id],
    );

    console.log("✅ EXISTING PARENT ACCOUNT:", existing.id);

    return {
      id: Number(existing.id),
      username: existing.username,
      relationship: null,
      created: false,
    };
  }

  // ========================================================
  // TẠO ACCOUNT MỚI
  // ========================================================

  const passwordHash = await bcrypt.hash(normalizedPhone, 10);

  console.log("CREATING PARENT ACCOUNT");

  console.log("USERNAME:", normalizedPhone);

  console.log("PASSWORD SOURCE:", normalizedPhone);

  console.log("PASSWORD HASH:", passwordHash);

  const [result] = await connection.execute(
    `
        INSERT INTO admins (
          church_id,
          username,
          password,
          role,
          account_type,
          is_active,
          full_name,
          phone
        )

        VALUES (
          ?,
          ?,
          ?,
          'parent',
          'member',
          1,
          ?,
          ?
        )
      `,
    [
      churchId,
      normalizedPhone,
      passwordHash,
      fullName || normalizedPhone,
      normalizedPhone,
    ],
  );

  const parentId = Number(result.insertId);

  console.log("✅ NEW PARENT ACCOUNT:", {
    id: parentId,
    username: normalizedPhone,
  });

  return {
    id: parentId,
    username: normalizedPhone,
    relationship: null,
    created: true,
  };
};

/**
 * =========================================================
 * LINK PARENT STUDENT
 * =========================================================
 */

const linkParentToStudent = async ({
  connection,
  churchId,
  parentId,
  studentId,
  relationship,
}) => {
  /**
   * -------------------------------------------------------
   * CHUẨN HÓA RELATIONSHIP
   * -------------------------------------------------------
   *
   * parent_students.relationship chỉ cho phép:
   * father | mother | guardian
   */

  const validRelationships = ["father", "mother", "guardian"];

  const normalizedRelationship = validRelationships.includes(relationship)
    ? relationship
    : "guardian";

  console.log("");
  console.log("🔗 LINK PARENT -> STUDENT");
  console.log("   Church ID     :", churchId);
  console.log("   Parent ID     :", parentId);
  console.log("   Student ID    :", studentId);
  console.log("   Relationship  :", relationship);
  console.log("   Normalized    :", normalizedRelationship);

  await connection.execute(
    `
      INSERT INTO parent_students (
        church_id,
        parent_id,
        student_id,
        relationship
      )
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        relationship = VALUES(relationship),
        church_id = VALUES(church_id)
    `,
    [churchId, parentId, studentId, normalizedRelationship],
  );

  console.log("✅ LINK PARENT SUCCESS");
};
/**
 * =========================================================
 * SYNC PARENTS
 * =========================================================
 */

const syncStudentParents = async ({
  connection,
  churchId,
  studentId,

  fatherName,
  fatherPhone,

  motherName,
  motherPhone,

  guardianName,
  guardianPhone,
  guardianRelationship,
}) => {
  console.log("");
  console.log("============================================================");
  console.log("                    SYNC STUDENT PARENTS");
  console.log("============================================================");

  console.log("CHURCH ID       :", churchId);
  console.log("STUDENT ID      :", studentId);

  /**
   * -------------------------------------------------------
   * BUILD PARENT CANDIDATES
   * -------------------------------------------------------
   */

  const candidates = [
    {
      name: fatherName,
      phone: normalizeParentPhone(fatherPhone),
      relationship: "father",
    },
    {
      name: motherName,
      phone: normalizeParentPhone(motherPhone),
      relationship: "mother",
    },
    {
      name: guardianName,
      phone: normalizeParentPhone(guardianPhone),
      relationship: "guardian",
    },
  ];

  /**
   * -------------------------------------------------------
   * CHỈ GIỮ NGƯỜI CÓ SỐ ĐIỆN THOẠI
   * -------------------------------------------------------
   */

  const validCandidates = candidates.filter((item) => item.phone);

  console.log("PARENT CANDIDATES:", validCandidates);

  /**
   * -------------------------------------------------------
   * DEDUPE THEO PHONE
   * -------------------------------------------------------
   *
   * Trường hợp:
   *
   * father_phone   = 098xxx
   * guardian_phone = 098xxx
   *
   * thì không tạo 2 parent_students.
   *
   * Ưu tiên:
   * father > mother > guardian
   */

  const parentMap = new Map();

  for (const candidate of validCandidates) {
    if (!parentMap.has(candidate.phone)) {
      parentMap.set(candidate.phone, candidate);
    }
  }

  const uniqueParents = Array.from(parentMap.values());

  console.log("UNIQUE PARENTS:", uniqueParents);

  /**
   * -------------------------------------------------------
   * NẾU KHÔNG CÓ PHỤ HUYNH
   * -------------------------------------------------------
   */

  if (uniqueParents.length === 0) {
    console.log("ℹ️ STUDENT HAS NO PARENT PHONE");

    /**
     * Không tự xóa parent_students ở đây.
     *
     * Vì nếu update student mà request không có phone
     * thì có thể làm mất liên kết cũ.
     *
     * Tuy nhiên với code update hiện tại:
     * normalizedFatherPhone / MotherPhone / GuardianPhone
     * đã lấy từ oldStudent nếu body không truyền.
     *
     * Nên trường hợp này chỉ xảy ra khi thực sự không còn phone.
     */

    return [];
  }

  /**
   * -------------------------------------------------------
   * SYNC TỪNG PARENT
   * -------------------------------------------------------
   */

  const parentAccounts = [];

  for (const candidate of uniqueParents) {
    console.log("");
    console.log("------------------------------------------------------------");
    console.log("SYNC PARENT");
    console.log("NAME         :", candidate.name);
    console.log("PHONE        :", candidate.phone);
    console.log("RELATIONSHIP :", candidate.relationship);
    console.log("------------------------------------------------------------");

    /**
     * -----------------------------------------------------
     * CREATE / GET ACCOUNT
     * -----------------------------------------------------
     */

    const parent = await getOrCreateParentAccount({
      connection,
      churchId,
      phone: candidate.phone,
      fullName: candidate.name,
    });

    /**
     * -----------------------------------------------------
     * LINK PARENT -> STUDENT
     * -----------------------------------------------------
     */

    await linkParentToStudent({
      connection,
      churchId,
      parentId: parent.id,
      studentId,
      relationship: candidate.relationship,
    });

    parentAccounts.push({
      id: parent.id,
      username: parent.username,
      relationship: candidate.relationship,
      created: parent.created,
    });
  }

  console.log("");
  console.log("✅ SYNC STUDENT PARENTS SUCCESS");
  console.log("PARENT COUNT:", parentAccounts.length);

  return parentAccounts;
};

/**
 * =========================================================
 * GET STUDENTS
 * =========================================================
 */

/**
 * =========================================================
 * AVATAR HELPER
 * =========================================================
 *
 * Mục đích:
 *
 * DB hiện tại có thể đang lưu:
 *
 * 1. Windows absolute path:
 *    C:\Users\HungML\Downloads\giaoxu\api_giaoxu\uploads\students\a.png
 *
 * 2. Unix path:
 *    /var/www/api_giaoxu/uploads/students/a.png
 *
 * 3. Relative:
 *    uploads/students/a.png
 *
 * 4. Relative:
 *    /uploads/students/a.png
 *
 * 5. Chỉ tên file:
 *    a.png
 *
 * 6. URL:
 *    https://api.amsacviet.online/uploads/students/a.png
 *
 * API sẽ chuẩn hóa tất cả thành:
 *
 * https://api.amsacviet.online/uploads/students/a.png
 * =========================================================
 */

const getPublicAvatarUrl = (avatar) => {
  // =====================================================
  // KHÔNG CÓ AVATAR
  // =====================================================

  if (avatar === null || avatar === undefined || String(avatar).trim() === "") {
    return null;
  }

  // =====================================================
  // API PUBLIC URL
  // =====================================================

  const API_PUBLIC_URL = (
    process.env.API_PUBLIC_URL || "https://api.amsacviet.online"
  ).replace(/\/+$/, "");

  // =====================================================
  // STRING
  // =====================================================

  let value = String(avatar).trim();

  // =====================================================
  // NẾU ĐÃ LÀ URL
  // =====================================================

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // =====================================================
  // WINDOWS PATH
  //
  // C:\Users\...\uploads\students\a.png
  //
  // =>
  //
  // C:/Users/.../uploads/students/a.png
  // =====================================================

  value = value.replace(/\\/g, "/");

  const lowerValue = value.toLowerCase();

  // =====================================================
  // TÌM /uploads/
  //
  // Ví dụ:
  //
  // C:/Users/HungML/Downloads/giaoxu/api_giaoxu/uploads/students/a.png
  //
  // => /uploads/students/a.png
  // =====================================================

  const uploadIndex = lowerValue.indexOf("/uploads/");

  if (uploadIndex !== -1) {
    const relativePath = value.substring(uploadIndex);

    return `${API_PUBLIC_URL}${relativePath}`;
  }

  // =====================================================
  // uploads/students/a.png
  // =====================================================

  if (lowerValue.startsWith("uploads/")) {
    return `${API_PUBLIC_URL}/${value}`;
  }

  // =====================================================
  // /uploads/students/a.png
  // =====================================================

  if (lowerValue.startsWith("/uploads/")) {
    return `${API_PUBLIC_URL}${value}`;
  }

  // =====================================================
  // students/a.png
  // =====================================================

  if (lowerValue.startsWith("students/")) {
    return `${API_PUBLIC_URL}/uploads/${value}`;
  }

  // =====================================================
  // /students/a.png
  // =====================================================

  if (lowerValue.startsWith("/students/")) {
    return `${API_PUBLIC_URL}/uploads${value}`;
  }

  // =====================================================
  // CHỈ CÒN TÊN FILE
  //
  // a.png
  //
  // => /uploads/students/a.png
  // =====================================================

  const fileName = value.split("/").filter(Boolean).pop();

  if (!fileName) {
    return null;
  }

  return `${API_PUBLIC_URL}/uploads/students/${encodeURIComponent(fileName)}`;
};

/**
 * =========================================================
 * NORMALIZE STUDENT AVATAR
 * =========================================================
 */

const normalizeStudentAvatar = (student) => {
  if (!student) {
    return student;
  }

  return {
    ...student,

    avatar: getPublicAvatarUrl(student.avatar),
  };
};

/**
 * =========================================================
 * NORMALIZE STUDENTS
 * =========================================================
 */

const normalizeStudentAvatars = (students = []) => {
  return students.map((student) => normalizeStudentAvatar(student));
};

/**
 * =========================================================
 * GET STUDENTS
 * =========================================================
 */

exports.getStudents = async (req, res) => {
  try {
    console.log("");
    console.log("============================================================");
    console.log("                       GET STUDENTS");
    console.log("============================================================");

    // =====================================================
    // CHURCH
    // =====================================================

    const churchId = getChurchId(req);

    console.log("CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    const page = Math.max(1, Number(req.query.page) || 1);

    const pageSize = Math.min(
      1000,
      Math.max(1, Number(req.query.pageSize) || Number(req.query.limit) || 20),
    );

    const offset = (page - 1) * pageSize;

    console.log("PAGE:", page);
    console.log("PAGE SIZE:", pageSize);
    console.log("OFFSET:", offset);

    // =====================================================
    // FILTER
    // =====================================================

    const search = normalizeValue(req.query.search);

    const classId = toInt(req.query.class_id);

    const status = normalizeValue(req.query.status);

    console.log("SEARCH:", search);
    console.log("CLASS ID:", classId);
    console.log("STATUS:", status);

    // =====================================================
    // WHERE
    // =====================================================

    const where = ["s.church_id = ?"];

    const params = [churchId];

    // =====================================================
    // SEARCH
    // =====================================================

    if (search) {
      where.push(`
        (
          s.name LIKE ?
          OR s.code LIKE ?
          OR s.phone LIKE ?
          OR s.email LIKE ?
          OR s.father_name LIKE ?
          OR s.mother_name LIKE ?
          OR s.father_phone LIKE ?
          OR s.mother_phone LIKE ?
        )
      `);

      const searchValue = `%${search}%`;

      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
      );
    }

    // =====================================================
    // CLASS FILTER
    // =====================================================

    if (classId) {
      where.push(`
        EXISTS (
          SELECT 1

          FROM class_students cs_filter

          INNER JOIN classes c_filter
            ON c_filter.id = cs_filter.class_id

          WHERE cs_filter.student_id = s.id

            AND cs_filter.class_id = ?

            AND c_filter.church_id = ?
        )
      `);

      params.push(classId, churchId);
    }

    // =====================================================
    // STATUS FILTER
    // =====================================================

    if (status) {
      if (!VALID_STUDENT_STATUS.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Trạng thái học sinh không hợp lệ",
        });
      }

      where.push("s.status = ?");

      params.push(status);
    }

    // =====================================================
    // WHERE SQL
    // =====================================================

    const whereSql = where.join(" AND ");

    console.log("WHERE SQL:", whereSql);

    console.log("FILTER PARAMS:", params);

    // =====================================================
    // COUNT
    // =====================================================

    const [countRows] = await db.execute(
      `
          SELECT
            COUNT(*) AS total

          FROM students s

          WHERE ${whereSql}
        `,
      params,
    );

    const total = Number(countRows[0]?.total || 0);

    console.log("TOTAL STUDENTS:", total);

    // =====================================================
    // DATA SQL
    // =====================================================

    const dataSql = `
      SELECT
        s.*,

        (
          SELECT
            GROUP_CONCAT(
              DISTINCT c.id
              ORDER BY c.id
              SEPARATOR ','
            )

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE cs.student_id = s.id

            AND c.church_id = ?
        ) AS class_ids,

        (
          SELECT
            GROUP_CONCAT(
              DISTINCT c.name
              ORDER BY c.name
              SEPARATOR ', '
            )

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE cs.student_id = s.id

            AND c.church_id = ?
        ) AS class_names

      FROM students s

      WHERE ${whereSql}

      ORDER BY s.id DESC

      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    // =====================================================
    // DATA PARAMS
    // =====================================================

    const dataParams = [churchId, churchId, ...params];

    console.log("DATA PARAMS:", dataParams);

    console.log("LIMIT:", pageSize);

    console.log("OFFSET:", offset);

    // =====================================================
    // QUERY DATA
    // =====================================================

    const [rows] = await db.execute(dataSql, dataParams);

    console.log("ROWS RETURNED:", rows.length);

    // =====================================================
    // NORMALIZE AVATAR
    // =====================================================

    const students = normalizeStudentAvatars(rows);

    // =====================================================
    // LOG AVATAR
    // =====================================================

    console.log(
      "AVATAR RESULT:",
      students.map((student) => ({
        id: student.id,
        name: student.name,
        avatar: student.avatar,
      })),
    );

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: students,

      pagination: {
        page,

        pageSize,

        total,

        totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
      },
    });
  } catch (error) {
    // =====================================================
    // ERROR
    // =====================================================

    console.error("");

    console.error(
      "============================================================",
    );

    console.error("                  GET STUDENTS ERROR");

    console.error(
      "============================================================",
    );

    console.error("ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Không thể lấy danh sách học sinh",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * =========================================================
 * GET STUDENT BY ID
 * =========================================================
 */

exports.getStudentById = async (req, res) => {
  try {
    console.log("");
    console.log("============================================================");
    console.log("                    GET STUDENT BY ID");
    console.log("============================================================");

    // =====================================================
    // CHURCH
    // =====================================================

    const churchId = getChurchId(req);

    // =====================================================
    // STUDENT ID
    // =====================================================

    const studentId = toInt(req.params.id);

    console.log("CHURCH ID:", churchId);

    console.log("STUDENT ID:", studentId);

    // =====================================================
    // CHECK CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    // =====================================================
    // CHECK ID
    // =====================================================

    if (!isValidId(studentId)) {
      return res.status(400).json({
        success: false,
        message: "ID học sinh không hợp lệ",
      });
    }

    // =====================================================
    // GET STUDENT
    // =====================================================

    const [rows] = await db.execute(
      `
          SELECT *
          FROM students

          WHERE id = ?
            AND church_id = ?

          LIMIT 1
        `,
      [studentId, churchId],
    );

    // =====================================================
    // NOT FOUND
    // =====================================================

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    // =====================================================
    // STUDENT
    // =====================================================

    const student = normalizeStudentAvatar(rows[0]);

    console.log("STUDENT AVATAR:", student.avatar);

    // =====================================================
    // GET CLASSES
    // =====================================================

    const [classes] = await db.execute(
      `
          SELECT
            c.id,
            c.name,
            c.code

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE cs.student_id = ?

            AND c.church_id = ?

          ORDER BY
            c.name ASC
        `,
      [studentId, churchId],
    );

    console.log("CLASSES:", classes);

    // =====================================================
    // GET PARENTS
    // =====================================================

    const [parents] = await db.execute(
      `
          SELECT
            ps.id,
            ps.parent_id,
            ps.relationship,

            a.username,
            a.full_name,
            a.phone,
            a.is_active

          FROM parent_students ps

          INNER JOIN admins a
            ON a.id = ps.parent_id

          WHERE ps.student_id = ?

            AND ps.church_id = ?

          ORDER BY
            ps.id ASC
        `,
      [studentId, churchId],
    );

    console.log("PARENTS:", parents);

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: {
        ...student,

        classes,

        parents,
      },
    });
  } catch (error) {
    // =====================================================
    // ERROR
    // =====================================================

    console.error("");

    console.error(
      "============================================================",
    );

    console.error("                GET STUDENT BY ID ERROR");

    console.error(
      "============================================================",
    );

    console.error("ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Không thể lấy thông tin học sinh",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * =========================================================
 * GET STUDENTS BY CLASS
 * =========================================================
 */

exports.getStudentsByClass = async (req, res) => {
  try {
    console.log("");
    console.log("============================================================");
    console.log("                  GET STUDENTS BY CLASS");
    console.log("============================================================");

    // =====================================================
    // CHURCH
    // =====================================================

    const churchId = getChurchId(req);

    // =====================================================
    // CLASS ID
    // =====================================================

    const classId = toInt(req.params.id);

    console.log("CHURCH ID:", churchId);

    console.log("CLASS ID:", classId);

    // =====================================================
    // CHECK CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    // =====================================================
    // CHECK CLASS ID
    // =====================================================

    if (!isValidId(classId)) {
      return res.status(400).json({
        success: false,
        message: "ID lớp không hợp lệ",
      });
    }

    // =====================================================
    // CHECK CLASS
    // =====================================================

    const [classRows] = await db.execute(
      `
          SELECT
            id,
            name,
            code

          FROM classes

          WHERE id = ?

            AND church_id = ?

          LIMIT 1
        `,
      [classId, churchId],
    );

    console.log("CLASS:", classRows);

    // =====================================================
    // CLASS NOT FOUND
    // =====================================================

    if (classRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    // =====================================================
    // GET STUDENTS
    // =====================================================

    const [studentRows] = await db.execute(
      `
          SELECT
            s.*

          FROM students s

          INNER JOIN class_students cs
            ON cs.student_id = s.id

          WHERE cs.class_id = ?

            AND s.church_id = ?

          ORDER BY
            s.name ASC,
            s.id ASC
        `,
      [classId, churchId],
    );

    console.log("STUDENTS FOUND:", studentRows.length);

    // =====================================================
    // NORMALIZE AVATAR
    // =====================================================

    const students = normalizeStudentAvatars(studentRows);

    // =====================================================
    // LOG AVATAR
    // =====================================================

    console.log(
      "AVATAR RESULT:",
      students.map((student) => ({
        id: student.id,
        name: student.name,
        avatar: student.avatar,
      })),
    );

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: students,

      class: classRows[0],

      total: students.length,
    });
  } catch (error) {
    // =====================================================
    // ERROR
    // =====================================================

    console.error("");

    console.error(
      "============================================================",
    );

    console.error("              GET STUDENTS BY CLASS ERROR");

    console.error(
      "============================================================",
    );

    console.error("ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Không thể lấy học sinh trong lớp",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * =========================================================
 * GET STUDENTS BY TEACHER
 * =========================================================
 *
 * Mapping:
 * req.user.username = catechists.catechist_code
 */

exports.getStudentsByTeacher = async (req, res) => {
  console.log("\n");
  console.log("======================================================");
  console.log("🔎 GET STUDENTS BY TEACHER");
  console.log("======================================================");

  try {
    // =====================================================
    // 0. LẤY THÔNG TIN USER
    // =====================================================
    console.log("\n---------- AUTH ----------");

    console.log("REQ.USER:", req.user);

    const churchId = getChurchId(req);

    const rawUsername = req.user?.username;
    const username = normalizeValue(rawUsername);

    console.log("⛪ CHURCH ID:", churchId);
    console.log("👤 RAW USERNAME:", rawUsername);
    console.log("👤 NORMALIZED USERNAME:", username);

    // =====================================================
    // CHECK CHURCH
    // =====================================================
    if (!churchId) {
      console.log("❌ KHÔNG XÁC ĐỊNH ĐƯỢC CHURCH ID");

      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    // =====================================================
    // CHECK USERNAME
    // =====================================================
    if (!username) {
      console.log("❌ KHÔNG XÁC ĐỊNH ĐƯỢC USERNAME");

      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản giáo lý viên",
      });
    }

    // =====================================================
    // 1. TÌM GIÁO LÝ VIÊN
    // =====================================================
    console.log("\n---------- CHECK CATECHIST ----------");

    console.log("🔎 Tìm catechist:");
    console.log("   church_id      =", churchId);
    console.log("   catechist_code =", username);

    const [catechistRows] = await db.execute(
      `
        SELECT
          id,
          church_id,
          catechist_code
        FROM catechists
        WHERE church_id = ?
          AND catechist_code = ?
        LIMIT 1
      `,
      [churchId, username],
    );

    console.log("👨‍🏫 CATECHIST ROWS:", catechistRows);
    console.log("👨‍🏫 CATECHIST COUNT:", catechistRows.length);

    if (!catechistRows.length) {
      console.log("❌ KHÔNG TÌM THẤY GIÁO LÝ VIÊN");

      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: {
          churchId,
          username,
          catechistFound: false,
          catechistId: null,
          classCount: 0,
          classStudentCount: 0,
          studentCount: 0,
        },
      });
    }

    const catechist = catechistRows[0];
    const catechistId = Number(catechist.id);

    console.log("✅ TÌM THẤY CATECHIST");
    console.log("👨‍🏫 CATECHIST ID:", catechistId);

    // =====================================================
    // 2. TÌM LỚP CỦA GIÁO LÝ VIÊN
    // =====================================================
    console.log("\n---------- CHECK CATECHIST CLASSES ----------");

    console.log("🔎 Tìm lớp của catechist:");
    console.log("   catechist_id =", catechistId);
    console.log("   church_id    =", churchId);

    const [classRows] = await db.execute(
      `
        SELECT
          c.id,
          c.church_id,
          c.name,
          c.code,
          c.category,
          c.catechist_id,
          c.description,
          c.start_date,
          c.end_date,
          c.status,

          cc.id AS catechist_class_id

        FROM catechist_classes cc

        INNER JOIN classes c
          ON c.id = cc.class_id
          AND c.church_id = ?

        WHERE cc.catechist_id = ?

        ORDER BY
          c.id ASC
      `,
      [churchId, catechistId],
    );

    console.log("🏫 CLASS ROWS:", classRows);
    console.log("🏫 CLASS COUNT:", classRows.length);

    // =====================================================
    // KHÔNG CÓ LỚP
    // =====================================================
    if (!classRows.length) {
      console.log("❌ GIÁO LÝ VIÊN CHƯA ĐƯỢC GÁN LỚP");
      console.log("❌ Kiểm tra bảng catechist_classes");

      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: {
          churchId,
          username,
          catechistFound: true,
          catechistId,
          classCount: 0,
          classStudentCount: 0,
          studentCount: 0,
        },
      });
    }

    // =====================================================
    // CLASS IDS
    // =====================================================
    const classIds = [
      ...new Set(
        classRows
          .map((item) => Number(item.id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    console.log("🏫 CLASS IDS:", classIds);

    if (!classIds.length) {
      console.log("❌ KHÔNG CÓ CLASS ID HỢP LỆ");

      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: {
          churchId,
          username,
          catechistFound: true,
          catechistId,
          classCount: classRows.length,
          classIds: [],
          classStudentCount: 0,
          studentCount: 0,
        },
      });
    }

    // =====================================================
    // 3. KIỂM TRA CLASS_STUDENTS
    // =====================================================
    console.log("\n---------- CHECK CLASS STUDENTS ----------");

    const classPlaceholders = classIds.map(() => "?").join(",");

    const [classStudentRows] = await db.execute(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.student_id,
          cs.status,
          cs.joined_at,
          cs.left_at

        FROM class_students cs

        WHERE cs.class_id IN (${classPlaceholders})

        ORDER BY
          cs.class_id ASC,
          cs.student_id ASC
      `,
      classIds,
    );

    console.log("🔗 CLASS_STUDENT ROWS:", classStudentRows);
    console.log("🔗 CLASS_STUDENT COUNT:", classStudentRows.length);

    // =====================================================
    // KHÔNG CÓ HỌC SINH
    // =====================================================
    if (!classStudentRows.length) {
      console.log("❌ CÁC LỚP KHÔNG CÓ HỌC SINH");

      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: {
          churchId,
          username,
          catechistFound: true,
          catechistId,
          classCount: classRows.length,
          classIds,
          classStudentCount: 0,
          studentCount: 0,
        },
      });
    }

    // =====================================================
    // 4. LẤY STUDENT IDS
    // =====================================================
    const studentIds = [
      ...new Set(
        classStudentRows
          .map((item) => Number(item.student_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    console.log("\n---------- STUDENT IDS ----------");

    console.log("👨‍🎓 STUDENT IDS:", studentIds);
    console.log("👨‍🎓 STUDENT COUNT:", studentIds.length);

    if (!studentIds.length) {
      console.log("❌ KHÔNG CÓ STUDENT ID HỢP LỆ");

      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: {
          churchId,
          username,
          catechistFound: true,
          catechistId,
          classCount: classRows.length,
          classIds,
          classStudentCount: classStudentRows.length,
          studentCount: 0,
        },
      });
    }

    // =====================================================
    // 5. CHECK STUDENTS
    // =====================================================
    console.log("\n---------- CHECK STUDENTS ----------");

    const studentPlaceholders = studentIds.map(() => "?").join(",");

    const [studentCheckRows] = await db.execute(
      `
        SELECT
          id,
          church_id,
          code,
          name,
          gender,
          date_of_birth,
          phone,
          email,
          address,
          avatar,
          status,
          catechism_status

        FROM students

        WHERE church_id = ?
          AND id IN (${studentPlaceholders})

        ORDER BY
          name ASC,
          id ASC
      `,
      [churchId, ...studentIds],
    );

    console.log("👨‍🎓 STUDENT CHECK ROWS:", studentCheckRows);

    console.log("👨‍🎓 STUDENT CHECK COUNT:", studentCheckRows.length);

    // =====================================================
    // 6. MAIN QUERY
    // =====================================================
    console.log("\n---------- MAIN STUDENT QUERY ----------");

    const mainSql = `
      SELECT DISTINCT

        -- ==========================
        -- STUDENT
        -- ==========================
        s.id,
        s.church_id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.address,
        s.avatar,
        s.status,
        s.catechism_status,

        -- ==========================
        -- CLASS
        -- ==========================
        c.id AS class_id,
        c.name AS class_name,
        c.code AS class_code,
        c.category AS class_category,
        c.status AS class_status,

        -- ==========================
        -- CATECHIST CLASS
        -- ==========================
        cc.id AS catechist_class_id

      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id
        AND c.church_id = ?

      INNER JOIN catechist_classes cc
        ON cc.class_id = c.id

      WHERE s.church_id = ?
        AND cc.catechist_id = ?

      ORDER BY
        s.name ASC,
        s.id ASC
    `;

    const mainParams = [churchId, churchId, catechistId];

    console.log("📌 MAIN PARAMS:", mainParams);
    console.log("📌 MAIN SQL:", mainSql);

    const [rows] = await db.execute(mainSql, mainParams);

    // =====================================================
    // 7. HÀM CHUẨN HÓA AVATAR
    // =====================================================
    const API_PUBLIC_URL = (
      process.env.API_PUBLIC_URL || "https://api.amsacviet.online"
    ).replace(/\/+$/, "");

    console.log("🌐 API PUBLIC URL:", API_PUBLIC_URL);

    const normalizeAvatarUrl = (avatar) => {
      // Không có avatar
      if (
        avatar === null ||
        avatar === undefined ||
        String(avatar).trim() === ""
      ) {
        return null;
      }

      let value = String(avatar).trim();

      // ---------------------------------------------
      // Nếu đã là URL hoàn chỉnh
      // ---------------------------------------------
      if (value.startsWith("http://") || value.startsWith("https://")) {
        return value;
      }

      // ---------------------------------------------
      // Chuẩn hóa Windows path
      //
      // C:\Users\HungML\...\uploads\students\a.png
      //
      // thành:
      //
      // C:/Users/HungML/.../uploads/students/a.png
      // ---------------------------------------------
      value = value.replace(/\\/g, "/");

      // ---------------------------------------------
      // Tìm /uploads/
      // ---------------------------------------------
      const lowerValue = value.toLowerCase();

      const uploadIndex = lowerValue.indexOf("/uploads/");

      if (uploadIndex !== -1) {
        const relativePath = value.substring(uploadIndex);

        return `${API_PUBLIC_URL}${relativePath}`;
      }

      // ---------------------------------------------
      // Trường hợp:
      // uploads/students/avatar.png
      // ---------------------------------------------
      if (lowerValue.startsWith("uploads/")) {
        return `${API_PUBLIC_URL}/${value}`;
      }

      // ---------------------------------------------
      // Trường hợp:
      // /uploads/students/avatar.png
      // ---------------------------------------------
      if (lowerValue.startsWith("/uploads/")) {
        return `${API_PUBLIC_URL}${value}`;
      }

      // ---------------------------------------------
      // Trường hợp DB chỉ lưu:
      // students/avatar.png
      // ---------------------------------------------
      if (lowerValue.startsWith("students/")) {
        return `${API_PUBLIC_URL}/uploads/${value}`;
      }

      // ---------------------------------------------
      // Trường hợp DB chỉ lưu tên file
      // ---------------------------------------------
      const fileName = value.split("/").filter(Boolean).pop();

      if (fileName) {
        return `${API_PUBLIC_URL}/uploads/students/${encodeURIComponent(
          fileName,
        )}`;
      }

      return null;
    };

    // =====================================================
    // 8. CHUẨN HÓA DATA TRẢ VỀ
    // =====================================================
    const students = rows.map((student) => {
      const originalAvatar = student.avatar;

      const normalizedAvatar = normalizeAvatarUrl(originalAvatar);

      return {
        ...student,

        avatar: normalizedAvatar,
      };
    });

    // =====================================================
    // 9. LOG KẾT QUẢ
    // =====================================================
    console.log("\n---------- RESULT ----------");

    console.log("👨‍🎓 STUDENTS FOUND:", students.length);

    if (students.length > 0) {
      console.log(
        "👨‍🎓 STUDENTS:",
        students.map((student) => ({
          id: student.id,
          code: student.code,
          name: student.name,

          original_avatar:
            rows.find((item) => Number(item.id) === Number(student.id))
              ?.avatar || null,

          avatar: student.avatar,

          church_id: student.church_id,

          class_id: student.class_id,
          class_name: student.class_name,
          class_code: student.class_code,

          catechist_class_id: student.catechist_class_id,
        })),
      );
    } else {
      console.log("⚠️ KHÔNG TÌM THẤY HỌC SINH SAU MAIN QUERY");

      // ===================================================
      // 10. DEEP DEBUG
      // ===================================================
      console.log("\n---------- DEEP DEBUG ----------");

      const [deepRows] = await db.execute(
        `
          SELECT

            cc.id AS catechist_class_id,
            cc.catechist_id,
            cc.class_id,

            c.id AS real_class_id,
            c.name AS class_name,
            c.code AS class_code,
            c.church_id AS class_church_id,

            cs.id AS class_student_id,
            cs.student_id,
            cs.status AS class_student_status,

            s.id AS student_real_id,
            s.name AS student_name,
            s.code AS student_code,
            s.avatar AS student_avatar,
            s.church_id AS student_church_id

          FROM catechist_classes cc

          LEFT JOIN classes c
            ON c.id = cc.class_id

          LEFT JOIN class_students cs
            ON cs.class_id = cc.class_id

          LEFT JOIN students s
            ON s.id = cs.student_id

          WHERE cc.catechist_id = ?

          ORDER BY
            cc.class_id ASC,
            cs.student_id ASC
        `,
        [catechistId],
      );

      console.log("🔍 DEEP DEBUG ROWS:", deepRows);

      console.log(
        "🔍 DEEP DEBUG SUMMARY:",
        deepRows.map((row) => ({
          catechist_class_id: row.catechist_class_id,

          catechist_id: row.catechist_id,

          class_id: row.class_id,

          real_class_id: row.real_class_id,

          class_name: row.class_name,

          class_code: row.class_code,

          class_church_id: row.class_church_id,

          class_student_id: row.class_student_id,

          student_id: row.student_id,

          class_student_status: row.class_student_status,

          student_real_id: row.student_real_id,

          student_name: row.student_name,

          student_code: row.student_code,

          student_avatar: row.student_avatar,

          student_church_id: row.student_church_id,
        })),
      );
    }

    // =====================================================
    // 11. SUCCESS
    // =====================================================
    console.log("\n======================================================");
    console.log("✅ GET STUDENTS BY TEACHER FINISHED");
    console.log("======================================================");

    return res.json({
      success: true,

      data: students,

      total: students.length,

      debug: {
        churchId,
        username,

        catechistFound: true,
        catechistId,

        classCount: classRows.length,
        classIds,

        classStudentCount: classStudentRows.length,

        studentCheckCount: studentCheckRows.length,

        studentCount: students.length,

        avatarBaseUrl: `${API_PUBLIC_URL}/uploads/students`,
      },
    });
  } catch (error) {
    // =====================================================
    // ERROR
    // =====================================================
    console.log("\n");
    console.log("======================================================");
    console.log("❌ GET STUDENTS BY TEACHER ERROR");
    console.log("======================================================");

    console.log("ERROR CODE:", error.code);
    console.log("ERROR MESSAGE:", error.message);
    console.log("ERROR SQL:", error.sql);
    console.log("ERROR STACK:", error.stack);

    console.log("======================================================");

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách học sinh của giáo lý viên",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * =========================================================
 * CREATE STUDENT
 * =========================================================
 */

exports.createStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  let uploadedFilePath = null;

  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    /**
     * FILE
     */
    uploadedFilePath = req.file?.path || null;

    /**
     * BODY
     */
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

    const normalizedName = normalizeValue(name);

    if (!normalizedName) {
      return res.status(400).json({
        success: false,
        message: "Tên học sinh là bắt buộc",
      });
    }

    if (normalizedName.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Tên học sinh không được vượt quá 255 ký tự",
      });
    }

    const normalizedGender = normalizeValue(gender);

    if (normalizedGender && !VALID_GENDERS.includes(normalizedGender)) {
      return res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ",
      });
    }

    const normalizedCatechismStatus = normalizeValue(catechism_status) || "new";

    if (!VALID_CATECHISM_STATUS.includes(normalizedCatechismStatus)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái giáo lý không hợp lệ",
      });
    }

    const normalizedStatus = normalizeValue(status) || "active";

    if (!VALID_STUDENT_STATUS.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    const classId = toInt(class_id);

    /**
     * DATE
     */
    const normalizedDateOfBirth = normalizeDate(date_of_birth);

    const normalizedBaptismDate = normalizeDate(baptism_date);

    const normalizedFirstCommunionDate = normalizeDate(first_communion_date);

    const normalizedConfirmationDate = normalizeDate(confirmation_date);

    const normalizedEnrollmentDate = normalizeDate(enrollment_date);

    const dateFields = [
      {
        name: "Ngày sinh",
        value: normalizedDateOfBirth,
      },
      {
        name: "Ngày rửa tội",
        value: normalizedBaptismDate,
      },
      {
        name: "Ngày xưng tội lần đầu",
        value: normalizedFirstCommunionDate,
      },
      {
        name: "Ngày thêm sức",
        value: normalizedConfirmationDate,
      },
      {
        name: "Ngày nhập học",
        value: normalizedEnrollmentDate,
      },
    ];

    for (const field of dateFields) {
      if (!isValidDateString(field.value)) {
        return res.status(400).json({
          success: false,
          message: `${field.name} không hợp lệ`,
        });
      }
    }

    /**
     * -------------------------------------------------------
     * TRANSACTION
     * -------------------------------------------------------
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * CHECK CLASS
     */
    if (classId) {
      const validClassId = await checkClassBelongsToChurch(
        connection,
        classId,
        churchId,
      );

      if (!validClassId) {
        throw new Error("Lớp học không tồn tại hoặc không thuộc giáo xứ");
      }
    }

    /**
     * -------------------------------------------------------
     * GENERATE CODE
     * -------------------------------------------------------
     */

    const [lastStudentRows] = await connection.execute(
      `
          SELECT id
          FROM students
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE
        `,
    );

    const nextId =
      lastStudentRows.length > 0 ? Number(lastStudentRows[0].id) + 1 : 1;

    const code = `HS${String(nextId).padStart(6, "0")}`;

    /**
     * QR TOKEN
     */
    const qrToken = `${churchId}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 12)}`;

    /**
     * AVATAR
     */
    const avatarValue = uploadedFilePath || normalizeValue(avatar);

    /**
     * -------------------------------------------------------
     * INSERT STUDENT
     * -------------------------------------------------------
     */

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
      `,
      [
        churchId,
        code,
        qrToken,
        normalizedName,
        normalizedGender,
        normalizedDateOfBirth,
        normalizeValue(birth_place),
        normalizeValue(nationality) || "Việt Nam",
        normalizeValue(phone),
        normalizeValue(email),
        normalizeValue(address),
        normalizeValue(parish),

        normalizeValue(father_name),
        normalizeParentPhone(father_phone),

        normalizeValue(mother_name),
        normalizeParentPhone(mother_phone),

        normalizeValue(guardian_name),
        normalizeParentPhone(guardian_phone),
        normalizeValue(guardian_relationship),

        normalizeValue(baptism_name),
        normalizedBaptismDate,
        normalizeValue(baptism_place),
        normalizeValue(baptism_parish),
        normalizeValue(baptism_certificate_no),

        normalizeValue(saint_name),

        normalizedFirstCommunionDate,
        normalizeValue(first_communion_place),

        normalizedConfirmationDate,
        normalizeValue(confirmation_place),
        normalizeValue(confirmation_saint_name),

        normalizeValue(catechism_level),
        normalizedCatechismStatus,
        normalizedEnrollmentDate,

        normalizeValue(note),
        avatarValue,
        normalizedStatus,
      ],
    );

    const studentId = Number(result.insertId);

    /**
     * -------------------------------------------------------
     * CLASS
     * -------------------------------------------------------
     */

    if (classId) {
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

    /**
     * -------------------------------------------------------
     * PARENT
     * -------------------------------------------------------
     */

    const parentAccounts = await syncStudentParents({
      connection,
      churchId,
      studentId,

      fatherName: normalizeValue(father_name),
      fatherPhone: normalizeParentPhone(father_phone),

      motherName: normalizeValue(mother_name),
      motherPhone: normalizeParentPhone(mother_phone),

      guardianName: normalizeValue(guardian_name),
      guardianPhone: normalizeParentPhone(guardian_phone),
      guardianRelationship: normalizeValue(guardian_relationship),
    });

    /**
     * -------------------------------------------------------
     * COMMIT
     * -------------------------------------------------------
     */

    await connection.commit();

    transactionStarted = false;

    console.log("✅ CREATE STUDENT SUCCESS:", {
      studentId,
      code,
      parentCount: parentAccounts.length,
    });

    /**
     * -------------------------------------------------------
     * RESPONSE
     * -------------------------------------------------------
     */

    return res.status(201).json({
      success: true,
      message: "Thêm học sinh thành công",
      data: {
        id: studentId,
        code,
        qr_token: qrToken,
        name: normalizedName,
        parents: parentAccounts.map((parent) => ({
          id: parent.id,
          username: parent.username,
          relationship: parent.relationship,
          created: parent.created,
        })),
      },
    });
  } catch (error) {
    console.error("");
    console.error("❌ CREATE STUDENT ERROR");
    console.error(error);

    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ ROLLBACK ERROR:", rollbackError);
      }
    }

    /**
     * File mới upload nhưng transaction fail
     */
    if (uploadedFilePath) {
      deleteFileSafe(uploadedFilePath);
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể thêm học sinh",
    });
  } finally {
    connection.release();
  }
};

/**
 * =========================================================
 * UPDATE STUDENT
 * =========================================================
 */

exports.updateStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  let newUploadedFile = null;

  try {
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.id);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    if (!isValidId(studentId)) {
      return res.status(400).json({
        success: false,
        message: "ID học sinh không hợp lệ",
      });
    }

    newUploadedFile = req.file?.path || null;

    /**
     * -------------------------------------------------------
     * LOAD OLD STUDENT
     * -------------------------------------------------------
     */

    const [studentRows] = await connection.execute(
      `
          SELECT *
          FROM students
          WHERE id = ?
            AND church_id = ?
          LIMIT 1
        `,
      [studentId, churchId],
    );

    if (studentRows.length === 0) {
      if (newUploadedFile) {
        deleteFileSafe(newUploadedFile);
      }

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    const oldStudent = studentRows[0];

    /**
     * -------------------------------------------------------
     * BODY
     * -------------------------------------------------------
     */

    const body = req.body;

    const normalizedName = normalizeValue(body.name);

    if (!normalizedName) {
      if (newUploadedFile) {
        deleteFileSafe(newUploadedFile);
      }

      return res.status(400).json({
        success: false,
        message: "Tên học sinh là bắt buộc",
      });
    }

    const normalizedGender = normalizeValue(body.gender);

    if (normalizedGender && !VALID_GENDERS.includes(normalizedGender)) {
      if (newUploadedFile) {
        deleteFileSafe(newUploadedFile);
      }

      return res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ",
      });
    }

    const normalizedCatechismStatus =
      normalizeValue(body.catechism_status) ||
      oldStudent.catechism_status ||
      "new";

    if (!VALID_CATECHISM_STATUS.includes(normalizedCatechismStatus)) {
      if (newUploadedFile) {
        deleteFileSafe(newUploadedFile);
      }

      return res.status(400).json({
        success: false,
        message: "Trạng thái giáo lý không hợp lệ",
      });
    }

    const normalizedStatus =
      normalizeValue(body.status) || oldStudent.status || "active";

    if (!VALID_STUDENT_STATUS.includes(normalizedStatus)) {
      if (newUploadedFile) {
        deleteFileSafe(newUploadedFile);
      }

      return res.status(400).json({
        success: false,
        message: "Trạng thái học sinh không hợp lệ",
      });
    }

    const classId = body.class_id !== undefined ? toInt(body.class_id) : null;

    /**
     * DATE
     */

    const normalizedDateOfBirth =
      body.date_of_birth !== undefined
        ? normalizeDate(body.date_of_birth)
        : oldStudent.date_of_birth;

    const normalizedBaptismDate =
      body.baptism_date !== undefined
        ? normalizeDate(body.baptism_date)
        : oldStudent.baptism_date;

    const normalizedFirstCommunionDate =
      body.first_communion_date !== undefined
        ? normalizeDate(body.first_communion_date)
        : oldStudent.first_communion_date;

    const normalizedConfirmationDate =
      body.confirmation_date !== undefined
        ? normalizeDate(body.confirmation_date)
        : oldStudent.confirmation_date;

    const normalizedEnrollmentDate =
      body.enrollment_date !== undefined
        ? normalizeDate(body.enrollment_date)
        : oldStudent.enrollment_date;

    const dateFields = [
      normalizedDateOfBirth,
      normalizedBaptismDate,
      normalizedFirstCommunionDate,
      normalizedConfirmationDate,
      normalizedEnrollmentDate,
    ];

    for (const date of dateFields) {
      if (!isValidDateString(date)) {
        if (newUploadedFile) {
          deleteFileSafe(newUploadedFile);
        }

        return res.status(400).json({
          success: false,
          message: "Có ngày tháng không hợp lệ",
        });
      }
    }

    /**
     * -------------------------------------------------------
     * NORMALIZE ALL FIELDS
     * -------------------------------------------------------
     */

    const normalizedFatherName =
      body.father_name !== undefined
        ? normalizeValue(body.father_name)
        : oldStudent.father_name;

    const normalizedFatherPhone =
      body.father_phone !== undefined
        ? normalizeParentPhone(body.father_phone)
        : oldStudent.father_phone;

    const normalizedMotherName =
      body.mother_name !== undefined
        ? normalizeValue(body.mother_name)
        : oldStudent.mother_name;

    const normalizedMotherPhone =
      body.mother_phone !== undefined
        ? normalizeParentPhone(body.mother_phone)
        : oldStudent.mother_phone;

    const normalizedGuardianName =
      body.guardian_name !== undefined
        ? normalizeValue(body.guardian_name)
        : oldStudent.guardian_name;

    const normalizedGuardianPhone =
      body.guardian_phone !== undefined
        ? normalizeParentPhone(body.guardian_phone)
        : oldStudent.guardian_phone;

    const normalizedGuardianRelationship =
      body.guardian_relationship !== undefined
        ? normalizeValue(body.guardian_relationship)
        : oldStudent.guardian_relationship;

    /**
     * -------------------------------------------------------
     * TRANSACTION
     * -------------------------------------------------------
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * CLASS
     */

    if (body.class_id !== undefined && classId) {
      const validClassId = await checkClassBelongsToChurch(
        connection,
        classId,
        churchId,
      );

      if (!validClassId) {
        throw new Error("Lớp học không tồn tại hoặc không thuộc giáo xứ");
      }
    }

    /**
     * -------------------------------------------------------
     * AVATAR
     * -------------------------------------------------------
     */

    const avatarValue =
      newUploadedFile ||
      (body.avatar !== undefined
        ? normalizeValue(body.avatar)
        : oldStudent.avatar);

    /**
     * -------------------------------------------------------
     * UPDATE
     * -------------------------------------------------------
     */

    await connection.execute(
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
          status = ?

        WHERE id = ?
          AND church_id = ?
      `,
      [
        normalizedName,
        normalizedGender,
        normalizedDateOfBirth,
        body.birth_place !== undefined
          ? normalizeValue(body.birth_place)
          : oldStudent.birth_place,
        body.nationality !== undefined
          ? normalizeValue(body.nationality)
          : oldStudent.nationality || "Việt Nam",
        body.phone !== undefined
          ? normalizeValue(body.phone)
          : oldStudent.phone,
        body.email !== undefined
          ? normalizeValue(body.email)
          : oldStudent.email,
        body.address !== undefined
          ? normalizeValue(body.address)
          : oldStudent.address,
        body.parish !== undefined
          ? normalizeValue(body.parish)
          : oldStudent.parish,

        normalizedFatherName,
        normalizedFatherPhone,

        normalizedMotherName,
        normalizedMotherPhone,

        normalizedGuardianName,
        normalizedGuardianPhone,
        normalizedGuardianRelationship,

        body.baptism_name !== undefined
          ? normalizeValue(body.baptism_name)
          : oldStudent.baptism_name,
        normalizedBaptismDate,
        body.baptism_place !== undefined
          ? normalizeValue(body.baptism_place)
          : oldStudent.baptism_place,
        body.baptism_parish !== undefined
          ? normalizeValue(body.baptism_parish)
          : oldStudent.baptism_parish,
        body.baptism_certificate_no !== undefined
          ? normalizeValue(body.baptism_certificate_no)
          : oldStudent.baptism_certificate_no,

        body.saint_name !== undefined
          ? normalizeValue(body.saint_name)
          : oldStudent.saint_name,

        normalizedFirstCommunionDate,
        body.first_communion_place !== undefined
          ? normalizeValue(body.first_communion_place)
          : oldStudent.first_communion_place,

        normalizedConfirmationDate,
        body.confirmation_place !== undefined
          ? normalizeValue(body.confirmation_place)
          : oldStudent.confirmation_place,
        body.confirmation_saint_name !== undefined
          ? normalizeValue(body.confirmation_saint_name)
          : oldStudent.confirmation_saint_name,

        body.catechism_level !== undefined
          ? normalizeValue(body.catechism_level)
          : oldStudent.catechism_level,

        normalizedCatechismStatus,
        normalizedEnrollmentDate,

        body.note !== undefined ? normalizeValue(body.note) : oldStudent.note,

        avatarValue,
        normalizedStatus,

        studentId,
        churchId,
      ],
    );

    /**
     * -------------------------------------------------------
     * CLASS
     * -------------------------------------------------------
     *
     * Chỉ xử lý class nếu request có gửi class_id.
     */

    if (body.class_id !== undefined) {
      await connection.execute(
        `
          DELETE FROM class_students
          WHERE student_id = ?
        `,
        [studentId],
      );

      if (classId) {
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

    /**
     * -------------------------------------------------------
     * SYNC PARENT
     * -------------------------------------------------------
     */

    const parentAccounts = await syncStudentParents({
      connection,
      churchId,
      studentId,

      fatherName: normalizedFatherName,
      fatherPhone: normalizedFatherPhone,

      motherName: normalizedMotherName,
      motherPhone: normalizedMotherPhone,

      guardianName: normalizedGuardianName,
      guardianPhone: normalizedGuardianPhone,
      guardianRelationship: normalizedGuardianRelationship,
    });

    /**
     * -------------------------------------------------------
     * COMMIT
     * -------------------------------------------------------
     */

    await connection.commit();

    transactionStarted = false;

    /**
     * -------------------------------------------------------
     * XÓA AVATAR CŨ SAU KHI COMMIT
     * -------------------------------------------------------
     */

    if (
      newUploadedFile &&
      oldStudent.avatar &&
      oldStudent.avatar !== newUploadedFile
    ) {
      deleteFileSafe(oldStudent.avatar);
    }

    return res.json({
      success: true,
      message: "Cập nhật học sinh thành công",
      data: {
        id: studentId,
        parents: parentAccounts.map((parent) => ({
          id: parent.id,
          username: parent.username,
          relationship: parent.relationship,
          created: parent.created,
        })),
      },
    });
  } catch (error) {
    console.error("❌ UPDATE STUDENT:", error);

    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ ROLLBACK:", rollbackError);
      }
    }

    /**
     * File mới upload nhưng update thất bại
     */
    if (newUploadedFile) {
      deleteFileSafe(newUploadedFile);
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể cập nhật học sinh",
    });
  } finally {
    connection.release();
  }
};
/**
 * =========================================================
 * BULK UPDATE STUDENTS IN CLASS
 * =========================================================
 *
 * PUT /api/students/classes/:id/bulk-update
 *
 */
exports.bulkUpdateStudents = async (req, res) => {
  let connection = null;
  let transactionStarted = false;

  try {
    /**
     * -------------------------------------------------------
     * CHURCH
     * -------------------------------------------------------
     */

    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    /**
     * -------------------------------------------------------
     * CLASS
     * -------------------------------------------------------
     */

    const classId = toInt(req.params.id);

    if (!isValidId(classId)) {
      return res.status(400).json({
        success: false,
        message: "ID lớp không hợp lệ",
      });
    }

    /**
     * -------------------------------------------------------
     * BODY
     * -------------------------------------------------------
     */

    const students = req.body?.students;

    if (!Array.isArray(students)) {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu students phải là một mảng",
      });
    }

    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Không có học sinh cần cập nhật",
      });
    }

    /**
     * -------------------------------------------------------
     * GIỚI HẠN AN TOÀN
     * -------------------------------------------------------
     *
     * Không nên cho một request cập nhật vô hạn dòng.
     * 1000 học sinh là quá đủ cho một lớp / lần chỉnh sửa.
     */

    if (students.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Số lượng học sinh cập nhật tối đa là 1000",
      });
    }

    /**
     * -------------------------------------------------------
     * LOAD CLASS
     * -------------------------------------------------------
     */

    connection = await db.getConnection();

    const [classRows] = await connection.execute(
      `
        SELECT
          id,
          name,
          code
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [classId, churchId],
    );

    if (classRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học hoặc lớp không thuộc giáo xứ",
      });
    }

    const classInfo = classRows[0];

    /**
     * -------------------------------------------------------
     * CHECK DUPLICATE STUDENT ID
     * -------------------------------------------------------
     */

    const studentIds = [];

    const duplicateIds = [];

    const seenIds = new Set();

    for (let index = 0; index < students.length; index++) {
      const item = students[index];

      const studentId = toInt(item?.id);

      if (!isValidId(studentId)) {
        continue;
      }

      if (seenIds.has(studentId)) {
        duplicateIds.push({
          row: index + 1,
          student_id: studentId,
        });
      } else {
        seenIds.add(studentId);
        studentIds.push(studentId);
      }
    }

    if (duplicateIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách có học sinh bị trùng ID",
        errors: duplicateIds,
      });
    }

    /**
     * -------------------------------------------------------
     * LOAD ALL STUDENTS
     * -------------------------------------------------------
     *
     * Lấy một lần thay vì query từng dòng.
     */

    if (studentIds.length !== students.length) {
      const errors = [];

      students.forEach((item, index) => {
        const studentId = toInt(item?.id);

        if (!isValidId(studentId)) {
          errors.push({
            row: index + 1,
            student_id: item?.id || null,
            field: "id",
            message: "ID học sinh không hợp lệ",
          });
        }
      });

      return res.status(400).json({
        success: false,
        message: "Có học sinh có ID không hợp lệ",
        errors,
      });
    }

    const placeholders = studentIds.map(() => "?").join(", ");

    const [oldStudentRows] = await connection.query(
      `
        SELECT
          s.*,
          cs.class_id
        FROM students s
        INNER JOIN class_students cs
          ON cs.student_id = s.id
        WHERE s.church_id = ?
          AND cs.class_id = ?
          AND s.id IN (${placeholders})
      `,
      [churchId, classId, ...studentIds],
    );

    /**
     * -------------------------------------------------------
     * MAP OLD STUDENTS
     * -------------------------------------------------------
     */

    const oldStudentMap = new Map();

    for (const student of oldStudentRows) {
      oldStudentMap.set(Number(student.id), student);
    }

    /**
     * -------------------------------------------------------
     * CHECK ALL STUDENTS BELONG TO CLASS
     * -------------------------------------------------------
     */

    const ownershipErrors = [];

    for (let index = 0; index < students.length; index++) {
      const item = students[index];
      const studentId = toInt(item?.id);

      if (!oldStudentMap.has(studentId)) {
        ownershipErrors.push({
          row: index + 1,
          student_id: studentId,
          field: "id",
          message:
            "Học sinh không tồn tại, không thuộc giáo xứ hoặc không thuộc lớp này",
        });
      }
    }

    if (ownershipErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Có học sinh không thuộc lớp đang chỉnh sửa",
        errors: ownershipErrors,
      });
    }

    /**
     * =======================================================
     * VALIDATE ALL DATA BEFORE TRANSACTION UPDATE
     * =======================================================
     */

    const validationErrors = [];

    /**
     * -------------------------------------------------------
     * HELPER
     * -------------------------------------------------------
     */

    const addError = ({
      row,
      studentId,
      field,
      message,
      value = undefined,
    }) => {
      const error = {
        row,
        student_id: studentId,
        field,
        message,
      };

      if (value !== undefined) {
        error.value = value;
      }

      validationErrors.push(error);
    };

    /**
     * -------------------------------------------------------
     * VALIDATE EACH STUDENT
     * -------------------------------------------------------
     */

    for (let index = 0; index < students.length; index++) {
      const item = students[index];

      const row = index + 1;
      const studentId = toInt(item.id);
      const oldStudent = oldStudentMap.get(studentId);

      /**
       * -----------------------------------------------------
       * NAME
       * -----------------------------------------------------
       */

      const normalizedName =
        item.name !== undefined
          ? normalizeValue(item.name)
          : normalizeValue(oldStudent.name);

      if (!normalizedName) {
        addError({
          row,
          studentId,
          field: "name",
          message: "Tên học sinh là bắt buộc",
        });
      }

      /**
       * -----------------------------------------------------
       * GENDER
       * -----------------------------------------------------
       */

      const normalizedGender =
        item.gender !== undefined
          ? normalizeValue(item.gender)
          : oldStudent.gender;

      if (normalizedGender && !VALID_GENDERS.includes(normalizedGender)) {
        addError({
          row,
          studentId,
          field: "gender",
          message: "Giới tính không hợp lệ",
          value: normalizedGender,
        });
      }

      /**
       * -----------------------------------------------------
       * CATECHISM STATUS
       * -----------------------------------------------------
       */

      const normalizedCatechismStatus =
        item.catechism_status !== undefined
          ? normalizeValue(item.catechism_status)
          : oldStudent.catechism_status || "new";

      if (!VALID_CATECHISM_STATUS.includes(normalizedCatechismStatus)) {
        addError({
          row,
          studentId,
          field: "catechism_status",
          message: "Trạng thái giáo lý không hợp lệ",
          value: normalizedCatechismStatus,
        });
      }

      /**
       * -----------------------------------------------------
       * STATUS
       * -----------------------------------------------------
       */

      const normalizedStatus =
        item.status !== undefined
          ? normalizeValue(item.status)
          : oldStudent.status || "active";

      if (!VALID_STUDENT_STATUS.includes(normalizedStatus)) {
        addError({
          row,
          studentId,
          field: "status",
          message: "Trạng thái học sinh không hợp lệ",
          value: normalizedStatus,
        });
      }

      /**
       * -----------------------------------------------------
       * DATES
       * -----------------------------------------------------
       */

      const normalizedDateOfBirth =
        item.date_of_birth !== undefined
          ? normalizeDate(item.date_of_birth)
          : oldStudent.date_of_birth;

      const normalizedBaptismDate =
        item.baptism_date !== undefined
          ? normalizeDate(item.baptism_date)
          : oldStudent.baptism_date;

      const normalizedFirstCommunionDate =
        item.first_communion_date !== undefined
          ? normalizeDate(item.first_communion_date)
          : oldStudent.first_communion_date;

      const normalizedConfirmationDate =
        item.confirmation_date !== undefined
          ? normalizeDate(item.confirmation_date)
          : oldStudent.confirmation_date;

      const normalizedEnrollmentDate =
        item.enrollment_date !== undefined
          ? normalizeDate(item.enrollment_date)
          : oldStudent.enrollment_date;

      const dateFields = [
        {
          field: "date_of_birth",
          value: normalizedDateOfBirth,
        },
        {
          field: "baptism_date",
          value: normalizedBaptismDate,
        },
        {
          field: "first_communion_date",
          value: normalizedFirstCommunionDate,
        },
        {
          field: "confirmation_date",
          value: normalizedConfirmationDate,
        },
        {
          field: "enrollment_date",
          value: normalizedEnrollmentDate,
        },
      ];

      for (const dateField of dateFields) {
        if (!isValidDateString(dateField.value)) {
          addError({
            row,
            studentId,
            field: dateField.field,
            message: "Ngày tháng không hợp lệ",
            value: dateField.value,
          });
        }
      }

      /**
       * -----------------------------------------------------
       * PHONE
       * -----------------------------------------------------
       */

      const normalizedFatherPhone =
        item.father_phone !== undefined
          ? normalizeParentPhone(item.father_phone)
          : oldStudent.father_phone;

      const normalizedMotherPhone =
        item.mother_phone !== undefined
          ? normalizeParentPhone(item.mother_phone)
          : oldStudent.mother_phone;

      const normalizedGuardianPhone =
        item.guardian_phone !== undefined
          ? normalizeParentPhone(item.guardian_phone)
          : oldStudent.guardian_phone;

      /**
       * -----------------------------------------------------
       * LƯU NORMALIZED DATA
       * -----------------------------------------------------
       *
       * Gắn tạm vào object để không phải normalize lại
       * ở bước UPDATE.
       */

      item.__normalized = {
        name: normalizedName,
        gender: normalizedGender,

        date_of_birth: normalizedDateOfBirth,

        birth_place:
          item.birth_place !== undefined
            ? normalizeValue(item.birth_place)
            : oldStudent.birth_place,

        nationality:
          item.nationality !== undefined
            ? normalizeValue(item.nationality)
            : oldStudent.nationality || "Việt Nam",

        phone:
          item.phone !== undefined
            ? normalizeValue(item.phone)
            : oldStudent.phone,

        email:
          item.email !== undefined
            ? normalizeValue(item.email)
            : oldStudent.email,

        address:
          item.address !== undefined
            ? normalizeValue(item.address)
            : oldStudent.address,

        parish:
          item.parish !== undefined
            ? normalizeValue(item.parish)
            : oldStudent.parish,

        father_name:
          item.father_name !== undefined
            ? normalizeValue(item.father_name)
            : oldStudent.father_name,

        father_phone: normalizedFatherPhone,

        mother_name:
          item.mother_name !== undefined
            ? normalizeValue(item.mother_name)
            : oldStudent.mother_name,

        mother_phone: normalizedMotherPhone,

        guardian_name:
          item.guardian_name !== undefined
            ? normalizeValue(item.guardian_name)
            : oldStudent.guardian_name,

        guardian_phone: normalizedGuardianPhone,

        guardian_relationship:
          item.guardian_relationship !== undefined
            ? normalizeValue(item.guardian_relationship)
            : oldStudent.guardian_relationship,

        baptism_name:
          item.baptism_name !== undefined
            ? normalizeValue(item.baptism_name)
            : oldStudent.baptism_name,

        baptism_date: normalizedBaptismDate,

        baptism_place:
          item.baptism_place !== undefined
            ? normalizeValue(item.baptism_place)
            : oldStudent.baptism_place,

        baptism_parish:
          item.baptism_parish !== undefined
            ? normalizeValue(item.baptism_parish)
            : oldStudent.baptism_parish,

        baptism_certificate_no:
          item.baptism_certificate_no !== undefined
            ? normalizeValue(item.baptism_certificate_no)
            : oldStudent.baptism_certificate_no,

        saint_name:
          item.saint_name !== undefined
            ? normalizeValue(item.saint_name)
            : oldStudent.saint_name,

        first_communion_date: normalizedFirstCommunionDate,

        first_communion_place:
          item.first_communion_place !== undefined
            ? normalizeValue(item.first_communion_place)
            : oldStudent.first_communion_place,

        confirmation_date: normalizedConfirmationDate,

        confirmation_place:
          item.confirmation_place !== undefined
            ? normalizeValue(item.confirmation_place)
            : oldStudent.confirmation_place,

        confirmation_saint_name:
          item.confirmation_saint_name !== undefined
            ? normalizeValue(item.confirmation_saint_name)
            : oldStudent.confirmation_saint_name,

        catechism_level:
          item.catechism_level !== undefined
            ? normalizeValue(item.catechism_level)
            : oldStudent.catechism_level,

        catechism_status: normalizedCatechismStatus,

        enrollment_date: normalizedEnrollmentDate,

        note:
          item.note !== undefined ? normalizeValue(item.note) : oldStudent.note,

        status: normalizedStatus,
      };
    }

    /**
     * -------------------------------------------------------
     * RETURN ALL VALIDATION ERRORS
     * -------------------------------------------------------
     */

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu có lỗi, chưa có học sinh nào được cập nhật",
        errors: validationErrors,
      });
    }

    /**
     * =======================================================
     * TRANSACTION
     * =======================================================
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * -------------------------------------------------------
     * UPDATE STUDENTS
     * -------------------------------------------------------
     */

    for (const item of students) {
      const studentId = toInt(item.id);
      const data = item.__normalized;

      await connection.execute(
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
            status = ?

          WHERE id = ?
            AND church_id = ?
        `,
        [
          data.name,
          data.gender,
          data.date_of_birth,
          data.birth_place,
          data.nationality,
          data.phone,
          data.email,
          data.address,
          data.parish,

          data.father_name,
          data.father_phone,

          data.mother_name,
          data.mother_phone,

          data.guardian_name,
          data.guardian_phone,
          data.guardian_relationship,

          data.baptism_name,
          data.baptism_date,
          data.baptism_place,
          data.baptism_parish,
          data.baptism_certificate_no,

          data.saint_name,

          data.first_communion_date,
          data.first_communion_place,

          data.confirmation_date,
          data.confirmation_place,
          data.confirmation_saint_name,

          data.catechism_level,
          data.catechism_status,
          data.enrollment_date,

          data.note,
          data.status,

          studentId,
          churchId,
        ],
      );
    }

    /**
     * -------------------------------------------------------
     * SYNC PARENTS
     * -------------------------------------------------------
     */

    const parentResults = [];

    for (const item of students) {
      const studentId = toInt(item.id);
      const data = item.__normalized;

      const parentAccounts = await syncStudentParents({
        connection,
        churchId,
        studentId,

        fatherName: data.father_name,
        fatherPhone: data.father_phone,

        motherName: data.mother_name,
        motherPhone: data.mother_phone,

        guardianName: data.guardian_name,
        guardianPhone: data.guardian_phone,
        guardianRelationship: data.guardian_relationship,
      });

      parentResults.push({
        student_id: studentId,
        parents: parentAccounts.map((parent) => ({
          id: parent.id,
          username: parent.username,
          relationship: parent.relationship,
          created: parent.created,
        })),
      });
    }

    /**
     * -------------------------------------------------------
     * COMMIT
     * -------------------------------------------------------
     */

    await connection.commit();

    transactionStarted = false;

    /**
     * -------------------------------------------------------
     * RESPONSE
     * -------------------------------------------------------
     */

    return res.json({
      success: true,
      message: `Đã cập nhật ${students.length} học sinh`,
      data: {
        class: classInfo,
        updated: students.length,
        failed: 0,
        parents: parentResults,
      },
    });
  } catch (error) {
    console.error("❌ BULK UPDATE STUDENTS:", error);

    /**
     * -------------------------------------------------------
     * ROLLBACK
     * -------------------------------------------------------
     */

    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ BULK UPDATE ROLLBACK:", rollbackError);
      }
    }

    /**
     * -------------------------------------------------------
     * ERROR RESPONSE
     * -------------------------------------------------------
     */

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể cập nhật danh sách học sinh",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
/**
 * =========================================================
 * DELETE ONE STUDENT
 * =========================================================
 */

/**
 * =========================================================
 * DELETE STUDENT
 * =========================================================
 */
exports.deleteStudent = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  try {
    /**
     * =======================================================
     * 1. BASIC INFO
     * =======================================================
     */

    const churchId = getChurchId(req);
    const studentId = toInt(req.params.id);

    console.log("");
    console.log("============================================================");
    console.log("                     DELETE STUDENT");
    console.log("============================================================");
    console.log("CHURCH ID:", churchId);
    console.log("STUDENT ID:", studentId);

    /**
     * =======================================================
     * 2. VALIDATE CHURCH
     * =======================================================
     */

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    /**
     * =======================================================
     * 3. VALIDATE STUDENT ID
     * =======================================================
     */

    if (!isValidId(studentId)) {
      return res.status(400).json({
        success: false,
        message: "ID học sinh không hợp lệ",
      });
    }

    /**
     * =======================================================
     * 4. START TRANSACTION
     * =======================================================
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * =======================================================
     * 5. LOCK + GET STUDENT
     * =======================================================
     */

    const [studentRows] = await connection.execute(
      `
        SELECT
          id,
          avatar,
          name,
          code
        FROM students
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [studentId, churchId],
    );

    if (studentRows.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    const student = studentRows[0];

    console.log("STUDENT:", {
      id: student.id,
      name: student.name,
      code: student.code,
    });

    /**
     * =======================================================
     * 6. GET PARENTS OF STUDENT
     *
     * Quan trọng:
     * Không xóa parent ngay.
     * Chỉ lưu lại parent_id để xử lý sau.
     * =======================================================
     */

    const [parentRows] = await connection.execute(
      `
        SELECT DISTINCT
          parent_id
        FROM parent_students
        WHERE student_id = ?
          AND church_id = ?
          AND parent_id IS NOT NULL
        FOR UPDATE
      `,
      [studentId, churchId],
    );

    const parentIds = [
      ...new Set(
        parentRows
          .map((row) => Number(row.parent_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    console.log("PARENT IDS:", parentIds);

    /**
     * =======================================================
     * 7. DELETE PARENT-STUDENT RELATION
     * =======================================================
     */

    const [parentRelationResult] = await connection.execute(
      `
          DELETE FROM parent_students
          WHERE student_id = ?
            AND church_id = ?
        `,
      [studentId, churchId],
    );

    console.log("DELETED PARENT RELATIONS:", parentRelationResult.affectedRows);

    /**
     * =======================================================
     * 8. DELETE CLASS-STUDENT RELATION
     * =======================================================
     */

    const [classRelationResult] = await connection.execute(
      `
          DELETE FROM class_students
          WHERE student_id = ?
        `,
      [studentId],
    );

    console.log("DELETED CLASS RELATIONS:", classRelationResult.affectedRows);

    /**
     * =======================================================
     * 9. DELETE STUDENT
     * =======================================================
     */

    const [deleteStudentResult] = await connection.execute(
      `
          DELETE FROM students
          WHERE id = ?
            AND church_id = ?
        `,
      [studentId, churchId],
    );

    if (deleteStudentResult.affectedRows === 0) {
      throw new Error("Không thể xóa học sinh");
    }

    console.log("DELETED STUDENT:", deleteStudentResult.affectedRows);

    /**
     * =======================================================
     * 10. CHECK + DELETE ORPHAN PARENTS
     *
     * Chỉ xóa parent nếu:
     *
     * parent không còn bất kỳ học sinh nào.
     * =======================================================
     */

    const deletedParentIds = [];

    for (const parentId of parentIds) {
      const [remainingRows] = await connection.execute(
        `
            SELECT
              id
            FROM parent_students
            WHERE parent_id = ?
              AND church_id = ?
            LIMIT 1
          `,
        [parentId, churchId],
      );

      /**
       * Parent vẫn còn con
       */
      if (remainingRows.length > 0) {
        console.log(`PARENT ${parentId}: vẫn còn học sinh khác`);

        continue;
      }

      /**
       * Parent không còn con
       * => Xóa tài khoản
       */

      const [deleteParentResult] = await connection.execute(
        `
            DELETE FROM parents
            WHERE id = ?
              AND church_id = ?
          `,
        [parentId, churchId],
      );

      if (deleteParentResult.affectedRows > 0) {
        deletedParentIds.push(parentId);

        console.log(`PARENT ${parentId}: ĐÃ XÓA`);
      }
    }

    /**
     * =======================================================
     * 11. COMMIT
     * =======================================================
     */

    await connection.commit();

    transactionStarted = false;

    /**
     * =======================================================
     * 12. DELETE AVATAR AFTER COMMIT
     *
     * Không xóa file trước khi DB commit.
     * =======================================================
     */

    if (student.avatar) {
      try {
        deleteFileSafe(student.avatar);
      } catch (fileError) {
        console.error("❌ DELETE STUDENT AVATAR:", fileError);
      }
    }

    /**
     * =======================================================
     * 13. RESPONSE
     * =======================================================
     */

    return res.json({
      success: true,
      message: "Xóa học sinh thành công",
      data: {
        id: studentId,
        name: student.name,
        code: student.code,

        deleted_parent_ids: deletedParentIds,

        deleted_parent_count: deletedParentIds.length,
      },
    });
  } catch (error) {
    console.error("");
    console.error("❌ DELETE STUDENT ERROR:", error);

    /**
     * =======================================================
     * ROLLBACK
     * =======================================================
     */

    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ DELETE STUDENT ROLLBACK ERROR:", rollbackError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Không thể xóa học sinh",
    });
  } finally {
    connection.release();
  }
};

/**
 * =========================================================
 * DELETE STUDENTS BULK
 * =========================================================
 */
exports.deleteStudentsBulk = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  try {
    /**
     * =======================================================
     * 1. BASIC INFO
     * =======================================================
     */

    const churchId = getChurchId(req);

    console.log("");
    console.log("============================================================");
    console.log("                   DELETE STUDENTS BULK");
    console.log("============================================================");
    console.log("CHURCH ID:", churchId);

    /**
     * =======================================================
     * 2. VALIDATE CHURCH
     * =======================================================
     */

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    /**
     * =======================================================
     * 3. GET STUDENT IDS
     * =======================================================
     */

    const studentIds = Array.isArray(req.body?.student_ids)
      ? [
          ...new Set(
            req.body.student_ids
              .map((id) => Number(id))
              .filter((id) => Number.isInteger(id) && id > 0),
          ),
        ]
      : [];

    console.log("REQUEST STUDENT IDS:", studentIds);

    /**
     * =======================================================
     * 4. VALIDATE IDS
     * =======================================================
     */

    if (studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh cần xóa không hợp lệ",
      });
    }

    if (studentIds.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Mỗi lần chỉ được xóa tối đa 1000 học sinh",
      });
    }

    /**
     * =======================================================
     * 5. START TRANSACTION
     * =======================================================
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * =======================================================
     * 6. PLACEHOLDERS
     * =======================================================
     */

    const placeholders = studentIds.map(() => "?").join(",");

    /**
     * =======================================================
     * 7. GET STUDENTS
     *
     * Chỉ lấy học sinh thuộc church hiện tại.
     *
     * FOR UPDATE:
     * Khóa các record trong transaction để tránh
     * thay đổi dữ liệu đồng thời trong lúc xóa.
     * =======================================================
     */

    const [students] = await connection.execute(
      `
        SELECT
          id,
          avatar,
          name,
          code
        FROM students
        WHERE church_id = ?
          AND id IN (${placeholders})
        FOR UPDATE
      `,
      [churchId, ...studentIds],
    );

    console.log("FOUND STUDENTS:", students.length);

    /**
     * =======================================================
     * 8. KHÔNG CÓ HỌC SINH HỢP LỆ
     * =======================================================
     */

    if (students.length === 0) {
      await connection.rollback();

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh để xóa",
      });
    }

    /**
     * =======================================================
     * 9. VALID STUDENT IDS
     * =======================================================
     */

    const validIds = students.map((student) => Number(student.id));

    console.log("VALID STUDENT IDS:", validIds);

    /**
     * =======================================================
     * 10. NOT FOUND IDS
     * =======================================================
     */

    const notFoundIds = studentIds.filter((id) => !validIds.includes(id));

    console.log("NOT FOUND STUDENT IDS:", notFoundIds);

    /**
     * =======================================================
     * 11. VALID PLACEHOLDERS
     * =======================================================
     */

    const validPlaceholders = validIds.map(() => "?").join(",");

    /**
     * =======================================================
     * 12. DELETE CLASS-STUDENT RELATIONS
     *
     * Xóa quan hệ học sinh - lớp trước.
     *
     * Không xóa classes.
     * Không ảnh hưởng học sinh khác.
     * =======================================================
     */

    const [classRelationResult] = await connection.execute(
      `
          DELETE FROM class_students
          WHERE student_id IN (${validPlaceholders})
        `,
      validIds,
    );

    console.log("DELETED CLASS RELATIONS:", classRelationResult.affectedRows);

    /**
     * =======================================================
     * 13. DELETE STUDENTS
     *
     * RẤT QUAN TRỌNG:
     *
     * parent_students.student_id
     * REFERENCES students(id)
     * ON DELETE CASCADE
     *
     * Vì vậy khi xóa students:
     *
     * students
     *    ↓
     * parent_students
     *
     * MySQL tự động xóa các quan hệ
     * parent_students tương ứng.
     *
     * KHÔNG DELETE FROM parents
     * vì database không có bảng parents.
     *
     * KHÔNG DELETE FROM admins
     * vì parent_id tham chiếu admins.id.
     * =======================================================
     */

    const [deleteStudentResult] = await connection.execute(
      `
          DELETE FROM students
          WHERE church_id = ?
            AND id IN (${validPlaceholders})
        `,
      [churchId, ...validIds],
    );

    console.log("DELETED STUDENTS:", deleteStudentResult.affectedRows);

    /**
     * =======================================================
     * 14. CHECK ACTUAL DELETED COUNT
     * =======================================================
     */

    const deletedCount = Number(deleteStudentResult.affectedRows) || 0;

    /**
     * =======================================================
     * 15. COMMIT
     * =======================================================
     */

    await connection.commit();

    transactionStarted = false;

    console.log("TRANSACTION COMMITTED");

    /**
     * =======================================================
     * 16. DELETE AVATARS AFTER COMMIT
     *
     * Chỉ xóa file sau khi DB commit thành công.
     *
     * Nếu xóa DB thất bại:
     * avatar vẫn còn.
     *
     * Nếu DB đã commit:
     * mới tiến hành xóa avatar.
     * =======================================================
     */

    let deletedAvatarCount = 0;

    for (const student of students) {
      if (!student.avatar) {
        continue;
      }

      try {
        const deleted = deleteFileSafe(student.avatar);

        if (deleted !== false) {
          deletedAvatarCount++;
        }

        console.log(`DELETED AVATAR STUDENT ${student.id}:`, student.avatar);
      } catch (fileError) {
        console.error(`❌ DELETE AVATAR STUDENT ${student.id}:`, fileError);
      }
    }

    /**
     * =======================================================
     * 17. RESPONSE
     * =======================================================
     */

    return res.json({
      success: true,

      message: `Đã xóa ${deletedCount} học sinh`,

      data: {
        /**
         * Danh sách ID thực tế đã xóa
         */
        deleted_ids: validIds,

        /**
         * Tổng số học sinh đã xóa
         */
        deleted_count: deletedCount,

        /**
         * Số quan hệ lớp đã xóa
         */
        deleted_class_relations: Number(classRelationResult.affectedRows) || 0,

        /**
         * parent_students được xóa tự động
         * bởi ON DELETE CASCADE.
         */
        parent_relations_cascade: true,

        /**
         * Không xóa admins.
         */
        deleted_parents: 0,

        /**
         * Không xóa admin accounts.
         */
        deleted_admins: 0,

        /**
         * Số avatar đã xử lý.
         */
        deleted_avatars: deletedAvatarCount,

        /**
         * Số lượng request ban đầu.
         */
        requested_count: studentIds.length,

        /**
         * Những ID không tồn tại
         * hoặc không thuộc church hiện tại.
         */
        not_found_ids: notFoundIds,
      },
    });
  } catch (error) {
    /**
     * =======================================================
     * ERROR LOG
     * =======================================================
     */

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("❌ DELETE STUDENTS BULK ERROR");
    console.error(
      "============================================================",
    );

    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL STATE:", error.sqlState);
    console.error("SQL MESSAGE:", error.sqlMessage);

    /**
     * =======================================================
     * ROLLBACK
     * =======================================================
     */

    if (transactionStarted) {
      try {
        await connection.rollback();

        console.log("ROLLBACK SUCCESS");
      } catch (rollbackError) {
        console.error("❌ DELETE STUDENTS BULK ROLLBACK ERROR:", rollbackError);
      }
    }

    /**
     * =======================================================
     * RESPONSE
     * =======================================================
     */

    return res.status(500).json({
      success: false,
      message: "Không thể xóa danh sách học sinh",
    });
  } finally {
    /**
     * =======================================================
     * RELEASE CONNECTION
     * =======================================================
     */

    connection.release();

    console.log("DATABASE CONNECTION RELEASED");

    console.log("============================================================");
    console.log("");
  }
};
/**
 * =========================================================
 * IMPORT EXCEL
 * =========================================================
 */

exports.importStudentsExcel = async (req, res) => {
  const connection = await db.getConnection();

  let transactionStarted = false;

  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

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

    /**
     * -------------------------------------------------------
     * READ EXCEL
     * -------------------------------------------------------
     */

    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
    });

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
      raw: true,
    });

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "File Excel không có dữ liệu",
      });
    }

    if (rows.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Mỗi lần chỉ được import tối đa 1000 học sinh",
      });
    }

    /**
     * -------------------------------------------------------
     * CHECK HEADER NAME
     * -------------------------------------------------------
     */

    const firstRow = rows[0];

    const normalizedHeaders = Object.keys(firstRow).map((key) =>
      String(key).trim().toLowerCase(),
    );

    if (!normalizedHeaders.includes("name")) {
      return res.status(400).json({
        success: false,
        message: "File Excel bắt buộc phải có cột name",
      });
    }

    /**
     * -------------------------------------------------------
     * TRANSACTION
     * -------------------------------------------------------
     */

    await connection.beginTransaction();

    transactionStarted = true;

    /**
     * Cache class
     */
    const classCache = new Map();

    /**
     * Lấy ID cuối
     */
    const [lastStudentRows] = await connection.execute(
      `
          SELECT id
          FROM students
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE
        `,
    );

    let nextId =
      lastStudentRows.length > 0 ? Number(lastStudentRows[0].id) + 1 : 1;

    const successRows = [];
    const errorRows = [];

    /**
     * -------------------------------------------------------
     * LOOP
     * -------------------------------------------------------
     */

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const excelRow = index + 2;

      try {
        /**
         * NAME
         */
        const name = normalizeValue(row.name);

        if (!name) {
          throw new Error("Thiếu tên học sinh");
        }

        /**
         * GENDER
         */
        const gender = normalizeValue(row.gender);

        if (gender && !VALID_GENDERS.includes(gender)) {
          throw new Error(`gender không hợp lệ: ${gender}`);
        }

        /**
         * STATUS
         */
        const status = normalizeValue(row.status) || "active";

        if (!VALID_STUDENT_STATUS.includes(status)) {
          throw new Error(`status không hợp lệ: ${status}`);
        }

        /**
         * CATECHISM STATUS
         */
        const catechismStatus = normalizeValue(row.catechism_status) || "new";

        if (!VALID_CATECHISM_STATUS.includes(catechismStatus)) {
          throw new Error(`catechism_status không hợp lệ: ${catechismStatus}`);
        }

        /**
         * DATES
         */
        const dateOfBirth = normalizeDate(row.date_of_birth);

        const baptismDate = normalizeDate(row.baptism_date);

        const firstCommunionDate = normalizeDate(row.first_communion_date);

        const confirmationDate = normalizeDate(row.confirmation_date);

        const enrollmentDate = normalizeDate(row.enrollment_date);

        const dates = [
          {
            name: "date_of_birth",
            value: dateOfBirth,
          },
          {
            name: "baptism_date",
            value: baptismDate,
          },
          {
            name: "first_communion_date",
            value: firstCommunionDate,
          },
          {
            name: "confirmation_date",
            value: confirmationDate,
          },
          {
            name: "enrollment_date",
            value: enrollmentDate,
          },
        ];

        for (const date of dates) {
          if (!isValidDateString(date.value)) {
            throw new Error(`${date.name} không hợp lệ`);
          }
        }

        /**
         * ---------------------------------------------------
         * CLASS
         * ---------------------------------------------------
         */

        const rawClassId =
          row.class_id !== undefined &&
          row.class_id !== null &&
          row.class_id !== ""
            ? Number(row.class_id)
            : null;

        let classId = null;

        if (rawClassId !== null) {
          if (!Number.isInteger(rawClassId)) {
            throw new Error(`class_id không hợp lệ: ${row.class_id}`);
          }

          if (classCache.has(rawClassId)) {
            classId = classCache.get(rawClassId);
          } else {
            const validClassId = await checkClassBelongsToChurch(
              connection,
              rawClassId,
              churchId,
            );

            if (!validClassId) {
              throw new Error(
                `Lớp ${rawClassId} không tồn tại hoặc không thuộc giáo xứ`,
              );
            }

            classId = validClassId;

            classCache.set(rawClassId, validClassId);
          }
        }

        /**
         * ---------------------------------------------------
         * CODE
         * ---------------------------------------------------
         */

        let code = normalizeValue(row.code);

        if (!code) {
          code = `HS${String(nextId).padStart(6, "0")}`;
        }

        /**
         * CHECK CODE
         */
        const [codeRows] = await connection.execute(
          `
              SELECT id
              FROM students
              WHERE code = ?
              LIMIT 1
              FOR UPDATE
            `,
          [code],
        );

        if (codeRows.length > 0) {
          throw new Error(`Mã học sinh ${code} đã tồn tại`);
        }

        /**
         * QR
         */
        const qrToken = `${churchId}-${Date.now()}-${index}-${Math.random()
          .toString(36)
          .substring(2, 10)}`;

        /**
         * ---------------------------------------------------
         * INSERT
         * ---------------------------------------------------
         */

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
            `,
          [
            churchId,
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
            normalizeParentPhone(row.father_phone),

            normalizeValue(row.mother_name),
            normalizeParentPhone(row.mother_phone),

            normalizeValue(row.guardian_name),
            normalizeParentPhone(row.guardian_phone),
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
            status,
          ],
        );

        const studentId = Number(result.insertId);

        /**
         * ---------------------------------------------------
         * CLASS
         * ---------------------------------------------------
         */

        if (classId) {
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

        /**
         * ---------------------------------------------------
         * PARENT
         * ---------------------------------------------------
         */

        const parentAccounts = await syncStudentParents({
          connection,
          churchId,
          studentId,

          fatherName: normalizeValue(row.father_name),
          fatherPhone: normalizeParentPhone(row.father_phone),

          motherName: normalizeValue(row.mother_name),
          motherPhone: normalizeParentPhone(row.mother_phone),

          guardianName: normalizeValue(row.guardian_name),
          guardianPhone: normalizeParentPhone(row.guardian_phone),
          guardianRelationship: normalizeValue(row.guardian_relationship),
        });

        successRows.push({
          row: excelRow,
          student_id: studentId,
          code,
          name,
          parent_count: parentAccounts.length,
        });

        nextId++;
      } catch (rowError) {
        console.error(`❌ IMPORT ROW ${excelRow}:`, rowError);

        errorRows.push({
          row: excelRow,
          name: normalizeValue(row.name) || null,
          error: rowError.message,
        });
      }
    }

    /**
     * -------------------------------------------------------
     * NẾU CÓ BẤT KỲ ROW LỖI
     * -> ROLLBACK TOÀN BỘ
     * -------------------------------------------------------
     */

    if (errorRows.length > 0) {
      await connection.rollback();

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Import thất bại. Dữ liệu đã được rollback toàn bộ.",
        data: {
          total_rows: rows.length,
          success_count: 0,
          error_count: errorRows.length,
          errors: errorRows,
        },
      });
    }

    /**
     * -------------------------------------------------------
     * COMMIT
     * -------------------------------------------------------
     */

    await connection.commit();

    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: `Import thành công ${successRows.length} học sinh`,
      data: {
        total_rows: rows.length,
        success_count: successRows.length,
        error_count: 0,
        students: successRows,
      },
    });
  } catch (error) {
    console.error("❌ IMPORT STUDENTS EXCEL:", error);

    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ ROLLBACK IMPORT:", rollbackError);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể import học sinh",
    });
  } finally {
    connection.release();
  }
};

/**
 * =========================================================
 * EXPORT STUDENTS EXCEL
 * =========================================================
 */

exports.exportStudentsExcel = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    const classId = toInt(req.body?.class_id);

    const studentIds = Array.isArray(req.body?.student_ids)
      ? [
          ...new Set(
            req.body.student_ids
              .map(Number)
              .filter((id) => Number.isInteger(id) && id > 0),
          ),
        ]
      : [];

    const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];

    const where = ["s.church_id = ?"];

    const params = [churchId];

    if (classId) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM class_students cs_filter
          WHERE cs_filter.student_id = s.id
            AND cs_filter.class_id = ?
        )
      `);

      params.push(classId);
    }

    if (studentIds.length > 0) {
      const placeholders = studentIds.map(() => "?").join(",");

      where.push(`s.id IN (${placeholders})`);

      params.push(...studentIds);
    }

    const [students] = await db.execute(
      `
          SELECT
            s.*,

            (
              SELECT GROUP_CONCAT(
                DISTINCT c.name
                ORDER BY c.name
                SEPARATOR ', '
              )
              FROM class_students cs
              INNER JOIN classes c
                ON c.id = cs.class_id
              WHERE cs.student_id = s.id
                AND c.church_id = ?
            ) AS class_names

          FROM students s

          WHERE ${where.join(" AND ")}

          ORDER BY s.name ASC, s.id ASC
        `,
      [churchId, ...params],
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không có học sinh để xuất",
      });
    }

    /**
     * Các field cho phép export
     */
    const allowedFields = {
      code: "Mã học sinh",
      name: "Họ và tên",
      gender: "Giới tính",
      date_of_birth: "Ngày sinh",
      birth_place: "Nơi sinh",
      nationality: "Quốc tịch",
      phone: "Điện thoại học sinh",
      email: "Email",
      address: "Địa chỉ",
      parish: "Giáo xứ",

      father_name: "Tên cha",
      father_phone: "SĐT cha",

      mother_name: "Tên mẹ",
      mother_phone: "SĐT mẹ",

      guardian_name: "Người giám hộ",
      guardian_phone: "SĐT người giám hộ",
      guardian_relationship: "Quan hệ người giám hộ",

      class_names: "Lớp",

      baptism_name: "Tên thánh rửa tội",
      baptism_date: "Ngày rửa tội",
      baptism_place: "Nơi rửa tội",
      baptism_parish: "Giáo xứ rửa tội",
      baptism_certificate_no: "Số chứng chỉ rửa tội",

      saint_name: "Tên thánh",

      first_communion_date: "Ngày xưng tội lần đầu",
      first_communion_place: "Nơi xưng tội lần đầu",

      confirmation_date: "Ngày thêm sức",
      confirmation_place: "Nơi thêm sức",
      confirmation_saint_name: "Tên thánh thêm sức",

      catechism_level: "Lớp giáo lý",
      catechism_status: "Trạng thái giáo lý",
      enrollment_date: "Ngày nhập học",

      note: "Ghi chú",
      status: "Trạng thái",
    };

    let exportFields = fields.filter(
      (field) => typeof field === "string" && allowedFields[field],
    );

    /**
     * Nếu FE không gửi fields
     * -> export bộ mặc định
     */
    if (exportFields.length === 0) {
      exportFields = [
        "code",
        "name",
        "gender",
        "date_of_birth",
        "class_names",
        "father_name",
        "father_phone",
        "mother_name",
        "mother_phone",
        "guardian_name",
        "guardian_phone",
        "catechism_status",
        "status",
      ];
    }

    const exportData = students.map((student) => {
      const item = {};

      for (const field of exportFields) {
        item[allowedFields[field]] = student[field] ?? "";
      }

      return item;
    });

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    XLSX.utils.book_append_sheet(workbook, worksheet, "HocSinh");

    /**
     * Auto width
     */
    const widths = exportFields.map((field) => {
      const header = allowedFields[field];

      let maxLength = header.length;

      for (const student of students) {
        const value = student[field] ?? "";

        maxLength = Math.max(maxLength, String(value).length);
      }

      return {
        wch: Math.min(Math.max(maxLength + 2, 12), 40),
      };
    });

    worksheet["!cols"] = widths;

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const fileName = `danh-sach-hoc-sinh-${Date.now()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    return res.send(buffer);
  } catch (error) {
    console.error("❌ EXPORT STUDENTS:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xuất danh sách học sinh",
    });
  }
};

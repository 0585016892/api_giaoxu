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
    // DATA
    //
    // LƯU Ý:
    // LIMIT / OFFSET được nối trực tiếp sau khi
    // đã ép kiểu số nguyên và giới hạn giá trị.
    //
    // Không dùng:
    // LIMIT ? OFFSET ?
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
    //
    // 2 params đầu tiên cho:
    // c.church_id = ?
    // c.church_id = ?
    //
    // Sau đó mới đến params của WHERE
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
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: rows,

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

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy học sinh",
      });
    }

    const student = rows[0];

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
        ORDER BY c.name ASC
      `,
      [studentId, churchId],
    );

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
        ORDER BY ps.id ASC
      `,
      [studentId, churchId],
    );

    return res.json({
      success: true,
      data: {
        ...student,
        classes,
        parents,
      },
    });
  } catch (error) {
    console.error("❌ GET STUDENT BY ID:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin học sinh",
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
    const churchId = getChurchId(req);
    const classId = toInt(req.params.id);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    if (!isValidId(classId)) {
      return res.status(400).json({
        success: false,
        message: "ID lớp không hợp lệ",
      });
    }

    const [classRows] = await db.execute(
      `
        SELECT id, name, code
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
        message: "Không tìm thấy lớp học",
      });
    }

    const [students] = await db.execute(
      `
        SELECT
          s.*
        FROM students s
        INNER JOIN class_students cs
          ON cs.student_id = s.id
        WHERE cs.class_id = ?
          AND s.church_id = ?
        ORDER BY s.name ASC, s.id ASC
      `,
      [classId, churchId],
    );

    return res.json({
      success: true,
      data: students,
      class: classRows[0],
      total: students.length,
    });
  } catch (error) {
    console.error("❌ GET STUDENTS BY CLASS:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy học sinh trong lớp",
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
  try {
    console.log("");
    console.log("======================================================");
    console.log("        GET STUDENTS BY TEACHER - DEBUG");
    console.log("======================================================");

    // =====================================================
    // 1. AUTH INFO
    // =====================================================

    console.log("REQ.USER:", req.user);

    const churchId = getChurchId(req);
    const username = normalizeValue(req.user?.username);

    console.log("CHURCH ID:", churchId);
    console.log("USERNAME RAW:", req.user?.username);
    console.log("USERNAME NORMALIZED:", username);

    // =====================================================
    // 2. VALIDATE
    // =====================================================

    if (!churchId) {
      console.log("❌ KHÔNG CÓ CHURCH ID");

      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ",
      });
    }

    if (!username) {
      console.log("❌ KHÔNG CÓ USERNAME");

      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản giáo lý viên",
      });
    }

    // =====================================================
    // 3. CHECK CATECHIST
    // =====================================================

    console.log("");
    console.log("---------- CHECK CATECHIST ----------");

    const [catechistRows] = await db.execute(
      `
      SELECT
        id,
        church_id,
        catechist_code,
        name,
        phone,
        status
      FROM catechists
      WHERE church_id = ?
        AND catechist_code = ?
      `,
      [churchId, username],
    );

    console.log("CATECHIST ROWS:", catechistRows);

    if (!catechistRows.length) {
      console.log("❌ KHÔNG TÌM THẤY CATECHIST");
      console.log("❌ church_id:", churchId);
      console.log("❌ catechist_code:", username);

      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: {
          churchId,
          username,
          catechistFound: false,
          message:
            "Không tìm thấy giáo lý viên theo church_id + catechist_code",
        },
      });
    }

    const catechist = catechistRows[0];

    console.log("✅ CATECHIST:", catechist);

    // =====================================================
    // 4. CHECK CLASS CỦA GIÁO LÝ VIÊN
    // =====================================================

    console.log("");
    console.log("---------- CHECK CLASSES ----------");

    const [classRows] = await db.execute(
      `
      SELECT
        id,
        church_id,
        name,
        code,
        category,
        catechist_id,
        status
      FROM classes
      WHERE church_id = ?
        AND catechist_id = ?
      ORDER BY id DESC
      `,
      [churchId, catechist.id],
    );

    console.log("CLASS COUNT:", classRows.length);

    console.table(classRows);

    if (!classRows.length) {
      console.log("❌ GIÁO LÝ VIÊN KHÔNG ĐƯỢC GÁN LỚP NÀO");

      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: {
          churchId,
          username,
          catechistId: catechist.id,
          classes: [],
        },
      });
    }

    // =====================================================
    // 5. CHECK CLASS_STUDENTS
    // =====================================================

    console.log("");
    console.log("---------- CHECK CLASS STUDENTS ----------");

    const classIds = classRows.map((item) => item.id);

    console.log("CLASS IDS:", classIds);

    const placeholders = classIds.map(() => "?").join(",");

    const [classStudentRows] = await db.execute(
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
          s.church_id AS student_church_id

        FROM class_students cs

        LEFT JOIN students s
          ON s.id = cs.student_id

        WHERE cs.class_id IN (${placeholders})

        ORDER BY cs.class_id, cs.student_id
        `,
      classIds,
    );

    console.log("CLASS_STUDENTS COUNT:", classStudentRows.length);

    console.table(classStudentRows);

    // =====================================================
    // 6. CHECK STUDENTS CÓ CÙNG CHURCH
    // =====================================================

    const [studentChurchRows] = await db.execute(
      `
        SELECT
          s.id,
          s.name,
          s.code,
          s.church_id
        FROM students s
        INNER JOIN class_students cs
          ON cs.student_id = s.id
        INNER JOIN classes c
          ON c.id = cs.class_id
        WHERE c.church_id = ?
          AND c.catechist_id = ?
        ORDER BY s.id
        `,
      [churchId, catechist.id],
    );

    console.log("");
    console.log("---------- STUDENTS BY CLASS/CATECHIST ----------");

    console.log("STUDENT COUNT:", studentChurchRows.length);

    console.table(studentChurchRows);

    // =====================================================
    // 7. QUERY CHÍNH
    // =====================================================

    console.log("");
    console.log("---------- MAIN QUERY ----------");

    const sql = `
      SELECT DISTINCT
        s.*,

        c.id AS class_id,
        c.name AS class_name,
        c.code AS class_code

      FROM students s

      INNER JOIN class_students cs
        ON cs.student_id = s.id

      INNER JOIN classes c
        ON c.id = cs.class_id

      INNER JOIN catechists ct
        ON ct.id = c.catechist_id

      WHERE s.church_id = ?
        AND ct.church_id = ?
        AND ct.catechist_code = ?

      ORDER BY
        s.name ASC,
        s.id ASC
    `;

    console.log("SQL:", sql);
    console.log("PARAMS:", [churchId, churchId, username]);

    const [rows] = await db.execute(sql, [churchId, churchId, username]);

    // =====================================================
    // 8. RESULT
    // =====================================================

    console.log("");
    console.log("======================================================");
    console.log("RESULT");
    console.log("======================================================");

    console.log("FOUND STUDENTS:", rows.length);

    console.table(
      rows.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        church_id: item.church_id,
        class_id: item.class_id,
        class_name: item.class_name,
        class_code: item.class_code,
      })),
    );

    console.log("======================================================");
    console.log("");

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("");
    console.error("======================================================");
    console.error("❌ GET STUDENTS BY TEACHER ERROR");
    console.error("======================================================");

    console.error("ERROR CODE:", error.code);
    console.error("ERROR MESSAGE:", error.message);
    console.error("ERROR SQL:", error.sql);
    console.error("ERROR STACK:", error.stack);

    console.error("======================================================");

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách học sinh của giáo lý viên",
      error: error.message,
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
     * FOR UPDATE để tránh race condition.
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

    /**
     * Không có học sinh hợp lệ
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
     * 8. VALID STUDENT IDS
     * =======================================================
     */

    const validIds = students.map((student) => Number(student.id));

    console.log("VALID STUDENT IDS:", validIds);

    /**
     * =======================================================
     * 9. GET ALL PARENTS
     *
     * Lấy parent của toàn bộ học sinh chuẩn bị xóa.
     * DISTINCT để tránh parent bị xử lý nhiều lần.
     * =======================================================
     */

    const validPlaceholders = validIds.map(() => "?").join(",");

    const [parentRows] = await connection.execute(
      `
          SELECT DISTINCT
            parent_id
          FROM parent_students
          WHERE church_id = ?
            AND student_id IN (${validPlaceholders})
            AND parent_id IS NOT NULL
          FOR UPDATE
        `,
      [churchId, ...validIds],
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
     * 10. DELETE PARENT-STUDENT
     * =======================================================
     */

    const [parentRelationResult] = await connection.execute(
      `
          DELETE FROM parent_students
          WHERE church_id = ?
            AND student_id IN (${validPlaceholders})
        `,
      [churchId, ...validIds],
    );

    console.log("DELETED PARENT RELATIONS:", parentRelationResult.affectedRows);

    /**
     * =======================================================
     * 11. DELETE CLASS-STUDENT
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
     * 12. DELETE STUDENTS
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
     * 13. DELETE ORPHAN PARENTS
     *
     * Sau khi xóa quan hệ:
     *
     * - Parent còn con khác => giữ
     * - Parent không còn con => xóa
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
       * Parent còn học sinh
       */

      if (remainingRows.length > 0) {
        console.log(`PARENT ${parentId}: vẫn còn học sinh khác`);

        continue;
      }

      /**
       * Parent không còn học sinh
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
     * 14. COMMIT
     * =======================================================
     */

    await connection.commit();

    transactionStarted = false;

    /**
     * =======================================================
     * 15. DELETE AVATARS AFTER COMMIT
     * =======================================================
     */

    for (const student of students) {
      if (!student.avatar) {
        continue;
      }

      try {
        deleteFileSafe(student.avatar);
      } catch (fileError) {
        console.error(`❌ DELETE AVATAR STUDENT ${student.id}:`, fileError);
      }
    }

    /**
     * =======================================================
     * 16. RESPONSE
     * =======================================================
     */

    return res.json({
      success: true,
      message: `Đã xóa ${validIds.length} học sinh`,
      data: {
        deleted_ids: validIds,

        deleted_count: validIds.length,

        deleted_parent_ids: deletedParentIds,

        deleted_parent_count: deletedParentIds.length,

        requested_count: studentIds.length,

        not_found_ids: studentIds.filter((id) => !validIds.includes(id)),
      },
    });
  } catch (error) {
    console.error("");
    console.error("❌ DELETE STUDENTS BULK ERROR:", error);

    /**
     * =======================================================
     * ROLLBACK
     * =======================================================
     */

    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("❌ DELETE STUDENTS BULK ROLLBACK ERROR:", rollbackError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Không thể xóa danh sách học sinh",
    });
  } finally {
    connection.release();
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

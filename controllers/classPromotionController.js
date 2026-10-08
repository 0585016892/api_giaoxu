const db = require("../config/db");
const {
  writeLog,
  getChurchId,
  getAdminId,
} = require("../utils/activityChurchLogger");

// ============================================================
// ACADEMIC YEAR CONTROLLER
// ============================================================
//
// API:
//
// 1. POST /academic-years/preview-create
// 2. POST /academic-years
// 3. POST /academic-years/preview-promotion
// 4. POST /academic-years/confirm-promotion
//
// Không tạo thêm bảng lịch sử.
// Lịch sử học sinh được xác định bằng:
//
//      class_students
//              ↓
//          classes
//              ↓
//      academic_year
//
// Audit log:
//
//      activity_church_logs
//
// ============================================================

// ============================================================
// HELPER
// ============================================================

const normalizeAcademicYear = (value) => {
  if (!value) {
    return null;
  }

  const year = String(value).trim();

  if (!/^\d{4}-\d{4}$/.test(year)) {
    return null;
  }

  const [start, end] = year.split("-").map(Number);

  if (end !== start + 1) {
    return null;
  }

  return year;
};

// ============================================================
// PARSE ACADEMIC YEAR
// ============================================================

const parseAcademicYear = (value) => {
  const year = normalizeAcademicYear(value);

  if (!year) {
    return null;
  }

  const [start, end] = year.split("-").map(Number);

  return {
    value: year,
    start,
    end,
  };
};

// ============================================================
// VALIDATE TRANSITION
// ============================================================

const validateYearTransition = (fromAcademicYear, toAcademicYear) => {
  const from = parseAcademicYear(fromAcademicYear);

  const to = parseAcademicYear(toAcademicYear);

  if (!from || !to) {
    return {
      valid: false,
      message: "Năm học không hợp lệ. Định dạng phải là YYYY-YYYY.",
    };
  }

  if (to.start !== from.start + 1) {
    return {
      valid: false,
      message:
        `Chỉ được chuyển sang năm học kế tiếp. ` +
        `${from.value} → ${from.start + 1}-${from.end + 1}.`,
    };
  }

  return {
    valid: true,
    from,
    to,
  };
};

// ============================================================
// GET TARGET CLASS
// ============================================================
//
// Ưu tiên:
//
// 1. level_order + 1
//
// Không tự đoán bằng tên lớp.
//
// ============================================================

const findTargetClass = (sourceClass, targetClasses) => {
  if (
    sourceClass.level_order === null ||
    sourceClass.level_order === undefined
  ) {
    return null;
  }

  const nextLevel = Number(sourceClass.level_order) + 1;

  const candidates = targetClasses.filter(
    (item) => Number(item.level_order) === nextLevel,
  );

  if (candidates.length === 0) {
    return null;
  }

  /**
   * Nếu có nhiều lớp cùng level_order
   * thì ưu tiên cùng category.
   */

  const sameCategory = candidates.find(
    (item) =>
      String(item.category || "") === String(sourceClass.category || ""),
  );

  return sameCategory || candidates[0];
};

// ============================================================
// GET CLASS BY IDS
// ============================================================

const getClassesByIds = async (connection, churchId, classIds) => {
  if (!Array.isArray(classIds) || classIds.length === 0) {
    return [];
  }

  const ids = [
    ...new Set(
      classIds.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await connection.query(
    `
        SELECT
          id,
          church_id,
          name,
          code,
          category,
          level_order,
          academic_year,
          status
        FROM classes
        WHERE church_id = ?
          AND id IN (${placeholders})
      `,
    [churchId, ...ids],
  );

  return rows;
};

// ============================================================
// 1. PREVIEW CREATE ACADEMIC YEAR
// ============================================================
//
// POST /academic-years/preview-create
//
// BODY:
//
// {
//   "fromAcademicYear": "2025-2026",
//   "toAcademicYear": "2026-2027"
// }
//
// ============================================================

exports.previewCreateAcademicYear = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("          PREVIEW CREATE ACADEMIC YEAR");
  console.log("============================================================");

  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ.",
        code: "CHURCH_ID_REQUIRED",
      });
    }

    const { fromAcademicYear, toAcademicYear } = req.body || {};

    console.log("CHURCH ID:", churchId);

    console.log("FROM:", fromAcademicYear);

    console.log("TO:", toAcademicYear);

    // ========================================================
    // VALIDATE
    // ========================================================

    const validation = validateYearTransition(fromAcademicYear, toAcademicYear);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        code: "INVALID_ACADEMIC_YEAR",
      });
    }

    const fromYear = validation.from.value;

    const toYear = validation.to.value;

    // ========================================================
    // SOURCE CLASSES
    // ========================================================

    const [classes] = await db.query(
      `
          SELECT
            c.id,
            c.name,
            c.code,
            c.category,
            c.level_order,
            c.description,
            c.status,
            c.academic_year,

            COUNT(
              DISTINCT CASE
                WHEN cs.status = 'studying'
                THEN cs.student_id
              END
            ) AS student_count

          FROM classes c

          LEFT JOIN class_students cs
            ON cs.class_id = c.id

          WHERE c.church_id = ?
            AND c.academic_year = ?

          GROUP BY
            c.id,
            c.name,
            c.code,
            c.category,
            c.level_order,
            c.description,
            c.status,
            c.academic_year

          ORDER BY
            c.level_order ASC,
            c.name ASC,
            c.id ASC
        `,
      [churchId, fromYear],
    );

    // ========================================================
    // TARGET YEAR EXISTS?
    // ========================================================

    const [existingTargetRows] = await db.query(
      `
        SELECT
          id,
          name,
          code,
          level_order
        FROM classes
        WHERE church_id = ?
          AND academic_year = ?
        ORDER BY
          level_order ASC,
          name ASC
      `,
      [churchId, toYear],
    );

    const targetExists = existingTargetRows.length > 0;

    // ========================================================
    // WARNINGS
    // ========================================================

    const warnings = [];

    if (classes.length === 0) {
      warnings.push({
        code: "SOURCE_YEAR_EMPTY",
        message: `Không có lớp nào trong năm học ${fromYear}.`,
      });
    }

    const classesWithoutLevel = classes.filter(
      (item) => item.level_order === null || item.level_order === undefined,
    );

    if (classesWithoutLevel.length > 0) {
      warnings.push({
        code: "CLASS_MISSING_LEVEL_ORDER",
        message: `${classesWithoutLevel.length} lớp chưa có level_order.`,
        class_ids: classesWithoutLevel.map((item) => item.id),
      });
    }

    if (targetExists) {
      warnings.push({
        code: "TARGET_YEAR_EXISTS",
        message: `Năm học ${toYear} đã tồn tại.`,
      });
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.json({
      success: true,

      can_create: classes.length > 0 && !targetExists,

      from_academic_year: fromYear,

      to_academic_year: toYear,

      source: {
        class_count: classes.length,

        student_count: classes.reduce(
          (total, item) => total + Number(item.student_count || 0),
          0,
        ),

        classes,
      },

      target: {
        exists: targetExists,

        class_count: existingTargetRows.length,

        classes: existingTargetRows,
      },

      warnings,
    });
  } catch (error) {
    console.error("PREVIEW CREATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể kiểm tra khởi tạo năm học.",
      code: "PREVIEW_ACADEMIC_YEAR_ERROR",
      error: error.message,
    });
  }
};

// ============================================================
// 2. CREATE ACADEMIC YEAR
// ============================================================
//
// POST /academic-years
//
// Tạo toàn bộ cơ cấu lớp từ năm cũ sang năm mới.
//
// KHÔNG copy:
// - học sinh
// - giáo lý viên
// - lịch học
//
// Vì những phần đó sẽ xử lý ở bước phân lớp.
//
// ============================================================

exports.createAcademicYear = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("               CREATE ACADEMIC YEAR");
  console.log("============================================================");

  const connection = await db.getConnection();

  try {
    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    if (!churchId) {
      connection.release();

      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ.",
        code: "CHURCH_ID_REQUIRED",
      });
    }

    const { fromAcademicYear, toAcademicYear } = req.body || {};

    console.log("CHURCH ID:", churchId);

    console.log("ADMIN ID:", adminId);

    console.log("FROM:", fromAcademicYear);

    console.log("TO:", toAcademicYear);

    // ========================================================
    // VALIDATE
    // ========================================================

    const validation = validateYearTransition(fromAcademicYear, toAcademicYear);

    if (!validation.valid) {
      connection.release();

      return res.status(400).json({
        success: false,
        message: validation.message,
        code: "INVALID_ACADEMIC_YEAR",
      });
    }

    const fromYear = validation.from.value;

    const toYear = validation.to.value;

    // ========================================================
    // BEGIN
    // ========================================================

    await connection.beginTransaction();

    // ========================================================
    // CHECK TARGET YEAR
    // ========================================================

    const [targetRows] = await connection.query(
      `
        SELECT
          id
        FROM classes
        WHERE church_id = ?
          AND academic_year = ?
        LIMIT 1
        FOR UPDATE
      `,
      [churchId, toYear],
    );

    if (targetRows.length > 0) {
      await connection.rollback();
      connection.release();

      return res.status(409).json({
        success: false,
        message: `Năm học ${toYear} đã được khởi tạo.`,
        code: "ACADEMIC_YEAR_ALREADY_EXISTS",
      });
    }

    // ========================================================
    // SOURCE CLASSES
    // ========================================================

    const [sourceClasses] = await connection.query(
      `
        SELECT
          id,
          name,
          code,
          category,
          level_order,
          description,
          status
        FROM classes
        WHERE church_id = ?
          AND academic_year = ?
        ORDER BY
          level_order ASC,
          name ASC,
          id ASC
      `,
      [churchId, fromYear],
    );

    if (sourceClasses.length === 0) {
      await connection.rollback();
      connection.release();

      return res.status(400).json({
        success: false,
        message: `Không có lớp nào trong năm học ${fromYear}.`,
        code: "SOURCE_ACADEMIC_YEAR_EMPTY",
      });
    }

    // ========================================================
    // CREATE CLASSES
    // ========================================================

    const createdClasses = [];

    for (const sourceClass of sourceClasses) {
      const [result] = await connection.execute(
        `
          INSERT INTO classes (
            church_id,
            name,
            code,
            category,
            level_order,
            catechist_id,
            description,
            room,
            day_of_week,
            start_time,
            end_time,
            start_date,
            end_date,
            academic_year,
            status
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            NULL,
            ?,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            ?,
            'active'
          )
        `,
        [
          churchId,
          sourceClass.name,
          sourceClass.code,
          sourceClass.category,
          sourceClass.level_order,
          sourceClass.description,
          toYear,
        ],
      );

      createdClasses.push({
        source_class_id: sourceClass.id,

        source_name: sourceClass.name,

        new_class_id: result.insertId,

        new_name: sourceClass.name,

        code: sourceClass.code,

        level_order: sourceClass.level_order,
      });
    }

    // ========================================================
    // COMMIT
    // ========================================================

    await connection.commit();

    connection.release();

    // ========================================================
    // ACTIVITY LOG
    // ========================================================

    await writeLog({
      req,

      action: "CREATE_ACADEMIC_YEAR",

      target_type: "academic_year",

      target_id: null,

      description: `Khởi tạo năm học ${toYear} ` + `từ ${fromYear}.`,

      metadata: {
        fromAcademicYear: fromYear,

        toAcademicYear: toYear,

        sourceClassCount: sourceClasses.length,

        createdClassCount: createdClasses.length,

        classes: createdClasses,
      },
    });

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,

      message: `Đã khởi tạo năm học ${toYear}.`,

      from_academic_year: fromYear,

      to_academic_year: toYear,

      class_count: createdClasses.length,

      classes: createdClasses,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    connection.release();

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("          CREATE ACADEMIC YEAR ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL MESSAGE:", error.sqlMessage);
    console.error(
      "============================================================",
    );

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Mã lớp đã tồn tại trong năm học mới.",
        code: "ACADEMIC_YEAR_CLASS_DUPLICATE",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể khởi tạo năm học.",
      code: "CREATE_ACADEMIC_YEAR_ERROR",
      error: error.message,
    });
  }
};

// ============================================================
// 3. PREVIEW PROMOTION
// ============================================================
//
// POST /academic-years/preview-promotion
//
// BODY:
//
// {
//   "fromAcademicYear": "2025-2026",
//   "toAcademicYear": "2026-2027"
// }
//
// ============================================================

exports.previewPromotion = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("              PREVIEW ACADEMIC PROMOTION");
  console.log("============================================================");

  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ.",
        code: "CHURCH_ID_REQUIRED",
      });
    }

    const { fromAcademicYear, toAcademicYear } = req.body || {};

    // ========================================================
    // VALIDATE
    // ========================================================

    const validation = validateYearTransition(fromAcademicYear, toAcademicYear);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        code: "INVALID_ACADEMIC_YEAR",
      });
    }

    const fromYear = validation.from.value;

    const toYear = validation.to.value;

    // ========================================================
    // LOAD SOURCE CLASSES
    // ========================================================

    const [sourceClasses] = await db.query(
      `
        SELECT
          id,
          name,
          code,
          category,
          level_order,
          academic_year,
          status
        FROM classes
        WHERE church_id = ?
          AND academic_year = ?
        ORDER BY
          level_order ASC,
          name ASC,
          id ASC
      `,
      [churchId, fromYear],
    );

    // ========================================================
    // LOAD TARGET CLASSES
    // ========================================================

    const [targetClasses] = await db.query(
      `
        SELECT
          id,
          name,
          code,
          category,
          level_order,
          academic_year,
          status
        FROM classes
        WHERE church_id = ?
          AND academic_year = ?
        ORDER BY
          level_order ASC,
          name ASC,
          id ASC
      `,
      [churchId, toYear],
    );

    if (targetClasses.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          `Chưa có lớp nào trong năm học ${toYear}. ` +
          `Hãy khởi tạo năm học mới trước.`,
        code: "TARGET_ACADEMIC_YEAR_EMPTY",
      });
    }

    // ========================================================
    // SOURCE CLASS IDS
    // ========================================================

    const sourceClassIds = sourceClasses.map((item) => item.id);

    if (sourceClassIds.length === 0) {
      return res.json({
        success: true,

        from_academic_year: fromYear,

        to_academic_year: toYear,

        summary: {
          source_class_count: 0,
          student_count: 0,
          promote_count: 0,
          unassigned_count: 0,
        },

        classes: [],

        warnings: [
          {
            code: "SOURCE_ACADEMIC_YEAR_EMPTY",
            message: `Không có lớp nào trong năm học ${fromYear}.`,
          },
        ],
      });
    }

    // ========================================================
    // LOAD STUDENTS
    // ========================================================

    const placeholders = sourceClassIds.map(() => "?").join(",");

    const [studentRows] = await db.query(
      `
        SELECT
          cs.id AS class_student_id,

          cs.class_id,

          cs.student_id,

          cs.joined_at,

          cs.status AS class_student_status,

          s.code,

          s.name,

          s.saint_name,

          s.avatar,

          s.gender,

          s.date_of_birth,

          c.name AS source_class_name,

          c.code AS source_class_code,

          c.category AS source_category,

          c.level_order AS source_level_order

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id
         AND s.church_id = ?

        INNER JOIN classes c
          ON c.id = cs.class_id
         AND c.church_id = ?

        WHERE cs.class_id IN (${placeholders})

          AND cs.status = 'studying'

          AND c.academic_year = ?

        ORDER BY
          c.level_order ASC,
          c.name ASC,
          s.name ASC,
          s.id ASC
      `,
      [churchId, churchId, ...sourceClassIds, fromYear],
    );

    // ========================================================
    // GROUP STUDENTS
    // ========================================================

    const studentsByClass = new Map();

    for (const student of studentRows) {
      if (!studentsByClass.has(student.class_id)) {
        studentsByClass.set(student.class_id, []);
      }

      studentsByClass.get(student.class_id).push(student);
    }

    // ========================================================
    // BUILD PREVIEW
    // ========================================================

    const warnings = [];

    const classes = [];

    const allStudents = [];

    let promoteCount = 0;

    let unassignedCount = 0;

    for (const sourceClass of sourceClasses) {
      const students = studentsByClass.get(sourceClass.id) || [];

      // ------------------------------------------------------
      // FIND TARGET
      // ------------------------------------------------------

      const targetClass = findTargetClass(sourceClass, targetClasses);

      const classStudents = students.map((student) => {
        const canPromote = !!targetClass;

        const action = canPromote ? "promote" : "unassigned";

        if (canPromote) {
          promoteCount++;
        } else {
          unassignedCount++;
        }

        const item = {
          student_id: student.student_id,

          class_student_id: student.class_student_id,

          code: student.code,

          name: student.name,

          saint_name: student.saint_name,

          avatar: student.avatar,

          gender: student.gender,

          date_of_birth: student.date_of_birth,

          source_class_id: sourceClass.id,

          source_class_name: sourceClass.name,

          source_class_code: sourceClass.code,

          source_level_order: sourceClass.level_order,

          destination_class_id: targetClass ? targetClass.id : null,

          destination_class_name: targetClass ? targetClass.name : null,

          destination_class_code: targetClass ? targetClass.code : null,

          destination_level_order: targetClass ? targetClass.level_order : null,

          action,

          reason: canPromote ? "AUTO_LEVEL_ORDER" : "NO_TARGET_CLASS",
        };

        allStudents.push(item);

        return item;
      });

      if (!targetClass) {
        warnings.push({
          code: "NO_TARGET_CLASS",

          source_class_id: sourceClass.id,

          source_class_name: sourceClass.name,

          source_level_order: sourceClass.level_order,

          student_count: students.length,

          message: `Không tìm thấy lớp đích cho ` + `${sourceClass.name}.`,
        });
      }

      classes.push({
        source: {
          id: sourceClass.id,

          name: sourceClass.name,

          code: sourceClass.code,

          category: sourceClass.category,

          level_order: sourceClass.level_order,

          student_count: students.length,
        },

        destination: targetClass
          ? {
              id: targetClass.id,

              name: targetClass.name,

              code: targetClass.code,

              category: targetClass.category,

              level_order: targetClass.level_order,
            }
          : null,

        student_count: students.length,

        students: classStudents,
      });
    }

    // ========================================================
    // SUMMARY
    // ========================================================

    const summary = {
      source_class_count: sourceClasses.length,

      target_class_count: targetClasses.length,

      student_count: studentRows.length,

      promote_count: promoteCount,

      unassigned_count: unassignedCount,
    };

    console.log("CHURCH ID:", churchId);

    console.log("FROM:", fromYear);

    console.log("TO:", toYear);

    console.log("SOURCE CLASSES:", sourceClasses.length);

    console.log("TARGET CLASSES:", targetClasses.length);

    console.log("STUDENTS:", studentRows.length);

    console.log("PROMOTE:", promoteCount);

    console.log("UNASSIGNED:", unassignedCount);

    // ========================================================
    // LOG PREVIEW
    // ========================================================

    await writeLog({
      req,

      action: "PREVIEW_ACADEMIC_YEAR_PROMOTION",

      target_type: "academic_year",

      description: `Xem trước phân lớp ${fromYear} → ${toYear}.`,

      metadata: {
        fromAcademicYear: fromYear,

        toAcademicYear: toYear,

        sourceClassCount: sourceClasses.length,

        targetClassCount: targetClasses.length,

        studentCount: studentRows.length,

        promoteCount,

        unassignedCount,
      },
    });

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.json({
      success: true,

      from_academic_year: fromYear,

      to_academic_year: toYear,

      summary,

      classes,

      students: allStudents,

      warnings,
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("        PREVIEW PROMOTION ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL MESSAGE:", error.sqlMessage);
    console.error(
      "============================================================",
    );

    return res.status(500).json({
      success: false,
      message: "Không thể tạo dữ liệu xem trước phân lớp.",
      code: "PREVIEW_PROMOTION_ERROR",
      error: error.message,
    });
  }
};

// ============================================================
// 4. CONFIRM PROMOTION
// ============================================================
//
// POST /academic-years/confirm-promotion
//
// BODY:
//
// {
//   "fromAcademicYear": "2025-2026",
//   "toAcademicYear": "2026-2027",
//
//   "students": [
//     {
//       "student_id": 1,
//       "from_class_id": 10,
//       "to_class_id": 20,
//       "action": "promote"
//     }
//   ]
// }
//
// action:
//
// promote
// stay
// unassigned
//
// Với:
// - promote → sang lớp mới
// - stay → ở lại lớp mới do FE chỉ định
// - unassigned → chưa xếp lớp
//
// ============================================================

exports.confirmPromotion = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("             CONFIRM ACADEMIC PROMOTION");
  console.log("============================================================");

  const connection = await db.getConnection();

  try {
    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    if (!churchId) {
      connection.release();

      return res.status(403).json({
        success: false,
        message: "Không xác định được giáo xứ.",
        code: "CHURCH_ID_REQUIRED",
      });
    }

    const { fromAcademicYear, toAcademicYear, students } = req.body || {};

    // ========================================================
    // VALIDATE YEAR
    // ========================================================

    const validation = validateYearTransition(fromAcademicYear, toAcademicYear);

    if (!validation.valid) {
      connection.release();

      return res.status(400).json({
        success: false,
        message: validation.message,
        code: "INVALID_ACADEMIC_YEAR",
      });
    }

    const fromYear = validation.from.value;

    const toYear = validation.to.value;

    // ========================================================
    // VALIDATE STUDENT LIST
    // ========================================================

    if (!Array.isArray(students)) {
      connection.release();

      return res.status(400).json({
        success: false,
        message: "Danh sách học sinh không hợp lệ.",
        code: "STUDENTS_ARRAY_REQUIRED",
      });
    }

    if (students.length === 0) {
      connection.release();

      return res.status(400).json({
        success: false,
        message: "Chưa có học sinh nào để phân lớp.",
        code: "NO_STUDENTS",
      });
    }

    console.log("CHURCH ID:", churchId);

    console.log("ADMIN ID:", adminId);

    console.log("FROM:", fromYear);

    console.log("TO:", toYear);

    console.log("STUDENT COUNT:", students.length);

    // ========================================================
    // BEGIN
    // ========================================================

    await connection.beginTransaction();

    // ========================================================
    // LOAD SOURCE CLASSES
    // ========================================================

    const [sourceClasses] = await connection.query(
      `
        SELECT
          id,
          name,
          code,
          category,
          level_order,
          academic_year
        FROM classes
        WHERE church_id = ?
          AND academic_year = ?
        FOR UPDATE
      `,
      [churchId, fromYear],
    );

    if (sourceClasses.length === 0) {
      await connection.rollback();
      connection.release();

      return res.status(400).json({
        success: false,
        message: `Không có lớp nguồn trong năm ${fromYear}.`,
        code: "SOURCE_CLASSES_NOT_FOUND",
      });
    }

    // ========================================================
    // LOAD TARGET CLASSES
    // ========================================================

    const [targetClasses] = await connection.query(
      `
        SELECT
          id,
          name,
          code,
          category,
          level_order,
          academic_year
        FROM classes
        WHERE church_id = ?
          AND academic_year = ?
        FOR UPDATE
      `,
      [churchId, toYear],
    );

    if (targetClasses.length === 0) {
      await connection.rollback();
      connection.release();

      return res.status(400).json({
        success: false,
        message: `Không có lớp đích trong năm ${toYear}.`,
        code: "TARGET_CLASSES_NOT_FOUND",
      });
    }

    const sourceClassMap = new Map(
      sourceClasses.map((item) => [Number(item.id), item]),
    );

    const targetClassMap = new Map(
      targetClasses.map((item) => [Number(item.id), item]),
    );

    // ========================================================
    // VALIDATE INPUT
    // ========================================================

    const normalizedStudents = [];

    const seenStudentIds = new Set();

    for (const item of students) {
      const studentId = Number(item?.student_id);

      const fromClassId = Number(item?.from_class_id);

      const toClassId =
        item?.to_class_id === null ||
        item?.to_class_id === undefined ||
        item?.to_class_id === ""
          ? null
          : Number(item.to_class_id);

      const action = String(item?.action || "")
        .trim()
        .toLowerCase();

      // ------------------------------------------------------
      // BASIC
      // ------------------------------------------------------

      if (!Number.isInteger(studentId) || studentId <= 0) {
        throw new Error(`student_id không hợp lệ: ${item?.student_id}`);
      }

      if (seenStudentIds.has(studentId)) {
        throw new Error(`Học sinh ${studentId} xuất hiện nhiều lần.`);
      }

      seenStudentIds.add(studentId);

      if (!Number.isInteger(fromClassId) || fromClassId <= 0) {
        throw new Error(
          `from_class_id không hợp lệ của học sinh ${studentId}.`,
        );
      }

      // ------------------------------------------------------
      // SOURCE CLASS
      // ------------------------------------------------------

      const sourceClass = sourceClassMap.get(fromClassId);

      if (!sourceClass) {
        throw new Error(
          `Lớp nguồn ${fromClassId} không thuộc giáo xứ hoặc năm học ${fromYear}.`,
        );
      }

      // ------------------------------------------------------
      // ACTION
      // ------------------------------------------------------

      if (!["promote", "stay", "unassigned"].includes(action)) {
        throw new Error(`Action không hợp lệ của học sinh ${studentId}.`);
      }

      // ------------------------------------------------------
      // UNASSIGNED
      // ------------------------------------------------------

      if (action === "unassigned") {
        normalizedStudents.push({
          student_id: studentId,

          from_class_id: fromClassId,

          to_class_id: null,

          action,
        });

        continue;
      }

      // ------------------------------------------------------
      // TARGET REQUIRED
      // ------------------------------------------------------

      if (!Number.isInteger(toClassId) || toClassId <= 0) {
        throw new Error(`Học sinh ${studentId} chưa có lớp đích.`);
      }

      // ------------------------------------------------------
      // TARGET CLASS
      // ------------------------------------------------------

      const targetClass = targetClassMap.get(toClassId);

      if (!targetClass) {
        throw new Error(
          `Lớp đích ${toClassId} không thuộc năm học ${toYear} của giáo xứ này.`,
        );
      }

      normalizedStudents.push({
        student_id: studentId,

        from_class_id: fromClassId,

        to_class_id: toClassId,

        action,
      });
    }

    // ========================================================
    // LOAD REAL SOURCE MEMBERSHIP
    // ========================================================
    //
    // Không tin from_class_id từ FE.
    //
    // Phải kiểm tra học sinh thực sự đang ở lớp nguồn.
    //
    // ========================================================

    const studentIds = normalizedStudents.map((item) => item.student_id);

    const studentPlaceholders = studentIds.map(() => "?").join(",");

    const [sourceMemberships] = await connection.query(
      `
        SELECT
          cs.id AS class_student_id,

          cs.student_id,

          cs.class_id,

          cs.status,

          c.academic_year,

          c.church_id

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE c.church_id = ?

          AND c.academic_year = ?

          AND cs.status = 'studying'

          AND cs.student_id IN (${studentPlaceholders})

        FOR UPDATE
      `,
      [churchId, fromYear, ...studentIds],
    );

    const membershipMap = new Map();

    for (const membership of sourceMemberships) {
      membershipMap.set(Number(membership.student_id), membership);
    }

    // ========================================================
    // CHECK MEMBERSHIP
    // ========================================================

    for (const item of normalizedStudents) {
      const membership = membershipMap.get(item.student_id);

      if (!membership) {
        throw new Error(
          `Học sinh ${item.student_id} không có lớp đang học trong năm ${fromYear}.`,
        );
      }

      if (Number(membership.class_id) !== Number(item.from_class_id)) {
        throw new Error(
          `Học sinh ${item.student_id} không thuộc lớp ${item.from_class_id}.`,
        );
      }
    }

    // ========================================================
    // LOAD STUDENT CHURCH
    // ========================================================

    const [validStudents] = await connection.query(
      `
        SELECT
          id
        FROM students
        WHERE church_id = ?
          AND id IN (${studentPlaceholders})
        FOR UPDATE
      `,
      [churchId, ...studentIds],
    );

    const validStudentIds = new Set(
      validStudents.map((item) => Number(item.id)),
    );

    for (const item of normalizedStudents) {
      if (!validStudentIds.has(item.student_id)) {
        throw new Error(`Học sinh ${item.student_id} không thuộc giáo xứ này.`);
      }
    }

    // ========================================================
    // CHECK TARGET DUPLICATES
    // ========================================================
    //
    // Một học sinh không được có 2 dòng studying
    // trong cùng một lớp đích.
    //
    // Đồng thời kiểm tra nếu đã phân lớp từ trước.
    //
    // ========================================================

    const studentsWithTarget = normalizedStudents.filter(
      (item) => item.action !== "unassigned" && item.to_class_id,
    );

    if (studentsWithTarget.length > 0) {
      const targetStudentIds = studentsWithTarget.map(
        (item) => item.student_id,
      );

      const targetStudentPlaceholders = targetStudentIds
        .map(() => "?")
        .join(",");

      const [existingTargetRows] = await connection.query(
        `
          SELECT
            cs.id,
            cs.student_id,
            cs.class_id,
            cs.status,
            c.academic_year

          FROM class_students cs

          INNER JOIN classes c
            ON c.id = cs.class_id

          WHERE c.church_id = ?

            AND c.academic_year = ?

            AND cs.status = 'studying'

            AND cs.student_id IN (
              ${targetStudentPlaceholders}
            )

          FOR UPDATE
        `,
        [churchId, toYear, ...targetStudentIds],
      );

      if (existingTargetRows.length > 0) {
        /**
         * Không tự động thêm lần nữa.
         */

        const existing = existingTargetRows[0];

        throw new Error(
          `Học sinh ${existing.student_id} đã được phân lớp trong năm ${toYear}.`,
        );
      }
    }

    // ========================================================
    // INSERT NEW CLASS STUDENTS
    // ========================================================
    //
    // Lưu ý:
    //
    // KHÔNG xóa lịch sử lớp cũ.
    //
    // Chỉ thêm dòng mới cho năm học mới.
    //
    // ========================================================

    let promoteCount = 0;

    let stayCount = 0;

    let unassignedCount = 0;

    const insertedAssignments = [];

    for (const item of normalizedStudents) {
      if (item.action === "unassigned") {
        unassignedCount++;

        continue;
      }

      await connection.execute(
        `
          INSERT INTO class_students (
            class_id,
            student_id,
            joined_at,
            left_at,
            status
          )
          VALUES (
            ?,
            ?,
            NOW(),
            NULL,
            'studying'
          )
        `,
        [item.to_class_id, item.student_id],
      );

      if (item.action === "promote") {
        promoteCount++;
      }

      if (item.action === "stay") {
        stayCount++;
      }

      insertedAssignments.push({
        student_id: item.student_id,

        from_class_id: item.from_class_id,

        to_class_id: item.to_class_id,

        action: item.action,
      });
    }

    // ========================================================
    // CLOSE OLD CLASS MEMBERSHIP
    // ========================================================
    //
    // Chỉ đóng bản ghi cũ của những học sinh đã
    // được phân vào năm mới.
    //
    // ========================================================

    const movedStudents = normalizedStudents.filter(
      (item) => item.action !== "unassigned",
    );

    for (const item of movedStudents) {
      const membership = membershipMap.get(item.student_id);

      if (!membership) {
        continue;
      }

      await connection.execute(
        `
          UPDATE class_students
          SET
            left_at = NOW(),
            status = 'completed'
          WHERE id = ?
          LIMIT 1
        `,
        [membership.class_student_id],
      );
    }

    // ========================================================
    // COMMIT
    // ========================================================

    await connection.commit();

    connection.release();

    // ========================================================
    // ACTIVITY LOG
    // ========================================================

    await writeLog({
      req,

      action: "CONFIRM_ACADEMIC_YEAR_PROMOTION",

      target_type: "academic_year",

      target_id: null,

      description: `Chốt phân lớp năm học ${toYear} ` + `từ ${fromYear}.`,

      metadata: {
        fromAcademicYear: fromYear,

        toAcademicYear: toYear,

        totalStudentCount: normalizedStudents.length,

        promoteCount,

        stayCount,

        unassignedCount,

        insertedCount: insertedAssignments.length,
      },
    });

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.json({
      success: true,

      message: `Đã chốt phân lớp năm học ${toYear}.`,

      from_academic_year: fromYear,

      to_academic_year: toYear,

      summary: {
        total_student_count: normalizedStudents.length,

        promote_count: promoteCount,

        stay_count: stayCount,

        unassigned_count: unassignedCount,

        inserted_count: insertedAssignments.length,
      },

      assignments: insertedAssignments,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    connection.release();

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("          CONFIRM PROMOTION ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL MESSAGE:", error.sqlMessage);
    console.error(
      "============================================================",
    );

    return res.status(400).json({
      success: false,

      message: error.message || "Không thể chốt phân lớp.",

      code: "CONFIRM_PROMOTION_ERROR",
    });
  }
};

const db = require("../config/db");

const {
  writeLog,
  getChurchId,
  getAdminId,
} = require("../utils/activityLogger");

// ============================================================
// HELPER - NORMALIZE ACADEMIC YEAR
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
// HELPER - PARSE ACADEMIC YEAR
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
// HELPER - VALIDATE YEAR TRANSITION
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
// HELPER - FIND TARGET CLASS
// ============================================================
//
// Quy tắc:
//
// source level_order = 1
// target level_order = 2
//
// Nếu có nhiều lớp cùng level:
// ưu tiên cùng category.
//
// Không đoán bằng tên lớp.
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

  const sameCategory = candidates.find(
    (item) =>
      String(item.category || "") === String(sourceClass.category || ""),
  );

  return sameCategory || candidates[0];
};

// ============================================================
// HELPER - SAFE RELEASE
// ============================================================

const safeRelease = (connection) => {
  if (!connection) {
    return;
  }

  try {
    connection.release();
  } catch (_) {}
};

// ============================================================
// HELPER - SAFE ROLLBACK
// ============================================================

const safeRollback = async (connection) => {
  if (!connection) {
    return;
  }

  try {
    await connection.rollback();
  } catch (_) {}
};

// ============================================================
// 1. PREVIEW CREATE ACADEMIC YEAR
// ============================================================
//
// POST
//
// /academic-years/preview-create
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
    // ======================================================
    // CHURCH
    // ======================================================

    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,

        message: "Không xác định được giáo xứ.",

        code: "CHURCH_ID_REQUIRED",
      });
    }

    // ======================================================
    // BODY
    // ======================================================

    const { fromAcademicYear, toAcademicYear } = req.body || {};

    console.log("CHURCH ID:", churchId);

    console.log("FROM:", fromAcademicYear);

    console.log("TO:", toAcademicYear);

    // ======================================================
    // VALIDATE YEAR
    // ======================================================

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

    // ======================================================
    // SOURCE CLASSES
    // ======================================================

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
              ) AS student_count,

              COUNT(
                DISTINCT sch.id
              ) AS schedule_count

            FROM classes c

            LEFT JOIN class_students cs
              ON cs.class_id = c.id

            LEFT JOIN class_schedules sch
              ON sch.class_id = c.id

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

    // ======================================================
    // TARGET CLASSES
    // ======================================================

    const [existingTargetRows] = await db.query(
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
              DISTINCT sch.id
            ) AS schedule_count

          FROM classes c

          LEFT JOIN class_schedules sch
            ON sch.class_id = c.id

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
      [churchId, toYear],
    );

    const targetExists = existingTargetRows.length > 0;

    // ======================================================
    // WARNINGS
    // ======================================================

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

    const classesWithoutSchedule = classes.filter(
      (item) => Number(item.schedule_count || 0) === 0,
    );

    if (classesWithoutSchedule.length > 0) {
      warnings.push({
        code: "CLASS_WITHOUT_SCHEDULE",

        message: `${classesWithoutSchedule.length} lớp chưa có lịch học.`,

        class_ids: classesWithoutSchedule.map((item) => item.id),
      });
    }

    if (targetExists) {
      warnings.push({
        code: "TARGET_YEAR_EXISTS",

        message: `Năm học ${toYear} đã tồn tại.`,
      });
    }

    // ======================================================
    // COUNTS
    // ======================================================

    const studentCount = classes.reduce(
      (total, item) => total + Number(item.student_count || 0),
      0,
    );

    const scheduleCount = classes.reduce(
      (total, item) => total + Number(item.schedule_count || 0),
      0,
    );

    // ======================================================
    // RESPONSE
    // ======================================================

    return res.json({
      success: true,

      can_create: classes.length > 0 && !targetExists,

      from_academic_year: fromYear,

      to_academic_year: toYear,

      source: {
        class_count: classes.length,

        student_count: studentCount,

        schedule_count: scheduleCount,

        classes,
      },

      target: {
        exists: targetExists,

        class_count: existingTargetRows.length,

        schedule_count: existingTargetRows.reduce(
          (total, item) => total + Number(item.schedule_count || 0),
          0,
        ),

        classes: existingTargetRows,
      },

      warnings,
    });
  } catch (error) {
    console.error("");

    console.error(
      "============================================================",
    );

    console.error("      PREVIEW CREATE ACADEMIC YEAR ERROR");

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
// POST
//
// /academic-years
//
// THỰC HIỆN:
//
// 1. Tạo classes năm mới.
// 2. Tạo class_schedules năm mới.
// 3. Không copy học sinh.
// 4. Không copy điểm danh.
// 5. Không copy giáo lý viên.
//
// Toàn bộ nằm trong một transaction.
//
// ============================================================

exports.createAcademicYear = async (req, res) => {
  console.log("");

  console.log("============================================================");

  console.log("               CREATE ACADEMIC YEAR");

  console.log("============================================================");

  let connection = null;

  try {
    // ======================================================
    // CONNECTION
    // ======================================================

    connection = await db.getConnection();

    // ======================================================
    // USER
    // ======================================================

    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    if (!churchId) {
      safeRelease(connection);

      return res.status(403).json({
        success: false,

        message: "Không xác định được giáo xứ.",

        code: "CHURCH_ID_REQUIRED",
      });
    }

    // ======================================================
    // BODY
    // ======================================================

    const { fromAcademicYear, toAcademicYear } = req.body || {};

    console.log("CHURCH ID:", churchId);

    console.log("ADMIN ID:", adminId);

    console.log("FROM:", fromAcademicYear);

    console.log("TO:", toAcademicYear);

    // ======================================================
    // VALIDATE YEAR
    // ======================================================

    const validation = validateYearTransition(fromAcademicYear, toAcademicYear);

    if (!validation.valid) {
      safeRelease(connection);

      return res.status(400).json({
        success: false,

        message: validation.message,

        code: "INVALID_ACADEMIC_YEAR",
      });
    }

    const fromYear = validation.from.value;

    const toYear = validation.to.value;

    // ======================================================
    // BEGIN TRANSACTION
    // ======================================================

    await connection.beginTransaction();

    console.log("TRANSACTION: BEGIN");

    // ======================================================
    // CHECK TARGET YEAR
    // ======================================================

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
      await safeRollback(connection);

      safeRelease(connection);

      return res.status(409).json({
        success: false,

        message: `Năm học ${toYear} đã được khởi tạo.`,

        code: "ACADEMIC_YEAR_ALREADY_EXISTS",
      });
    }

    // ======================================================
    // SOURCE CLASSES
    // ======================================================

    const [sourceClasses] = await connection.query(
      `
            SELECT
              id,
              church_id,
              name,
              code,
              category,
              level_order,
              description,
              status,
              academic_year

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
      await safeRollback(connection);

      safeRelease(connection);

      return res.status(400).json({
        success: false,

        message: `Không có lớp nào trong năm học ${fromYear}.`,

        code: "SOURCE_ACADEMIC_YEAR_EMPTY",
      });
    }

    console.log("SOURCE CLASS COUNT:", sourceClasses.length);

    // ======================================================
    // SOURCE SCHEDULES
    // ======================================================

    const sourceClassIds = sourceClasses.map((item) => Number(item.id));

    const classPlaceholders = sourceClassIds.map(() => "?").join(",");

    const [sourceSchedules] = await connection.query(
      `
            SELECT
              id,
              class_id,
              day_of_week,
              start_time,
              end_time,
              room

            FROM class_schedules

            WHERE class_id IN (
              ${classPlaceholders}
            )

            ORDER BY
              class_id ASC,
              id ASC
          `,
      sourceClassIds,
    );

    console.log("SOURCE SCHEDULE COUNT:", sourceSchedules.length);

    // ======================================================
    // CREATE CLASS MAP
    // ======================================================

    const classIdMap = new Map();

    const createdClasses = [];

    // ======================================================
    // CREATE CLASSES
    // ======================================================

    for (const sourceClass of sourceClasses) {
      const [result] = await connection.execute(
        `
              INSERT INTO classes (
                church_id,
                name,
                code,
                academic_year,
                category,
                level_order,
                catechist_id,
                description,
                start_date,
                end_date,
                status
              )

              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                NULL,
                ?,
                NULL,
                NULL,
                'active'
              )
            `,
        [
          churchId,

          sourceClass.name,

          sourceClass.code,

          toYear,

          sourceClass.category,

          sourceClass.level_order,

          sourceClass.description,
        ],
      );

      const newClassId = Number(result.insertId);

      classIdMap.set(Number(sourceClass.id), newClassId);

      createdClasses.push({
        source_class_id: Number(sourceClass.id),

        source_name: sourceClass.name,

        new_class_id: newClassId,

        new_name: sourceClass.name,

        code: sourceClass.code,

        category: sourceClass.category,

        level_order: sourceClass.level_order,
      });
    }

    console.log("CREATED CLASS COUNT:", createdClasses.length);

    // ======================================================
    // COPY CLASS SCHEDULES
    // ======================================================

    const createdSchedules = [];

    for (const schedule of sourceSchedules) {
      const newClassId = classIdMap.get(Number(schedule.class_id));

      if (!newClassId) {
        throw new Error(
          `Không tìm thấy mapping lớp mới cho class_id ${schedule.class_id}.`,
        );
      }

      const [result] = await connection.execute(
        `
              INSERT INTO class_schedules (
                class_id,
                day_of_week,
                start_time,
                end_time,
                room
              )

              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?
              )
            `,
        [
          newClassId,

          schedule.day_of_week,

          schedule.start_time,

          schedule.end_time,

          schedule.room || null,
        ],
      );

      createdSchedules.push({
        source_schedule_id: Number(schedule.id),

        source_class_id: Number(schedule.class_id),

        new_class_id: newClassId,

        new_schedule_id: Number(result.insertId),

        day_of_week: schedule.day_of_week,

        start_time: schedule.start_time,

        end_time: schedule.end_time,

        room: schedule.room || null,
      });
    }

    console.log("CREATED SCHEDULE COUNT:", createdSchedules.length);

    // ======================================================
    // COMMIT
    // ======================================================

    await connection.commit();

    console.log("TRANSACTION: COMMIT");

    safeRelease(connection);

    connection = null;

    // ======================================================
    // ACTIVITY LOG
    // ======================================================

    await writeLog({
      req,

      admin_id: adminId,

      action: "CREATE_ACADEMIC_YEAR",

      target_type: "academic_year",

      target_id: null,

      description: `Khởi tạo năm học ${toYear} từ ${fromYear}.`,

      metadata: {
        fromAcademicYear: fromYear,

        toAcademicYear: toYear,

        sourceClassCount: sourceClasses.length,

        createdClassCount: createdClasses.length,

        sourceScheduleCount: sourceSchedules.length,

        createdScheduleCount: createdSchedules.length,

        classMapping: createdClasses.map((item) => ({
          source_class_id: item.source_class_id,

          new_class_id: item.new_class_id,
        })),
      },
    });

    // ======================================================
    // RESPONSE
    // ======================================================

    return res.status(201).json({
      success: true,

      message: `Đã khởi tạo năm học ${toYear}.`,

      from_academic_year: fromYear,

      to_academic_year: toYear,

      class_count: createdClasses.length,

      schedule_count: createdSchedules.length,

      classes: createdClasses,

      schedules: createdSchedules,
    });
  } catch (error) {
    await safeRollback(connection);

    safeRelease(connection);

    connection = null;

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

    console.error("STACK:", error.stack);

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
// POST
//
// /academic-years/preview-promotion
//
// ============================================================

exports.previewPromotion = async (req, res) => {
  console.log("");

  console.log("============================================================");

  console.log("              PREVIEW ACADEMIC PROMOTION");

  console.log("============================================================");

  try {
    // ======================================================
    // CHURCH
    // ======================================================

    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,

        message: "Không xác định được giáo xứ.",

        code: "CHURCH_ID_REQUIRED",
      });
    }

    const { fromAcademicYear, toAcademicYear } = req.body || {};

    // ======================================================
    // VALIDATE
    // ======================================================

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

    console.log("CHURCH ID:", churchId);

    console.log("FROM:", fromYear);

    console.log("TO:", toYear);

    // ======================================================
    // SOURCE CLASSES
    // ======================================================

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

    // ======================================================
    // TARGET CLASSES
    // ======================================================

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

    // ======================================================
    // SOURCE EMPTY
    // ======================================================

    if (sourceClasses.length === 0) {
      return res.json({
        success: true,

        from_academic_year: fromYear,

        to_academic_year: toYear,

        summary: {
          source_class_count: 0,

          target_class_count: targetClasses.length,

          student_count: 0,

          promote_count: 0,

          unassigned_count: 0,
        },

        classes: [],

        students: [],

        warnings: [
          {
            code: "SOURCE_ACADEMIC_YEAR_EMPTY",

            message: `Không có lớp nào trong năm học ${fromYear}.`,
          },
        ],
      });
    }

    // ======================================================
    // SOURCE CLASS IDS
    // ======================================================

    const sourceClassIds = sourceClasses.map((item) => Number(item.id));

    const placeholders = sourceClassIds.map(() => "?").join(",");

    // ======================================================
    // LOAD STUDENTS
    // ======================================================

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

            WHERE cs.class_id IN (
              ${placeholders}
            )

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

    // ======================================================
    // GROUP
    // ======================================================

    const studentsByClass = new Map();

    for (const student of studentRows) {
      const classId = Number(student.class_id);

      if (!studentsByClass.has(classId)) {
        studentsByClass.set(classId, []);
      }

      studentsByClass.get(classId).push(student);
    }

    // ======================================================
    // BUILD
    // ======================================================

    const warnings = [];

    const classes = [];

    const allStudents = [];

    let promoteCount = 0;

    let unassignedCount = 0;

    for (const sourceClass of sourceClasses) {
      const students = studentsByClass.get(Number(sourceClass.id)) || [];

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
          student_id: Number(student.student_id),

          class_student_id: Number(student.class_student_id),

          code: student.code,

          name: student.name,

          saint_name: student.saint_name,

          avatar: student.avatar,

          gender: student.gender,

          date_of_birth: student.date_of_birth,

          source_class_id: Number(sourceClass.id),

          source_class_name: sourceClass.name,

          source_class_code: sourceClass.code,

          source_category: sourceClass.category,

          source_level_order: sourceClass.level_order,

          destination_class_id: targetClass ? Number(targetClass.id) : null,

          destination_class_name: targetClass ? targetClass.name : null,

          destination_class_code: targetClass ? targetClass.code : null,

          destination_category: targetClass ? targetClass.category : null,

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

          source_class_id: Number(sourceClass.id),

          source_class_name: sourceClass.name,

          source_level_order: sourceClass.level_order,

          student_count: students.length,

          message: `Không tìm thấy lớp đích cho ${sourceClass.name}.`,
        });
      }

      classes.push({
        source: {
          id: Number(sourceClass.id),

          name: sourceClass.name,

          code: sourceClass.code,

          category: sourceClass.category,

          level_order: sourceClass.level_order,

          student_count: students.length,
        },

        destination: targetClass
          ? {
              id: Number(targetClass.id),

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

    // ======================================================
    // SUMMARY
    // ======================================================

    const summary = {
      source_class_count: sourceClasses.length,

      target_class_count: targetClasses.length,

      student_count: studentRows.length,

      promote_count: promoteCount,

      unassigned_count: unassignedCount,
    };

    console.log("SOURCE CLASSES:", sourceClasses.length);

    console.log("TARGET CLASSES:", targetClasses.length);

    console.log("STUDENTS:", studentRows.length);

    console.log("PROMOTE:", promoteCount);

    console.log("UNASSIGNED:", unassignedCount);

    // ======================================================
    // LOG
    // ======================================================

    await writeLog({
      req,

      admin_id: getAdminId(req),

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

    // ======================================================
    // RESPONSE
    // ======================================================

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
// POST
//
// /academic-years/confirm-promotion
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
// ACTION:
//
// promote
// stay
// unassigned
//
// ============================================================

exports.confirmPromotion = async (req, res) => {
  console.log("");

  console.log("============================================================");

  console.log("             CONFIRM ACADEMIC PROMOTION");

  console.log("============================================================");

  let connection = null;

  try {
    // ======================================================
    // CONNECTION
    // ======================================================

    connection = await db.getConnection();

    // ======================================================
    // USER
    // ======================================================

    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    if (!churchId) {
      safeRelease(connection);

      return res.status(403).json({
        success: false,

        message: "Không xác định được giáo xứ.",

        code: "CHURCH_ID_REQUIRED",
      });
    }

    // ======================================================
    // BODY
    // ======================================================

    const { fromAcademicYear, toAcademicYear, students } = req.body || {};

    // ======================================================
    // VALIDATE YEAR
    // ======================================================

    const validation = validateYearTransition(fromAcademicYear, toAcademicYear);

    if (!validation.valid) {
      safeRelease(connection);

      return res.status(400).json({
        success: false,

        message: validation.message,

        code: "INVALID_ACADEMIC_YEAR",
      });
    }

    const fromYear = validation.from.value;

    const toYear = validation.to.value;

    // ======================================================
    // VALIDATE STUDENTS
    // ======================================================

    if (!Array.isArray(students)) {
      safeRelease(connection);

      return res.status(400).json({
        success: false,

        message: "Danh sách học sinh không hợp lệ.",

        code: "STUDENTS_ARRAY_REQUIRED",
      });
    }

    if (students.length === 0) {
      safeRelease(connection);

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

    // ======================================================
    // BEGIN
    // ======================================================

    await connection.beginTransaction();

    console.log("TRANSACTION: BEGIN");

    // ======================================================
    // LOAD SOURCE CLASSES
    // ======================================================

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
      await safeRollback(connection);

      safeRelease(connection);

      return res.status(400).json({
        success: false,

        message: `Không có lớp nguồn trong năm ${fromYear}.`,

        code: "SOURCE_CLASSES_NOT_FOUND",
      });
    }

    // ======================================================
    // LOAD TARGET CLASSES
    // ======================================================

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
      await safeRollback(connection);

      safeRelease(connection);

      return res.status(400).json({
        success: false,

        message: `Không có lớp đích trong năm ${toYear}.`,

        code: "TARGET_CLASSES_NOT_FOUND",
      });
    }

    // ======================================================
    // MAP CLASSES
    // ======================================================

    const sourceClassMap = new Map(
      sourceClasses.map((item) => [Number(item.id), item]),
    );

    const targetClassMap = new Map(
      targetClasses.map((item) => [Number(item.id), item]),
    );

    // ======================================================
    // NORMALIZE INPUT
    // ======================================================

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

      // ====================================================
      // STUDENT ID
      // ====================================================

      if (!Number.isInteger(studentId) || studentId <= 0) {
        throw new Error(`student_id không hợp lệ: ${item?.student_id}`);
      }

      // ====================================================
      // DUPLICATE STUDENT
      // ====================================================

      if (seenStudentIds.has(studentId)) {
        throw new Error(
          `Học sinh ${studentId} xuất hiện nhiều lần trong dữ liệu phân lớp.`,
        );
      }

      seenStudentIds.add(studentId);

      // ====================================================
      // SOURCE CLASS
      // ====================================================

      if (!Number.isInteger(fromClassId) || fromClassId <= 0) {
        throw new Error(
          `from_class_id không hợp lệ của học sinh ${studentId}.`,
        );
      }

      const sourceClass = sourceClassMap.get(fromClassId);

      if (!sourceClass) {
        throw new Error(
          `Lớp nguồn ${fromClassId} không thuộc giáo xứ hoặc năm học ${fromYear}.`,
        );
      }

      // ====================================================
      // ACTION
      // ====================================================

      if (!["promote", "stay", "unassigned"].includes(action)) {
        throw new Error(`Action không hợp lệ của học sinh ${studentId}.`);
      }

      // ====================================================
      // UNASSIGNED
      // ====================================================

      if (action === "unassigned") {
        normalizedStudents.push({
          student_id: studentId,

          from_class_id: fromClassId,

          to_class_id: null,

          action,
        });

        continue;
      }

      // ====================================================
      // TARGET REQUIRED
      // ====================================================

      if (!Number.isInteger(toClassId) || toClassId <= 0) {
        throw new Error(`Học sinh ${studentId} chưa có lớp đích.`);
      }

      // ====================================================
      // TARGET CLASS
      // ====================================================

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

    // ======================================================
    // STUDENT IDS
    // ======================================================

    const studentIds = normalizedStudents.map((item) => item.student_id);

    const studentPlaceholders = studentIds.map(() => "?").join(",");

    // ======================================================
    // CHECK STUDENTS BELONG TO CHURCH
    // ======================================================

    const [validStudents] = await connection.query(
      `
            SELECT
              id

            FROM students

            WHERE church_id = ?

              AND id IN (
                ${studentPlaceholders}
              )

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

    // ======================================================
    // LOAD REAL SOURCE MEMBERSHIP
    // ======================================================

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

              AND cs.student_id IN (
                ${studentPlaceholders}
              )

            FOR UPDATE
          `,
      [churchId, fromYear, ...studentIds],
    );

    // ======================================================
    // SOURCE MEMBERSHIP MAP
    // ======================================================
    //
    // Phát hiện dữ liệu lỗi:
    //
    // Một học sinh có nhiều membership studying
    // trong cùng năm.
    //
    // Không tự ý chọn một dòng.
    //
    // ======================================================

    const membershipMap = new Map();

    const duplicateMemberships = new Map();

    for (const membership of sourceMemberships) {
      const studentId = Number(membership.student_id);

      if (membershipMap.has(studentId)) {
        if (!duplicateMemberships.has(studentId)) {
          duplicateMemberships.set(studentId, [membershipMap.get(studentId)]);
        }

        duplicateMemberships.get(studentId).push(membership);

        continue;
      }

      membershipMap.set(studentId, membership);
    }

    if (duplicateMemberships.size > 0) {
      const firstDuplicate = Array.from(duplicateMemberships.entries())[0];

      throw new Error(
        `Học sinh ${firstDuplicate[0]} đang có nhiều lớp học trong năm ${fromYear}. Vui lòng kiểm tra dữ liệu trước khi phân lớp.`,
      );
    }

    // ======================================================
    // CHECK REAL MEMBERSHIP
    // ======================================================

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

    // ======================================================
    // CHECK TARGET DUPLICATES
    // ======================================================

    const studentsWithTarget = normalizedStudents.filter(
      (item) => item.action !== "unassigned" && item.to_class_id,
    );

    if (studentsWithTarget.length > 0) {
      const targetStudentIds = studentsWithTarget.map(
        (item) => item.student_id,
      );

      const targetPlaceholders = targetStudentIds.map(() => "?").join(",");

      const [existingTargetRows] = await connection.query(
        `
              SELECT
                cs.id,
                cs.student_id,
                cs.class_id,
                cs.status,
                c.academic_year,
                c.name AS class_name

              FROM class_students cs

              INNER JOIN classes c
                ON c.id = cs.class_id

              WHERE c.church_id = ?

                AND c.academic_year = ?

                AND cs.status = 'studying'

                AND cs.student_id IN (
                  ${targetPlaceholders}
                )

              FOR UPDATE
            `,
        [churchId, toYear, ...targetStudentIds],
      );

      if (existingTargetRows.length > 0) {
        const existing = existingTargetRows[0];

        throw new Error(
          `Học sinh ${existing.student_id} đã được phân lớp trong năm ${toYear}${existing.class_name ? ` (${existing.class_name})` : ""}.`,
        );
      }
    }

    // ======================================================
    // INSERT NEW CLASS STUDENTS
    // ======================================================

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

    // ======================================================
    // CLOSE OLD MEMBERSHIP
    // ======================================================
    //
    // Chỉ đóng học sinh đã được chuyển sang năm mới.
    //
    // unassigned:
    // vẫn giữ studying ở năm cũ.
    //
    // ======================================================

    const movedStudents = normalizedStudents.filter(
      (item) => item.action !== "unassigned",
    );

    for (const item of movedStudents) {
      const membership = membershipMap.get(item.student_id);

      if (!membership) {
        throw new Error(
          `Không tìm thấy membership cũ của học sinh ${item.student_id}.`,
        );
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

    // ======================================================
    // COMMIT
    // ======================================================

    await connection.commit();

    console.log("TRANSACTION: COMMIT");

    safeRelease(connection);

    connection = null;

    // ======================================================
    // ACTIVITY LOG
    // ======================================================

    await writeLog({
      req,

      admin_id: adminId,

      action: "CONFIRM_ACADEMIC_YEAR_PROMOTION",

      target_type: "academic_year",

      target_id: null,

      description: `Chốt phân lớp năm học ${toYear} từ ${fromYear}.`,

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

    // ======================================================
    // RESPONSE
    // ======================================================

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
    await safeRollback(connection);

    safeRelease(connection);

    connection = null;

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

    console.error("STACK:", error.stack);

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

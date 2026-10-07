const db = require("../config/db");

/**
 * ============================================================
 * CLASS PROMOTION CONTROLLER
 * ============================================================
 *
 * Chức năng:
 * 1. Preview lên lớp
 * 2. Confirm lên lớp
 *
 * Không tạo log ở giai đoạn này.
 *
 * Quy tắc:
 * - class_id cũ giữ nguyên
 * - class_students cũ được cập nhật status
 * - tạo class_students mới cho năm học mới
 * - attendance cũ vẫn giữ nguyên class_id cũ
 * ============================================================
 */

/**
 * ============================================================
 * GET CHURCH ID
 * ============================================================
 */
const getChurchId = (req) => {
  const churchId =
    req.user?.church_id ??
    req.user?.parish_id ??
    req.auth?.church_id ??
    req.auth?.parish_id;

  const id = Number(churchId);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
};

/**
 * ============================================================
 * NORMALIZE ACTION
 * ============================================================
 */
const normalizeAction = (value) => {
  if (!value) return null;

  const action = String(value).trim().toLowerCase();

  if (action === "promote") {
    return "promote";
  }

  if (action === "stay") {
    return "stay";
  }

  return null;
};

/**
 * ============================================================
 * PREVIEW PROMOTION
 * ============================================================
 *
 * POST /api/class-promotions/preview
 *
 * Body:
 *
 * {
 *   "fromClassId": 101,
 *   "toClassId": 102
 * }
 *
 * ============================================================
 */
exports.previewPromotion = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("              PREVIEW CLASS PROMOTION");
  console.log("============================================================");

  const churchId = getChurchId(req);

  console.log("CHURCH ID:", churchId);

  if (!churchId) {
    return res.status(403).json({
      success: false,
      message: "Không xác định được giáo xứ.",
      code: "CHURCH_ID_REQUIRED",
    });
  }

  try {
    const fromClassId = Number(req.body?.fromClassId);
    const toClassId = Number(req.body?.toClassId);

    console.log("FROM CLASS ID:", fromClassId);
    console.log("TO CLASS ID:", toClassId);

    if (
      !Number.isInteger(fromClassId) ||
      !Number.isInteger(toClassId) ||
      fromClassId <= 0 ||
      toClassId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "fromClassId và toClassId không hợp lệ.",
        code: "INVALID_CLASS_ID",
      });
    }

    if (fromClassId === toClassId) {
      return res.status(400).json({
        success: false,
        message: "Lớp nguồn và lớp đích không được giống nhau.",
        code: "SAME_CLASS",
      });
    }

    // ========================================================
    // 1. LOAD SOURCE CLASS
    // ========================================================

    const [sourceRows] = await db.execute(
      `
        SELECT
          id,
          church_id,
          name,
          code,
          academic_year,
          category,
          status
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [fromClassId, churchId],
    );

    if (!sourceRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp nguồn.",
        code: "SOURCE_CLASS_NOT_FOUND",
      });
    }

    const sourceClass = sourceRows[0];

    console.log("SOURCE CLASS:", sourceClass);

    if (!sourceClass.academic_year) {
      return res.status(400).json({
        success: false,
        message: "Lớp nguồn chưa có năm học.",
        code: "SOURCE_ACADEMIC_YEAR_REQUIRED",
      });
    }

    // ========================================================
    // 2. LOAD TARGET CLASS
    // ========================================================

    const [targetRows] = await db.execute(
      `
        SELECT
          id,
          church_id,
          name,
          code,
          academic_year,
          category,
          status
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
      `,
      [toClassId, churchId],
    );

    if (!targetRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp đích.",
        code: "TARGET_CLASS_NOT_FOUND",
      });
    }

    const targetClass = targetRows[0];

    console.log("TARGET CLASS:", targetClass);

    if (!targetClass.academic_year) {
      return res.status(400).json({
        success: false,
        message: "Lớp đích chưa có năm học.",
        code: "TARGET_ACADEMIC_YEAR_REQUIRED",
      });
    }

    if (sourceClass.academic_year === targetClass.academic_year) {
      return res.status(400).json({
        success: false,
        message: "Lớp nguồn và lớp đích phải thuộc hai năm học khác nhau.",
        code: "SAME_ACADEMIC_YEAR",
      });
    }

    // ========================================================
    // 3. TÌM LỚP CÙNG KHỐI Ở NĂM MỚI
    // ========================================================
    //
    // Dùng code trước.
    // Nếu không có code thì fallback theo name.
    //
    // Đây chính là lớp để "Ở lại".
    //
    // Ví dụ:
    //
    // 1A 2025-2026
    // 2A 2025-2026
    //
    // target:
    // 2A 2026-2027
    //
    // stay:
    // 1A 2026-2027
    // ========================================================

    let stayClass = null;

    if (sourceClass.code) {
      const [stayRowsByCode] = await db.execute(
        `
          SELECT
            id,
            church_id,
            name,
            code,
            academic_year,
            category,
            status
          FROM classes
          WHERE church_id = ?
            AND code = ?
            AND academic_year = ?
          LIMIT 1
        `,
        [churchId, sourceClass.code, targetClass.academic_year],
      );

      if (stayRowsByCode.length) {
        stayClass = stayRowsByCode[0];
      }
    }

    // Fallback theo tên lớp
    if (!stayClass) {
      const [stayRowsByName] = await db.execute(
        `
          SELECT
            id,
            church_id,
            name,
            code,
            academic_year,
            category,
            status
          FROM classes
          WHERE church_id = ?
            AND name = ?
            AND academic_year = ?
          ORDER BY id ASC
          LIMIT 1
        `,
        [churchId, sourceClass.name, targetClass.academic_year],
      );

      if (stayRowsByName.length) {
        stayClass = stayRowsByName[0];
      }
    }

    console.log("STAY CLASS:", stayClass);

    // ========================================================
    // 4. SNAPSHOT STUDENTS
    // ========================================================
    //
    // QUAN TRỌNG:
    // Chỉ lấy status = studying.
    //
    // Không lấy học sinh đã completed / transferred.
    // ========================================================

    const [studentRows] = await db.execute(
      `
        SELECT
          cs.id AS class_student_id,
          cs.class_id,
          cs.student_id,
          cs.status,
          cs.joined_at,

          s.name,
          s.code,
          s.qr_token,
          s.avatar,
          s.gender,
          s.birth_date,

          c.name AS class_name,
          c.code AS class_code,
          c.academic_year

        FROM class_students cs

        INNER JOIN students s
          ON s.id = cs.student_id

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.class_id = ?
          AND cs.status = 'studying'
          AND c.church_id = ?

        ORDER BY
          s.name ASC,
          s.id ASC
      `,
      [fromClassId, churchId],
    );

    console.log("SOURCE STUDENT COUNT:", studentRows.length);

    // ========================================================
    // 5. FORMAT STUDENTS
    // ========================================================

    const students = studentRows.map((student) => ({
      class_student_id: student.class_student_id,

      student_id: student.student_id,

      name: student.name,
      code: student.code,
      qr_token: student.qr_token,

      avatar: student.avatar || null,

      gender: student.gender,
      birth_date: student.birth_date,

      source_class_id: fromClassId,
      source_class_name: sourceClass.name,

      action: "promote",

      destination_class_id: toClassId,
      destination_class_name: targetClass.name,

      stay_class_id: stayClass?.id || null,
      stay_class_name: stayClass?.name || null,
    }));

    // ========================================================
    // 6. RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      data: {
        sourceClass: {
          id: sourceClass.id,
          church_id: sourceClass.church_id,
          name: sourceClass.name,
          code: sourceClass.code,
          academic_year: sourceClass.academic_year,
          category: sourceClass.category,
          status: sourceClass.status,
        },

        targetClass: {
          id: targetClass.id,
          church_id: targetClass.church_id,
          name: targetClass.name,
          code: targetClass.code,
          academic_year: targetClass.academic_year,
          category: targetClass.category,
          status: targetClass.status,
        },

        stayClass: stayClass
          ? {
              id: stayClass.id,
              church_id: stayClass.church_id,
              name: stayClass.name,
              code: stayClass.code,
              academic_year: stayClass.academic_year,
              category: stayClass.category,
              status: stayClass.status,
            }
          : null,

        students,

        summary: {
          total: students.length,
          promote: students.length,
          stay: 0,
        },
      },
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("             PREVIEW PROMOTION ERROR");
    console.error(
      "============================================================",
    );
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Không thể xem trước danh sách lên lớp.",
      code: "PREVIEW_PROMOTION_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ============================================================
 * CONFIRM PROMOTION
 * ============================================================
 *
 * POST /api/class-promotions/confirm
 *
 * Body:
 *
 * {
 *   "fromClassId": 101,
 *   "toClassId": 102,
 *   "stayClassId": 201,
 *
 *   "students": [
 *     {
 *       "student_id": 1,
 *       "action": "promote"
 *     },
 *     {
 *       "student_id": 2,
 *       "action": "stay"
 *     }
 *   ]
 * }
 *
 * ============================================================
 */
exports.confirmPromotion = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("              CONFIRM CLASS PROMOTION");
  console.log("============================================================");

  const churchId = getChurchId(req);

  console.log("CHURCH ID:", churchId);

  if (!churchId) {
    return res.status(403).json({
      success: false,
      message: "Không xác định được giáo xứ.",
      code: "CHURCH_ID_REQUIRED",
    });
  }

  const fromClassId = Number(req.body?.fromClassId);
  const toClassId = Number(req.body?.toClassId);

  const stayClassId = req.body?.stayClassId
    ? Number(req.body.stayClassId)
    : null;

  const students = Array.isArray(req.body?.students) ? req.body.students : [];

  console.log("FROM CLASS ID:", fromClassId);
  console.log("TO CLASS ID:", toClassId);
  console.log("STAY CLASS ID:", stayClassId);
  console.log("REQUEST STUDENTS:", students.length);

  if (
    !Number.isInteger(fromClassId) ||
    !Number.isInteger(toClassId) ||
    fromClassId <= 0 ||
    toClassId <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Thông tin lớp không hợp lệ.",
      code: "INVALID_CLASS_ID",
    });
  }

  if (fromClassId === toClassId) {
    return res.status(400).json({
      success: false,
      message: "Lớp nguồn và lớp đích không được giống nhau.",
      code: "SAME_CLASS",
    });
  }

  if (!students.length) {
    return res.status(400).json({
      success: false,
      message: "Chưa có danh sách học sinh cần xử lý.",
      code: "STUDENTS_REQUIRED",
    });
  }

  let connection;

  try {
    // ========================================================
    // 1. GET CONNECTION
    // ========================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    console.log("TRANSACTION STARTED");

    // ========================================================
    // 2. LOCK SOURCE CLASS
    // ========================================================

    const [sourceRows] = await connection.execute(
      `
        SELECT
          id,
          church_id,
          name,
          code,
          academic_year,
          category,
          status
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [fromClassId, churchId],
    );

    if (!sourceRows.length) {
      throw new Error("SOURCE_CLASS_NOT_FOUND");
    }

    const sourceClass = sourceRows[0];

    // ========================================================
    // 3. LOCK TARGET CLASS
    // ========================================================

    const [targetRows] = await connection.execute(
      `
        SELECT
          id,
          church_id,
          name,
          code,
          academic_year,
          category,
          status
        FROM classes
        WHERE id = ?
          AND church_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [toClassId, churchId],
    );

    if (!targetRows.length) {
      throw new Error("TARGET_CLASS_NOT_FOUND");
    }

    const targetClass = targetRows[0];

    if (!sourceClass.academic_year) {
      throw new Error("SOURCE_ACADEMIC_YEAR_REQUIRED");
    }

    if (!targetClass.academic_year) {
      throw new Error("TARGET_ACADEMIC_YEAR_REQUIRED");
    }

    if (sourceClass.academic_year === targetClass.academic_year) {
      throw new Error("SAME_ACADEMIC_YEAR");
    }

    // ========================================================
    // 4. FIND / LOCK STAY CLASS
    // ========================================================

    let resolvedStayClass = null;

    if (stayClassId) {
      const [stayRows] = await connection.execute(
        `
          SELECT
            id,
            church_id,
            name,
            code,
            academic_year,
            category,
            status
          FROM classes
          WHERE id = ?
            AND church_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [stayClassId, churchId],
      );

      if (!stayRows.length) {
        throw new Error("STAY_CLASS_NOT_FOUND");
      }

      resolvedStayClass = stayRows[0];
    } else {
      // Tìm theo code
      if (sourceClass.code) {
        const [stayRows] = await connection.execute(
          `
            SELECT
              id,
              church_id,
              name,
              code,
              academic_year,
              category,
              status
            FROM classes
            WHERE church_id = ?
              AND code = ?
              AND academic_year = ?
            LIMIT 1
            FOR UPDATE
          `,
          [churchId, sourceClass.code, targetClass.academic_year],
        );

        if (stayRows.length) {
          resolvedStayClass = stayRows[0];
        }
      }

      // Fallback theo tên
      if (!resolvedStayClass) {
        const [stayRows] = await connection.execute(
          `
            SELECT
              id,
              church_id,
              name,
              code,
              academic_year,
              category,
              status
            FROM classes
            WHERE church_id = ?
              AND name = ?
              AND academic_year = ?
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE
          `,
          [churchId, sourceClass.name, targetClass.academic_year],
        );

        if (stayRows.length) {
          resolvedStayClass = stayRows[0];
        }
      }
    }

    console.log("RESOLVED STAY CLASS:", resolvedStayClass);

    // ========================================================
    // 5. SNAPSHOT SOURCE STUDENTS
    // ========================================================
    //
    // Đây là bước cực kỳ quan trọng.
    //
    // Snapshot trước khi update.
    //
    // ========================================================

    const [sourceStudents] = await connection.execute(
      `
        SELECT
          cs.id AS class_student_id,
          cs.class_id,
          cs.student_id,
          cs.status
        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.class_id = ?
          AND cs.status = 'studying'
          AND c.church_id = ?

        FOR UPDATE
      `,
      [fromClassId, churchId],
    );

    console.log("SOURCE SNAPSHOT COUNT:", sourceStudents.length);

    if (!sourceStudents.length) {
      throw new Error("SOURCE_CLASS_HAS_NO_STUDENTS");
    }

    // ========================================================
    // 6. CREATE SNAPSHOT MAP
    // ========================================================

    const sourceStudentMap = new Map();

    for (const row of sourceStudents) {
      sourceStudentMap.set(Number(row.student_id), row);
    }

    // ========================================================
    // 7. VALIDATE REQUEST
    // ========================================================

    const requestStudentMap = new Map();

    for (const item of students) {
      const studentId = Number(item?.student_id);
      const action = normalizeAction(item?.action);

      if (!Number.isInteger(studentId) || studentId <= 0) {
        throw new Error("INVALID_STUDENT_ID");
      }

      if (!action) {
        throw new Error(`INVALID_ACTION_${studentId}`);
      }

      if (requestStudentMap.has(studentId)) {
        throw new Error(`DUPLICATE_STUDENT_${studentId}`);
      }

      requestStudentMap.set(studentId, {
        student_id: studentId,
        action,
        destination_class_id: item?.destination_class_id
          ? Number(item.destination_class_id)
          : null,
      });
    }

    // ========================================================
    // 8. ĐẢM BẢO REQUEST ĐỦ TOÀN BỘ HỌC SINH
    // ========================================================

    if (requestStudentMap.size !== sourceStudentMap.size) {
      throw new Error("STUDENT_SNAPSHOT_MISMATCH");
    }

    for (const sourceStudent of sourceStudents) {
      const studentId = Number(sourceStudent.student_id);

      if (!requestStudentMap.has(studentId)) {
        throw new Error(`MISSING_STUDENT_${studentId}`);
      }
    }

    // ========================================================
    // 9. PREPARE OPERATIONS
    // ========================================================

    const operations = [];

    for (const sourceStudent of sourceStudents) {
      const studentId = Number(sourceStudent.student_id);

      const request = requestStudentMap.get(studentId);

      let destinationClassId = null;

      if (request.action === "promote") {
        destinationClassId = request.destination_class_id || toClassId;
      }

      if (request.action === "stay") {
        destinationClassId =
          request.destination_class_id || resolvedStayClass?.id || null;
      }

      if (!destinationClassId) {
        throw new Error(`DESTINATION_CLASS_REQUIRED_${studentId}`);
      }

      operations.push({
        student_id: studentId,
        class_student_id: sourceStudent.class_student_id,
        action: request.action,
        destination_class_id: destinationClassId,
      });
    }

    console.log("OPERATIONS:", operations);

    // ========================================================
    // 10. LOAD ALL DESTINATION CLASSES
    // ========================================================

    const destinationClassIds = [
      ...new Set(operations.map((item) => item.destination_class_id)),
    ];

    const destinationClasses = new Map();

    for (const classId of destinationClassIds) {
      const [rows] = await connection.execute(
        `
          SELECT
            id,
            church_id,
            name,
            code,
            academic_year,
            category,
            status
          FROM classes
          WHERE id = ?
            AND church_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [classId, churchId],
      );

      if (!rows.length) {
        throw new Error(`DESTINATION_CLASS_NOT_FOUND_${classId}`);
      }

      const destinationClass = rows[0];

      // Destination phải là năm mới
      if (destinationClass.academic_year !== targetClass.academic_year) {
        throw new Error(`INVALID_DESTINATION_ACADEMIC_YEAR_${classId}`);
      }

      destinationClasses.set(classId, destinationClass);
    }

    // ========================================================
    // 11. KIỂM TRA STUDENT ĐÃ CÓ LỚP TRONG NĂM MỚI
    // ========================================================
    //
    // Một học sinh chỉ được có một membership
    // studying trong một năm học.
    //
    // ========================================================

    for (const operation of operations) {
      const destinationClass = destinationClasses.get(
        operation.destination_class_id,
      );

      const [existingRows] = await connection.execute(
        `
            SELECT
              cs.id,
              cs.class_id,
              cs.student_id,
              cs.status,
              c.name AS class_name,
              c.academic_year
            FROM class_students cs

            INNER JOIN classes c
              ON c.id = cs.class_id

            WHERE cs.student_id = ?
              AND cs.status = 'studying'
              AND c.church_id = ?
              AND c.academic_year = ?
            LIMIT 1
            FOR UPDATE
          `,
        [operation.student_id, churchId, targetClass.academic_year],
      );

      if (existingRows.length) {
        const existing = existingRows[0];

        throw new Error(
          `STUDENT_ALREADY_HAS_TARGET_YEAR_CLASS_${operation.student_id}_${existing.class_id}`,
        );
      }

      console.log(
        `STUDENT ${operation.student_id} -> ${destinationClass.name}`,
      );
    }

    // ========================================================
    // 12. PROCESS
    // ========================================================

    let promotedCount = 0;
    let stayCount = 0;

    for (const operation of operations) {
      const destinationClass = destinationClasses.get(
        operation.destination_class_id,
      );

      // ======================================================
      // 12.1 Đóng membership cũ
      // ======================================================

      await connection.execute(
        `
          UPDATE class_students
          SET
            status = ?,
            left_at = CURDATE(),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND class_id = ?
            AND student_id = ?
            AND status = 'studying'
        `,
        [
          operation.action === "promote" ? "transferred" : "completed",

          operation.class_student_id,
          fromClassId,
          operation.student_id,
        ],
      );

      // ======================================================
      // 12.2 Tạo membership năm mới
      // ======================================================

      await connection.execute(
        `
          INSERT INTO class_students (
            class_id,
            student_id,
            status,
            joined_at,
            left_at
          )
          VALUES (
            ?,
            ?,
            'studying',
            CURDATE(),
            NULL
          )
        `,
        [operation.destination_class_id, operation.student_id],
      );

      if (operation.action === "promote") {
        promotedCount++;
      } else {
        stayCount++;
      }

      console.log(
        `DONE STUDENT ${operation.student_id}: ${sourceClass.name} -> ${destinationClass.name} [${operation.action}]`,
      );
    }

    // ========================================================
    // 13. COMMIT
    // ========================================================

    await connection.commit();

    console.log("TRANSACTION COMMITTED");

    // ========================================================
    // 14. RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      message: "Đã chốt danh sách lên lớp thành công.",

      data: {
        sourceClass: {
          id: sourceClass.id,
          name: sourceClass.name,
          code: sourceClass.code,
          academic_year: sourceClass.academic_year,
        },

        targetAcademicYear: targetClass.academic_year,

        summary: {
          total: operations.length,
          promote: promotedCount,
          stay: stayCount,
        },
      },
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("             CONFIRM PROMOTION ERROR");
    console.error(
      "============================================================",
    );
    console.error(error);

    if (connection) {
      try {
        await connection.rollback();

        console.log("TRANSACTION ROLLED BACK");
      } catch (rollbackError) {
        console.error("ROLLBACK ERROR:", rollbackError);
      }
    }

    // ========================================================
    // ERROR MAPPING
    // ========================================================

    const errorCode = String(error?.message || "");

    const errorMap = {
      SOURCE_CLASS_NOT_FOUND: {
        status: 404,
        message: "Không tìm thấy lớp nguồn.",
      },

      TARGET_CLASS_NOT_FOUND: {
        status: 404,
        message: "Không tìm thấy lớp đích.",
      },

      STAY_CLASS_NOT_FOUND: {
        status: 404,
        message: "Không tìm thấy lớp ở lại của năm mới.",
      },

      SOURCE_ACADEMIC_YEAR_REQUIRED: {
        status: 400,
        message: "Lớp nguồn chưa có năm học.",
      },

      TARGET_ACADEMIC_YEAR_REQUIRED: {
        status: 400,
        message: "Lớp đích chưa có năm học.",
      },

      SAME_ACADEMIC_YEAR: {
        status: 400,
        message: "Lớp nguồn và lớp đích phải thuộc hai năm học khác nhau.",
      },

      SOURCE_CLASS_HAS_NO_STUDENTS: {
        status: 400,
        message: "Lớp nguồn hiện không có học sinh đang học.",
      },

      INVALID_STUDENT_ID: {
        status: 400,
        message: "Có học sinh không hợp lệ.",
      },

      STUDENT_SNAPSHOT_MISMATCH: {
        status: 409,
        message:
          "Danh sách học sinh đã thay đổi. Vui lòng tải lại và xem trước lại.",
      },
    };

    // Dynamic error
    if (errorCode.startsWith("STUDENT_ALREADY_HAS_TARGET_YEAR_CLASS_")) {
      const parts = errorCode.split("_");

      const studentId = parts[parts.length - 2];

      const classId = parts[parts.length - 1];

      return res.status(409).json({
        success: false,
        message: `Học sinh ID ${studentId} đã có lớp học trong năm mới.`,
        code: "STUDENT_ALREADY_HAS_TARGET_YEAR_CLASS",
        student_id: Number(studentId),
        class_id: Number(classId),
      });
    }

    if (errorCode.startsWith("DESTINATION_CLASS_NOT_FOUND_")) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy một lớp đích.",
        code: "DESTINATION_CLASS_NOT_FOUND",
      });
    }

    if (errorCode.startsWith("INVALID_DESTINATION_ACADEMIC_YEAR_")) {
      return res.status(400).json({
        success: false,
        message: "Lớp đích không thuộc năm học mới.",
        code: "INVALID_DESTINATION_ACADEMIC_YEAR",
      });
    }

    if (errorCode.startsWith("MISSING_STUDENT_")) {
      return res.status(409).json({
        success: false,
        message:
          "Danh sách học sinh gửi lên không đầy đủ. Vui lòng xem trước lại.",
        code: "MISSING_STUDENT",
      });
    }

    if (errorCode.startsWith("DUPLICATE_STUDENT_")) {
      return res.status(400).json({
        success: false,
        message: "Danh sách có học sinh bị trùng.",
        code: "DUPLICATE_STUDENT",
      });
    }

    if (errorCode.startsWith("INVALID_ACTION_")) {
      return res.status(400).json({
        success: false,
        message: "Có học sinh có thao tác không hợp lệ.",
        code: "INVALID_ACTION",
      });
    }

    if (errorCode.startsWith("DESTINATION_CLASS_REQUIRED_")) {
      return res.status(400).json({
        success: false,
        message: "Có học sinh chưa được xác định lớp đích.",
        code: "DESTINATION_CLASS_REQUIRED",
      });
    }

    if (errorMap[errorCode]) {
      return res.status(errorMap[errorCode].status).json({
        success: false,
        message: errorMap[errorCode].message,
        code: errorCode,
      });
    }

    // ========================================================
    // MYSQL DUPLICATE
    // ========================================================

    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Một hoặc nhiều học sinh đã tồn tại trong lớp đích.",
        code: "DUPLICATE_CLASS_STUDENT",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể chốt danh sách lên lớp.",
      code: "CONFIRM_PROMOTION_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (connection) {
      connection.release();

      console.log("DATABASE CONNECTION RELEASED");
    }
  }
};

const db = require("../config/db");

const { writeLog } = require("../utils/activityLogger");

const { getChurchId, getAdminId } = require("../utils/authContext");

// ============================================================
// CLASSES CONTROLLER
// ============================================================
//
// TABLE:
//
// classes
// class_schedules
// class_students
// catechists
// catechist_classes
//
// ============================================================
//
// API:
//
// GET    /api/classes
// GET    /api/classes/:id
// GET    /api/classes/teacher-class
// GET    /api/classes/schedules
//
// POST   /api/classes
// PUT    /api/classes/:id
// DELETE /api/classes/:id
//
// POST   /api/classes/:id/schedules
// PUT    /api/classes/:id/schedules/:scheduleId
// DELETE /api/classes/:id/schedules/:scheduleId
//
// ============================================================

// ============================================================
// CONSTANT
// ============================================================

const DEFAULT_CATEGORY = "Giáo lý Thiếu Nhi";

const VALID_CLASS_STATUS = ["active", "completed", "cancelled"];

// ============================================================
// VALIDATE ACADEMIC YEAR
// ============================================================

const validateAcademicYear = (academicYear) => {
  if (!academicYear) {
    return "Năm học là bắt buộc.";
  }

  const value = String(academicYear).trim();

  if (!/^\d{4}-\d{4}$/.test(value)) {
    return "Năm học không hợp lệ. Ví dụ: 2026-2027.";
  }

  const [startYear, endYear] = value.split("-").map(Number);

  if (endYear !== startYear + 1) {
    return (
      "Năm học không hợp lệ. " + "Năm kết thúc phải lớn hơn năm bắt đầu 1 năm."
    );
  }

  return null;
};

// ============================================================
// NORMALIZE ACADEMIC YEAR
// ============================================================

const normalizeAcademicYear = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();

  const error = validateAcademicYear(normalized);

  if (error) {
    return null;
  }

  return normalized;
};

// ============================================================
// VALIDATE LEVEL ORDER
// ============================================================

const validateLevelOrder = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const levelOrder = Number(value);

  if (!Number.isInteger(levelOrder) || levelOrder < 1) {
    return "level_order phải là số nguyên lớn hơn hoặc bằng 1.";
  }

  return null;
};

// ============================================================
// NORMALIZE LEVEL ORDER
// ============================================================

const normalizeLevelOrder = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const levelOrder = Number(value);

  if (!Number.isInteger(levelOrder) || levelOrder < 1) {
    return null;
  }

  return levelOrder;
};

// ============================================================
// VALIDATE SCHEDULE
// ============================================================

const validateSchedule = (schedule) => {
  const { day_of_week, start_time, end_time } = schedule || {};

  const day = Number(day_of_week);

  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return "Thứ trong tuần không hợp lệ. " + "Giá trị phải từ 1 đến 7.";
  }

  if (!start_time || !end_time) {
    return "Giờ bắt đầu và giờ kết thúc " + "là bắt buộc.";
  }

  if (String(start_time) >= String(end_time)) {
    return "Giờ kết thúc phải lớn hơn giờ bắt đầu.";
  }

  return null;
};

// ============================================================
// FORMAT SCHEDULE
// ============================================================

const formatSchedule = (item) => ({
  id: Number(item.id),

  class_id: Number(item.class_id),

  day_of_week: Number(item.day_of_week),

  start_time: item.start_time,

  end_time: item.end_time,

  room: item.room || null,

  created_at: item.created_at,

  updated_at: item.updated_at,
});

// ============================================================
// GET SCHEDULES BY CLASS IDS
// ============================================================

const getSchedulesByClassIds = async (classIds, connection = db) => {
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
          class_id,
          day_of_week,
          start_time,
          end_time,
          room,
          created_at,
          updated_at

        FROM class_schedules

        WHERE class_id IN (${placeholders})

        ORDER BY
          class_id ASC,
          day_of_week ASC,
          start_time ASC,
          id ASC
      `,
    ids,
  );

  return rows.map(formatSchedule);
};

// ============================================================
// GET CLASS BASE DATA
// ============================================================

const getClassByIdInternal = async (classId, churchId, connection = db) => {
  const [rows] = await connection.query(
    `
        SELECT
          c.id,
          c.church_id,
          c.name,
          c.code,
          c.academic_year,
          c.category,
          c.level_order,
          c.catechist_id,
          c.description,
          c.start_date,
          c.end_date,
          c.status,
          c.created_at,
          c.updated_at,

          (
            SELECT COUNT(*)
            FROM class_students cs
            WHERE cs.class_id = c.id
              AND cs.status = 'studying'
          ) AS studentsCount

        FROM classes c

        WHERE c.id = ?
          AND c.church_id = ?

        LIMIT 1
      `,
    [classId, churchId],
  );

  if (!rows.length) {
    return null;
  }

  return rows[0];
};

// ============================================================
// GET CLASS CATECHISTS
// ============================================================

const getClassCatechists = async (classId, churchId, connection = db) => {
  const [rows] = await connection.query(
    `
        SELECT
          cc.id AS assignment_id,

          cc.catechist_id,
          cc.class_id,

          cc.role,
          cc.assigned_date,
          cc.notes,

          ct.catechist_code,
          ct.holy_name,
          ct.full_name,
          ct.gender,
          ct.phone,
          ct.email,
          ct.level,
          ct.status

        FROM catechist_classes cc

        INNER JOIN catechists ct
          ON ct.id = cc.catechist_id
         AND ct.church_id = ?

        WHERE cc.class_id = ?

        ORDER BY
          cc.role ASC,
          ct.full_name ASC
      `,
    [churchId, classId],
  );

  return rows;
};

// ============================================================
// GET CLASS DETAIL
// ============================================================

const getFullClassData = async (classId, churchId, connection = db) => {
  const classData = await getClassByIdInternal(classId, churchId, connection);

  if (!classData) {
    return null;
  }

  const catechists = await getClassCatechists(classId, churchId, connection);

  const schedules = await getSchedulesByClassIds([classId], connection);

  return {
    ...classData,

    id: Number(classData.id),

    church_id: Number(classData.church_id),

    catechist_id: classData.catechist_id
      ? Number(classData.catechist_id)
      : null,

    level_order:
      classData.level_order !== null && classData.level_order !== undefined
        ? Number(classData.level_order)
        : null,

    studentsCount: Number(classData.studentsCount || 0),

    catechists,

    schedules,
  };
};

// ============================================================
// 1. GET CLASSES
// ============================================================
//
// GET /api/classes
//
// ============================================================

exports.getClasses = async (req, res) => {
  console.log("");
  console.log("============================================================");
  console.log("                    GET CLASSES");
  console.log("============================================================");

  try {
    const churchId = getChurchId(req);

    console.log("CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
        code: "CHURCH_ID_REQUIRED",
      });
    }

    const [rows] = await db.query(
      `
          SELECT
            c.id,
            c.church_id,
            c.name,
            c.code,
            c.academic_year,
            c.category,
            c.level_order,
            c.catechist_id,
            c.description,
            c.start_date,
            c.end_date,
            c.status,
            c.created_at,
            c.updated_at,

            (
              SELECT COUNT(*)
              FROM class_students cs
              WHERE cs.class_id = c.id
                AND cs.status = 'studying'
            ) AS studentsCount

          FROM classes c

          WHERE c.church_id = ?

          ORDER BY
            c.academic_year DESC,
            c.level_order ASC,
            c.name ASC,
            c.id ASC
        `,
      [churchId],
    );

    const classIds = rows.map((item) => Number(item.id));

    const schedules = await getSchedulesByClassIds(classIds);

    const schedulesMap = {};

    for (const schedule of schedules) {
      const classId = Number(schedule.class_id);

      if (!schedulesMap[classId]) {
        schedulesMap[classId] = [];
      }

      schedulesMap[classId].push(schedule);
    }

    // ========================================================
    // LOAD CATECHISTS
    // ========================================================

    let catechists = [];

    if (classIds.length > 0) {
      const placeholders = classIds.map(() => "?").join(",");

      const [catechistRows] = await db.query(
        `
            SELECT
              cc.id AS assignment_id,
              cc.class_id,
              cc.catechist_id,
              cc.role,
              cc.assigned_date,
              cc.notes,

              ct.catechist_code,
              ct.holy_name,
              ct.full_name

            FROM catechist_classes cc

            INNER JOIN catechists ct
              ON ct.id = cc.catechist_id
             AND ct.church_id = ?

            WHERE cc.class_id IN (${placeholders})

            ORDER BY
              cc.class_id ASC,
              cc.role ASC,
              ct.full_name ASC
          `,
        [churchId, ...classIds],
      );

      catechists = catechistRows;
    }

    const catechistMap = {};

    for (const item of catechists) {
      const classId = Number(item.class_id);

      if (!catechistMap[classId]) {
        catechistMap[classId] = [];
      }

      catechistMap[classId].push({
        id: Number(item.catechist_id),

        assignment_id: Number(item.assignment_id),

        code: item.catechist_code || null,

        holy_name: item.holy_name || null,

        full_name: item.full_name || null,

        role: item.role || null,

        assigned_date: item.assigned_date || null,

        notes: item.notes || null,
      });
    }

    const data = rows.map((item) => ({
      id: Number(item.id),

      church_id: Number(item.church_id),

      name: item.name,

      code: item.code,

      academic_year: item.academic_year || null,

      category: item.category || DEFAULT_CATEGORY,

      level_order:
        item.level_order !== null && item.level_order !== undefined
          ? Number(item.level_order)
          : null,

      catechist_id: item.catechist_id ? Number(item.catechist_id) : null,

      description: item.description || null,

      start_date: item.start_date || null,

      end_date: item.end_date || null,

      status: item.status || "active",

      created_at: item.created_at,

      updated_at: item.updated_at,

      studentsCount: Number(item.studentsCount || 0),

      catechists: catechistMap[Number(item.id)] || [],

      schedules: schedulesMap[Number(item.id)] || [],
    }));

    console.log("CLASS COUNT:", data.length);

    console.log("SCHEDULE COUNT:", schedules.length);

    return res.status(200).json({
      success: true,

      church_id: Number(churchId),

      data,
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("                 GET CLASSES ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lớp học.",
      error: error.message,
    });
  }
};

// ============================================================
// 2. GET CLASS BY ID
// ============================================================
//
// GET /api/classes/:id
//
// ============================================================

exports.getClassById = async (req, res) => {
  try {
    const classId = Number(req.params.id);

    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ.",
      });
    }

    const data = await getFullClassData(classId, churchId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn.",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getClassById error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin lớp học.",
      error: error.message,
    });
  }
};

// ============================================================
// 3. GET CLASSES BY TEACHER
// ============================================================
//
// GET /api/classes/teacher-class
//
// ============================================================

exports.getClassesByTeacherId = async (req, res) => {
  try {
    const username = req.user?.username;

    const churchId = getChurchId(req);

    if (!username) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được mã giáo lý viên.",
      });
    }

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    const [catechistRows] = await db.query(
      `
        SELECT
          id,
          catechist_code,
          full_name,
          holy_name

        FROM catechists

        WHERE catechist_code = ?
          AND church_id = ?

        LIMIT 1
      `,
      [username, churchId],
    );

    if (!catechistRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo lý viên tương ứng với tài khoản.",
      });
    }

    const catechist = catechistRows[0];

    const [rows] = await db.query(
      `
        SELECT
          c.*,

          (
            SELECT COUNT(*)
            FROM class_students cs
            WHERE cs.class_id = c.id
              AND cs.status = 'studying'
          ) AS studentsCount,

          cc.id AS assignment_id,
          cc.role AS catechist_role,
          cc.assigned_date,
          cc.notes

        FROM classes c

        INNER JOIN catechist_classes cc
          ON cc.class_id = c.id
         AND cc.catechist_id = ?

        WHERE c.church_id = ?

        ORDER BY
          c.academic_year DESC,
          c.level_order ASC,
          c.name ASC
      `,
      [catechist.id, churchId],
    );

    const classIds = rows.map((item) => Number(item.id));

    const schedules = await getSchedulesByClassIds(classIds);

    const schedulesMap = {};

    for (const schedule of schedules) {
      const classId = Number(schedule.class_id);

      if (!schedulesMap[classId]) {
        schedulesMap[classId] = [];
      }

      schedulesMap[classId].push(schedule);
    }

    return res.status(200).json({
      success: true,

      catechist: {
        id: Number(catechist.id),

        catechist_code: catechist.catechist_code,

        full_name: catechist.full_name,

        holy_name: catechist.holy_name,
      },

      data: rows.map((item) => ({
        ...item,

        id: Number(item.id),

        church_id: Number(item.church_id),

        catechist_id: item.catechist_id ? Number(item.catechist_id) : null,

        level_order:
          item.level_order !== null && item.level_order !== undefined
            ? Number(item.level_order)
            : null,

        studentsCount: Number(item.studentsCount || 0),

        schedules: schedulesMap[Number(item.id)] || [],
      })),
    });
  } catch (error) {
    console.error("getClassesByTeacherId error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lớp của giáo lý viên.",
      error: error.message,
    });
  }
};

// ============================================================
// 4. GET ALL CLASS SCHEDULES
// ============================================================
//
// GET /api/classes/schedules
//
// ============================================================

exports.getClassSchedules = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          cs.id,
          cs.class_id,

          c.church_id,
          c.name AS class_name,
          c.code AS class_code,
          c.academic_year,
          c.category AS class_category,
          c.level_order,
          c.status AS class_status,

          cs.day_of_week,
          cs.start_time,
          cs.end_time,
          cs.room,

          cs.created_at,
          cs.updated_at

        FROM class_schedules cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE c.church_id = ?

        ORDER BY
          c.academic_year DESC,
          cs.day_of_week ASC,
          cs.start_time ASC,
          c.name ASC
      `,
      [churchId],
    );

    return res.status(200).json({
      success: true,

      church_id: Number(churchId),

      data: rows.map((item) => ({
        id: Number(item.id),

        class_id: Number(item.class_id),

        church_id: Number(item.church_id),

        class_name: item.class_name,

        class_code: item.class_code,

        academic_year: item.academic_year || null,

        class_category: item.class_category || DEFAULT_CATEGORY,

        level_order:
          item.level_order !== null && item.level_order !== undefined
            ? Number(item.level_order)
            : null,

        class_status: item.class_status,

        day_of_week: Number(item.day_of_week),

        start_time: item.start_time,

        end_time: item.end_time,

        room: item.room || null,

        created_at: item.created_at,

        updated_at: item.updated_at,
      })),
    });
  } catch (error) {
    console.error("getClassSchedules error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy lịch học.",
      error: error.message,
    });
  }
};

// ============================================================
// GENERATE CLASS CODE
// ============================================================

const generateClassCode = async (
  connection,
  churchId,
  academicYear,
  category,
) => {
  let prefix = "GL";

  switch (category) {
    case "Giáo lý Hôn Nhân":
      prefix = "GLHN";
      break;

    case "Giáo lý Dự Tòng":
      prefix = "GLDT";
      break;

    case "Giáo lý Tân Tòng":
      prefix = "GLTT";
      break;

    case "Giáo lý Thiếu Nhi":
      prefix = "GLTN";
      break;

    case "Giáo lý Thêm Sức":
      prefix = "GLTS";
      break;

    default:
      prefix = "GL";
  }

  for (let attempts = 0; attempts < 100; attempts++) {
    const randomNumber = Math.floor(Math.random() * 1000);

    const code = `${prefix}${String(randomNumber).padStart(3, "0")}`;

    const [existing] = await connection.query(
      `
        SELECT id

        FROM classes

        WHERE church_id = ?
          AND code = ?
          AND academic_year = ?

        LIMIT 1
      `,
      [churchId, code, academicYear],
    );

    if (!existing.length) {
      return code;
    }
  }

  throw new Error("Không thể tạo mã lớp học ngẫu nhiên.");
};

// ============================================================
// 5. CREATE CLASS
// ============================================================
//
// POST /api/classes
//
// BODY:
//
// {
//   name,
//   academic_year,
//   category,
//   level_order,
//   catechist_id,
//   description,
//   start_date,
//   end_date,
//   status,
//   schedules: []
// }
//
// ============================================================

exports.createClass = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    const {
      name,
      academic_year,
      category,
      level_order,
      catechist_id,
      description,
      start_date,
      end_date,
      status,
      schedules = [],
    } = req.body || {};

    console.log("");
    console.log("============================================================");
    console.log("                    CREATE CLASS");
    console.log("============================================================");

    console.log("CHURCH ID:", churchId);

    console.log("ADMIN ID:", adminId);

    console.log("NAME:", name);

    console.log("ACADEMIC YEAR:", academic_year);

    console.log("LEVEL ORDER:", level_order);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
        code: "CHURCH_ID_REQUIRED",
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên lớp là bắt buộc.",
      });
    }

    const normalizedYear = normalizeAcademicYear(academic_year);

    if (!normalizedYear) {
      return res.status(400).json({
        success: false,
        message: "Năm học không hợp lệ. Ví dụ: 2026-2027.",
      });
    }

    const levelError = validateLevelOrder(level_order);

    if (levelError) {
      return res.status(400).json({
        success: false,
        message: levelError,
      });
    }

    if (!Array.isArray(schedules)) {
      return res.status(400).json({
        success: false,
        message: "Danh sách lịch học không hợp lệ.",
      });
    }

    for (const schedule of schedules) {
      const error = validateSchedule(schedule);

      if (error) {
        return res.status(400).json({
          success: false,
          message: error,
        });
      }
    }

    const normalizedLevelOrder = normalizeLevelOrder(level_order);

    const normalizedCategory = category?.trim() || DEFAULT_CATEGORY;

    const normalizedStatus = status || "active";

    if (!VALID_CLASS_STATUS.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái lớp không hợp lệ.",
      });
    }

    await connection.beginTransaction();

    // ========================================================
    // GENERATE CODE
    // ========================================================

    const code = await generateClassCode(
      connection,
      churchId,
      normalizedYear,
      normalizedCategory,
    );

    // ========================================================
    // INSERT CLASS
    // ========================================================

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
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        churchId,
        name.trim(),
        code,
        normalizedYear,
        normalizedCategory,
        normalizedLevelOrder,
        catechist_id || null,
        description?.trim() || null,
        start_date || null,
        end_date || null,
        normalizedStatus,
      ],
    );

    const classId = Number(result.insertId);

    // ========================================================
    // INSERT SCHEDULES
    // ========================================================

    for (const schedule of schedules) {
      await connection.execute(
        `
          INSERT INTO class_schedules (
            class_id,
            day_of_week,
            start_time,
            end_time,
            room
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          classId,
          Number(schedule.day_of_week),
          schedule.start_time,
          schedule.end_time,
          schedule.room?.trim() || null,
        ],
      );
    }

    await connection.commit();

    // ========================================================
    // LOG
    // ========================================================

    await writeLog({
      admin_id: adminId,

      action: "CREATE_CLASS",

      target_type: "classes",

      target_id: classId,

      description:
        `Tạo lớp "${name.trim()}" ` +
        `(${code}), năm học ` +
        `${normalizedYear}, ` +
        `level_order=${normalizedLevelOrder ?? "NULL"}.`,

      ip_address: req.ip,
    });

    return res.status(201).json({
      success: true,

      message: "Tạo lớp học thành công.",

      data: {
        id: classId,

        church_id: Number(churchId),

        name: name.trim(),

        code,

        academic_year: normalizedYear,

        category: normalizedCategory,

        level_order: normalizedLevelOrder,

        catechist_id: catechist_id ? Number(catechist_id) : null,

        description: description?.trim() || null,

        start_date: start_date || null,

        end_date: end_date || null,

        status: normalizedStatus,

        schedules: schedules.map((item) => ({
          day_of_week: Number(item.day_of_week),
          start_time: item.start_time,
          end_time: item.end_time,
          room: item.room?.trim() || null,
        })),
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("                 CREATE CLASS ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL MESSAGE:", error.sqlMessage);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Mã lớp đã tồn tại trong năm học này.",
        code: "CLASS_CODE_DUPLICATE",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể tạo lớp học.",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// ============================================================
// 6. UPDATE CLASS
// ============================================================
//
// PUT /api/classes/:id
//
// ============================================================

exports.updateClass = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const classId = Number(req.params.id);

    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    const {
      name,
      academic_year,
      category,
      level_order,
      catechist_id,
      description,
      start_date,
      end_date,
      status,
      schedules,
    } = req.body || {};

    console.log("");
    console.log("============================================================");
    console.log("                    UPDATE CLASS");
    console.log("============================================================");

    console.log("CLASS ID:", classId);

    console.log("CHURCH ID:", churchId);

    console.log("ADMIN ID:", adminId);

    console.log("LEVEL ORDER:", level_order);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ.",
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên lớp là bắt buộc.",
      });
    }

    const normalizedYear = normalizeAcademicYear(academic_year);

    if (!normalizedYear) {
      return res.status(400).json({
        success: false,
        message: "Năm học không hợp lệ. Ví dụ: 2026-2027.",
      });
    }

    const levelError = validateLevelOrder(level_order);

    if (levelError) {
      return res.status(400).json({
        success: false,
        message: levelError,
      });
    }

    if (schedules !== undefined && !Array.isArray(schedules)) {
      return res.status(400).json({
        success: false,
        message: "Danh sách lịch học không hợp lệ.",
      });
    }

    if (Array.isArray(schedules)) {
      for (const schedule of schedules) {
        const error = validateSchedule(schedule);

        if (error) {
          return res.status(400).json({
            success: false,
            message: error,
          });
        }
      }
    }

    const normalizedCategory = category?.trim() || DEFAULT_CATEGORY;

    const normalizedLevelOrder = normalizeLevelOrder(level_order);

    const normalizedStatus = status || "active";

    if (!VALID_CLASS_STATUS.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái lớp không hợp lệ.",
      });
    }

    // ========================================================
    // LOAD OLD CLASS
    // ========================================================

    const oldClass = await getClassByIdInternal(classId, churchId, connection);

    if (!oldClass) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn.",
      });
    }

    await connection.beginTransaction();

    // ========================================================
    // UPDATE CLASS
    // ========================================================

    await connection.execute(
      `
        UPDATE classes

        SET
          name = ?,
          academic_year = ?,
          category = ?,
          level_order = ?,
          catechist_id = ?,
          description = ?,
          start_date = ?,
          end_date = ?,
          status = ?

        WHERE id = ?
          AND church_id = ?
      `,
      [
        name.trim(),
        normalizedYear,
        normalizedCategory,
        normalizedLevelOrder,
        catechist_id || null,
        description?.trim() || null,
        start_date || null,
        end_date || null,
        normalizedStatus,
        classId,
        churchId,
      ],
    );

    // ========================================================
    // UPDATE SCHEDULES
    // ========================================================
    //
    // Chỉ thay toàn bộ schedules nếu FE gửi schedules.
    //
    // Nếu không gửi:
    // → giữ nguyên lịch cũ.
    //
    // ========================================================

    if (Array.isArray(schedules)) {
      await connection.execute(
        `
          DELETE FROM class_schedules
          WHERE class_id = ?
        `,
        [classId],
      );

      for (const schedule of schedules) {
        await connection.execute(
          `
            INSERT INTO class_schedules (
              class_id,
              day_of_week,
              start_time,
              end_time,
              room
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            classId,
            Number(schedule.day_of_week),
            schedule.start_time,
            schedule.end_time,
            schedule.room?.trim() || null,
          ],
        );
      }
    }

    await connection.commit();

    // ========================================================
    // LOG
    // ========================================================

    await writeLog({
      admin_id: adminId,

      action: "UPDATE_CLASS",

      target_type: "classes",

      target_id: classId,

      description:
        `Cập nhật lớp "${name.trim()}" ` +
        `(${oldClass.code}), ` +
        `năm học ${normalizedYear}, ` +
        `level_order=${normalizedLevelOrder ?? "NULL"}.`,

      ip_address: req.ip,
    });

    const data = await getFullClassData(classId, churchId);

    return res.status(200).json({
      success: true,

      message: "Cập nhật lớp học thành công.",

      data,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("                 UPDATE CLASS ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL MESSAGE:", error.sqlMessage);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Mã lớp đã tồn tại trong năm học này.",
        code: "CLASS_DUPLICATE",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật lớp học.",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// ============================================================
// 7. DELETE CLASS
// ============================================================
//
// DELETE /api/classes/:id
//
// ============================================================

exports.deleteClass = async (req, res) => {
  try {
    const classId = Number(req.params.id);

    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ.",
      });
    }

    const classData = await getClassByIdInternal(classId, churchId);

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn.",
      });
    }

    // ========================================================
    // KIỂM TRA HỌC SINH
    // ========================================================

    const [studentRows] = await db.query(
      `
        SELECT COUNT(*) AS total
        FROM class_students
        WHERE class_id = ?
      `,
      [classId],
    );

    const studentCount = Number(studentRows[0]?.total || 0);

    if (studentCount > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Không thể xóa lớp vì lớp đã có dữ liệu học sinh. Hãy xử lý dữ liệu lớp trước.",
        code: "CLASS_HAS_STUDENTS",
        student_count: studentCount,
      });
    }

    const [result] = await db.query(
      `
        DELETE FROM classes

        WHERE id = ?
          AND church_id = ?
      `,
      [classId, churchId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không thể xóa lớp học.",
      });
    }

    await writeLog({
      admin_id: adminId,

      action: "DELETE_CLASS",

      target_type: "classes",

      target_id: classId,

      description:
        `Xóa lớp "${classData.name}" ` +
        `(${classData.code}), ` +
        `năm học ${classData.academic_year || "—"}.`,

      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,

      message: `Đã xóa lớp "${classData.name}".`,

      data: {
        id: Number(classData.id),

        name: classData.name,

        code: classData.code,

        academic_year: classData.academic_year || null,

        category: classData.category || null,

        level_order:
          classData.level_order !== null && classData.level_order !== undefined
            ? Number(classData.level_order)
            : null,
      },
    });
  } catch (error) {
    console.error("deleteClass error:", error);

    if (
      error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_ROW_IS_REFERENCED"
    ) {
      return res.status(409).json({
        success: false,
        message: "Không thể xóa lớp vì đang có dữ liệu liên quan.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể xóa lớp học.",
      error: error.message,
    });
  }
};

// ============================================================
// 8. CREATE CLASS SCHEDULE
// ============================================================
//
// POST /api/classes/:id/schedules
//
// ============================================================

exports.createClassSchedule = async (req, res) => {
  try {
    const classId = Number(req.params.id);

    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    const { day_of_week, start_time, end_time, room } = req.body || {};

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ.",
      });
    }

    const scheduleError = validateSchedule({
      day_of_week,
      start_time,
      end_time,
    });

    if (scheduleError) {
      return res.status(400).json({
        success: false,
        message: scheduleError,
      });
    }

    const classData = await getClassByIdInternal(classId, churchId);

    if (!classData) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ.",
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO class_schedules (
          class_id,
          day_of_week,
          start_time,
          end_time,
          room
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        classId,
        Number(day_of_week),
        start_time,
        end_time,
        room?.trim() || null,
      ],
    );

    await writeLog({
      admin_id: adminId,

      action: "CREATE_CLASS_SCHEDULE",

      target_type: "class_schedules",

      target_id: result.insertId,

      description:
        `Thêm lịch học cho lớp ` +
        `"${classData.name}" ` +
        `(${classData.code}), ` +
        `năm học ${classData.academic_year || "—"}.`,

      ip_address: req.ip,
    });

    return res.status(201).json({
      success: true,

      message: "Thêm lịch học thành công.",

      data: {
        id: Number(result.insertId),

        class_id: classId,

        day_of_week: Number(day_of_week),

        start_time,

        end_time,

        room: room?.trim() || null,
      },
    });
  } catch (error) {
    console.error("createClassSchedule error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể thêm lịch học.",
      error: error.message,
    });
  }
};

// ============================================================
// 9. UPDATE CLASS SCHEDULE
// ============================================================
//
// PUT /api/classes/:id/schedules/:scheduleId
//
// ============================================================

exports.updateClassSchedule = async (req, res) => {
  try {
    const classId = Number(req.params.id);

    const scheduleId = Number(req.params.scheduleId);

    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    const { day_of_week, start_time, end_time, room } = req.body || {};

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    if (
      !Number.isInteger(classId) ||
      classId <= 0 ||
      !Number.isInteger(scheduleId) ||
      scheduleId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "ID lớp hoặc lịch học không hợp lệ.",
      });
    }

    const scheduleError = validateSchedule({
      day_of_week,
      start_time,
      end_time,
    });

    if (scheduleError) {
      return res.status(400).json({
        success: false,
        message: scheduleError,
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.day_of_week,
          cs.start_time,
          cs.end_time,
          cs.room,

          c.name AS class_name,
          c.code AS class_code,
          c.academic_year

        FROM class_schedules cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.id = ?
          AND cs.class_id = ?
          AND c.church_id = ?

        LIMIT 1
      `,
      [scheduleId, classId, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch học trong lớp.",
      });
    }

    await db.query(
      `
        UPDATE class_schedules

        SET
          day_of_week = ?,
          start_time = ?,
          end_time = ?,
          room = ?

        WHERE id = ?
          AND class_id = ?
      `,
      [
        Number(day_of_week),
        start_time,
        end_time,
        room?.trim() || null,
        scheduleId,
        classId,
      ],
    );

    await writeLog({
      admin_id: adminId,

      action: "UPDATE_CLASS_SCHEDULE",

      target_type: "class_schedules",

      target_id: scheduleId,

      description:
        `Cập nhật lịch học ` +
        `của lớp "${rows[0].class_name}" ` +
        `(${rows[0].class_code}), ` +
        `năm học ${rows[0].academic_year || "—"}.`,

      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,

      message: "Cập nhật lịch học thành công.",

      data: {
        id: scheduleId,

        class_id: classId,

        day_of_week: Number(day_of_week),

        start_time,

        end_time,

        room: room?.trim() || null,
      },
    });
  } catch (error) {
    console.error("updateClassSchedule error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật lịch học.",
      error: error.message,
    });
  }
};

// ============================================================
// 10. DELETE CLASS SCHEDULE
// ============================================================
//
// DELETE /api/classes/:id/schedules/:scheduleId
//
// ============================================================

exports.deleteClassSchedule = async (req, res) => {
  try {
    const classId = Number(req.params.id);

    const scheduleId = Number(req.params.scheduleId);

    const churchId = getChurchId(req);

    const adminId = getAdminId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ.",
      });
    }

    if (
      !Number.isInteger(classId) ||
      classId <= 0 ||
      !Number.isInteger(scheduleId) ||
      scheduleId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "ID lớp hoặc lịch học không hợp lệ.",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          cs.id,
          cs.class_id,
          cs.day_of_week,
          cs.start_time,
          cs.end_time,
          cs.room,

          c.name AS class_name,
          c.code AS class_code,
          c.academic_year

        FROM class_schedules cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.id = ?
          AND cs.class_id = ?
          AND c.church_id = ?

        LIMIT 1
      `,
      [scheduleId, classId, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch học trong lớp.",
      });
    }

    await db.query(
      `
        DELETE FROM class_schedules

        WHERE id = ?
          AND class_id = ?
      `,
      [scheduleId, classId],
    );

    await writeLog({
      admin_id: adminId,

      action: "DELETE_CLASS_SCHEDULE",

      target_type: "class_schedules",

      target_id: scheduleId,

      description:
        `Xóa lịch học của lớp ` +
        `"${rows[0].class_name}" ` +
        `(${rows[0].class_code}), ` +
        `năm học ${rows[0].academic_year || "—"}.`,

      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,

      message: "Đã xóa lịch học.",

      data: {
        id: Number(rows[0].id),

        class_id: Number(rows[0].class_id),
      },
    });
  } catch (error) {
    console.error("deleteClassSchedule error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa lịch học.",
      error: error.message,
    });
  }
};

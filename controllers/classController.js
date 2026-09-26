const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");

// =========================================================
// HELPER
// =========================================================

const getChurchId = (req) => {
  return req.user?.church_id;
};

const validateSchedule = (schedule) => {
  const { day_of_week, start_time, end_time } = schedule || {};

  const day = Number(day_of_week);

  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return "Thứ trong tuần không hợp lệ. Giá trị phải từ 1 đến 7.";
  }

  if (!start_time || !end_time) {
    return "Giờ bắt đầu và giờ kết thúc là bắt buộc.";
  }

  if (start_time >= end_time) {
    return "Giờ kết thúc phải lớn hơn giờ bắt đầu.";
  }

  return null;
};

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

const getSchedulesByClassIds = async (classIds) => {
  if (!classIds.length) {
    return [];
  }

  const placeholders = classIds.map(() => "?").join(",");

  const [rows] = await db.query(
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
      start_time ASC
    `,
    classIds,
  );

  return rows.map(formatSchedule);
};

// =========================================================
// LẤY DANH SÁCH LỚP
// GET /api/classes
// =========================================================

exports.getClasses = async (req, res) => {
  console.log("🔥 CALL API GET CLASSES");

  try {
    const church_id = getChurchId(req);

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // 1. LẤY DANH SÁCH LỚP
    // =====================================================

    const sql = `
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
        c.created_at,
        c.updated_at,

        (
          SELECT COUNT(*)
          FROM class_students cs
          WHERE cs.class_id = c.id
            AND cs.status = 'studying'
        ) AS studentsCount,

        GROUP_CONCAT(
          DISTINCT ct.id
          ORDER BY ct.full_name
          SEPARATOR ','
        ) AS catechist_ids,

        GROUP_CONCAT(
          DISTINCT ct.catechist_code
          ORDER BY ct.full_name
          SEPARATOR ', '
        ) AS catechist_codes,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            IFNULL(ct.holy_name, ''),
            CASE
              WHEN ct.holy_name IS NOT NULL
                AND ct.holy_name != ''
              THEN ' '
              ELSE ''
            END,
            ct.full_name
          )
          ORDER BY ct.full_name
          SEPARATOR ', '
        ) AS catechist_names,

        GROUP_CONCAT(
          DISTINCT cc.role
          ORDER BY ct.full_name
          SEPARATOR ', '
        ) AS catechist_roles,

        GROUP_CONCAT(
          DISTINCT DATE_FORMAT(
            cc.assigned_date,
            '%Y-%m-%d'
          )
          ORDER BY ct.full_name
          SEPARATOR ', '
        ) AS assigned_dates

      FROM classes c

      LEFT JOIN catechist_classes cc
        ON cc.class_id = c.id

      LEFT JOIN catechists ct
        ON ct.id = cc.catechist_id
        AND ct.church_id = c.church_id

      WHERE c.church_id = ?

      GROUP BY
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
        c.created_at,
        c.updated_at

      ORDER BY c.created_at DESC
    `;

    const [rows] = await db.query(sql, [church_id]);

    // =====================================================
    // 2. LẤY SCHEDULE CỦA TOÀN BỘ LỚP
    // =====================================================

    const classIds = rows.map((item) => Number(item.id));

    const schedules = await getSchedulesByClassIds(classIds);

    // =====================================================
    // 3. MAP SCHEDULE THEO CLASS ID
    // =====================================================

    const schedulesMap = {};

    for (const schedule of schedules) {
      if (!schedulesMap[schedule.class_id]) {
        schedulesMap[schedule.class_id] = [];
      }

      schedulesMap[schedule.class_id].push(schedule);
    }

    // =====================================================
    // 4. FORMAT DATA
    // =====================================================

    const formattedRows = rows.map((item) => {
      const catechistIds = item.catechist_ids
        ? item.catechist_ids.split(",")
        : [];

      const catechistCodes = item.catechist_codes
        ? item.catechist_codes.split(", ")
        : [];

      const catechistNames = item.catechist_names
        ? item.catechist_names.split(", ")
        : [];

      const catechistRoles = item.catechist_roles
        ? item.catechist_roles.split(", ")
        : [];

      const assignedDates = item.assigned_dates
        ? item.assigned_dates.split(", ")
        : [];

      const catechists = catechistIds.map((catechistId, index) => ({
        id: Number(catechistId),
        code: catechistCodes[index] || null,
        full_name: catechistNames[index] || null,
        role: catechistRoles[index] || null,
        assigned_date: assignedDates[index] || null,
      }));

      return {
        id: Number(item.id),
        church_id: Number(item.church_id),
        name: item.name,
        code: item.code,
        category: item.category,
        catechist_id: item.catechist_id ? Number(item.catechist_id) : null,
        description: item.description,
        start_date: item.start_date,
        end_date: item.end_date,
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,

        studentsCount: Number(item.studentsCount || 0),

        catechists,

        schedules: schedulesMap[Number(item.id)] || [],
      };
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      church_id: Number(church_id),
      data: formattedRows,
    });
  } catch (error) {
    console.error("❌ getClasses error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lớp học",
      error: error.message,
    });
  }
};

// =========================================================
// CHI TIẾT LỚP
// GET /api/classes/:id
// =========================================================

exports.getClassById = async (req, res) => {
  try {
    const { id } = req.params;

    const classId = Number(id);
    const church_id = getChurchId(req);

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ",
      });
    }

    // =====================================================
    // 1. THÔNG TIN LỚP
    // =====================================================

    const classSql = `
      SELECT
        c.*,

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
    `;

    const [classRows] = await db.query(classSql, [classId, church_id]);

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn",
      });
    }

    const classData = classRows[0];

    // =====================================================
    // 2. GIÁO LÝ VIÊN
    // =====================================================

    const catechistSql = `
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

      WHERE cc.class_id = ?
        AND ct.church_id = ?

      ORDER BY
        cc.role ASC,
        ct.full_name ASC
    `;

    const [catechists] = await db.query(catechistSql, [classId, church_id]);

    // =====================================================
    // 3. LỊCH HỌC
    // =====================================================

    const scheduleSql = `
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

      WHERE class_id = ?

      ORDER BY
        day_of_week ASC,
        start_time ASC
    `;

    const [schedules] = await db.query(scheduleSql, [classId]);

    // =====================================================
    // 4. RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      data: {
        ...classData,

        id: Number(classData.id),
        church_id: Number(classData.church_id),

        catechist_id: classData.catechist_id
          ? Number(classData.catechist_id)
          : null,

        studentsCount: Number(classData.studentsCount || 0),

        catechists,

        schedules: schedules.map(formatSchedule),
      },
    });
  } catch (error) {
    console.error("❌ getClassById error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin lớp học",
      error: error.message,
    });
  }
};

// =========================================================
// LỚP CỦA GIÁO LÝ VIÊN ĐĂNG NHẬP
// GET /api/classes/teacher-class
// =========================================================

exports.getClassesByTeacherId = async (req, res) => {
  try {
    const username = req.user?.username;
    const church_id = getChurchId(req);

    if (!username) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được mã giáo lý viên",
      });
    }

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // 1. TÌM GIÁO LÝ VIÊN
    // =====================================================

    const catechistSql = `
      SELECT
        id,
        catechist_code,
        full_name,
        holy_name

      FROM catechists

      WHERE catechist_code = ?
        AND church_id = ?

      LIMIT 1
    `;

    const [catechistRows] = await db.query(catechistSql, [username, church_id]);

    if (!catechistRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo lý viên tương ứng với tài khoản",
      });
    }

    const catechist = catechistRows[0];

    const catechist_id = catechist.id;

    // =====================================================
    // 2. LẤY LỚP
    // =====================================================

    const classSql = `
      SELECT
        c.*,

        (
          SELECT COUNT(*)
          FROM class_students cs
          WHERE cs.class_id = c.id
            AND cs.status = 'studying'
        ) AS studentsCount,

        cc.id AS assignment_id,
        cc.catechist_id AS assigned_catechist_id,
        cc.role AS catechist_role,
        cc.assigned_date,
        cc.notes

      FROM classes c

      INNER JOIN catechist_classes cc
        ON cc.class_id = c.id
        AND cc.catechist_id = ?

      WHERE c.church_id = ?

      ORDER BY c.id DESC
    `;

    const [rows] = await db.query(classSql, [catechist_id, church_id]);

    // =====================================================
    // 3. LẤY SCHEDULE
    // =====================================================

    const classIds = rows.map((item) => Number(item.id));

    const schedules = await getSchedulesByClassIds(classIds);

    const schedulesMap = {};

    for (const schedule of schedules) {
      if (!schedulesMap[schedule.class_id]) {
        schedulesMap[schedule.class_id] = [];
      }

      schedulesMap[schedule.class_id].push(schedule);
    }

    // =====================================================
    // 4. RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      catechist: {
        id: catechist.id,
        catechist_code: catechist.catechist_code,
        full_name: catechist.full_name,
        holy_name: catechist.holy_name,
      },

      data: rows.map((item) => ({
        ...item,

        id: Number(item.id),
        church_id: Number(item.church_id),

        catechist_id: item.catechist_id ? Number(item.catechist_id) : null,

        studentsCount: Number(item.studentsCount || 0),

        schedules: schedulesMap[Number(item.id)] || [],
      })),
    });
  } catch (error) {
    console.error("❌ getClassesByTeacherId error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lớp của giáo lý viên",
      error: error.message,
    });
  }
};

// =========================================================
// LẤY TOÀN BỘ LỊCH HỌC CỦA GIÁO XỨ
//
// GET /api/classes/schedules
//
// Dùng cho trang:
// Thứ 2 | Thứ 3 | ... | Chủ nhật
// =========================================================

exports.getClassSchedules = async (req, res) => {
  try {
    const church_id = getChurchId(req);

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    const sql = `
      SELECT
        cs.id,
        cs.class_id,

        c.church_id,
        c.name AS class_name,
        c.code AS class_code,
        c.category AS class_category,
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
        cs.day_of_week ASC,
        cs.start_time ASC,
        c.name ASC
    `;

    const [rows] = await db.query(sql, [church_id]);

    return res.status(200).json({
      success: true,
      church_id: Number(church_id),

      data: rows.map((item) => ({
        id: Number(item.id),
        class_id: Number(item.class_id),

        church_id: Number(item.church_id),

        class_name: item.class_name,
        class_code: item.class_code,
        class_category: item.class_category,
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
    console.error("❌ getClassSchedules error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy lịch học",
      error: error.message,
    });
  }
};

// =========================================================
// TẠO LỚP
//
// POST /api/classes
//
// Body:
// {
//   name,
//   category,
//   catechist_id,
//   description,
//   start_date,
//   end_date,
//   status,
//   schedules: [
//     {
//       day_of_week,
//       start_time,
//       end_time,
//       room
//     }
//   ]
// }
// =========================================================

exports.createClass = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      name,
      category,
      catechist_id,
      description,
      start_date,
      end_date,
      status,
      schedules = [],
    } = req.body;

    const church_id = getChurchId(req);

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE
    // =====================================================

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên lớp là bắt buộc",
      });
    }

    if (!Array.isArray(schedules)) {
      return res.status(400).json({
        success: false,
        message: "Danh sách lịch học không hợp lệ",
      });
    }

    for (const schedule of schedules) {
      const scheduleError = validateSchedule(schedule);

      if (scheduleError) {
        return res.status(400).json({
          success: false,
          message: scheduleError,
        });
      }
    }

    // =====================================================
    // PREFIX
    // =====================================================

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

    // =====================================================
    // SINH CODE
    // =====================================================

    let code = null;
    let attempts = 0;

    while (attempts < 100) {
      const randomNumber = Math.floor(Math.random() * 1000);

      const randomCode = `${prefix}${String(randomNumber).padStart(3, "0")}`;

      const [existing] = await connection.query(
        `
        SELECT id
        FROM classes
        WHERE code = ?
        LIMIT 1
        `,
        [randomCode],
      );

      if (!existing.length) {
        code = randomCode;
        break;
      }

      attempts++;
    }

    if (!code) {
      return res.status(500).json({
        success: false,
        message: "Không thể tạo mã lớp học ngẫu nhiên",
      });
    }

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    // =====================================================
    // INSERT CLASS
    // =====================================================

    const [result] = await connection.query(
      `
      INSERT INTO classes (
        church_id,
        name,
        code,
        category,
        catechist_id,
        description,
        start_date,
        end_date,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        church_id,
        name.trim(),
        code,
        category || "Giáo lý Thiếu Nhi",
        catechist_id || null,
        description?.trim() || null,
        start_date || null,
        end_date || null,
        status || "active",
      ],
    );

    const classId = result.insertId;

    // =====================================================
    // INSERT SCHEDULE
    // =====================================================

    for (const schedule of schedules) {
      await connection.query(
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

    // =====================================================
    // ACTIVITY LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "CREATE_CLASS",

        target_type: "classes",

        target_id: classId,

        description: `Tạo lớp "${name.trim()}" (${code}), loại ${
          category || "Giáo lý Thiếu Nhi"
        }, thuộc giáo xứ #${church_id}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log createClass error:", logError);
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(201).json({
      success: true,
      message: "Tạo lớp học thành công",

      data: {
        id: classId,
        code,
        church_id: Number(church_id),

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
    } catch (rollbackError) {
      console.error("❌ Rollback createClass error:", rollbackError);
    }

    console.error("❌ createClass error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Mã lớp hoặc lịch học đã tồn tại",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể tạo lớp học",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// =========================================================
// CẬP NHẬT LỚP
//
// PUT /api/classes/:id
//
// schedules gửi lên là TOÀN BỘ lịch mới của lớp.
// =========================================================

exports.updateClass = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;

    const classId = Number(id);

    const {
      name,
      category,
      catechist_id,
      description,
      start_date,
      end_date,
      status,
      schedules,
    } = req.body;

    const church_id = getChurchId(req);

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ",
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên lớp là bắt buộc",
      });
    }

    if (schedules !== undefined && !Array.isArray(schedules)) {
      return res.status(400).json({
        success: false,
        message: "Danh sách lịch học không hợp lệ",
      });
    }

    if (Array.isArray(schedules)) {
      for (const schedule of schedules) {
        const scheduleError = validateSchedule(schedule);

        if (scheduleError) {
          return res.status(400).json({
            success: false,
            message: scheduleError,
          });
        }
      }
    }

    // =====================================================
    // KIỂM TRA LỚP
    // =====================================================

    const [classRows] = await connection.query(
      `
      SELECT
        id,
        code,
        name,
        category
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, church_id],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn",
      });
    }

    const oldClass = classRows[0];

    // =====================================================
    // TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    // =====================================================
    // UPDATE CLASS
    // =====================================================

    await connection.query(
      `
      UPDATE classes
      SET
        name = ?,
        category = ?,
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
        category || "Giáo lý Thiếu Nhi",
        catechist_id || null,
        description?.trim() || null,
        start_date || null,
        end_date || null,
        status || "active",
        classId,
        church_id,
      ],
    );

    // =====================================================
    // UPDATE SCHEDULE
    //
    // Nếu FE gửi schedules:
    // Xóa toàn bộ lịch cũ
    // rồi insert lại lịch mới.
    //
    // Nếu không gửi schedules:
    // Giữ nguyên lịch hiện tại.
    // =====================================================

    if (Array.isArray(schedules)) {
      await connection.query(
        `
        DELETE FROM class_schedules
        WHERE class_id = ?
        `,
        [classId],
      );

      for (const schedule of schedules) {
        await connection.query(
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

    // =====================================================
    // ACTIVITY LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "UPDATE_CLASS",

        target_type: "classes",

        target_id: classId,

        description:
          `Cập nhật lớp "${name.trim()}" (${oldClass.code}), ` +
          `thuộc giáo xứ #${church_id}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log updateClass error:", logError);
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      message: "Cập nhật lớp học thành công",

      data: {
        id: classId,
        code: oldClass.code,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("❌ Rollback updateClass error:", rollbackError);
    }

    console.error("❌ updateClass error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Lịch học bị trùng hoặc dữ liệu đã tồn tại",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật lớp học",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// =========================================================
// XÓA LỚP
//
// DELETE /api/classes/:id
// =========================================================

exports.deleteClass = async (req, res) => {
  try {
    const { id } = req.params;

    const classId = Number(id);
    const church_id = getChurchId(req);

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ",
      });
    }

    // =====================================================
    // KIỂM TRA LỚP
    // =====================================================

    const [classRows] = await db.query(
      `
      SELECT
        id,
        name,
        code,
        category,
        church_id
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [classId, church_id],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn",
      });
    }

    const classData = classRows[0];

    // =====================================================
    // XÓA LỚP
    //
    // class_schedules sẽ tự xóa nhờ ON DELETE CASCADE
    // =====================================================

    const [result] = await db.query(
      `
      DELETE FROM classes
      WHERE id = ?
        AND church_id = ?
      `,
      [classId, church_id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không thể xóa lớp học",
      });
    }

    // =====================================================
    // ACTIVITY LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "DELETE_CLASS",

        target_type: "classes",

        target_id: classId,

        description:
          `Xóa lớp "${classData.name}" (${classData.code}), ` +
          `loại ${classData.category || "—"}, ` +
          `thuộc giáo xứ #${church_id}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log deleteClass error:", logError);
    }

    return res.status(200).json({
      success: true,
      message: `Đã xóa lớp "${classData.name}"`,

      data: {
        id: classData.id,
        name: classData.name,
        code: classData.code,
        category: classData.category,
      },
    });
  } catch (error) {
    console.error("❌ deleteClass error:", error);

    if (
      error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_ROW_IS_REFERENCED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Không thể xóa lớp vì lớp đang có dữ liệu liên quan. Vui lòng xử lý dữ liệu liên quan trước.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể xóa lớp học",
      error: error.message,
    });
  }
};

// =========================================================
// THÊM LỊCH CHO LỚP
//
// POST /api/classes/:id/schedules
//
// Body:
// {
//   day_of_week: 2,
//   start_time: "19:00",
//   end_time: "20:30",
//   room: "Phòng 1"
// }
// =========================================================

exports.createClassSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    const classId = Number(id);
    const church_id = getChurchId(req);

    const { day_of_week, start_time, end_time, room } = req.body;

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp học không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE
    // =====================================================

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

    // =====================================================
    // KIỂM TRA LỚP
    // =====================================================

    const [classRows] = await db.query(
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
      [classId, church_id],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn",
      });
    }

    // =====================================================
    // INSERT
    // =====================================================

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

    // =====================================================
    // LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "CREATE_CLASS_SCHEDULE",

        target_type: "class_schedules",

        target_id: result.insertId,

        description:
          `Thêm lịch học cho lớp "${classRows[0].name}" ` +
          `(${classRows[0].code}), thuộc giáo xứ #${church_id}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log createClassSchedule error:", logError);
    }

    return res.status(201).json({
      success: true,
      message: "Thêm lịch học thành công",

      data: {
        id: result.insertId,
        class_id: classId,
        day_of_week: Number(day_of_week),
        start_time,
        end_time,
        room: room?.trim() || null,
      },
    });
  } catch (error) {
    console.error("❌ createClassSchedule error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Lịch học này đã tồn tại trong lớp",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể thêm lịch học",
      error: error.message,
    });
  }
};

// =========================================================
// SỬA LỊCH
//
// PUT /api/classes/:id/schedules/:scheduleId
// =========================================================

exports.updateClassSchedule = async (req, res) => {
  try {
    const { id, scheduleId } = req.params;

    const classId = Number(id);
    const schedule_id = Number(scheduleId);

    const church_id = getChurchId(req);

    const { day_of_week, start_time, end_time, room } = req.body;

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (
      !Number.isInteger(classId) ||
      classId <= 0 ||
      !Number.isInteger(schedule_id) ||
      schedule_id <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "ID lớp hoặc lịch học không hợp lệ",
      });
    }

    // =====================================================
    // VALIDATE
    // =====================================================

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

    // =====================================================
    // KIỂM TRA SCHEDULE THUỘC LỚP
    // VÀ LỚP THUỘC GIÁO XỨ
    // =====================================================

    const [scheduleRows] = await db.query(
      `
      SELECT
        cs.id,
        cs.class_id,
        c.name AS class_name,
        c.code AS class_code

      FROM class_schedules cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.id = ?
        AND cs.class_id = ?
        AND c.church_id = ?

      LIMIT 1
      `,
      [schedule_id, classId, church_id],
    );

    if (!scheduleRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch học trong lớp của bạn",
      });
    }

    // =====================================================
    // UPDATE
    // =====================================================

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
        schedule_id,
        classId,
      ],
    );

    // =====================================================
    // LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "UPDATE_CLASS_SCHEDULE",

        target_type: "class_schedules",

        target_id: schedule_id,

        description:
          `Cập nhật lịch học của lớp "${scheduleRows[0].class_name}" ` +
          `(${scheduleRows[0].class_code}), ` +
          `thuộc giáo xứ #${church_id}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log updateClassSchedule error:", logError);
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật lịch học thành công",

      data: {
        id: schedule_id,
        class_id: classId,
        day_of_week: Number(day_of_week),
        start_time,
        end_time,
        room: room?.trim() || null,
      },
    });
  } catch (error) {
    console.error("❌ updateClassSchedule error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Lịch học này đã tồn tại trong lớp",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật lịch học",
      error: error.message,
    });
  }
};

// =========================================================
// XÓA LỊCH
//
// DELETE /api/classes/:id/schedules/:scheduleId
// =========================================================

exports.deleteClassSchedule = async (req, res) => {
  try {
    const { id, scheduleId } = req.params;

    const classId = Number(id);
    const schedule_id = Number(scheduleId);

    const church_id = getChurchId(req);

    if (!church_id) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    if (
      !Number.isInteger(classId) ||
      classId <= 0 ||
      !Number.isInteger(schedule_id) ||
      schedule_id <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "ID lớp hoặc lịch học không hợp lệ",
      });
    }

    // =====================================================
    // KIỂM TRA
    // =====================================================

    const [scheduleRows] = await db.query(
      `
      SELECT
        cs.id,
        cs.class_id,
        cs.day_of_week,
        cs.start_time,
        cs.end_time,
        cs.room,

        c.name AS class_name,
        c.code AS class_code

      FROM class_schedules cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.id = ?
        AND cs.class_id = ?
        AND c.church_id = ?

      LIMIT 1
      `,
      [schedule_id, classId, church_id],
    );

    if (!scheduleRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lịch học trong lớp của bạn",
      });
    }

    const scheduleData = scheduleRows[0];

    // =====================================================
    // DELETE
    // =====================================================

    const [result] = await db.query(
      `
      DELETE FROM class_schedules

      WHERE id = ?
        AND class_id = ?
      `,
      [schedule_id, classId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không thể xóa lịch học",
      });
    }

    // =====================================================
    // LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "DELETE_CLASS_SCHEDULE",

        target_type: "class_schedules",

        target_id: schedule_id,

        description:
          `Xóa lịch học của lớp "${scheduleData.class_name}" ` +
          `(${scheduleData.class_code}), ` +
          `thuộc giáo xứ #${church_id}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ Activity log deleteClassSchedule error:", logError);
    }

    return res.status(200).json({
      success: true,
      message: "Đã xóa lịch học",

      data: {
        id: scheduleData.id,
        class_id: scheduleData.class_id,
      },
    });
  } catch (error) {
    console.error("❌ deleteClassSchedule error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa lịch học",
      error: error.message,
    });
  }
};

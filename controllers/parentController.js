const db = require("../config/db");

/**
 * =========================================================
 * HELPER
 * =========================================================
 */

const toInt = (value, defaultValue = null) => {
  const n = Number(value);

  if (!Number.isInteger(n)) {
    return defaultValue;
  }

  return n;
};

const getChurchId = (req) => {
  return req.user?.church_id || null;
};

const getParentId = (req) => {
  return req.user?.id || null;
};

const normalizeDate = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

/**
 * =========================================================
 * CHECK PARENT
 *
 * Parent account nằm trong admins
 * =========================================================
 */

const checkParentAccount = async (parentId, churchId) => {
  if (!parentId || !churchId) {
    return null;
  }

  const [rows] = await db.query(
    `
    SELECT
      id,
      church_id,
      username,
      full_name,
      phone,
      email,
      role,
      status
    FROM admins
    WHERE id = ?
      AND church_id = ?
    LIMIT 1
    `,
    [parentId, churchId],
  );

  return rows.length ? rows[0] : null;
};

/**
 * =========================================================
 * CHECK PARENT -> STUDENT
 *
 * Cực kỳ quan trọng:
 * phụ huynh chỉ được xem con đã được liên kết
 * =========================================================
 */

const checkParentStudent = async (parentId, studentId, churchId) => {
  if (!parentId || !studentId || !churchId) {
    return null;
  }

  const [rows] = await db.query(
    `
    SELECT
      ps.id AS parent_student_id,
      ps.parent_id,
      ps.student_id,
      ps.relationship,
      ps.is_primary,

      s.id,
      s.church_id,
      s.code,
      s.name,
      s.gender,
      s.date_of_birth,
      s.phone,
      s.email,
      s.address,
      s.parish,
      s.avatar,
      s.status

    FROM parent_students ps

    INNER JOIN admins a
      ON a.id = ps.parent_id

    INNER JOIN students s
      ON s.id = ps.student_id

    WHERE ps.parent_id = ?
      AND ps.student_id = ?
      AND a.church_id = ?
      AND s.church_id = ?

    LIMIT 1
    `,
    [parentId, studentId, churchId, churchId],
  );

  return rows.length ? rows[0] : null;
};

/**
 * =========================================================
 * GET /api/parent/me
 *
 * Thông tin tài khoản phụ huynh
 * =========================================================
 */

exports.getMe = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);

    console.log("");
    console.log("=================================================");
    console.log("PARENT - GET ME");
    console.log("=================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);

    if (!parentId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh không hợp lệ",
      });
    }

    const [children] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM parent_students ps

      INNER JOIN students s
        ON s.id = ps.student_id

      WHERE ps.parent_id = ?
        AND s.church_id = ?
      `,
      [parentId, churchId],
    );

    return res.json({
      success: true,
      data: {
        id: parent.id,
        username: parent.username,
        full_name: parent.full_name,
        phone: parent.phone || null,
        email: parent.email || null,
        role: parent.role || null,
        status: parent.status || null,
        total_children: Number(children[0]?.total || 0),
      },
    });
  } catch (error) {
    console.error("PARENT GET ME ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy thông tin phụ huynh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/parent/children
 *
 * Lấy toàn bộ con của phụ huynh
 * =========================================================
 */

exports.getChildren = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);

    console.log("");
    console.log("=================================================");
    console.log("PARENT - GET CHILDREN");
    console.log("=================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);

    if (!parentId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh không hợp lệ",
      });
    }

    const [children] = await db.query(
      `
      SELECT
        s.id,
        s.code,
        s.name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.address,
        s.parish,
        s.avatar,
        s.status,

        ps.relationship,
        ps.is_primary

      FROM parent_students ps

      INNER JOIN students s
        ON s.id = ps.student_id

      WHERE ps.parent_id = ?
        AND s.church_id = ?

      ORDER BY
        ps.is_primary DESC,
        s.name ASC
      `,
      [parentId, churchId],
    );

    console.log("TOTAL CHILDREN:", children.length);

    const result = [];

    for (const child of children) {
      /**
       * ===============================================
       * CURRENT CLASS
       * ===============================================
       */

      const [classRows] = await db.query(
        `
        SELECT
          c.id,
          c.name,
          c.code,
          c.category,
          c.status,
          c.room,
          c.day_of_week,
          c.start_time,
          c.end_time,
          c.start_date,
          c.end_date

        FROM class_students cs

        INNER JOIN classes c
          ON c.id = cs.class_id

        WHERE cs.student_id = ?
          AND cs.status = 'studying'
          AND c.church_id = ?

        ORDER BY cs.joined_at DESC
        LIMIT 1
        `,
        [child.id, churchId],
      );

      const classData = classRows.length ? classRows[0] : null;

      /**
       * ===============================================
       * ATTENDANCE SUMMARY
       * ===============================================
       */

      const [attendanceRows] = await db.query(
        `
        SELECT
          COUNT(*) AS total,

          SUM(
            CASE
              WHEN status = 'present'
              THEN 1 ELSE 0
            END
          ) AS present,

          SUM(
            CASE
              WHEN status = 'absent'
              THEN 1 ELSE 0
            END
          ) AS absent,

          SUM(
            CASE
              WHEN status = 'late'
              THEN 1 ELSE 0
            END
          ) AS late,

          SUM(
            CASE
              WHEN status = 'excused'
              THEN 1 ELSE 0
            END
          ) AS excused

        FROM attendances

        WHERE student_id = ?
          AND church_id = ?
        `,
        [child.id, churchId],
      );

      const attendance = attendanceRows[0] || {};

      const totalAttendance = Number(attendance.total || 0);

      const present = Number(attendance.present || 0);

      const late = Number(attendance.late || 0);

      const excused = Number(attendance.excused || 0);

      const absent = Number(attendance.absent || 0);

      const attended = present + late + excused;

      const attendanceRate =
        totalAttendance > 0
          ? Number(((attended / totalAttendance) * 100).toFixed(1))
          : 0;

      /**
       * ===============================================
       * LATEST RESULT
       * ===============================================
       */

      const [resultRows] = await db.query(
        `
        SELECT
          id,
          score,
          exam_type,
          exam_date,
          note

        FROM results

        WHERE student_id = ?
          AND church_id = ?

        ORDER BY exam_date DESC, id DESC
        LIMIT 1
        `,
        [child.id, churchId],
      );

      const latestResult = resultRows.length ? resultRows[0] : null;

      result.push({
        id: child.id,
        code: child.code,
        name: child.name,
        gender: child.gender,
        date_of_birth: child.date_of_birth,
        phone: child.phone || null,
        email: child.email || null,
        address: child.address || null,
        parish: child.parish || null,
        avatar: child.avatar || null,
        status: child.status,

        relationship: child.relationship || null,

        is_primary: Boolean(child.is_primary),

        class: classData
          ? {
              id: classData.id,
              name: classData.name,
              code: classData.code,
              category: classData.category || null,
              status: classData.status || null,
              room: classData.room || null,
              day_of_week: classData.day_of_week,
              start_time: classData.start_time,
              end_time: classData.end_time,
              start_date: classData.start_date,
              end_date: classData.end_date,
            }
          : null,

        attendance: {
          total: totalAttendance,
          present,
          absent,
          late,
          excused,
          attended,
          rate: attendanceRate,
        },

        latest_result: latestResult
          ? {
              id: latestResult.id,
              score: latestResult.score,
              exam_type: latestResult.exam_type,
              exam_date: latestResult.exam_date,
              note: latestResult.note || null,
            }
          : null,
      });
    }

    return res.json({
      success: true,
      data: {
        total: result.length,
        children: result,
      },
    });
  } catch (error) {
    console.error("PARENT GET CHILDREN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách con",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/parent/children/:studentId
 *
 * Chi tiết một học sinh
 * =========================================================
 */

exports.getChild = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    console.log("");
    console.log("=================================================");
    console.log("PARENT - GET CHILD DETAIL");
    console.log("=================================================");
    console.log("PARENT ID:", parentId);
    console.log("STUDENT ID:", studentId);
    console.log("CHURCH ID:", churchId);

    if (!parentId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem học sinh này",
      });
    }

    /**
     * ===============================================
     * CURRENT CLASSES
     * ===============================================
     */

    const [classes] = await db.query(
      `
      SELECT
        c.id,
        c.name,
        c.code,
        c.category,
        c.status,
        c.room,
        c.day_of_week,
        c.start_time,
        c.end_time,
        c.start_date,
        c.end_date

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.student_id = ?
        AND cs.status = 'studying'
        AND c.church_id = ?

      ORDER BY cs.joined_at DESC
      `,
      [studentId, churchId],
    );

    /**
     * ===============================================
     * ATTENDANCE SUMMARY
     * ===============================================
     */

    const [attendanceRows] = await db.query(
      `
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused

      FROM attendances

      WHERE student_id = ?
        AND church_id = ?
      `,
      [studentId, churchId],
    );

    const attendance = attendanceRows[0] || {};

    const total = Number(attendance.total || 0);

    const present = Number(attendance.present || 0);

    const absent = Number(attendance.absent || 0);

    const late = Number(attendance.late || 0);

    const excused = Number(attendance.excused || 0);

    const attended = present + late + excused;

    const rate = total > 0 ? Number(((attended / total) * 100).toFixed(1)) : 0;

    /**
     * ===============================================
     * LATEST RESULT
     * ===============================================
     */

    const [resultRows] = await db.query(
      `
      SELECT
        id,
        score,
        exam_type,
        exam_date,
        note

      FROM results

      WHERE student_id = ?
        AND church_id = ?

      ORDER BY exam_date DESC, id DESC
      LIMIT 1
      `,
      [studentId, churchId],
    );

    /**
     * ===============================================
     * FAMILY INFORMATION
     * ===============================================
     */

    const family = {
      father: {
        name: child.father_name || null,
        phone: child.father_phone || null,
      },

      mother: {
        name: child.mother_name || null,
        phone: child.mother_phone || null,
      },

      guardian: {
        name: child.guardian_name || null,
        phone: child.guardian_phone || null,
        relationship: child.guardian_relationship || null,
      },
    };

    return res.json({
      success: true,

      data: {
        student: {
          id: child.id,
          code: child.code,
          name: child.name,
          gender: child.gender,
          date_of_birth: child.date_of_birth,
          phone: child.phone || null,
          email: child.email || null,
          address: child.address || null,
          parish: child.parish || null,
          avatar: child.avatar || null,
          status: child.status,
        },

        relationship: child.relationship || null,

        is_primary: Boolean(child.is_primary),

        family,

        classes: classes.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          category: item.category || null,
          status: item.status || null,
          room: item.room || null,
          day_of_week: item.day_of_week,
          start_time: item.start_time,
          end_time: item.end_time,
          start_date: item.start_date,
          end_date: item.end_date,
        })),

        attendance: {
          total,
          present,
          absent,
          late,
          excused,
          attended,
          rate,
        },

        latest_result: resultRows.length ? resultRows[0] : null,
      },
    });
  } catch (error) {
    console.error("PARENT GET CHILD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy thông tin học sinh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/parent/children/:studentId/attendance
 *
 * Điểm danh
 *
 * Query:
 * ?type=catechism
 * ?type=mass
 * ?from=2026-09-01
 * ?to=2026-09-30
 * ?page=1
 * ?pageSize=20
 * =========================================================
 */

exports.getChildAttendance = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    const type = req.query.type || null;

    const from = normalizeDate(req.query.from);
    const to = normalizeDate(req.query.to);

    const page = Math.max(toInt(req.query.page, 1), 1);

    const pageSize = Math.min(Math.max(toInt(req.query.pageSize, 20), 1), 100);

    const offset = (page - 1) * pageSize;

    console.log("");
    console.log("=================================================");
    console.log("PARENT - GET ATTENDANCE");
    console.log("=================================================");
    console.log("PARENT ID:", parentId);
    console.log("STUDENT ID:", studentId);
    console.log("TYPE:", type);
    console.log("FROM:", from);
    console.log("TO:", to);

    if (!parentId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem học sinh này",
      });
    }

    /**
     * ===============================================
     * BUILD WHERE
     * ===============================================
     */

    const where = ["a.student_id = ?", "a.church_id = ?"];

    const params = [studentId, churchId];

    if (type) {
      where.push("a.attendance_type = ?");

      params.push(type);
    }

    if (from) {
      where.push("DATE(a.attendance_date) >= ?");

      params.push(from);
    }

    if (to) {
      where.push("DATE(a.attendance_date) <= ?");

      params.push(to);
    }

    const whereSql = where.join(" AND ");

    /**
     * ===============================================
     * SUMMARY
     * ===============================================
     */

    const [summaryRows] = await db.query(
      `
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN a.status = 'present'
            THEN 1 ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN a.status = 'absent'
            THEN 1 ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN a.status = 'late'
            THEN 1 ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN a.status = 'excused'
            THEN 1 ELSE 0
          END
        ) AS excused

      FROM attendances a

      WHERE ${whereSql}
      `,
      params,
    );

    const summary = summaryRows[0] || {};

    const total = Number(summary.total || 0);

    const present = Number(summary.present || 0);

    const absent = Number(summary.absent || 0);

    const late = Number(summary.late || 0);

    const excused = Number(summary.excused || 0);

    const attended = present + late + excused;

    const rate = total > 0 ? Number(((attended / total) * 100).toFixed(1)) : 0;

    /**
     * ===============================================
     * TOTAL RECORDS
     * ===============================================
     */

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM attendances a
      WHERE ${whereSql}
      `,
      params,
    );

    const totalRecords = Number(countRows[0]?.total || 0);

    /**
     * ===============================================
     * DATA
     * ===============================================
     */

    const [records] = await db.query(
      `
      SELECT
        a.id,
        a.student_id,
        a.class_id,
        a.attendance_date,
        a.attendance_type,
        a.status,

        c.name AS class_name,
        c.code AS class_code,
        c.room

      FROM attendances a

      LEFT JOIN classes c
        ON c.id = a.class_id
        AND c.church_id = a.church_id

      WHERE ${whereSql}

      ORDER BY
        a.attendance_date DESC,
        a.id DESC

      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    return res.json({
      success: true,

      data: {
        summary: {
          total,
          present,
          absent,
          late,
          excused,
          attended,
          rate,
        },

        records: records.map((item) => ({
          id: item.id,
          student_id: item.student_id,
          class_id: item.class_id,
          class_name: item.class_name || null,
          class_code: item.class_code || null,
          room: item.room || null,
          attendance_date: item.attendance_date,
          attendance_type: item.attendance_type,
          status: item.status,
        })),

        pagination: {
          page,
          pageSize,
          total: totalRecords,
          totalPages: Math.ceil(totalRecords / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("PARENT GET ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy dữ liệu điểm danh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/parent/children/:studentId/results
 *
 * Kết quả học tập
 *
 * Query:
 * ?exam_type=paper
 * ?from=2026-01-01
 * ?to=2026-12-31
 * =========================================================
 */

exports.getChildResults = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    const examType = req.query.exam_type || null;

    const from = normalizeDate(req.query.from);
    const to = normalizeDate(req.query.to);

    console.log("");
    console.log("=================================================");
    console.log("PARENT - GET RESULTS");
    console.log("=================================================");
    console.log("PARENT ID:", parentId);
    console.log("STUDENT ID:", studentId);

    if (!parentId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem học sinh này",
      });
    }

    const where = ["r.student_id = ?", "r.church_id = ?"];

    const params = [studentId, churchId];

    if (examType) {
      where.push("r.exam_type = ?");

      params.push(examType);
    }

    if (from) {
      where.push("DATE(r.exam_date) >= ?");

      params.push(from);
    }

    if (to) {
      where.push("DATE(r.exam_date) <= ?");

      params.push(to);
    }

    const whereSql = where.join(" AND ");

    const [rows] = await db.query(
      `
      SELECT
        r.id,
        r.student_id,
        r.score,
        r.exam_type,
        r.exam_date,
        r.note

      FROM results r

      WHERE ${whereSql}

      ORDER BY
        r.exam_date DESC,
        r.id DESC
      `,
      params,
    );

    const scores = rows
      .map((item) => Number(item.score))
      .filter((score) => Number.isFinite(score));

    const total = rows.length;

    const average = scores.length
      ? Number(
          (
            scores.reduce((sum, score) => sum + score, 0) / scores.length
          ).toFixed(2),
        )
      : 0;

    const highest = scores.length ? Math.max(...scores) : null;

    const lowest = scores.length ? Math.min(...scores) : null;

    const latest = rows.length ? rows[0] : null;

    return res.json({
      success: true,

      data: {
        summary: {
          total,
          average,
          highest,
          lowest,
        },

        latest,

        records: rows.map((item) => ({
          id: item.id,
          student_id: item.student_id,
          score: Number(item.score),
          exam_type: item.exam_type,
          exam_date: item.exam_date,
          note: item.note || null,
        })),
      },
    });
  } catch (error) {
    console.error("PARENT GET RESULTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy kết quả học tập",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/parent/children/:studentId/schedule
 *
 * Lịch học
 * =========================================================
 */

exports.getChildSchedule = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    console.log("");
    console.log("=================================================");
    console.log("PARENT - GET SCHEDULE");
    console.log("=================================================");
    console.log("PARENT ID:", parentId);
    console.log("STUDENT ID:", studentId);

    if (!parentId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem học sinh này",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        c.id,
        c.name,
        c.code,
        c.category,
        c.status,
        c.room,
        c.day_of_week,
        c.start_time,
        c.end_time,
        c.start_date,
        c.end_date

      FROM class_students cs

      INNER JOIN classes c
        ON c.id = cs.class_id

      WHERE cs.student_id = ?
        AND cs.status = 'studying'
        AND c.church_id = ?

      ORDER BY
        c.day_of_week ASC,
        c.start_time ASC
      `,
      [studentId, churchId],
    );

    return res.json({
      success: true,

      data: {
        student: {
          id: child.id,
          code: child.code,
          name: child.name,
        },

        schedules: rows.map((item) => ({
          id: item.id,
          class_name: item.name,
          class_code: item.code,
          category: item.category || null,
          status: item.status || null,
          room: item.room || null,
          day_of_week: item.day_of_week,
          start_time: item.start_time,
          end_time: item.end_time,
          start_date: item.start_date,
          end_date: item.end_date,
        })),
      },
    });
  } catch (error) {
    console.error("PARENT GET SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy lịch học",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET /api/parent/children/:studentId/certificates
 *
 * Chứng chỉ
 *
 * LƯU Ý:
 * Phần này phụ thuộc schema certificates thực tế.
 * =========================================================
 */

exports.getChildCertificates = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    console.log("");
    console.log("=================================================");
    console.log("PARENT - GET CERTIFICATES");
    console.log("=================================================");
    console.log("PARENT ID:", parentId);
    console.log("STUDENT ID:", studentId);

    if (!parentId || !churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "studentId không hợp lệ",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem học sinh này",
      });
    }

    /**
     * =====================================================
     * TẠM DÙNG SCHEMA:
     *
     * certificates
     * - id
     * - student_id
     * - church_id
     * - certificate_type
     * - title
     * - certificate_number
     * - issue_date
     * - file_url
     * - status
     *
     * Nếu bảng thực tế khác, chỉ cần sửa query này.
     * =====================================================
     */

    const [rows] = await db.query(
      `
      SELECT
        id,
        student_id,
        certificate_type,
        title,
        certificate_number,
        issue_date,
        file_url,
        status

      FROM certificates

      WHERE student_id = ?
        AND church_id = ?

      ORDER BY
        issue_date DESC,
        id DESC
      `,
      [studentId, churchId],
    );

    return res.json({
      success: true,

      data: {
        total: rows.length,

        certificates: rows.map((item) => ({
          id: item.id,

          certificate_type: item.certificate_type,

          title: item.title,

          certificate_number: item.certificate_number || null,

          issue_date: item.issue_date,

          file_url: item.file_url || null,

          status: item.status || null,
        })),
      },
    });
  } catch (error) {
    console.error("PARENT GET CERTIFICATES ERROR:", error);

    /**
     * Nếu bảng certificates chưa có
     * thì trả danh sách rỗng thay vì làm
     * toàn bộ trang phụ huynh lỗi.
     */

    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.json({
        success: true,

        data: {
          total: 0,
          certificates: [],
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy chứng chỉ",
      error: error.message,
    });
  }
};

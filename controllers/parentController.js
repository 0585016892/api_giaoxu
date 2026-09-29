const db = require("../config/db");

/**
 * =========================================================
 * HELPERS
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
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const normalizePage = (value, defaultValue = 1) => {
  const page = toInt(value, defaultValue);

  if (!page || page < 1) {
    return defaultValue;
  }

  return page;
};

const normalizePageSize = (value, defaultValue = 20) => {
  const pageSize = toInt(value, defaultValue);

  if (!pageSize || pageSize < 1) {
    return defaultValue;
  }

  return Math.min(pageSize, 100);
};

/**
 * =========================================================
 * CHECK PARENT ACCOUNT
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
      account_type,
      is_active,
      avatar,
      created_at,
      updated_at
    FROM admins
    WHERE id = ?
      AND church_id = ?
      AND role = 'parent'
    LIMIT 1
    `,
    [parentId, churchId],
  );

  return rows.length ? rows[0] : null;
};

/**
 * =========================================================
 * CHECK PARENT -> STUDENT RELATION
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
      ps.church_id AS parent_student_church_id,

      s.id,
      s.church_id,
      s.code,
      s.qr_token,
      s.name,
      s.gender,
      s.date_of_birth,
      s.birth_place,
      s.nationality,
      s.phone,
      s.email,
      s.address,
      s.parish,

      s.father_name,
      s.father_phone,

      s.mother_name,
      s.mother_phone,

      s.guardian_name,
      s.guardian_phone,
      s.guardian_relationship,

      s.baptism_name,
      s.baptism_date,
      s.baptism_place,
      s.baptism_parish,
      s.baptism_certificate_no,
      s.saint_name,

      s.first_communion_date,
      s.first_communion_place,

      s.confirmation_date,
      s.confirmation_place,
      s.confirmation_saint_name,

      s.catechism_level,
      s.catechism_status,
      s.enrollment_date,
      s.note,

      s.avatar,
      s.status,
      s.created_at,
      s.updated_at

    FROM parent_students ps

    INNER JOIN admins a
      ON a.id = ps.parent_id
      AND a.church_id = ps.church_id
      AND a.role = 'parent'

    INNER JOIN students s
      ON s.id = ps.student_id
      AND s.church_id = ps.church_id

    WHERE ps.parent_id = ?
      AND ps.student_id = ?
      AND ps.church_id = ?

    LIMIT 1
    `,
    [parentId, studentId, churchId],
  );

  return rows.length ? rows[0] : null;
};

/**
 * =========================================================
 * GET CURRENT CLASSES OF STUDENT
 * =========================================================
 */

const getStudentClasses = async (studentId, churchId) => {
  const [rows] = await db.query(
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

      cs.id AS class_student_id,
      cs.status AS class_student_status,
      cs.joined_at,
      cs.left_at

    FROM class_students cs

    INNER JOIN classes c
      ON c.id = cs.class_id
      AND c.church_id = ?

    WHERE cs.student_id = ?
      AND cs.status = 'studying'

    ORDER BY
      c.start_date DESC,
      c.id DESC
    `,
    [churchId, studentId],
  );

  return rows;
};

/**
 * =========================================================
 * GET ATTENDANCE SUMMARY
 * =========================================================
 */

const getAttendanceSummary = async (studentId, churchId) => {
  const [rows] = await db.query(
    `
    SELECT
      COUNT(*) AS total,

      SUM(
        CASE
          WHEN status = 'present' THEN 1
          ELSE 0
        END
      ) AS present,

      SUM(
        CASE
          WHEN status = 'absent' THEN 1
          ELSE 0
        END
      ) AS absent,

      SUM(
        CASE
          WHEN status = 'late' THEN 1
          ELSE 0
        END
      ) AS late,

      SUM(
        CASE
          WHEN status = 'excused' THEN 1
          ELSE 0
        END
      ) AS excused

    FROM attendances
    WHERE student_id = ?
      AND church_id = ?
    `,
    [studentId, churchId],
  );

  const row = rows[0] || {};

  const total = Number(row.total) || 0;
  const present = Number(row.present) || 0;
  const absent = Number(row.absent) || 0;
  const late = Number(row.late) || 0;
  const excused = Number(row.excused) || 0;

  const attended = present + late;

  const rate = total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0;

  return {
    total,
    present,
    absent,
    late,
    excused,
    attended,
    rate,
  };
};

/**
 * =========================================================
 * GET LATEST RESULT
 * =========================================================
 */

const getLatestResult = async (studentId, churchId) => {
  const [rows] = await db.query(
    `
    SELECT
      id,
      student_id,
      grading_rule_id,
      grading_rule_item_id,
      score,
      exam_type,
      exam_date,
      note,
      created_at,
      updated_at

    FROM results

    WHERE student_id = ?
      AND church_id = ?

    ORDER BY
      exam_date DESC,
      id DESC

    LIMIT 1
    `,
    [studentId, churchId],
  );

  return rows.length ? rows[0] : null;
};

/**
 * =========================================================
 * GET PARENT ME
 * =========================================================
 */

exports.getMe = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);

    console.log("");
    console.log("============================================================");
    console.log("                       PARENT GET ME");
    console.log("============================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);

    if (!parentId || !churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản không phải phụ huynh hoặc không thuộc giáo xứ",
      });
    }

    if (!parent.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh đã bị khóa",
      });
    }

    return res.json({
      success: true,
      data: {
        id: parent.id,
        church_id: parent.church_id,
        username: parent.username,
        full_name: parent.full_name,
        phone: parent.phone,
        email: parent.email,
        role: parent.role,
        account_type: parent.account_type,
        is_active: Boolean(parent.is_active),
        avatar: parent.avatar,
        created_at: parent.created_at,
        updated_at: parent.updated_at,
      },
    });
  } catch (error) {
    console.error("PARENT GET ME ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải thông tin phụ huynh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET CHILDREN
 * =========================================================
 */

exports.getChildren = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);

    console.log("");
    console.log("============================================================");
    console.log("                    PARENT GET CHILDREN");
    console.log("============================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);

    if (!parentId || !churchId) {
      return res.status(403).json({
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

    if (!parent.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh đã bị khóa",
      });
    }

    const [students] = await db.query(
      `
      SELECT
        ps.id AS parent_student_id,
        ps.parent_id,
        ps.student_id,
        ps.relationship,

        s.id,
        s.church_id,
        s.code,
        s.qr_token,
        s.name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.address,
        s.parish,
        s.avatar,
        s.status,
        s.catechism_level,
        s.catechism_status,
        s.enrollment_date

      FROM parent_students ps

      INNER JOIN students s
        ON s.id = ps.student_id
        AND s.church_id = ps.church_id

      WHERE ps.parent_id = ?
        AND ps.church_id = ?

      ORDER BY
        s.name ASC,
        s.id ASC
      `,
      [parentId, churchId],
    );

    console.log("CHILD COUNT:", students.length);

    const children = [];

    for (const student of students) {
      const classes = await getStudentClasses(student.id, churchId);

      const attendance = await getAttendanceSummary(student.id, churchId);

      const latestResult = await getLatestResult(student.id, churchId);

      children.push({
        id: student.id,
        code: student.code,
        qr_token: student.qr_token,

        name: student.name,
        gender: student.gender,
        date_of_birth: student.date_of_birth,

        phone: student.phone,
        email: student.email,
        address: student.address,
        parish: student.parish,

        avatar: student.avatar,
        status: student.status,

        catechism_level: student.catechism_level,
        catechism_status: student.catechism_status,
        enrollment_date: student.enrollment_date,

        relationship: student.relationship,

        classes: classes.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          category: item.category,
          catechist_id: item.catechist_id,
          description: item.description,
          start_date: item.start_date,
          end_date: item.end_date,
          status: item.status,

          class_student_id: item.class_student_id,
          class_student_status: item.class_student_status,
          joined_at: item.joined_at,
          left_at: item.left_at,
        })),

        class:
          classes.length > 0
            ? {
                id: classes[0].id,
                name: classes[0].name,
                code: classes[0].code,
                category: classes[0].category,
                catechist_id: classes[0].catechist_id,
                description: classes[0].description,
                start_date: classes[0].start_date,
                end_date: classes[0].end_date,
                status: classes[0].status,
              }
            : null,

        attendance,

        latest_result: latestResult,
      });
    }

    return res.json({
      success: true,
      data: {
        children,
        total: children.length,
      },
    });
  } catch (error) {
    console.error("PARENT GET CHILDREN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải danh sách con",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET CHILD DETAIL
 * =========================================================
 */

exports.getChild = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    console.log("");
    console.log("============================================================");
    console.log("                    PARENT GET CHILD");
    console.log("============================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);
    console.log("STUDENT ID:", studentId);

    if (!parentId || !churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Mã học sinh không hợp lệ",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh không hợp lệ",
      });
    }

    if (!parent.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh đã bị khóa",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc tài khoản phụ huynh",
      });
    }

    const classes = await getStudentClasses(studentId, churchId);

    const attendance = await getAttendanceSummary(studentId, churchId);

    const latestResult = await getLatestResult(studentId, churchId);

    const family = {
      father: {
        name: child.father_name,
        phone: child.father_phone,
      },

      mother: {
        name: child.mother_name,
        phone: child.mother_phone,
      },

      guardian: {
        name: child.guardian_name,
        phone: child.guardian_phone,
        relationship: child.guardian_relationship,
      },
    };

    const student = {
      id: child.id,
      church_id: child.church_id,

      code: child.code,
      qr_token: child.qr_token,

      name: child.name,
      gender: child.gender,
      date_of_birth: child.date_of_birth,
      birth_place: child.birth_place,
      nationality: child.nationality,

      phone: child.phone,
      email: child.email,
      address: child.address,
      parish: child.parish,

      avatar: child.avatar,
      status: child.status,

      catechism_level: child.catechism_level,
      catechism_status: child.catechism_status,
      enrollment_date: child.enrollment_date,

      note: child.note,

      baptism: {
        name: child.baptism_name,
        date: child.baptism_date,
        place: child.baptism_place,
        parish: child.baptism_parish,
        certificate_no: child.baptism_certificate_no,
      },

      first_communion: {
        date: child.first_communion_date,
        place: child.first_communion_place,
      },

      confirmation: {
        date: child.confirmation_date,
        place: child.confirmation_place,
        saint_name: child.confirmation_saint_name,
      },

      saint_name: child.saint_name,

      created_at: child.created_at,
      updated_at: child.updated_at,
    };

    return res.json({
      success: true,
      data: {
        student,

        relationship: child.relationship,

        family,

        classes: classes.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          category: item.category,
          catechist_id: item.catechist_id,
          description: item.description,
          start_date: item.start_date,
          end_date: item.end_date,
          status: item.status,

          class_student_id: item.class_student_id,
          class_student_status: item.class_student_status,
          joined_at: item.joined_at,
          left_at: item.left_at,
        })),

        attendance,

        latest_result: latestResult,
      },
    });
  } catch (error) {
    console.error("PARENT GET CHILD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải thông tin học sinh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET CHILD ATTENDANCE
 * =========================================================
 */

exports.getChildAttendance = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    const attendanceType = req.query.type || null;

    const fromDate = normalizeDate(req.query.from);

    const toDate = normalizeDate(req.query.to);

    const page = normalizePage(req.query.page, 1);

    const pageSize = normalizePageSize(req.query.pageSize, 20);

    const offset = (page - 1) * pageSize;

    console.log("");
    console.log("============================================================");
    console.log("                PARENT GET CHILD ATTENDANCE");
    console.log("============================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);
    console.log("STUDENT ID:", studentId);
    console.log("TYPE:", attendanceType);
    console.log("FROM:", fromDate);
    console.log("TO:", toDate);
    console.log("PAGE:", page);
    console.log("PAGE SIZE:", pageSize);

    if (!parentId || !churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Mã học sinh không hợp lệ",
      });
    }

    if (attendanceType && !["mass", "catechism"].includes(attendanceType)) {
      return res.status(400).json({
        success: false,
        message: "Loại điểm danh không hợp lệ",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh không hợp lệ",
      });
    }

    if (!parent.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh đã bị khóa",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc tài khoản phụ huynh",
      });
    }

    /**
     * ---------------------------------------------------------
     * SUMMARY
     * ---------------------------------------------------------
     */

    const summaryParams = [studentId, churchId];

    let summaryWhere = `
      student_id = ?
      AND church_id = ?
    `;

    if (attendanceType) {
      summaryWhere += `
        AND attendance_type = ?
      `;

      summaryParams.push(attendanceType);
    }

    if (fromDate) {
      summaryWhere += `
        AND attendance_date >= ?
      `;

      summaryParams.push(fromDate);
    }

    if (toDate) {
      summaryWhere += `
        AND attendance_date <= ?
      `;

      summaryParams.push(toDate);
    }

    const [summaryRows] = await db.query(
      `
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN status = 'present' THEN 1
            ELSE 0
          END
        ) AS present,

        SUM(
          CASE
            WHEN status = 'absent' THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN status = 'late' THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN status = 'excused' THEN 1
            ELSE 0
          END
        ) AS excused

      FROM attendances

      WHERE ${summaryWhere}
      `,
      summaryParams,
    );

    const summaryRow = summaryRows[0] || {};

    const total = Number(summaryRow.total) || 0;

    const present = Number(summaryRow.present) || 0;

    const absent = Number(summaryRow.absent) || 0;

    const late = Number(summaryRow.late) || 0;

    const excused = Number(summaryRow.excused) || 0;

    const attended = present + late;

    const rate = total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0;

    /**
     * ---------------------------------------------------------
     * TOTAL RECORDS
     * ---------------------------------------------------------
     */

    const countParams = [studentId, churchId];

    let countWhere = `
      student_id = ?
      AND church_id = ?
    `;

    if (attendanceType) {
      countWhere += `
        AND attendance_type = ?
      `;

      countParams.push(attendanceType);
    }

    if (fromDate) {
      countWhere += `
        AND attendance_date >= ?
      `;

      countParams.push(fromDate);
    }

    if (toDate) {
      countWhere += `
        AND attendance_date <= ?
      `;

      countParams.push(toDate);
    }

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM attendances
      WHERE ${countWhere}
      `,
      countParams,
    );

    const totalRecords = Number(countRows[0]?.total) || 0;

    const totalPages =
      totalRecords > 0 ? Math.ceil(totalRecords / pageSize) : 0;

    /**
     * ---------------------------------------------------------
     * RECORDS
     * ---------------------------------------------------------
     */

    const recordParams = [studentId, churchId];

    let recordWhere = `
      a.student_id = ?
      AND a.church_id = ?
    `;

    if (attendanceType) {
      recordWhere += `
        AND a.attendance_type = ?
      `;

      recordParams.push(attendanceType);
    }

    if (fromDate) {
      recordWhere += `
        AND a.attendance_date >= ?
      `;

      recordParams.push(fromDate);
    }

    if (toDate) {
      recordWhere += `
        AND a.attendance_date <= ?
      `;

      recordParams.push(toDate);
    }

    recordParams.push(pageSize, offset);

    const [records] = await db.query(
      `
      SELECT
        a.id,
        a.church_id,
        a.class_id,
        a.student_id,
        a.teacher_id,
        a.attendance_date,
        a.attendance_type,
        a.status,
        a.check_in_time,
        a.note,
        a.created_at,
        a.updated_at,

        c.name AS class_name,
        c.code AS class_code,
        c.category AS class_category

      FROM attendances a

      LEFT JOIN classes c
        ON c.id = a.class_id
        AND c.church_id = a.church_id

      WHERE ${recordWhere}

      ORDER BY
        a.attendance_date DESC,
        a.id DESC

      LIMIT ?
      OFFSET ?
      `,
      recordParams,
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

        records,

        pagination: {
          page,
          pageSize,
          total: totalRecords,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error("PARENT GET CHILD ATTENDANCE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải dữ liệu điểm danh",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET CHILD RESULTS
 * =========================================================
 */

exports.getChildResults = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    const examType = req.query.exam_type || null;

    const fromDate = normalizeDate(req.query.from);

    const toDate = normalizeDate(req.query.to);

    console.log("");
    console.log("============================================================");
    console.log("                  PARENT GET CHILD RESULTS");
    console.log("============================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);
    console.log("STUDENT ID:", studentId);
    console.log("EXAM TYPE:", examType);
    console.log("FROM:", fromDate);
    console.log("TO:", toDate);

    if (!parentId || !churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Mã học sinh không hợp lệ",
      });
    }

    if (examType && !["online", "paper"].includes(examType)) {
      return res.status(400).json({
        success: false,
        message: "Loại bài thi không hợp lệ",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh không hợp lệ",
      });
    }

    if (!parent.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh đã bị khóa",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc tài khoản phụ huynh",
      });
    }

    const params = [studentId, churchId];

    let where = `
      student_id = ?
      AND church_id = ?
    `;

    if (examType) {
      where += `
        AND exam_type = ?
      `;

      params.push(examType);
    }

    if (fromDate) {
      where += `
        AND exam_date >= ?
      `;

      params.push(fromDate);
    }

    if (toDate) {
      where += `
        AND exam_date <= ?
      `;

      params.push(toDate);
    }

    const [records] = await db.query(
      `
      SELECT
        id,
        student_id,
        grading_rule_id,
        grading_rule_item_id,
        score,
        exam_type,
        exam_date,
        note,
        created_at,
        updated_at

      FROM results

      WHERE ${where}

      ORDER BY
        exam_date DESC,
        id DESC
      `,
      params,
    );

    const total = records.length;

    const scores = records
      .map((item) => Number(item.score))
      .filter((score) => Number.isFinite(score));

    const average =
      scores.length > 0
        ? Number(
            (
              scores.reduce((sum, score) => sum + score, 0) / scores.length
            ).toFixed(2),
          )
        : 0;

    const highest = scores.length > 0 ? Math.max(...scores) : null;

    const lowest = scores.length > 0 ? Math.min(...scores) : null;

    const latest = records.length > 0 ? records[0] : null;

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

        records,
      },
    });
  } catch (error) {
    console.error("PARENT GET CHILD RESULTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải kết quả học tập",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET CHILD SCHEDULE
 * =========================================================
 *
 * LƯU Ý:
 * Bảng classes hiện tại KHÔNG có:
 * room
 * day_of_week
 * start_time
 * end_time
 *
 * Vì vậy API chỉ trả các thông tin lịch
 * thực sự có trong database.
 */

exports.getChildSchedule = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    console.log("");
    console.log("============================================================");
    console.log("                 PARENT GET CHILD SCHEDULE");
    console.log("============================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);
    console.log("STUDENT ID:", studentId);

    if (!parentId || !churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Mã học sinh không hợp lệ",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh không hợp lệ",
      });
    }

    if (!parent.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh đã bị khóa",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc tài khoản phụ huynh",
      });
    }

    const classes = await getStudentClasses(studentId, churchId);

    return res.json({
      success: true,

      data: {
        student: {
          id: child.id,
          code: child.code,
          name: child.name,
          avatar: child.avatar,
        },

        schedules: classes.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          category: item.category,
          catechist_id: item.catechist_id,
          description: item.description,

          start_date: item.start_date,
          end_date: item.end_date,

          status: item.status,

          class_student_id: item.class_student_id,

          class_student_status: item.class_student_status,

          joined_at: item.joined_at,
          left_at: item.left_at,
        })),
      },
    });
  } catch (error) {
    console.error("PARENT GET CHILD SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải lịch học",
      error: error.message,
    });
  }
};

/**
 * =========================================================
 * GET CHILD CERTIFICATES
 * =========================================================
 *
 * Bảng certificates chưa được cung cấp schema.
 *
 * Controller sẽ thử truy vấn theo schema cũ.
 * Nếu bảng chưa tồn tại -> trả [] thay vì làm API chết.
 *
 * Khi có DESCRIBE certificates,
 * cần chuẩn hóa riêng phần này theo DB thực tế.
 */

exports.getChildCertificates = async (req, res) => {
  try {
    const parentId = getParentId(req);
    const churchId = getChurchId(req);
    const studentId = toInt(req.params.studentId);

    console.log("");
    console.log("============================================================");
    console.log("               PARENT GET CHILD CERTIFICATES");
    console.log("============================================================");
    console.log("PARENT ID:", parentId);
    console.log("CHURCH ID:", churchId);
    console.log("STUDENT ID:", studentId);

    if (!parentId || !churchId) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được tài khoản phụ huynh",
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Mã học sinh không hợp lệ",
      });
    }

    const parent = await checkParentAccount(parentId, churchId);

    if (!parent) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh không hợp lệ",
      });
    }

    if (!parent.is_active) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản phụ huynh đã bị khóa",
      });
    }

    const child = await checkParentStudent(parentId, studentId, churchId);

    if (!child) {
      return res.status(404).json({
        success: false,
        message: "Học sinh không thuộc tài khoản phụ huynh",
      });
    }

    try {
      const [certificates] = await db.query(
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
          certificates,
          total: certificates.length,
        },
      });
    } catch (certificateError) {
      if (
        certificateError.code === "ER_NO_SUCH_TABLE" ||
        certificateError.code === "ER_BAD_FIELD_ERROR"
      ) {
        console.warn(
          "CERTIFICATES TABLE/SCHEMA NOT READY:",
          certificateError.message,
        );

        return res.json({
          success: true,

          data: {
            certificates: [],
            total: 0,
          },
        });
      }

      throw certificateError;
    }
  } catch (error) {
    console.error("PARENT GET CHILD CERTIFICATES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải chứng chỉ",
      error: error.message,
    });
  }
};

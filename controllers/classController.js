const db = require("../config/db");

// =========================
// LẤY DANH SÁCH LỚP
// =========================
exports.getClasses = async (req, res) => {
  console.log("CALL API CLASS");

  try {
    const sql = `
      SELECT
        c.id,
        c.name,
        c.code,
        c.category,
        c.catechist_id,
        c.description,
        c.room,
        c.day_of_week,
        c.start_time,
        c.end_time,
        c.start_date,
        c.end_date,
        c.status,
        c.created_at,
        c.updated_at,

        /* =====================
           SỐ HỌC VIÊN
        ===================== */
        (
          SELECT COUNT(*)
          FROM class_students cs
          WHERE cs.class_id = c.id
          AND cs.status = 'studying'
        ) AS studentsCount,

        /* =====================
           GIÁO LÝ VIÊN
        ===================== */
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

        /* =====================
           THÔNG TIN PHÂN CÔNG
        ===================== */
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

      /* =====================
         GIÁO LÝ VIÊN PHÂN CÔNG
      ===================== */
      LEFT JOIN catechist_classes cc
        ON cc.class_id = c.id

      LEFT JOIN catechists ct
        ON ct.id = cc.catechist_id

      GROUP BY
        c.id,
        c.name,
        c.code,
        c.category,
        c.catechist_id,
        c.description,
        c.room,
        c.day_of_week,
        c.start_time,
        c.end_time,
        c.start_date,
        c.end_date,
        c.status,
        c.created_at,
        c.updated_at

      ORDER BY c.created_at DESC
    `;

    const [rows] = await db.query(sql);

    const formattedRows = rows.map((item) => ({
      ...item,

      catechists: item.catechist_ids
        ? item.catechist_ids.split(",").map((id, index) => ({
            id: Number(id),

            code: item.catechist_codes?.split(", ")[index] || null,

            full_name: item.catechist_names?.split(", ")[index] || null,

            role: item.catechist_roles?.split(", ")[index] || null,

            assigned_date: item.assigned_dates?.split(", ")[index] || null,
          }))
        : [],
    }));

    res.status(200).json({
      success: true,
      data: formattedRows,
    });
  } catch (error) {
    console.error("getClasses error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lớp học",
      error: error.message,
    });
  }
};
// =========================
// CHI TIẾT LỚP
// =========================
// =========================
// CHI TIẾT LỚP
// =========================

exports.getClassById = async (req, res) => {
  try {
    const { id } = req.params;

    /* =========================
       1. THÔNG TIN LỚP
    ========================= */

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
    `;

    const [classRows] = await db.query(classSql, [id]);

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    const classData = classRows[0];

    /* =========================
       2. DANH SÁCH GIÁO LÝ VIÊN
    ========================= */

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

      ORDER BY
        cc.role ASC,
        ct.full_name ASC
    `;

    const [catechists] = await db.query(catechistSql, [id]);

    /* =========================
       3. RESPONSE
    ========================= */

    res.status(200).json({
      success: true,

      data: {
        ...classData,

        catechists,
      },
    });
  } catch (error) {
    console.error("getClassById error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin lớp học",
      error: error.message,
    });
  }
};

// =========================
// TẠO LỚP
// =========================
exports.createClass = async (req, res) => {
  try {
    const {
      name,
      category,
      catechist_id,
      description,
      room,
      day_of_week,
      start_time,
      end_time,
      start_date,
      end_date,
      status,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên lớp là bắt buộc",
      });
    }

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

    const [rows] = await db.query(
      `
      SELECT code
      FROM classes
      WHERE code LIKE ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [`${prefix}%`],
    );

    let nextNumber = 1;

    if (rows.length > 0 && rows[0].code) {
      const lastNumber = parseInt(rows[0].code.replace(prefix, ""), 10);

      if (!Number.isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    const code = `${prefix}${String(nextNumber).padStart(3, "0")}`;

    const [result] = await db.query(
      `
      INSERT INTO classes (
        name,
        code,
        category,
        catechist_id,
        description,
        room,
        day_of_week,
        start_time,
        end_time,
        start_date,
        end_date,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name.trim(),
        code,
        category || "Giáo lý Thiếu Nhi",
        catechist_id || null,
        description?.trim() || null,
        room?.trim() || null,
        day_of_week || null,
        start_time || null,
        end_time || null,
        start_date || null,
        end_date || null,
        status || "active",
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Tạo lớp học thành công",
      data: {
        id: result.insertId,
        code,
      },
    });
  } catch (error) {
    console.error("❌ createClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tạo lớp học",
      error: error.message,
    });
  }
};
// =========================
// CẬP NHẬT LỚP
// =========================
exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      code,
      category,
      catechist_id,
      description,
      room,
      day_of_week,
      start_time,
      end_time,
      start_date,
      end_date,
      status,
    } = req.body;

    const [result] = await db.query(
      `
      UPDATE classes
      SET
        name = ?,
        code = ?,
        category = ?,
        catechist_id = ?,
        description = ?,
        room = ?,
        day_of_week = ?,
        start_time = ?,
        end_time = ?,
        start_date = ?,
        end_date = ?,
        status = ?
      WHERE id = ?
      `,
      [
        name,
        code || null,
        category || "Giáo lý Thiếu Nhi",
        catechist_id || null,
        description || null,
        room || null,
        day_of_week || null,
        start_time || null,
        end_time || null,
        start_date || null,
        end_date || null,
        status || "active",
        id,
      ],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật lớp học thành công",
    });
  } catch (error) {
    console.error("updateClass error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật lớp học",
    });
  }
};

// =========================
// XÓA LỚP
// =========================
exports.deleteClass = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(`DELETE FROM classes WHERE id = ?`, [id]);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học",
      });
    }

    res.json({
      success: true,
      message: "Đã xóa lớp học",
    });
  } catch (error) {
    console.error("deleteClass error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể xóa lớp học",
    });
  }
};

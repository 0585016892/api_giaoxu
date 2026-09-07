const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");
const fs = require("fs");
const path = require("path");

// ======================================================
// HELPER: XÓA FILE ẢNH VẬT LÝ
// ======================================================

const deletePhysicalFile = (imagePath) => {
  if (!imagePath) return;

  try {
    const relativePath = imagePath.startsWith("/")
      ? imagePath.slice(1)
      : imagePath;

    const fullPath = path.join(__dirname, "../", relativePath);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log("Đã xóa file ảnh cũ:", fullPath);
    }
  } catch (err) {
    console.error("Lỗi xóa file ảnh vật lý:", err.message);
  }
};

// ======================================================
// 1. GET ALL
// SEARCH + FILTER + PAGINATION + SỐ LƯỢNG GIÁO DÂN
// ======================================================

exports.getAll = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      keyword = "",
      type,
      district,
      ward,
      is_active,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    let params = [];

    // SEARCH
    if (keyword) {
      where += `
        AND (
          c.name LIKE ?
          OR c.code LIKE ?
          OR c.pastor_name LIKE ?
          OR c.address LIKE ?
        )
      `;

      params.push(
        `%${keyword}%`,
        `%${keyword}%`,
        `%${keyword}%`,
        `%${keyword}%`,
      );
    }

    // TYPE
    if (type) {
      where += " AND c.type = ?";
      params.push(type);
    }

    // DISTRICT
    if (district) {
      where += " AND c.district = ?";
      params.push(district);
    }

    // WARD
    if (ward) {
      where += " AND c.ward = ?";
      params.push(ward);
    }

    // ACTIVE
    if (is_active !== undefined && is_active !== "") {
      where += " AND c.is_active = ?";
      params.push(is_active);
    }

    // COUNT
    const [[count]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM churches c
      ${where}
      `,
      params,
    );

    // DATA
    const sqlData = `
      SELECT
        c.*,
        COUNT(p.id) AS total_parishioners
      FROM churches c

      LEFT JOIN parishioners p
        ON p.churches_id = c.id

      ${where}

      GROUP BY c.id

      ORDER BY c.created_at DESC

      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(sqlData, [...params, limit, offset]);

    return res.json({
      success: true,

      data: rows,

      pagination: {
        total: Number(count.total),
        page,
        limit,
        totalPages: Math.ceil(count.total / limit),
      },
    });
  } catch (err) {
    console.error("GET ALL CHURCHES ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================================
// 2. GET BY ID
// CHI TIẾT + LICENSE + THỐNG KÊ GIÁO DÂN
// ======================================================

exports.getById = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    if (!churchId || Number.isNaN(churchId)) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    const sql = `
      SELECT
        c.id,
        c.name,
        c.type,
        c.code,

        c.address,
        c.ward,
        c.district,

        c.phone,
        c.email,
        c.pastor_name,

        c.latitude,
        c.longitude,

        c.description,
        c.image,

        c.is_active,

        -- LICENSE
        c.license_status,
        c.trial_started_at,
        c.trial_expires_at,
        c.activated_at,

        -- SYSTEM
        c.created_at,
        c.updated_at,

        -- PARISHIONERS
        COUNT(p.id) AS total_parishioners,

        COALESCE(
          SUM(
            CASE
              WHEN p.gender IN ('NAM', 'MALE')
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS total_male,

        COALESCE(
          SUM(
            CASE
              WHEN p.gender IN ('NỮ', 'FEMALE')
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS total_female

      FROM churches c

      LEFT JOIN parishioners p
        ON p.churches_id = c.id

      WHERE c.id = ?

      GROUP BY
        c.id,
        c.name,
        c.type,
        c.code,
        c.address,
        c.ward,
        c.district,
        c.phone,
        c.email,
        c.pastor_name,
        c.latitude,
        c.longitude,
        c.description,
        c.image,
        c.is_active,
        c.license_status,
        c.trial_started_at,
        c.trial_expires_at,
        c.activated_at,
        c.created_at,
        c.updated_at
    `;

    const [rows] = await db.query(sql, [churchId]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    const church = rows[0];

    let licenseStatus = church.license_status || "trial";
    let daysRemaining = null;
    let isExpired = false;

    const now = new Date();

    // ACTIVE
    if (licenseStatus === "active") {
      daysRemaining = null;
      isExpired = false;
    }

    // TRIAL
    else if (licenseStatus === "trial") {
      if (!church.trial_expires_at) {
        daysRemaining = null;
        isExpired = false;
      } else {
        const expiresAt = new Date(church.trial_expires_at);

        if (expiresAt <= now) {
          await db.query(
            `
            UPDATE churches
            SET license_status = 'expired'
            WHERE id = ?
              AND license_status = 'trial'
            `,
            [churchId],
          );

          licenseStatus = "expired";
          daysRemaining = 0;
          isExpired = true;
        } else {
          const diffMs = expiresAt.getTime() - now.getTime();

          daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          isExpired = false;
        }
      }
    }

    // EXPIRED
    else if (licenseStatus === "expired") {
      daysRemaining = 0;
      isExpired = true;
    }

    return res.status(200).json({
      success: true,

      church: {
        id: Number(church.id),

        name: church.name,
        type: church.type,
        code: church.code,

        address: church.address,
        ward: church.ward,
        district: church.district,

        phone: church.phone,
        email: church.email,
        pastor_name: church.pastor_name,

        latitude: church.latitude !== null ? Number(church.latitude) : null,

        longitude: church.longitude !== null ? Number(church.longitude) : null,

        description: church.description,

        image: church.image,

        is_active: church.is_active === 1 || church.is_active === true,

        // LICENSE
        license_status: licenseStatus,

        trial_started_at: church.trial_started_at,

        trial_expires_at: church.trial_expires_at,

        activated_at: church.activated_at,

        days_remaining: daysRemaining,

        is_expired: isExpired,

        is_trial: licenseStatus === "trial",

        is_active_license: licenseStatus === "active",

        // STATISTICS
        total_parishioners: Number(church.total_parishioners || 0),

        total_male: Number(church.total_male || 0),

        total_female: Number(church.total_female || 0),

        // SYSTEM
        created_at: church.created_at,
        updated_at: church.updated_at,
      },
    });
  } catch (err) {
    console.error("==========================================");
    console.error("❌ GET CHURCH BY ID ERROR");
    console.error("==========================================");
    console.error("Message:", err.message);
    console.error("Code:", err.code);
    console.error("SQL State:", err.sqlState);
    console.error("SQL Message:", err.sqlMessage);
    console.error("Stack:", err.stack);
    console.error("==========================================");

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin giáo xứ",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// ======================================================
// 3. CREATE
// ======================================================

exports.create = async (req, res) => {
  try {
    console.log("===== CREATE CHURCH REQUEST =====");
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const {
      name,
      type = "GIAO_HO",
      address,
      is_active = 1,
      phone,
      email,
      pastor_name,
      district,
      ward,
      latitude,
      longitude,
      description,
      code,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Tên giáo xứ/giáo họ không được để trống!",
      });
    }

    let imagePath = null;

    if (req.file) {
      imagePath = `uploads/church/${req.file.filename}`;
    } else if (req.body.image && typeof req.body.image === "string") {
      imagePath = req.body.image;
    }

    const parsedLat =
      latitude && !isNaN(parseFloat(latitude)) ? parseFloat(latitude) : null;

    const parsedLng =
      longitude && !isNaN(parseFloat(longitude)) ? parseFloat(longitude) : null;

    const parsedIsActive = Number(is_active) === 1 ? 1 : 0;

    const values = [
      name || null,
      type || "GIAO_HO",
      address || null,
      parsedIsActive,
      phone || null,
      email || null,
      pastor_name || null,
      district || null,
      ward || null,
      parsedLat,
      parsedLng,
      description || null,
      code || null,
      imagePath,
    ];

    const sql = `
      INSERT INTO churches (
        name,
        type,
        address,
        is_active,
        phone,
        email,
        pastor_name,
        district,
        ward,
        latitude,
        longitude,
        description,
        code,
        image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, values);

    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user?.id,
          action: "CREATE_CHURCH",
          target_type: "churches",
          target_id: result.insertId,
          description: `Tạo giáo xứ/họ: ${name}`,
          ip_address: req.ip,
        });
      }
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    return res.json({
      success: true,
      message: "Created successfully",
      id: result.insertId,
      image: imagePath,
    });
  } catch (err) {
    console.error("❌ CREATE CHURCH ERROR DETAILS:");
    console.error("Code:", err.code);
    console.error("SQL Message:", err.sqlMessage || err.message);

    return res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
    });
  }
};

// ======================================================
// 4. UPDATE
// ======================================================

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("===== UPDATE CHURCH REQUEST =====");
    console.log("ID:", id);
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const [oldRows] = await db.query(
      "SELECT image FROM churches WHERE id = ?",
      [id],
    );

    if (!oldRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở!",
      });
    }

    const oldImage = oldRows[0].image;

    const {
      name,
      type,
      address,
      is_active,
      phone,
      email,
      pastor_name,
      district,
      ward,
      latitude,
      longitude,
      description,
      code,
    } = req.body;

    let newImage = oldImage || null;

    if (req.file) {
      newImage = `uploads/church/${req.file.filename}`;

      if (oldImage && oldImage !== newImage) {
        deletePhysicalFile(oldImage);
      }
    } else if (req.body.image !== undefined) {
      newImage = req.body.image || null;

      if (oldImage && !newImage) {
        deletePhysicalFile(oldImage);
      }
    }

    const parsedLat =
      latitude !== undefined && latitude !== "" && !isNaN(parseFloat(latitude))
        ? parseFloat(latitude)
        : null;

    const parsedLng =
      longitude !== undefined &&
      longitude !== "" &&
      !isNaN(parseFloat(longitude))
        ? parseFloat(longitude)
        : null;

    const parsedIsActive =
      is_active !== undefined ? (Number(is_active) === 1 ? 1 : 0) : 1;

    await db.query(
      `
      UPDATE churches
      SET
        name = ?,
        type = ?,
        address = ?,
        is_active = ?,
        phone = ?,
        email = ?,
        pastor_name = ?,
        district = ?,
        ward = ?,
        latitude = ?,
        longitude = ?,
        description = ?,
        code = ?,
        image = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        name || null,
        type || "GIAO_HO",
        address || null,
        parsedIsActive,
        phone || null,
        email || null,
        pastor_name || null,
        district || null,
        ward || null,
        parsedLat,
        parsedLng,
        description || null,
        code || null,
        newImage,
        id,
      ],
    );

    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user?.id,
          action: "UPDATE_CHURCH",
          target_type: "churches",
          target_id: id,
          description: `Cập nhật giáo xứ ${name || id}`,
          ip_address: req.ip,
        });
      }
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    return res.json({
      success: true,
      message: "Updated successfully",
      image: newImage,
    });
  } catch (err) {
    console.error("❌ UPDATE CHURCH ERROR DETAILS:");

    console.error("Code:", err.code);

    console.error("SQL Message:", err.sqlMessage || err.message);

    return res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
    });
  }
};

// ======================================================
// 5. DELETE
// ======================================================

exports.remove = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    const [rows] = await db.query("SELECT image FROM churches WHERE id = ?", [
      churchId,
    ]);

    if (rows.length && rows[0].image) {
      deletePhysicalFile(rows[0].image);
    }

    await db.query("DELETE FROM churches WHERE id = ?", [churchId]);

    try {
      await writeLog({
        admin_id: req.user?.id,
        action: "DELETE_CHURCH",
        target_type: "churches",
        target_id: churchId,
        description: `Xóa giáo xứ ID ${churchId}`,
        ip_address: req.ip,
      });
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    return res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================================
// 6. TOGGLE ACTIVE
// ======================================================

exports.toggleActive = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    const [rows] = await db.query(
      `
      SELECT is_active
      FROM churches
      WHERE id = ?
      `,
      [churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    const newStatus = rows[0].is_active ? 0 : 1;

    await db.query(
      `
      UPDATE churches
      SET is_active = ?
      WHERE id = ?
      `,
      [newStatus, churchId],
    );

    try {
      await writeLog({
        admin_id: req.user?.id,
        action: "TOGGLE_CHURCH",
        target_type: "churches",
        target_id: churchId,
        description: "Cập nhật trạng thái giáo xứ",
        ip_address: req.ip,
      });
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    return res.json({
      success: true,
      message: "Updated",
      is_active: newStatus,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================================
// 7. SEARCH MAP
// ======================================================

exports.searchMap = async (req, res) => {
  try {
    const { lat, lng, radius = 10, type } = req.query;

    let typeCondition = "";
    let params = [lat, lng, lat, radius];

    if (type) {
      typeCondition = " AND type = ?";

      params.push(type);
    }

    const [rows] = await db.query(
      `
        SELECT
          *,
          (
            6371 * acos(
              cos(radians(?)) *
              cos(radians(latitude)) *
              cos(
                radians(longitude) -
                radians(?)
              ) +
              sin(radians(?)) *
              sin(radians(latitude))
            )
          ) AS distance

        FROM churches

        WHERE is_active = 1
        ${typeCondition}

        HAVING distance < ?

        ORDER BY distance ASC
        `,
      params,
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================================
// 8. ACTIVATE LICENSE
// CHỈ ADMIN HỆ THỐNG ĐƯỢC KÍCH HOẠT
// ======================================================

exports.activateLicense = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    // ==================================================
    // 1. KIỂM TRA ID
    // ==================================================

    if (!churchId || Number.isNaN(churchId)) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    // ==================================================
    // 2. KIỂM TRA ĐĂNG NHẬP
    // ==================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Chưa đăng nhập",
      });
    }

    // ==================================================
    // 3. CHỈ ADMIN HỆ THỐNG
    // ==================================================

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        code: "LICENSE_ACTIVATION_FORBIDDEN",
        message: "Chỉ quản trị hệ thống mới có quyền kích hoạt FaithEdu",
      });
    }

    // ==================================================
    // 4. KIỂM TRA GIÁO XỨ
    // ==================================================

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        code,
        license_status,
        trial_started_at,
        trial_expires_at,
        activated_at
      FROM churches
      WHERE id = ?
      LIMIT 1
      `,
      [churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    const church = rows[0];

    // ==================================================
    // 5. NẾU ĐÃ ACTIVE
    // ==================================================

    if (church.license_status === "active") {
      return res.status(200).json({
        success: true,
        already_active: true,
        message: "FaithEdu của giáo xứ này đã được kích hoạt trước đó",
        license: {
          status: "active",
          activated_at: church.activated_at,
          is_expired: false,
          is_active: true,
        },
        church: {
          id: Number(church.id),
          name: church.name,
          code: church.code,
        },
      });
    }

    // ==================================================
    // 6. KÍCH HOẠT
    // ==================================================

    await db.query(
      `
      UPDATE churches
      SET
        license_status = 'active',
        activated_at = NOW(),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [churchId],
    );

    // ==================================================
    // 7. LẤY LẠI DATA SAU KHI UPDATE
    // ==================================================

    const [updatedRows] = await db.query(
      `
        SELECT
          id,
          name,
          code,
          license_status,
          trial_started_at,
          trial_expires_at,
          activated_at
        FROM churches
        WHERE id = ?
        LIMIT 1
        `,
      [churchId],
    );

    const updatedChurch = updatedRows[0];

    // ==================================================
    // 8. GHI ACTIVITY LOG
    // ==================================================

    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user.id,

          action: "ACTIVATE_FAITHEDU_LICENSE",

          target_type: "churches",

          target_id: churchId,

          description: `Kích hoạt FaithEdu cho giáo xứ: ${church.name} (ID: ${churchId})`,

          ip_address: req.ip,
        });
      }
    } catch (logErr) {
      console.error(
        "Lỗi ghi activity log khi kích hoạt license:",
        logErr.message,
      );
    }

    // ==================================================
    // 9. RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      message: "Kích hoạt FaithEdu thành công",

      license: {
        status: updatedChurch.license_status,

        trial_started_at: updatedChurch.trial_started_at,

        trial_expires_at: updatedChurch.trial_expires_at,

        activated_at: updatedChurch.activated_at,

        days_remaining: null,

        is_expired: false,

        is_trial: false,

        is_active: true,
      },

      church: {
        id: Number(updatedChurch.id),

        name: updatedChurch.name,

        code: updatedChurch.code,
      },
    });
  } catch (err) {
    console.error("==========================================");

    console.error("❌ ACTIVATE LICENSE ERROR");

    console.error("==========================================");

    console.error("Message:", err.message);

    console.error("Code:", err.code);

    console.error("SQL State:", err.sqlState);

    console.error("SQL Message:", err.sqlMessage);

    console.error("Stack:", err.stack);

    console.error("==========================================");

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi kích hoạt FaithEdu",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

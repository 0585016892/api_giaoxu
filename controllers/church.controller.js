const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");
const fs = require("fs");
const path = require("path");

// Helper xóa file ảnh vật lý trên server nếu tồn tại
const deletePhysicalFile = (imagePath) => {
  if (!imagePath) return;
  try {
    // Lấy relative path nếu imagePath chứa domain hoặc đường dẫn đầy đủ
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

// =========================
// 1. GET ALL (SEARCH + FILTER + PAGINATION)
// =========================
// =========================
// 1. GET ALL (KÈM SỐ LƯỢNG GIÁO DÂN)
// =========================
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
    const offset = (page - 1) * limit;

    // Lưu ý: Đổi tên cột 'church_id' dưới đây nếu bảng parishioners dùng 'churches_id'
    let where = "WHERE 1=1";
    let params = [];

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

    if (type) {
      where += " AND c.type = ?";
      params.push(type);
    }

    if (district) {
      where += " AND c.district = ?";
      params.push(district);
    }

    if (ward) {
      where += " AND c.ward = ?";
      params.push(ward);
    }

    if (is_active !== undefined && is_active !== "") {
      where += " AND c.is_active = ?";
      params.push(is_active);
    }

    // COUNT TỔNG SỐ BẢN GHI CHURCHES
    const [[count]] = await db.query(
      `SELECT COUNT(*) as total FROM churches c ${where}`,
      params,
    );

    // SQL LEFT JOIN ĐỂ ĐẾM SỐ LƯỢNG GIÁO DÂN CỦA TỪNG GIÁO HỌ/XỨ
    // ⚠️ Nếu trong DB bạn dùng 'churches_id' thay vì 'church_id', hãy đổi p.church_id thành p.churches_id
    const sqlData = `
      SELECT 
        c.*,
        COUNT(p.id) AS total_parishioners
      FROM churches c
      LEFT JOIN parishioners p ON p.churches_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(sqlData, [...params, limit, offset]);

    res.json({
      data: rows,
      pagination: {
        total: count.total,
        page,
        limit,
        totalPages: Math.ceil(count.total / limit),
      },
    });
  } catch (err) {
    console.error("GET ALL CHURCHES ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// 2. GET BY ID (KÈM CHI TIẾT THỐNG KÊ GIÁO DÂN)
// =========================
exports.getById = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    // ==========================================
    // 1. Validate ID
    // ==========================================
    if (!churchId || Number.isNaN(churchId)) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    // ==========================================
    // 2. Lấy thông tin giáo xứ
    // + License
    // + Thống kê giáo dân
    // ==========================================
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

        -- ========================================
        -- LICENSE
        -- ========================================
        c.license_status,
        c.trial_started_at,
        c.trial_expires_at,
        c.activated_at,

        -- ========================================
        -- SYSTEM
        -- ========================================
        c.created_at,
        c.updated_at,

        -- ========================================
        -- PARISHIONERS STATISTICS
        -- ========================================
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

    // ==========================================
    // 3. Không tìm thấy
    // ==========================================
    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    const church = rows[0];

    // ==========================================
    // 4. Tính License
    // ==========================================
    let licenseStatus = church.license_status || "trial";

    let daysRemaining = null;
    let isExpired = false;

    const now = new Date();

    // ------------------------------------------
    // ACTIVE
    // ------------------------------------------

    if (licenseStatus === "active") {
      daysRemaining = null;
      isExpired = false;
    }

    // ------------------------------------------
    // TRIAL
    // ------------------------------------------
    else if (licenseStatus === "trial") {
      if (!church.trial_expires_at) {
        // Dữ liệu cũ chưa có ngày trial
        daysRemaining = null;
        isExpired = false;
      } else {
        const expiresAt = new Date(church.trial_expires_at);

        if (expiresAt <= now) {
          // Lazy update
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

    // ------------------------------------------
    // EXPIRED
    // ------------------------------------------
    else if (licenseStatus === "expired") {
      daysRemaining = 0;
      isExpired = true;
    }

    // ==========================================
    // 5. Chuẩn hóa response
    // ==========================================

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

        // ======================================
        // LICENSE
        // ======================================

        license_status: licenseStatus,

        trial_started_at: church.trial_started_at,

        trial_expires_at: church.trial_expires_at,

        activated_at: church.activated_at,

        days_remaining: daysRemaining,

        is_expired: isExpired,

        is_trial: licenseStatus === "trial",

        is_active_license: licenseStatus === "active",

        // ======================================
        // STATISTICS
        // ======================================

        total_parishioners: Number(church.total_parishioners || 0),

        total_male: Number(church.total_male || 0),

        total_female: Number(church.total_female || 0),

        // ======================================
        // SYSTEM
        // ======================================

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

// =========================
// 3. CREATE (CÓ HÌNH ẢNH)
// =========================
// =========================
// CREATE (CÓ PHÒNG THỦ LỖI 500)
// =========================
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

    // 1. Validate bắt buộc nhập Name
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Tên giáo xứ/giáo họ không được để trống!",
      });
    }

    // 2. Lấy đường dẫn ảnh từ Multer hoặc req.body.image
    let imagePath = null;
    if (req.file) {
      imagePath = `uploads/church/${req.file.filename}`;
    } else if (req.body.image && typeof req.body.image === "string") {
      imagePath = req.body.image;
    }

    // 3. Chuẩn hóa dữ liệu Tọa độ (Chuyển chuỗi rỗng "" thành null để tránh lỗi MySQL DECIMAL/FLOAT)
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
        name, type, address, is_active,
        phone, email, pastor_name,
        district, ward,
        latitude, longitude,
        description, code, image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, values);

    // 4. Ghi log & tạo thông báo (sử dụng try...catch riêng để nếu lỗi Log cũng không làm nghẽn API)
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
      console.error(
        "Lỗi ghi log/thông báo (Không ảnh hưởng đếm db):",
        logErr.message,
      );
    }

    res.json({
      success: true,
      message: "Created successfully",
      id: result.insertId,
      image: imagePath,
    });
  } catch (err) {
    // 📌 In ra thông tin chi tiết lỗi SQL chính xác tại Terminal Node.js
    console.error("❌ CREATE CHURCH ERROR DETAILS:");
    console.error("Code:", err.code);
    console.error("SQL Message:", err.sqlMessage || err.message);

    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
    });
  }
};

// =========================
// 4. UPDATE (CÓ HÌNH ẢNH)
// =========================
// =========================
// 4. UPDATE (CÓ PHÒNG THỦ LỖI 500 CHI TIẾT)
// =========================
exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("===== UPDATE CHURCH REQUEST =====");
    console.log("ID:", id);
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    // 1. Lấy thông tin bản ghi cũ để kiểm tra
    const [oldRows] = await db.query(
      "SELECT image FROM churches WHERE id = ?",
      [id],
    );
    if (!oldRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy cơ sở!" });
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

    // 2. Xác định đường dẫn ảnh mới
    let newImage = oldImage || null;

    if (req.file) {
      newImage = `uploads/church/${req.file.filename}`;
      // Xóa ảnh cũ trên đĩa nếu có tải ảnh mới
      if (oldImage && oldImage !== newImage) {
        deletePhysicalFile(oldImage);
      }
    } else if (req.body.image !== undefined) {
      newImage = req.body.image || null;
      // Nếu người dùng chủ động xóa bỏ ảnh (chuỗi rỗng "")
      if (oldImage && !newImage) {
        deletePhysicalFile(oldImage);
      }
    }

    // 3. Chuẩn hóa dữ liệu để tránh lỗi MySQL Type / Bind Undefined
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

    // 4. Thực thi UPDATE
    await db.query(
      `UPDATE churches SET
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
      WHERE id = ?`,
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

    // 5. Ghi log & Thông báo (Bọc try-catch riêng để tránh treo API nếu lỗi log)
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
      console.error("Lỗi ghi log/thông báo khi update:", logErr.message);
    }

    res.json({
      success: true,
      message: "Updated successfully",
      image: newImage,
    });
  } catch (err) {
    // 📌 In thông tin lỗi chi tiết chính xác tại Terminal Node.js
    console.error("❌ UPDATE CHURCH ERROR DETAILS:");
    console.error("Code:", err.code);
    console.error("SQL Message:", err.sqlMessage || err.message);

    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
    });
  }
};
// =========================
// 5. DELETE (XÓA CẢ ẢNH TRÊN DISK)
// =========================
exports.remove = async (req, res) => {
  try {
    // Lấy thông tin ảnh trước khi xóa bản ghi trong CSDL
    const [rows] = await db.query("SELECT image FROM churches WHERE id = ?", [
      req.params.id,
    ]);

    if (rows.length && rows[0].image) {
      deletePhysicalFile(rows[0].image);
    }

    await db.query("DELETE FROM churches WHERE id = ?", [req.params.id]);

    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_CHURCH",
      target_type: "churches",
      target_id: req.params.id,
      description: `Xóa giáo xứ ID ${req.params.id}`,
      ip_address: req.ip,
    });

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// 6. TOGGLE ACTIVE
// =========================
exports.toggleActive = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT is_active FROM churches WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const newStatus = rows[0].is_active ? 0 : 1;

    await db.query("UPDATE churches SET is_active=? WHERE id=?", [
      newStatus,
      req.params.id,
    ]);

    await writeLog({
      admin_id: req.user?.id,
      action: "TOGGLE_CHURCH",
      target_type: "churches",
      target_id: req.params.id,
      description: `Cập nhật trạng thái giáo xứ`,
      ip_address: req.ip,
    });

    res.json({
      message: "Updated",
      is_active: newStatus,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// 7. SEARCH MAP (LAT LNG FILTER)
// =========================
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
      `SELECT *,
      (6371 * acos(
        cos(radians(?)) *
        cos(radians(latitude)) *
        cos(radians(longitude) - radians(?)) +
        sin(radians(?)) *
        sin(radians(latitude))
      )) AS distance
      FROM churches
      WHERE is_active = 1 ${typeCondition}
      HAVING distance < ?
      ORDER BY distance ASC`,
      params,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

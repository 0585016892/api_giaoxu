const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");
const { createNotification } = require("../services/notification.service");
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
    // ⚠️ Nếu trong DB dùng 'churches_id', hãy đổi p.church_id -> p.churches_id
    const sql = `
      SELECT 
        c.*,
        COUNT(p.id) AS total_parishioners,
        SUM(CASE WHEN p.gender = 'NAM' OR p.gender = 'MALE' THEN 1 ELSE 0 END) AS total_male,
        SUM(CASE WHEN p.gender = 'NỮ' OR p.gender = 'FEMALE' THEN 1 ELSE 0 END) AS total_female
      FROM churches c
      LEFT JOIN parishioners p ON p.churches_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `;

    const [rows] = await db.query(sql, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET CHURCH BY ID ERROR:", err);
    res.status(500).json({ message: err.message });
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

      if (typeof createNotification === "function") {
        await createNotification({
          type: "CREATE_CHURCH",
          title: "Giáo xứ mới",
          content: `${name} vừa được tạo`,
          created_by: req.user?.id,
          related_type: "churches",
          related_id: result.insertId,
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

      if (typeof createNotification === "function") {
        await createNotification({
          type: "UPDATE_CHURCH",
          title: "Cập nhật giáo xứ",
          content: `Một giáo xứ vừa được cập nhật`,
          created_by: req.user?.id,
          related_type: "churches",
          related_id: id,
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

    await createNotification({
      type: "DELETE_CHURCH",
      title: "Xóa giáo xứ",
      content: `Một giáo xứ vừa bị xóa`,
      created_by: req.user?.id,
      related_type: "churches",
      related_id: req.params.id,
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

    await createNotification({
      type: "CHURCH_STATUS",
      title: "Trạng thái giáo xứ",
      content: `Giáo xứ ID ${req.params.id} vừa đổi trạng thái`,
      created_by: req.user?.id,
      related_type: "churches",
      related_id: req.params.id,
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

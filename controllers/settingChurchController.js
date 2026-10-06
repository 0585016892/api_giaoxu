const path = require("path");
const fs = require("fs");
const db = require("../config/db");

// ============================================================
// XÓA FILE CŨ
// ============================================================

const deleteOldFile = (fileUrl) => {
  try {
    if (!fileUrl) {
      return;
    }

    let filePath = fileUrl;

    // --------------------------------------------------------
    // Nếu DB lưu:
    // /uploads/church-settings/abc.png
    // --------------------------------------------------------

    if (filePath.startsWith("/")) {
      filePath = filePath.substring(1);
    }

    const absolutePath = path.join(process.cwd(), filePath);

    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);

      console.log("[FILE] Deleted old file:", absolutePath);
    }
  } catch (error) {
    console.error("[FILE] Cannot delete old file:", error.message);
  }
};
const getChurchId = (req) => {
  return req.user?.church_id || req.user?.parish_id || null;
};
// ============================================================
// UPDATE CHURCH SETTINGS
// ============================================================

exports.updateChurchSettings = async (req, res) => {
  try {
    console.log("");
    console.log("============================================================");
    console.log("                UPDATE CHURCH SETTINGS");
    console.log("============================================================");

    // ========================================================
    // 1. CHURCH ID
    // ========================================================

    const churchId = getChurchId(req);

    console.log("[CHURCH SETTINGS] CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // ========================================================
    // 2. FILE UPLOAD
    // ========================================================

    const logoFile = req.files?.logo?.[0] || null;

    const coverImageFile = req.files?.cover_image?.[0] || null;

    console.log(
      "[UPLOAD] LOGO:",
      logoFile ? logoFile.originalname : "Không upload",
    );

    console.log(
      "[UPLOAD] COVER:",
      coverImageFile ? coverImageFile.originalname : "Không upload",
    );

    // ========================================================
    // 3. KIỂM TRA / TẠO BẢNG
    // ========================================================

    await db.query(`
      CREATE TABLE IF NOT EXISTS setting_church (
        id INT NOT NULL AUTO_INCREMENT,
        church_id INT NOT NULL,

        logo VARCHAR(500) DEFAULT NULL,
        cover_image VARCHAR(500) DEFAULT NULL,
        slogan VARCHAR(255) DEFAULT NULL,

        catechism_enabled TINYINT(1) NOT NULL DEFAULT 1,
        catechism_attendance_enabled TINYINT(1) NOT NULL DEFAULT 1,
        catechism_start_time TIME DEFAULT NULL,
        catechism_end_time TIME DEFAULT NULL,

        allow_late TINYINT(1) NOT NULL DEFAULT 1,
        late_minutes INT NOT NULL DEFAULT 15,
        auto_absent TINYINT(1) NOT NULL DEFAULT 0,

        attendance_enabled TINYINT(1) NOT NULL DEFAULT 1,
        attendance_qr_enabled TINYINT(1) NOT NULL DEFAULT 1,
        attendance_manual_enabled TINYINT(1) NOT NULL DEFAULT 1,
        attendance_edit_enabled TINYINT(1) NOT NULL DEFAULT 1,

        attendance_duration_minutes INT NOT NULL DEFAULT 120,
        attendance_auto_lock TINYINT(1) NOT NULL DEFAULT 1,
        attendance_auto_absent TINYINT(1) NOT NULL DEFAULT 0,
        attendance_late_enabled TINYINT(1) NOT NULL DEFAULT 1,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),

        UNIQUE KEY uk_setting_church_church_id (church_id),

        CONSTRAINT fk_setting_church_church
          FOREIGN KEY (church_id)
          REFERENCES churches(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE

      ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
    `);

    // ========================================================
    // 4. LẤY SETTING HIỆN TẠI
    // ========================================================

    const [currentRows] = await db.query(
      `
      SELECT *
      FROM setting_church
      WHERE church_id = ?
      LIMIT 1
      `,
      [churchId],
    );

    const currentSetting = currentRows[0] || null;

    console.log("[SETTING] CURRENT:", currentSetting);

    // ========================================================
    // 5. REQUEST BODY
    // ========================================================

    const {
      slogan = null,

      catechism_enabled = true,
      catechism_attendance_enabled = true,

      catechism_start_time = null,
      catechism_end_time = null,

      allow_late = true,
      late_minutes = 15,
      auto_absent = false,

      attendance_enabled = true,
      attendance_qr_enabled = true,
      attendance_manual_enabled = true,
      attendance_edit_enabled = true,

      attendance_duration_minutes = 120,
      attendance_auto_lock = true,
      attendance_auto_absent = false,
      attendance_late_enabled = true,
    } = req.body || {};

    console.log("[REQUEST BODY]", req.body);

    // ========================================================
    // 6. IMAGE PATH
    // ========================================================

    let logo = currentSetting?.logo || null;

    let coverImage = currentSetting?.cover_image || null;

    // --------------------------------------------------------
    // LOGO MỚI
    // --------------------------------------------------------

    if (logoFile) {
      logo = `/uploads/church-settings/${logoFile.filename}`;

      console.log("[UPLOAD] NEW LOGO:", logo);
    }

    // --------------------------------------------------------
    // COVER MỚI
    // --------------------------------------------------------

    if (coverImageFile) {
      coverImage = `/uploads/church-settings/${coverImageFile.filename}`;

      console.log("[UPLOAD] NEW COVER:", coverImage);
    }

    // ========================================================
    // 7. VALIDATE NUMBER
    // ========================================================

    const safeLateMinutes = Math.max(0, Number(late_minutes) || 0);

    const safeAttendanceDuration = Math.max(
      1,
      Number(attendance_duration_minutes) || 120,
    );

    // ========================================================
    // 8. UPSERT
    // ========================================================

    await db.query(
      `
      INSERT INTO setting_church (
        church_id,

        logo,
        cover_image,
        slogan,

        catechism_enabled,
        catechism_attendance_enabled,
        catechism_start_time,
        catechism_end_time,

        allow_late,
        late_minutes,
        auto_absent,

        attendance_enabled,
        attendance_qr_enabled,
        attendance_manual_enabled,
        attendance_edit_enabled,

        attendance_duration_minutes,
        attendance_auto_lock,
        attendance_auto_absent,
        attendance_late_enabled

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

      ON DUPLICATE KEY UPDATE

        logo = VALUES(logo),

        cover_image = VALUES(cover_image),

        slogan = VALUES(slogan),

        catechism_enabled =
          VALUES(catechism_enabled),

        catechism_attendance_enabled =
          VALUES(catechism_attendance_enabled),

        catechism_start_time =
          VALUES(catechism_start_time),

        catechism_end_time =
          VALUES(catechism_end_time),

        allow_late =
          VALUES(allow_late),

        late_minutes =
          VALUES(late_minutes),

        auto_absent =
          VALUES(auto_absent),

        attendance_enabled =
          VALUES(attendance_enabled),

        attendance_qr_enabled =
          VALUES(attendance_qr_enabled),

        attendance_manual_enabled =
          VALUES(attendance_manual_enabled),

        attendance_edit_enabled =
          VALUES(attendance_edit_enabled),

        attendance_duration_minutes =
          VALUES(attendance_duration_minutes),

        attendance_auto_lock =
          VALUES(attendance_auto_lock),

        attendance_auto_absent =
          VALUES(attendance_auto_absent),

        attendance_late_enabled =
          VALUES(attendance_late_enabled)
      `,
      [
        churchId,

        logo,
        coverImage,
        slogan,

        Number(!!catechism_enabled),
        Number(!!catechism_attendance_enabled),

        catechism_start_time || null,
        catechism_end_time || null,

        Number(!!allow_late),
        safeLateMinutes,
        Number(!!auto_absent),

        Number(!!attendance_enabled),
        Number(!!attendance_qr_enabled),
        Number(!!attendance_manual_enabled),
        Number(!!attendance_edit_enabled),

        safeAttendanceDuration,

        Number(!!attendance_auto_lock),
        Number(!!attendance_auto_absent),
        Number(!!attendance_late_enabled),
      ],
    );

    // ========================================================
    // 9. XÓA ẢNH CŨ SAU KHI UPDATE DB THÀNH CÔNG
    // ========================================================

    if (logoFile && currentSetting?.logo && currentSetting.logo !== logo) {
      console.log("[FILE] DELETE OLD LOGO:", currentSetting.logo);

      deleteOldFile(currentSetting.logo);
    }

    if (
      coverImageFile &&
      currentSetting?.cover_image &&
      currentSetting.cover_image !== coverImage
    ) {
      console.log("[FILE] DELETE OLD COVER:", currentSetting.cover_image);

      deleteOldFile(currentSetting.cover_image);
    }

    // ========================================================
    // 10. LẤY DATA SAU UPDATE
    // ========================================================

    const [rows] = await db.query(
      `
      SELECT *
      FROM setting_church
      WHERE church_id = ?
      LIMIT 1
      `,
      [churchId],
    );

    console.log("[SETTING] UPDATED:", rows[0]);

    // ========================================================
    // 11. RESPONSE
    // ========================================================

    return res.json({
      success: true,

      message: "Cập nhật cấu hình giáo xứ thành công",

      data: rows[0],
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("              UPDATE CHURCH SETTINGS ERROR");
    console.error(
      "============================================================",
    );

    console.error("[ERROR MESSAGE]:", error.message);

    console.error("[ERROR STACK]:", error.stack);

    // ========================================================
    // MULTER ERROR
    // ========================================================

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Ảnh tải lên không được vượt quá 5MB",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật cấu hình giáo xứ",

      error: error.message,
    });
  }
};

// ============================================================
// GET CHURCH SETTINGS
// GET /api/settings/church
// ============================================================
exports.getChurchSettings = async (req, res) => {
  try {
    console.log("");
    console.log("============================================================");
    console.log("                  GET CHURCH SETTINGS");
    console.log("============================================================");

    const churchId = getChurchId(req);

    console.log("CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // ========================================================
    // 1. KIỂM TRA / TẠO BẢNG
    // ========================================================
    await db.query(`
      CREATE TABLE IF NOT EXISTS setting_church (
        id INT NOT NULL AUTO_INCREMENT,
        church_id INT NOT NULL,

        logo VARCHAR(500) DEFAULT NULL,
        cover_image VARCHAR(500) DEFAULT NULL,
        slogan VARCHAR(255) DEFAULT NULL,

        catechism_enabled TINYINT(1) NOT NULL DEFAULT 1,
        catechism_attendance_enabled TINYINT(1) NOT NULL DEFAULT 1,
        catechism_start_time TIME DEFAULT NULL,
        catechism_end_time TIME DEFAULT NULL,

        allow_late TINYINT(1) NOT NULL DEFAULT 1,
        late_minutes INT NOT NULL DEFAULT 15,
        auto_absent TINYINT(1) NOT NULL DEFAULT 0,

        attendance_enabled TINYINT(1) NOT NULL DEFAULT 1,
        attendance_qr_enabled TINYINT(1) NOT NULL DEFAULT 1,
        attendance_manual_enabled TINYINT(1) NOT NULL DEFAULT 1,
        attendance_edit_enabled TINYINT(1) NOT NULL DEFAULT 1,

        attendance_duration_minutes INT NOT NULL DEFAULT 120,
        attendance_auto_lock TINYINT(1) NOT NULL DEFAULT 1,
        attendance_auto_absent TINYINT(1) NOT NULL DEFAULT 0,
        attendance_late_enabled TINYINT(1) NOT NULL DEFAULT 1,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        UNIQUE KEY uk_setting_church_church_id (church_id),

        CONSTRAINT fk_setting_church_church
          FOREIGN KEY (church_id)
          REFERENCES churches(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE

      ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
    `);

    console.log("SETTING TABLE: OK");

    // ========================================================
    // 2. LẤY SETTING
    // ========================================================
    const [rows] = await db.query(
      `
      SELECT
        id,
        church_id,

        logo,
        cover_image,
        slogan,

        catechism_enabled,
        catechism_attendance_enabled,
        catechism_start_time,
        catechism_end_time,

        allow_late,
        late_minutes,
        auto_absent,

        attendance_enabled,
        attendance_qr_enabled,
        attendance_manual_enabled,
        attendance_edit_enabled,
        attendance_duration_minutes,
        attendance_auto_lock,
        attendance_auto_absent,
        attendance_late_enabled,

        created_at,
        updated_at

      FROM setting_church
      WHERE church_id = ?
      LIMIT 1
      `,
      [churchId],
    );

    // ========================================================
    // 3. CHƯA CÓ → TẠO MẶC ĐỊNH
    // ========================================================
    if (!rows.length) {
      console.log("SETTING: CHƯA CÓ → TẠO MẶC ĐỊNH");

      await db.query(
        `
        INSERT INTO setting_church (
          church_id
        )
        VALUES (?)
        `,
        [churchId],
      );

      const [newRows] = await db.query(
        `
        SELECT *
        FROM setting_church
        WHERE church_id = ?
        LIMIT 1
        `,
        [churchId],
      );

      console.log("SETTING: CREATED");
      console.log("SETTING ID:", newRows[0]?.id);

      return res.json({
        success: true,
        message: "Lấy cấu hình giáo xứ thành công",
        data: newRows[0],
      });
    }

    console.log("SETTING ID:", rows[0].id);

    return res.json({
      success: true,
      message: "Lấy cấu hình giáo xứ thành công",
      data: rows[0],
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("               GET CHURCH SETTINGS ERROR");
    console.error(
      "============================================================",
    );
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy cấu hình giáo xứ",
      error: error.message,
    });
  }
};

const path = require("path");
const fs = require("fs");
const db = require("../config/db");

// ============================================================
// CONSTANTS
// ============================================================

const UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "church-settings",
);

const BOOLEAN_FIELDS = [
  "catechism_enabled",
  "catechism_attendance_enabled",
  "allow_late",
  "auto_absent",
  "attendance_enabled",
  "attendance_qr_enabled",
  "attendance_manual_enabled",
  "attendance_edit_enabled",
  "attendance_auto_lock",
  "attendance_auto_absent",
  "attendance_late_enabled",
  "bot_enabled",
];

const INTEGER_FIELDS = {
  late_minutes: {
    min: 0,
    max: 1440,
    defaultValue: 15,
  },
  attendance_duration_minutes: {
    min: 1,
    max: 10080,
    defaultValue: 120,
  },
};

const ALLOWED_BODY_FIELDS = new Set([
  "slogan",
  ...BOOLEAN_FIELDS,
  "catechism_start_time",
  "catechism_end_time",
  ...Object.keys(INTEGER_FIELDS),
]);

const SETTINGS_COLUMNS = [
  "id",
  "church_id",
  "logo",
  "cover_image",
  "slogan",
  "catechism_enabled",
  "catechism_attendance_enabled",
  "catechism_start_time",
  "catechism_end_time",
  "allow_late",
  "late_minutes",
  "auto_absent",
  "attendance_enabled",
  "attendance_qr_enabled",
  "attendance_manual_enabled",
  "attendance_edit_enabled",
  "attendance_duration_minutes",
  "attendance_auto_lock",
  "attendance_auto_absent",
  "attendance_late_enabled",
  "created_at",
  "updated_at",
  "bot_enabled",
];

// ============================================================
// REQUEST ID
// ============================================================

const createRequestId = (prefix = "CHURCH-SETTINGS") => {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
};

// ============================================================
// GET CHURCH ID
// ============================================================

const getChurchId = (req) => {
  const rawChurchId = req.user?.church_id ?? req.user?.parish_id ?? null;

  if (rawChurchId === null || rawChurchId === undefined || rawChurchId === "") {
    return null;
  }

  const churchId = Number(rawChurchId);

  if (!Number.isSafeInteger(churchId) || churchId <= 0) {
    return null;
  }

  return churchId;
};

// ============================================================
// PARSE BOOLEAN
// ============================================================

const parseBoolean = (value, fieldName) => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value === 1 || value === "1") {
    return 1;
  }

  if (value === 0 || value === "0") {
    return 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return 1;
    }

    if (normalized === "false") {
      return 0;
    }
  }

  throw new Error(`Trường ${fieldName} chỉ chấp nhận true, false, 1 hoặc 0`);
};

// ============================================================
// PARSE INTEGER
// ============================================================

const parseInteger = (value, fieldName) => {
  const config = INTEGER_FIELDS[fieldName];

  if (!config) {
    throw new Error(`Trường số không hợp lệ: ${fieldName}`);
  }

  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new Error(`Trường ${fieldName} không được để trống`);
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < config.min ||
    number > config.max
  ) {
    throw new Error(
      `${fieldName} phải là số nguyên từ ${config.min} đến ${config.max}`,
    );
  }

  return number;
};

// ============================================================
// PARSE SLOGAN
// ============================================================

const parseSlogan = (value) => {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Slogan không hợp lệ");
  }

  const slogan = value.trim();

  if (slogan.length > 255) {
    throw new Error("Slogan không được vượt quá 255 ký tự");
  }

  return slogan || null;
};

// ============================================================
// PARSE TIME
// ============================================================

const parseTime = (value, fieldName) => {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Thời gian ${fieldName} không hợp lệ`);
  }

  const time = value.trim();

  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);

  if (!match) {
    throw new Error(`${fieldName} phải có định dạng HH:mm hoặc HH:mm:ss`);
  }

  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
};

// ============================================================
// VALIDATE REQUEST BODY
// ============================================================

const validateRequestBody = (body) => {
  const updates = {};

  for (const [field, value] of Object.entries(body || {})) {
    if (!ALLOWED_BODY_FIELDS.has(field)) {
      console.warn("[CHURCH SETTINGS] Bỏ qua trường:", field);
      continue;
    }

    if (BOOLEAN_FIELDS.includes(field)) {
      updates[field] = parseBoolean(value, field);
      continue;
    }

    if (field === "slogan") {
      updates[field] = parseSlogan(value);
      continue;
    }

    if (field === "catechism_start_time" || field === "catechism_end_time") {
      updates[field] = parseTime(value, field);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(INTEGER_FIELDS, field)) {
      updates[field] = parseInteger(value, field);
    }
  }

  return updates;
};

// ============================================================
// FILE PATH
// Chỉ thao tác với file trong uploads/church-settings
// ============================================================

const getManagedFilePath = (fileUrl) => {
  if (typeof fileUrl !== "string" || !fileUrl.trim()) {
    return null;
  }

  const normalized = fileUrl.replace(/\\/g, "/");

  const match = normalized.match(/^\/?uploads\/church-settings\/([^/]+)$/);

  if (!match) {
    console.warn(
      "[CHURCH SETTINGS] Không xóa đường dẫn ngoài thư mục quản lý:",
      fileUrl,
    );

    return null;
  }

  const filename = match[1];

  if (filename === "." || filename === ".." || filename.includes("\0")) {
    return null;
  }

  const absolutePath = path.resolve(UPLOAD_DIRECTORY, filename);

  if (path.dirname(absolutePath) !== UPLOAD_DIRECTORY) {
    return null;
  }

  return absolutePath;
};

// ============================================================
// DELETE OLD FILE
// ============================================================

const deleteOldFile = (fileUrl) => {
  try {
    const absolutePath = getManagedFilePath(fileUrl);

    if (!absolutePath) {
      return;
    }

    if (!fs.existsSync(absolutePath)) {
      console.log("[FILE] File không tồn tại:", absolutePath);
      return;
    }

    fs.unlinkSync(absolutePath);

    console.log("[FILE] Đã xóa file:", absolutePath);
  } catch (error) {
    console.error("[FILE] Lỗi xóa file:", error.message);
  }
};

// ============================================================
// CLEANUP UPLOADED FILES
// ============================================================

const cleanupUploadedFiles = (files) => {
  const uploadedFiles = [files?.logo?.[0], files?.cover_image?.[0]].filter(
    Boolean,
  );

  for (const file of uploadedFiles) {
    if (!file?.filename) {
      continue;
    }

    deleteOldFile(`/uploads/church-settings/${path.basename(file.filename)}`);
  }
};

// ============================================================
// NORMALIZE RESPONSE
// ============================================================

const normalizeSettings = (setting) => {
  if (!setting) {
    return null;
  }

  const result = { ...setting };

  for (const field of BOOLEAN_FIELDS) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = Number(result[field]) === 1;
    }
  }

  for (const field of Object.keys(INTEGER_FIELDS)) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = Number(result[field]);
    }
  }

  return result;
};

// ============================================================
// SELECT SETTINGS
// ============================================================

const selectChurchSettings = async (churchId) => {
  const [rows] = await db.query(
    `
      SELECT ${SETTINGS_COLUMNS.join(", ")}
      FROM setting_church
      WHERE church_id = ?
      LIMIT 1
    `,
    [churchId],
  );

  return rows[0] || null;
};

// ============================================================
// ENSURE SETTINGS EXISTS
// ============================================================

const ensureChurchSettings = async (churchId) => {
  await db.query(
    `
      INSERT IGNORE INTO setting_church (church_id)
      VALUES (?)
    `,
    [churchId],
  );

  return selectChurchSettings(churchId);
};

// ============================================================
// GET CHURCH SETTINGS
// GET /api/settings/church
// ============================================================

exports.getChurchSettings = async (req, res) => {
  const requestId = createRequestId("GET-SETTINGS");

  console.log("");
  console.log("============================================================");
  console.log(`[${requestId}] GET CHURCH SETTINGS`);
  console.log("============================================================");

  try {
    const churchId = getChurchId(req);

    console.log(`[${requestId}] CHURCH ID:`, churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const setting = await ensureChurchSettings(churchId);

    if (!setting) {
      throw new Error("Không thể khởi tạo cấu hình giáo xứ");
    }

    console.log(`[${requestId}] SETTING ID:`, setting.id);
    console.log(`[${requestId}] GET SUCCESS`);

    return res.status(200).json({
      success: true,
      message: "Lấy cấu hình giáo xứ thành công",
      data: normalizeSettings(setting),
    });
  } catch (error) {
    console.error(`[${requestId}] GET ERROR:`, error.message);
    console.error(error.stack);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy cấu hình giáo xứ",
    });
  }
};

// ============================================================
// UPDATE CHURCH SETTINGS
// PUT /api/settings/church
// ============================================================

exports.updateChurchSettings = async (req, res) => {
  const requestId = createRequestId("UPDATE-SETTINGS");

  let databaseUpdated = false;

  console.log("");
  console.log("============================================================");
  console.log(`[${requestId}] UPDATE CHURCH SETTINGS`);
  console.log("============================================================");

  try {
    const churchId = getChurchId(req);

    console.log(`[${requestId}] CHURCH ID:`, churchId);
    console.log(`[${requestId}] BODY:`, req.body);
    console.log(
      `[${requestId}] LOGO:`,
      req.files?.logo?.[0]?.originalname || "Không thay đổi",
    );
    console.log(
      `[${requestId}] COVER:`,
      req.files?.cover_image?.[0]?.originalname || "Không thay đổi",
    );

    if (!churchId) {
      cleanupUploadedFiles(req.files);

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // 1. Validate dữ liệu trước khi ghi database.
    const updates = validateRequestBody(req.body);

    // 2. Đảm bảo cấu hình tồn tại.
    const currentSetting = await ensureChurchSettings(churchId);

    if (!currentSetting) {
      throw new Error("Không thể lấy cấu hình giáo xứ hiện tại");
    }

    const logoFile = req.files?.logo?.[0] || null;
    const coverImageFile = req.files?.cover_image?.[0] || null;

    // 3. Chỉ thay đổi đường dẫn khi thực sự có file mới.
    const newLogo = logoFile
      ? `/uploads/church-settings/${path.basename(logoFile.filename)}`
      : currentSetting.logo;

    const newCoverImage = coverImageFile
      ? `/uploads/church-settings/${path.basename(coverImageFile.filename)}`
      : currentSetting.cover_image;

    const updateValues = {
      ...updates,
    };

    if (logoFile) {
      updateValues.logo = newLogo;
    }

    if (coverImageFile) {
      updateValues.cover_image = newCoverImage;
    }

    const columns = Object.keys(updateValues);

    // Không có thay đổi thì trả cấu hình hiện tại.
    if (columns.length === 0) {
      console.log(`[${requestId}] Không có trường cần cập nhật`);

      return res.status(200).json({
        success: true,
        message: "Không có thay đổi cần cập nhật",
        data: normalizeSettings(currentSetting),
      });
    }

    // 4. Cập nhật các trường được phép.
    const setClause = columns.map((column) => `\`${column}\` = ?`).join(", ");

    const values = columns.map((column) => updateValues[column]);

    await db.query(
      `
        UPDATE setting_church
        SET ${setClause}
        WHERE church_id = ?
        LIMIT 1
      `,
      [...values, churchId],
    );

    databaseUpdated = true;

    console.log(`[${requestId}] DATABASE UPDATE SUCCESS`);

    // 5. Xóa ảnh cũ sau khi database đã lưu đường dẫn mới.
    if (logoFile && currentSetting.logo && currentSetting.logo !== newLogo) {
      deleteOldFile(currentSetting.logo);
    }

    if (
      coverImageFile &&
      currentSetting.cover_image &&
      currentSetting.cover_image !== newCoverImage
    ) {
      deleteOldFile(currentSetting.cover_image);
    }

    // 6. Lấy dữ liệu mới nhất.
    const updatedSetting = await selectChurchSettings(churchId);

    if (!updatedSetting) {
      throw new Error("Không thể đọc cấu hình sau khi cập nhật");
    }

    console.log(`[${requestId}] UPDATE SUCCESS`);
    console.log(`[${requestId}] SETTING ID:`, updatedSetting.id);

    return res.status(200).json({
      success: true,
      message: "Cập nhật cấu hình giáo xứ thành công",
      data: normalizeSettings(updatedSetting),
    });
  } catch (error) {
    console.error(`[${requestId}] UPDATE ERROR:`, error.message);
    console.error(error.stack);

    // Nếu chưa cập nhật DB thành công thì xóa các file upload mới.
    if (!databaseUpdated) {
      cleanupUploadedFiles(req.files);
    }

    const validationError =
      error.message?.startsWith("Trường ") ||
      error.message?.startsWith("Slogan ") ||
      error.message?.startsWith("Thời gian ") ||
      error.message?.startsWith("late_minutes ") ||
      error.message?.startsWith("attendance_duration_minutes ");

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Ảnh tải lên không được vượt quá 5MB",
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Trường upload ảnh không hợp lệ",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật cấu hình giáo xứ",
    });
  }
};

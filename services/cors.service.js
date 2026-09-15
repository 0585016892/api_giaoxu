const db = require("../config/db");

let allowedOrigins = new Set();

/**
 * Chuẩn hóa origin
 */
const normalizeOrigin = (origin) => {
  if (!origin) return "";

  return String(origin).trim().replace(/\/+$/, "");
};

/**
 * Load CORS từ database
 */
const loadCorsOrigins = async () => {
  try {
    const [rows] = await db.query(`
      SELECT origin
      FROM cors_origins
      WHERE is_active = 1
      ORDER BY id ASC
    `);

    allowedOrigins = new Set(
      rows.map((row) => normalizeOrigin(row.origin)).filter(Boolean),
    );

    console.log(`✅ CORS loaded: ${allowedOrigins.size} domains`);

    return getAllowedOrigins();
  } catch (error) {
    console.error("❌ LOAD CORS ERROR:", error);

    throw error;
  }
};

/**
 * Reload sau khi thêm / sửa / xóa
 */
const reloadCorsOrigins = async () => {
  return await loadCorsOrigins();
};

/**
 * Kiểm tra origin
 */
const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(normalizeOrigin(origin));
};

/**
 * Lấy cache hiện tại
 */
const getAllowedOrigins = () => {
  return Array.from(allowedOrigins);
};

/**
 * Kiểm tra format origin
 */
// =====================================================
// VALIDATE CORS ORIGIN
// Hỗ trợ:
// - http://
// - https://
// - faith:// (Electron)
// =====================================================

const validateOrigin = (value) => {
  if (!value || typeof value !== "string") {
    return {
      valid: false,
      message: "Origin không được để trống",
    };
  }

  const origin = value.trim().replace(/\/+$/, "");

  let parsed;

  try {
    parsed = new URL(origin);
  } catch (error) {
    return {
      valid: false,
      message:
        "Origin không hợp lệ. Ví dụ: https://giaolyso.site hoặc faith://app",
    };
  }

  // =====================================================
  // CHỈ CHO PHÉP CÁC SCHEME
  // =====================================================

  const allowedProtocols = ["http:", "https:", "faith:"];

  if (!allowedProtocols.includes(parsed.protocol)) {
    return {
      valid: false,
      message: "Origin chỉ hỗ trợ http://, https:// hoặc faith://",
    };
  }

  // =====================================================
  // KHÔNG CHO PATH
  // =====================================================

  if (parsed.pathname && parsed.pathname !== "/") {
    return {
      valid: false,
      message:
        "Origin không được chứa đường dẫn. Ví dụ đúng: https://giaolyso.site",
    };
  }

  // =====================================================
  // KHÔNG QUERY / HASH
  // =====================================================

  if (parsed.search || parsed.hash) {
    return {
      valid: false,
      message: "Origin không được chứa query hoặc hash",
    };
  }

  // =====================================================
  // KHÔNG USERNAME / PASSWORD
  // =====================================================

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      message: "Origin không được chứa username hoặc password",
    };
  }

  // =====================================================
  // FAITH://
  // =====================================================

  if (parsed.protocol === "faith:") {
    if (!parsed.hostname) {
      return {
        valid: false,
        message: "Origin faith:// phải có hostname. Ví dụ: faith://app",
      };
    }

    // Electron của FaithEdu hiện dùng chính xác:
    // faith://app
    return {
      valid: true,
      origin: `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`,
    };
  }

  // =====================================================
  // HTTP / HTTPS
  // =====================================================

  if (!parsed.hostname) {
    return {
      valid: false,
      message: "Origin phải có domain hợp lệ",
    };
  }

  return {
    valid: true,
    origin: `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`,
  };
};

module.exports = {
  loadCorsOrigins,
  reloadCorsOrigins,
  isOriginAllowed,
  getAllowedOrigins,
  validateOrigin,
  normalizeOrigin,
};

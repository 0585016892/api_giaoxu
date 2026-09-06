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
const validateOrigin = (origin) => {
  try {
    const normalized = normalizeOrigin(origin);

    if (!normalized) {
      return {
        valid: false,
        message: "Origin không được để trống",
      };
    }

    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        valid: false,
        message: "Origin phải sử dụng http hoặc https",
      };
    }

    if (url.pathname !== "/" && url.pathname !== "") {
      return {
        valid: false,
        message: "Origin không được chứa pathname",
      };
    }

    if (url.search || url.hash) {
      return {
        valid: false,
        message: "Origin không được chứa query hoặc hash",
      };
    }

    return {
      valid: true,
      origin: normalized,
    };
  } catch {
    return {
      valid: false,
      message: "Origin không hợp lệ",
    };
  }
};

module.exports = {
  loadCorsOrigins,
  reloadCorsOrigins,
  isOriginAllowed,
  getAllowedOrigins,
  validateOrigin,
  normalizeOrigin,
};

// utils/activityLogger.js

const db = require("../config/db");

// ============================================================
// ACTIVITY CHURCH LOGGER
// ============================================================
//
// Bảng sử dụng:
//      activity_church_logs
//
// Mục tiêu:
// - Mỗi log bắt buộc thuộc một giáo xứ.
// - church_id lấy từ req.user, KHÔNG lấy từ req.body.
// - admin_id lấy từ req.user.id.
// - Có IP + User-Agent.
// - Có metadata JSON để lưu thêm dữ liệu.
// - Logger lỗi không được làm rollback nghiệp vụ chính.
//
// ============================================================

// ============================================================
// GET CHURCH ID
// ============================================================

const getChurchId = (req) => {
  const churchId = Number(req?.user?.church_id || req?.user?.parish_id || 0);

  if (!Number.isInteger(churchId) || churchId <= 0) {
    return null;
  }

  return churchId;
};

// ============================================================
// GET ADMIN ID
// ============================================================

const getAdminId = (req) => {
  const adminId = Number(req?.user?.id || 0);

  if (!Number.isInteger(adminId) || adminId <= 0) {
    return null;
  }

  return adminId;
};

// ============================================================
// GET IP ADDRESS
// ============================================================

const getIpAddress = (req) => {
  if (!req) {
    return null;
  }

  /**
   * Cloudflare / Nginx / Proxy
   *
   * Có thể nhận:
   *
   * x-forwarded-for:
   * 1.2.3.4, 10.0.0.1
   */

  const forwardedFor = req.headers?.["x-forwarded-for"];

  if (forwardedFor) {
    return String(forwardedFor).split(",")[0].trim().substring(0, 100);
  }

  /**
   * Một số proxy dùng:
   * x-real-ip
   */

  const realIp = req.headers?.["x-real-ip"];

  if (realIp) {
    return String(realIp).trim().substring(0, 100);
  }

  return req.ip || req.socket?.remoteAddress || null;
};

// ============================================================
// GET USER AGENT
// ============================================================

const getUserAgent = (req) => {
  const userAgent = req?.headers?.["user-agent"];

  if (!userAgent) {
    return null;
  }

  return String(userAgent).substring(0, 500);
};

// ============================================================
// SAFE JSON
// ============================================================

const serializeMetadata = (metadata) => {
  if (metadata === null || metadata === undefined) {
    return null;
  }

  try {
    return JSON.stringify(metadata);
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("          ACTIVITY LOGGER METADATA ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error(
      "============================================================",
    );

    return null;
  }
};

// ============================================================
// WRITE LOG
// ============================================================
//
// Example:
//
// await writeLog({
//   req,
//
//   action: "CREATE_ACADEMIC_YEAR",
//
//   target_type: "academic_year",
//
//   target_id: null,
//
//   description:
//     "Khởi tạo năm học 2026-2027",
//
//   metadata: {
//     fromAcademicYear: "2025-2026",
//     toAcademicYear: "2026-2027",
//     classCount: 12
//   }
// });
//
// ============================================================

const writeLog = async ({
  req,

  admin_id = null,

  action,

  target_type = null,

  target_id = null,

  description = null,

  ip_address = null,

  user_agent = null,

  metadata = null,
}) => {
  try {
    // ========================================================
    // 1. CHURCH
    // ========================================================

    const churchId = getChurchId(req);

    if (!churchId) {
      console.error("");
      console.error(
        "============================================================",
      );
      console.error("       ACTIVITY LOGGER - MISSING CHURCH ID");
      console.error(
        "============================================================",
      );
      console.error("REQ USER:", req?.user || null);
      console.error(
        "============================================================",
      );

      /**
       * Không throw.
       *
       * Logger không được làm nghiệp vụ chính chết.
       */

      return {
        success: false,
        skipped: true,
        reason: "MISSING_CHURCH_ID",
      };
    }

    // ========================================================
    // 2. ADMIN
    // ========================================================

    let resolvedAdminId = null;

    if (admin_id !== null && admin_id !== undefined) {
      const parsedAdminId = Number(admin_id);

      if (Number.isInteger(parsedAdminId) && parsedAdminId > 0) {
        resolvedAdminId = parsedAdminId;
      }
    }

    /**
     * Nếu controller không truyền admin_id
     * thì lấy trực tiếp từ JWT.
     */

    if (!resolvedAdminId) {
      resolvedAdminId = getAdminId(req);
    }

    // ========================================================
    // 3. ACTION
    // ========================================================

    const safeAction = String(action || "UNKNOWN")
      .trim()
      .substring(0, 100);

    // ========================================================
    // 4. TARGET TYPE
    // ========================================================

    const safeTargetType = target_type
      ? String(target_type).trim().substring(0, 100)
      : null;

    // ========================================================
    // 5. TARGET ID
    // ========================================================

    let safeTargetId = null;

    if (target_id !== null && target_id !== undefined && target_id !== "") {
      const parsedTargetId = Number(target_id);

      if (Number.isFinite(parsedTargetId)) {
        safeTargetId = parsedTargetId;
      }
    }

    // ========================================================
    // 6. DESCRIPTION
    // ========================================================

    const safeDescription =
      description !== null && description !== undefined
        ? String(description)
        : null;

    // ========================================================
    // 7. IP
    // ========================================================

    const safeIpAddress = ip_address || getIpAddress(req);

    const finalIpAddress = safeIpAddress
      ? String(safeIpAddress).substring(0, 100)
      : null;

    // ========================================================
    // 8. USER AGENT
    // ========================================================

    const safeUserAgent = user_agent || getUserAgent(req);

    const finalUserAgent = safeUserAgent
      ? String(safeUserAgent).substring(0, 500)
      : null;

    // ========================================================
    // 9. METADATA
    // ========================================================

    const safeMetadata = serializeMetadata(metadata);

    // ========================================================
    // 10. SQL
    // ========================================================

    const sql = `
      INSERT INTO activity_church_logs (
        church_id,
        admin_id,
        action,
        target_type,
        target_id,
        description,
        ip_address,
        user_agent,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      churchId,
      resolvedAdminId,
      safeAction,
      safeTargetType,
      safeTargetId,
      safeDescription,
      finalIpAddress,
      finalUserAgent,
      safeMetadata,
    ];

    // ========================================================
    // 11. INSERT
    // ========================================================

    const [result] = await db.execute(sql, values);

    // ========================================================
    // 12. CONSOLE LOG
    // ========================================================

    console.log("");
    console.log("============================================================");
    console.log("                  ACTIVITY CHURCH LOG");
    console.log("============================================================");
    console.log("LOG ID:", result.insertId);
    console.log("CHURCH ID:", churchId);
    console.log("ADMIN ID:", resolvedAdminId);
    console.log("ACTION:", safeAction);
    console.log("TARGET TYPE:", safeTargetType);
    console.log("TARGET ID:", safeTargetId);
    console.log("DESCRIPTION:", safeDescription);
    console.log("IP:", finalIpAddress);
    console.log("============================================================");

    // ========================================================
    // 13. RETURN
    // ========================================================

    return {
      success: true,

      id: result.insertId,

      church_id: churchId,

      admin_id: resolvedAdminId,

      action: safeAction,
    };
  } catch (error) {
    // ========================================================
    // LOGGER ERROR
    // ========================================================

    console.error("");
    console.error(
      "============================================================",
    );
    console.error("             ACTIVITY CHURCH LOGGER ERROR");
    console.error(
      "============================================================",
    );
    console.error("MESSAGE:", error.message);
    console.error("CODE:", error.code);
    console.error("SQL MESSAGE:", error.sqlMessage);
    console.error("STACK:", error.stack);
    console.error(
      "============================================================",
    );

    /**
     * CỰC KỲ QUAN TRỌNG:
     *
     * Không throw error.
     *
     * Ví dụ:
     *
     * Tạo năm học thành công
     *       ↓
     * ghi activity log lỗi
     *       ↓
     * KHÔNG rollback việc tạo năm học.
     */

    return {
      success: false,

      error: error.message,
    };
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  writeLog,
  getChurchId,
  getAdminId,
};

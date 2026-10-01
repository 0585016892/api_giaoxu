const db = require("../config/db");

/**
 * GET /api/license/me
 *
 * Lấy thông tin license FaithEdu của giáo xứ hiện tại.
 *
 * JWT cần có:
 * req.user.church_id
 */
exports.getMyLicense = async (req, res) => {
  try {
    // ==========================================
    // 1. KIỂM TRA ĐĂNG NHẬP
    // ==========================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Chưa đăng nhập",
      });
    }

    // ==========================================
    // 2. LẤY CHURCH ID TỪ JWT
    // ==========================================

    const churchId = req.user.church_id || req.user.parish_id;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // ==========================================
    // 3. LẤY THÔNG TIN GIÁO XỨ
    // ==========================================

    const [rows] = await db.query(
      `
        SELECT
          *
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

    // ==========================================
    // 4. LICENSE DATA
    // ==========================================

    let licenseStatus = church.license_status || "trial";

    let licenseType = church.license_type || "trial";

    let isExpired = false;

    let daysRemaining = null;

    let isTrial = false;

    let isActive = false;

    let isLifetime = false;

    let expiresAt = null;

    const now = new Date();

    // ==================================================
    // TRIAL
    // ==================================================

    if (licenseStatus === "trial") {
      isTrial = true;

      licenseType = "trial";

      if (!church.trial_expires_at) {
        return res.status(500).json({
          success: false,
          code: "TRIAL_NOT_CONFIGURED",
          message: "License trial chưa được cấu hình ngày hết hạn",
        });
      }

      const trialExpiresAt = new Date(church.trial_expires_at);

      expiresAt = church.trial_expires_at;

      // ================================================
      // TRIAL ĐÃ HẾT HẠN
      // ================================================

      if (trialExpiresAt <= now) {
        await db.query(
          `
            UPDATE churches
            SET
              license_status = 'expired',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND license_status = 'trial'
          `,
          [churchId],
        );

        licenseStatus = "expired";

        isTrial = false;

        isExpired = true;

        daysRemaining = 0;
      }

      // ================================================
      // TRIAL CÒN HẠN
      // ================================================
      else {
        const diffMs = trialExpiresAt.getTime() - now.getTime();

        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        isExpired = false;
      }
    }

    // ==================================================
    // ACTIVE
    // ==================================================
    else if (licenseStatus === "active") {
      // ================================================
      // GÓI VĨNH VIỄN
      // ================================================

      if (licenseType === "lifetime") {
        isLifetime = true;

        isActive = true;

        isExpired = false;

        daysRemaining = null;

        expiresAt = null;
      }

      // ================================================
      // GÓI 1 NĂM
      // ================================================
      else if (licenseType === "yearly") {
        isLifetime = false;

        expiresAt = church.license_expires_at;

        // Không có ngày hết hạn => lỗi dữ liệu
        if (!church.license_expires_at) {
          console.error(
            `⚠️ License yearly không có license_expires_at. Church ID: ${churchId}`,
          );

          return res.status(500).json({
            success: false,
            code: "YEARLY_LICENSE_NOT_CONFIGURED",
            message: "License gói 1 năm chưa được cấu hình ngày hết hạn",
          });
        }

        const licenseExpiresAt = new Date(church.license_expires_at);

        const diffMs = licenseExpiresAt.getTime() - now.getTime();

        // ==============================================
        // GÓI 1 NĂM ĐÃ HẾT HẠN
        // ==============================================

        if (diffMs <= 0) {
          await db.query(
            `
              UPDATE churches
              SET
                license_status = 'expired',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
                AND license_status = 'active'
            `,
            [churchId],
          );

          licenseStatus = "expired";

          isActive = false;

          isExpired = true;

          daysRemaining = 0;
        }

        // ==============================================
        // GÓI 1 NĂM CÒN HẠN
        // ==============================================
        else {
          isActive = true;

          isExpired = false;

          daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }
      }

      // ================================================
      // DATA CŨ / KHÔNG CÓ LICENSE TYPE
      // ================================================
      else {
        console.warn(
          `⚠️ Church ${churchId} đang active nhưng license_type không hợp lệ:`,
          licenseType,
        );

        isActive = true;

        isExpired = false;

        daysRemaining = null;
      }
    }

    // ==================================================
    // EXPIRED
    // ==================================================
    else if (licenseStatus === "expired") {
      isExpired = true;

      isActive = false;

      isTrial = false;

      isLifetime = false;

      daysRemaining = 0;

      // Nếu trước đó là yearly thì giữ expires_at
      if (licenseType === "yearly" && church.license_expires_at) {
        expiresAt = church.license_expires_at;
      }

      // Nếu expired từ trial
      else if (church.trial_expires_at) {
        expiresAt = church.trial_expires_at;
      }
    }

    // ==================================================
    // 5. RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      license: {
        // ==============================================
        // STATUS
        // ==============================================

        status: licenseStatus,

        // ==============================================
        // PACKAGE
        // ==============================================

        type: licenseType,

        license_type: licenseType,

        // ==============================================
        // TRIAL
        // ==============================================

        trial_started_at: church.trial_started_at,

        trial_expires_at: church.trial_expires_at,

        // ==============================================
        // PAID LICENSE
        // ==============================================

        activated_at: church.activated_at,

        expires_at: expiresAt,

        license_expires_at: church.license_expires_at,

        // ==============================================
        // CALCULATED
        // ==============================================

        days_remaining: daysRemaining,

        is_expired: isExpired,

        is_trial: isTrial,

        is_lifetime: isLifetime,

        is_active: isActive,
      },

      // ================================================
      // CHURCH
      // ================================================

      church: {
        id: Number(church.id),

        name: church.name,

        code: church.code,

        type: church.type,

        address: church.address,

        phone: church.phone,

        email: church.email,

        pastor_name: church.pastor_name,

        image: church.image,

        is_active: Boolean(church.is_active),

        created_at: church.created_at,

        updated_at: church.updated_at,
      },
    });
  } catch (error) {
    console.error("\n==========================================");

    console.error("❌ GET MY LICENSE ERROR");

    console.error("==========================================");

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("SQL State:", error.sqlState);

    console.error("SQL Message:", error.sqlMessage);

    console.error("Stack:", error.stack);

    console.error("==========================================\n");

    return res.status(500).json({
      success: false,

      message: "Lỗi server khi lấy thông tin license",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,

      code: process.env.NODE_ENV === "development" ? error.code : undefined,
    });
  }
};

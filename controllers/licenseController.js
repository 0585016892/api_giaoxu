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
    // 1. Kiểm tra đăng nhập
    // ==========================================
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Chưa đăng nhập",
      });
    }

    // ==========================================
    // 2. Lấy church_id từ JWT
    // ==========================================
    const churchId = req.user.church_id || req.user.parish_id;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Tài khoản chưa được liên kết với giáo xứ",
      });
    }

    // ==========================================
    // 3. Lấy thông tin giáo xứ + license
    // ==========================================
    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        code,
        type,
        address,
        phone,
        email,
        image,
        is_active,

        license_status,
        trial_started_at,
        trial_expires_at,
        activated_at,

        created_at,
        updated_at

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
    // 4. Xác định trạng thái license
    // ==========================================
    let licenseStatus = church.license_status || "trial";

    let isExpired = false;
    let daysRemaining = null;

    const now = new Date();

    // ==========================================
    // ACTIVE
    // ==========================================
    if (licenseStatus === "active") {
      isExpired = false;
      daysRemaining = null;
    }

    // ==========================================
    // TRIAL
    // ==========================================
    else if (licenseStatus === "trial") {
      if (!church.trial_expires_at) {
        // Trial nhưng không có ngày hết hạn
        // coi như lỗi dữ liệu
        return res.status(500).json({
          success: false,
          message: "License trial chưa được cấu hình ngày hết hạn",
        });
      }

      const expiresAt = new Date(church.trial_expires_at);

      if (expiresAt <= now) {
        // ========================================
        // Trial đã hết hạn
        // Lazy update DB
        // ========================================
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
        isExpired = true;
        daysRemaining = 0;
      } else {
        // ========================================
        // Tính số ngày còn lại
        // ========================================
        const diffMs = expiresAt.getTime() - now.getTime();

        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        isExpired = false;
      }
    }

    // ==========================================
    // EXPIRED
    // ==========================================
    else if (licenseStatus === "expired") {
      isExpired = true;
      daysRemaining = 0;
    }

    // ==========================================
    // 5. Response
    // ==========================================
    return res.status(200).json({
      success: true,

      license: {
        status: licenseStatus,

        trial_started_at: church.trial_started_at,
        trial_expires_at: church.trial_expires_at,

        activated_at: church.activated_at,

        days_remaining: daysRemaining,

        is_expired: isExpired,

        // tiện cho FE
        is_trial: licenseStatus === "trial",
        is_active: licenseStatus === "active",
      },

      church: {
        id: Number(church.id),
        name: church.name,
        code: church.code,
        type: church.type,

        address: church.address,
        phone: church.phone,
        email: church.email,

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

      // Tạm thời trả ra để debug
      error: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
    });
  }
};

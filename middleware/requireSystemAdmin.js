const db = require("../config/db");

/**
 * ============================================================
 * REQUIRE SYSTEM ADMIN
 * ============================================================
 *
 * Chỉ cho phép tài khoản quản trị hệ thống:
 * - Đã đăng nhập
 * - JWT có user id
 * - JWT role = admin
 * - User trong DB phải tồn tại
 * - User trong DB phải có id = 1
 * - User trong DB phải có role = admin
 *
 * Middleware này dùng cho các API cấp SYSTEM:
 * - Tạo giáo xứ
 * - Sửa thông tin hệ thống giáo xứ
 * - Xóa giáo xứ
 * - Bật / tắt giáo xứ
 * - Các thao tác quản trị toàn hệ thống
 *
 * Lưu ý:
 * verifyToken PHẢI chạy trước middleware này.
 *
 * Ví dụ:
 * router.post("/", verifyToken, requireSystemAdmin, controller);
 *
 * ============================================================
 */

const requireSystemAdmin = async (req, res, next) => {
  try {
    // ========================================================
    // 1. KIỂM TRA AUTH
    // ========================================================

    if (!req.user) {
      console.warn(
        `[SECURITY] SYSTEM ADMIN DENIED | reason=NO_USER | ip=${req.ip} | path=${req.originalUrl}`,
      );

      return res.status(401).json({
        success: false,
        code: "AUTH_REQUIRED",
        message: "Chưa đăng nhập",
      });
    }

    // ========================================================
    // 2. LẤY THÔNG TIN TỪ JWT
    // ========================================================

    const userId = Number(req.user.id);
    const role = String(req.user.role || "")
      .trim()
      .toLowerCase();

    // ========================================================
    // 3. JWT PHẢI CÓ ID HỢP LỆ
    // ========================================================

    if (!Number.isInteger(userId) || userId <= 0) {
      console.warn(
        `[SECURITY] SYSTEM ADMIN DENIED | reason=INVALID_USER_ID | ` +
          `userId=${req.user.id} | role=${role} | ` +
          `ip=${req.ip} | path=${req.originalUrl}`,
      );

      return res.status(403).json({
        success: false,
        code: "SYSTEM_ADMIN_REQUIRED",
        message: "Bạn không có quyền thực hiện thao tác này",
      });
    }

    // ========================================================
    // 4. KIỂM TRA ROLE TRONG JWT
    // ========================================================

    if (role !== "admin") {
      console.warn(
        `[SECURITY] SYSTEM ADMIN DENIED | reason=INVALID_ROLE | ` +
          `userId=${userId} | role=${role} | ` +
          `ip=${req.ip} | path=${req.originalUrl}`,
      );

      return res.status(403).json({
        success: false,
        code: "SYSTEM_ADMIN_ONLY",
        message: "Chỉ quản trị hệ thống mới có quyền thực hiện thao tác này",
      });
    }

    // ========================================================
    // 5. KIỂM TRA LẠI USER TRONG DATABASE
    // ========================================================
    //
    // Không tin hoàn toàn role trong JWT đối với thao tác
    // cấp SYSTEM.
    //
    // Nếu tài khoản bị đổi role / khóa / xóa sau khi JWT được
    // phát hành thì middleware vẫn phải chặn.
    //
    // ========================================================

    const [rows] = await db.query(
      `
        SELECT
          id,
          username,
          role
        FROM admins
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (!rows || rows.length === 0) {
      console.warn(
        `[SECURITY] SYSTEM ADMIN DENIED | reason=USER_NOT_FOUND | ` +
          `userId=${userId} | role=${role} | ` +
          `ip=${req.ip} | path=${req.originalUrl}`,
      );

      return res.status(403).json({
        success: false,
        code: "SYSTEM_ADMIN_REQUIRED",
        message: "Bạn không có quyền thực hiện thao tác này",
      });
    }

    const admin = rows[0];

    // ========================================================
    // 6. HARD CHECK SYSTEM ADMIN
    // ========================================================
    //
    // Chỉ tài khoản:
    //
    // id = 1
    // role = admin
    //
    // mới được coi là SYSTEM ADMIN.
    //
    // ========================================================

    const dbRole = String(admin.role || "")
      .trim()
      .toLowerCase();

    if (Number(admin.id) !== 1 || dbRole !== "admin") {
      console.warn(
        `[SECURITY] SYSTEM ADMIN DENIED | reason=NOT_SYSTEM_ADMIN | ` +
          `jwtUserId=${userId} | dbUserId=${admin.id} | ` +
          `jwtRole=${role} | dbRole=${dbRole} | ` +
          `ip=${req.ip} | path=${req.originalUrl}`,
      );

      return res.status(403).json({
        success: false,
        code: "SYSTEM_ADMIN_ONLY",
        message: "Chỉ quản trị hệ thống mới có quyền thực hiện thao tác này",
      });
    }

    // ========================================================
    // 7. GẮN ADMIN ĐÃ VERIFY VÀO REQUEST
    // ========================================================

    req.systemAdmin = {
      id: Number(admin.id),
      username: admin.username,
      role: dbRole,
    };

    // ========================================================
    // 8. LOG SUCCESS
    // ========================================================

    console.log(
      `[SECURITY] SYSTEM ADMIN AUTHORIZED | ` +
        `userId=${admin.id} | ` +
        `username=${admin.username} | ` +
        `path=${req.originalUrl} | ` +
        `method=${req.method} | ` +
        `ip=${req.ip}`,
    );

    next();
  } catch (error) {
    console.error("[SECURITY] requireSystemAdmin ERROR:", error);

    return res.status(500).json({
      success: false,
      code: "SYSTEM_ADMIN_AUTHORIZATION_ERROR",
      message: "Lỗi kiểm tra quyền quản trị hệ thống",
    });
  }
};

module.exports = requireSystemAdmin;

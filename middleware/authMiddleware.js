const jwt = require("jsonwebtoken");
const db = require("../config/db");

// ============================================================
// VERIFY JWT TOKEN
// ============================================================

exports.verifyToken = (req, res, next) => {
  try {
    console.log("");
    console.log("============================================================");
    console.log("                    VERIFY TOKEN");
    console.log("============================================================");

    const authHeader = req.headers.authorization;

    // ========================================================
    // CHECK AUTHORIZATION HEADER
    // ========================================================

    if (!authHeader) {
      console.warn("[AUTH] Authorization header không tồn tại");

      return res.status(401).json({
        success: false,
        message: "Chưa đăng nhập",
        code: "AUTH_TOKEN_MISSING",
      });
    }

    // ========================================================
    // CHECK BEARER TOKEN
    // ========================================================

    const parts = authHeader.trim().split(/\s+/);

    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      console.warn("[AUTH] Authorization header không đúng định dạng");

      return res.status(401).json({
        success: false,
        message: "Authorization không hợp lệ",
        code: "AUTH_HEADER_INVALID",
      });
    }

    const token = parts[1];

    if (!token) {
      console.warn("[AUTH] Token rỗng");

      return res.status(401).json({
        success: false,
        message: "Token không tồn tại",
        code: "AUTH_TOKEN_MISSING",
      });
    }

    // ========================================================
    // VERIFY JWT
    // ========================================================

    jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: ["HS256"],
      },
      (err, decoded) => {
        if (err) {
          console.warn("[AUTH] JWT INVALID:", err.name);

          if (err.name === "TokenExpiredError") {
            return res.status(401).json({
              success: false,
              message: "Phiên đăng nhập đã hết hạn",
              code: "AUTH_TOKEN_EXPIRED",
            });
          }

          return res.status(401).json({
            success: false,
            message: "Token không hợp lệ",
            code: "AUTH_TOKEN_INVALID",
          });
        }

        // ====================================================
        // CHECK PAYLOAD
        // ====================================================

        if (!decoded || !decoded.id) {
          console.warn("[AUTH] JWT thiếu id");

          return res.status(401).json({
            success: false,
            message: "Token không hợp lệ",
            code: "AUTH_TOKEN_PAYLOAD_INVALID",
          });
        }

        if (!decoded.role) {
          console.warn("[AUTH] JWT thiếu role");

          return res.status(401).json({
            success: false,
            message: "Token thiếu thông tin quyền",
            code: "AUTH_ROLE_MISSING",
          });
        }

        // ====================================================
        // SAVE USER
        // ====================================================

        req.user = {
          id: decoded.id,
          username: decoded.username || null,
          role: decoded.role,
          church_id: decoded.church_id || null,
          teacher_id: decoded.teacher_id || null,
          catechist_id: decoded.catechist_id || null,
        };

        console.log("[AUTH] TOKEN VALID");
        console.log("[AUTH] USER ID:", req.user.id);
        console.log("[AUTH] ROLE:", req.user.role);
        console.log("[AUTH] CHURCH ID:", req.user.church_id);

        next();
      },
    );
  } catch (error) {
    console.error("[AUTH] VERIFY TOKEN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi xác thực",
      code: "AUTH_INTERNAL_ERROR",
    });
  }
};

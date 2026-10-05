const rateLimit = require("express-rate-limit");

/**
 * ============================================================
 * GLOBAL RATE LIMIT MIDDLEWARE
 * ============================================================
 *
 * Bảo vệ API theo 2 lớp:
 *
 * 1. IP
 *    - Chặn một IP gửi quá nhiều request.
 *
 * 2. USER
 *    - Chặn một tài khoản gửi quá nhiều request.
 *
 * Có thể dùng:
 *
 * - globalApiLimiter
 * - authLimiter
 * - sensitiveLimiter
 * - destructiveLimiter
 *
 * ============================================================
 */

/**
 * ============================================================
 * HELPER
 * ============================================================
 */

/**
 * Lấy IP thực tế của client.
 *
 * Express phải được cấu hình:
 *
 * app.set("trust proxy", 1);
 *
 * nếu API nằm sau Nginx / Cloudflare / proxy.
 */
const getClientIp = (req) => {
  return (
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
};

/**
 * Lấy user ID từ JWT.
 *
 * verifyToken phải chạy trước nếu muốn rate limit
 * theo user.
 */
const getUserId = (req) => {
  const userId = Number(req.user?.id);

  if (Number.isInteger(userId) && userId > 0) {
    return String(userId);
  }

  return null;
};

/**
 * ============================================================
 * 1. GLOBAL API LIMITER
 * ============================================================
 *
 * Dùng cho API thông thường.
 *
 * 300 requests / 15 phút / IP
 *
 * User đã đăng nhập:
 * thêm 300 requests / 15 phút / user
 *
 * ============================================================
 */

const globalIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 300,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    return `ip:${getClientIp(req)}`;
  },

  handler: (req, res) => {
    console.warn(
      `[SECURITY] GLOBAL IP RATE LIMIT | ` +
        `ip=${getClientIp(req)} | ` +
        `userId=${getUserId(req) || "anonymous"} | ` +
        `method=${req.method} | ` +
        `path=${req.originalUrl}`,
    );

    return res.status(429).json({
      success: false,
      code: "RATE_LIMITED",
      message: "Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
    });
  },
});

const globalUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 300,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    const userId = getUserId(req);

    /**
     * Nếu chưa đăng nhập thì không áp dụng
     * user limiter.
     *
     * IP limiter vẫn bảo vệ request.
     */
    return userId ? `user:${userId}` : `anonymous:${getClientIp(req)}`;
  },

  handler: (req, res) => {
    console.warn(
      `[SECURITY] GLOBAL USER RATE LIMIT | ` +
        `ip=${getClientIp(req)} | ` +
        `userId=${getUserId(req) || "anonymous"} | ` +
        `method=${req.method} | ` +
        `path=${req.originalUrl}`,
    );

    return res.status(429).json({
      success: false,
      code: "RATE_LIMITED",
      message:
        "Tài khoản của bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
    });
  },
});

/**
 * Middleware chung:
 *
 * IP + USER
 */
const globalApiLimiter = [globalIpLimiter, globalUserLimiter];

/**
 * ============================================================
 * 2. AUTH LIMITER
 * ============================================================
 *
 * Dùng cho:
 *
 * POST /login
 * POST /register
 * POST /forgot-password
 * POST /reset-password
 *
 * Các API này dễ bị brute-force.
 *
 * 20 requests / 15 phút / IP
 *
 * ============================================================
 */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 20,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    return `auth-ip:${getClientIp(req)}`;
  },

  handler: (req, res) => {
    console.warn(
      `[SECURITY] AUTH RATE LIMIT | ` +
        `ip=${getClientIp(req)} | ` +
        `path=${req.originalUrl}`,
    );

    return res.status(429).json({
      success: false,
      code: "AUTH_RATE_LIMITED",
      message: "Quá nhiều lần thử đăng nhập/xác thực. Vui lòng thử lại sau.",
    });
  },
});

/**
 * ============================================================
 * 3. SENSITIVE API LIMITER
 * ============================================================
 *
 * Dùng cho API nhạy cảm:
 *
 * - đổi mật khẩu
 * - reset password
 * - license
 * - upload
 * - import Excel
 * - thay đổi quyền
 *
 * 30 requests / 15 phút.
 *
 * ============================================================
 */

const sensitiveIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 30,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    return `sensitive-ip:${getClientIp(req)}`;
  },

  handler: (req, res) => {
    console.warn(
      `[SECURITY] SENSITIVE IP RATE LIMIT | ` +
        `ip=${getClientIp(req)} | ` +
        `userId=${getUserId(req) || "anonymous"} | ` +
        `path=${req.originalUrl}`,
    );

    return res.status(429).json({
      success: false,
      code: "SENSITIVE_RATE_LIMITED",
      message:
        "Bạn đã thực hiện quá nhiều thao tác nhạy cảm. Vui lòng thử lại sau.",
    });
  },
});

const sensitiveUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 30,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    const userId = getUserId(req);

    return userId
      ? `sensitive-user:${userId}`
      : `sensitive-anonymous:${getClientIp(req)}`;
  },

  handler: (req, res) => {
    console.warn(
      `[SECURITY] SENSITIVE USER RATE LIMIT | ` +
        `ip=${getClientIp(req)} | ` +
        `userId=${getUserId(req) || "anonymous"} | ` +
        `path=${req.originalUrl}`,
    );

    return res.status(429).json({
      success: false,
      code: "SENSITIVE_RATE_LIMITED",
      message:
        "Tài khoản của bạn đã thực hiện quá nhiều thao tác nhạy cảm. Vui lòng thử lại sau.",
    });
  },
});

const sensitiveLimiter = [sensitiveIpLimiter, sensitiveUserLimiter];

/**
 * ============================================================
 * 4. DESTRUCTIVE API LIMITER
 * ============================================================
 *
 * Dùng cho:
 *
 * DELETE church
 * DELETE admin
 * DELETE student
 * DELETE class
 * Các thao tác xóa dữ liệu quan trọng.
 *
 * 5 requests / 15 phút.
 *
 * ============================================================
 */

const destructiveIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 10,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    return `destructive-ip:${getClientIp(req)}`;
  },

  handler: (req, res) => {
    console.warn(
      `[SECURITY] DESTRUCTIVE IP RATE LIMIT | ` +
        `ip=${getClientIp(req)} | ` +
        `userId=${getUserId(req) || "anonymous"} | ` +
        `method=${req.method} | ` +
        `path=${req.originalUrl}`,
    );

    return res.status(429).json({
      success: false,
      code: "DESTRUCTIVE_RATE_LIMITED",
      message: "Bạn đã thực hiện quá nhiều thao tác xóa. Vui lòng thử lại sau.",
    });
  },
});

const destructiveUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 5,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    const userId = getUserId(req);

    return userId
      ? `destructive-user:${userId}`
      : `destructive-anonymous:${getClientIp(req)}`;
  },

  handler: (req, res) => {
    console.warn(
      `[SECURITY] DESTRUCTIVE USER RATE LIMIT | ` +
        `ip=${getClientIp(req)} | ` +
        `userId=${getUserId(req) || "anonymous"} | ` +
        `method=${req.method} | ` +
        `path=${req.originalUrl}`,
    );

    return res.status(429).json({
      success: false,
      code: "DESTRUCTIVE_RATE_LIMITED",
      message:
        "Tài khoản của bạn đã thực hiện quá nhiều thao tác xóa. Vui lòng thử lại sau.",
    });
  },
});

const destructiveLimiter = [destructiveIpLimiter, destructiveUserLimiter];

/**
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = {
  globalApiLimiter,
  authLimiter,
  sensitiveLimiter,
  destructiveLimiter,
};

exports.authorize =
  (...roles) =>
  (req, res, next) => {
    try {
      // req.user lấy từ verifyToken
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Chưa đăng nhập",
        });
      }

      // kiểm tra role
      if (!roles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền truy cập",
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  };

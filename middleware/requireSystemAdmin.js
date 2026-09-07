const requireSystemAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Chưa đăng nhập",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      code: "SYSTEM_ADMIN_ONLY",
      message: "Chỉ quản trị hệ thống mới có quyền thực hiện thao tác này",
    });
  }

  next();
};

module.exports = requireSystemAdmin;

// utils/authContext.js

// ============================================================
// AUTH CONTEXT HELPER
// ============================================================
//
// Mục tiêu:
// - Lấy church_id từ JWT.
// - Lấy admin/user id từ JWT.
// - KHÔNG lấy church_id từ req.body.
//
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

module.exports = {
  getChurchId,
  getAdminId,
};

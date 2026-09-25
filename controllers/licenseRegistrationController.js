const db = require("../config/db");

const PACKAGE_CODE = "FAITHEDU_CHURCH";
const PACKAGE_NAME = "FaithEdu - Giáo xứ";
const PACKAGE_AMOUNT = 299000;

const getChurchId = (req) => {
  const churchId = Number(
    req.user?.church_id || req.user?.parish_id || req.user?.churchId,
  );

  if (!churchId) {
    const error = new Error("Tài khoản chưa được gán giáo xứ");
    error.statusCode = 403;
    error.code = "CHURCH_NOT_ASSIGNED";
    throw error;
  }

  return churchId;
};

const getUserId = (req) => {
  return (
    Number(req.user?.id || req.user?.user_id || req.user?.admin_id || 0) || null
  );
};

const normalizeString = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

const normalizePhone = (value) => {
  const phone = normalizeString(value);

  if (!phone) {
    return null;
  }

  return phone;
};

const normalizeEmail = (value) => {
  const email = normalizeString(value);

  if (!email) {
    return null;
  }

  return email.toLowerCase();
};

const buildTransferContent = (churchName) => {
  const normalized = normalizeString(churchName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  return `DANG KY FAITHEDU - GIAO XU ${normalized}`;
};

/**
 * ============================================================
 * GET /license/registration/config
 * ============================================================
 *
 * Thông tin cố định cho màn hình đăng ký.
 *
 * Sau này có thể chuyển các thông tin ngân hàng / Zalo
 * sang bảng system_settings.
 */
exports.getRegistrationConfig = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const [rows] = await db.query(
      `
      SELECT
        id,
        name
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

    const transferContent = buildTransferContent(church.name);

    return res.json({
      success: true,
      data: {
        package: {
          code: PACKAGE_CODE,
          name: PACKAGE_NAME,
          amount: PACKAGE_AMOUNT,
        },

        church: {
          id: church.id,
          name: church.name,
        },

        transfer_content: transferContent,

        payment: {
          bank_name: process.env.FAITHEDU_BANK_NAME || "",
          account_number: process.env.FAITHEDU_BANK_ACCOUNT || "",
          account_name: process.env.FAITHEDU_BANK_ACCOUNT_NAME || "",
          qr_url: process.env.FAITHEDU_PAYMENT_QR_URL || "",
        },

        support: {
          zalo_group_url: process.env.FAITHEDU_ZALO_GROUP_URL || "",
          zalo_qr_url: process.env.FAITHEDU_ZALO_QR_URL || "",
        },
      },
    });
  } catch (error) {
    console.error("GET REGISTRATION CONFIG ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "GET_LICENSE_CONFIG_ERROR",
      message: error.message || "Không thể lấy thông tin đăng ký",
    });
  }
};

/**
 * ============================================================
 * GET /license/registration/me
 * ============================================================
 *
 * Lấy các lần đăng ký của giáo xứ hiện tại.
 */
exports.getMyRegistrations = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const [rows] = await db.query(
      `
      SELECT
        lr.id,
        lr.church_id,
        lr.name,
        lr.phone,
        lr.email,
        lr.package_code,
        lr.package_name,
        lr.amount,
        lr.transfer_content,
        lr.payment_image,
        lr.status,
        lr.reviewed_by,
        lr.reviewed_at,
        lr.reject_reason,
        lr.note,
        lr.created_at,
        lr.updated_at
      FROM license_registrations lr
      WHERE lr.church_id = ?
      ORDER BY lr.created_at DESC, lr.id DESC
      `,
      [churchId],
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("GET MY LICENSE REGISTRATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy lịch sử đăng ký",
    });
  }
};

/**
 * ============================================================
 * GET /license/registration/:id
 * ============================================================
 */
exports.getRegistrationById = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const registrationId = Number(req.params.id);

    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID đăng ký không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        lr.id,
        lr.church_id,
        lr.name,
        lr.phone,
        lr.email,
        lr.package_code,
        lr.package_name,
        lr.amount,
        lr.transfer_content,
        lr.payment_image,
        lr.status,
        lr.reviewed_by,
        lr.reviewed_at,
        lr.reject_reason,
        lr.note,
        lr.created_at,
        lr.updated_at
      FROM license_registrations lr
      WHERE lr.id = ?
        AND lr.church_id = ?
      LIMIT 1
      `,
      [registrationId, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đăng ký",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("GET LICENSE REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin đăng ký",
    });
  }
};

/**
 * ============================================================
 * POST /license/registration
 * ============================================================
 *
 * multipart/form-data
 *
 * name
 * phone
 * email
 * payment_image
 */
exports.createRegistration = async (req, res) => {
  let connection;

  try {
    const churchId = getChurchId(req);

    const name = normalizeString(req.body?.name);
    const phone = normalizePhone(req.body?.phone);
    const email = normalizeEmail(req.body?.email);

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập họ và tên",
      });
    }

    if (name.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Họ và tên không được vượt quá 255 ký tự",
      });
    }

    if (phone && phone.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ",
      });
    }

    if (email && email.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Email không hợp lệ",
      });
    }

    /**
     * Bắt buộc ảnh chuyển khoản.
     */
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng tải ảnh xác nhận chuyển khoản",
      });
    }

    /**
     * Không cho tạo nhiều yêu cầu pending cùng lúc.
     */
    const [pendingRows] = await db.query(
      `
      SELECT id
      FROM license_registrations
      WHERE church_id = ?
        AND status = 'pending'
      ORDER BY id DESC
      LIMIT 1
      `,
      [churchId],
    );

    if (pendingRows.length) {
      return res.status(409).json({
        success: false,
        code: "PENDING_REGISTRATION_EXISTS",
        message: "Giáo xứ đang có một yêu cầu đăng ký chờ xử lý",
        data: {
          registration_id: pendingRows[0].id,
        },
      });
    }

    /**
     * Lấy tên giáo xứ từ DB.
     */
    const [churchRows] = await db.query(
      `
      SELECT
        id,
        name
      FROM churches
      WHERE id = ?
      LIMIT 1
      `,
      [churchId],
    );

    if (!churchRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    const church = churchRows[0];

    const transferContent = buildTransferContent(church.name);

    const paymentImage = req.file.path || req.file.filename || null;

    if (!paymentImage) {
      return res.status(500).json({
        success: false,
        message: "Không xác định được đường dẫn ảnh chuyển khoản",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    const [result] = await connection.query(
      `
      INSERT INTO license_registrations (
        church_id,
        name,
        phone,
        email,
        package_code,
        package_name,
        amount,
        transfer_content,
        payment_image,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
      [
        churchId,
        name,
        phone,
        email,
        PACKAGE_CODE,
        PACKAGE_NAME,
        PACKAGE_AMOUNT,
        transferContent,
        paymentImage,
      ],
    );

    const registrationId = result.insertId;

    await connection.query(
      `
      INSERT INTO license_registration_logs (
        registration_id,
        old_status,
        new_status,
        changed_by,
        note
      )
      VALUES (?, NULL, 'pending', ?, ?)
      `,
      [registrationId, getUserId(req), "Tạo yêu cầu đăng ký FaithEdu"],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Đăng ký FaithEdu thành công. Yêu cầu đang chờ xử lý.",
      data: {
        id: registrationId,
        church_id: churchId,
        name,
        phone,
        email,
        package_code: PACKAGE_CODE,
        package_name: PACKAGE_NAME,
        amount: PACKAGE_AMOUNT,
        transfer_content: transferContent,
        payment_image: paymentImage,
        status: "pending",
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("CREATE LICENSE REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tạo yêu cầu đăng ký FaithEdu",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * ============================================================
 * DELETE /license/registration/:id
 * ============================================================
 *
 * Chỉ cho xóa yêu cầu pending của chính giáo xứ.
 */
exports.deleteMyRegistration = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const registrationId = Number(req.params.id);

    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID đăng ký không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        status
      FROM license_registrations
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [registrationId, churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu đăng ký",
      });
    }

    if (rows[0].status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Chỉ có thể xóa yêu cầu đang chờ xử lý",
      });
    }

    await db.query(
      `
      DELETE FROM license_registrations
      WHERE id = ?
        AND church_id = ?
        AND status = 'pending'
      `,
      [registrationId, churchId],
    );

    return res.json({
      success: true,
      message: "Đã xóa yêu cầu đăng ký",
    });
  } catch (error) {
    console.error("DELETE LICENSE REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa yêu cầu đăng ký",
    });
  }
};

/**
 * ============================================================
 * ADMIN
 * ============================================================
 *
 * GET /license/registrations
 *
 * Chỉ system admin.
 */
exports.getAllRegistrations = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const offset = (page - 1) * limit;

    const status = normalizeString(req.query.status);

    const search = normalizeString(req.query.search);

    const conditions = [];
    const params = [];

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      conditions.push("lr.status = ?");
      params.push(status);
    }

    if (search) {
      conditions.push(`
        (
          lr.name LIKE ?
          OR lr.phone LIKE ?
          OR lr.email LIKE ?
          OR c.name LIKE ?
          OR lr.transfer_content LIKE ?
        )
      `);

      const keyword = `%${search}%`;

      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    const whereSQL = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM license_registrations lr
      INNER JOIN churches c
        ON c.id = lr.church_id
      ${whereSQL}
      `,
      params,
    );

    const total = Number(countRows[0]?.total || 0);

    const [rows] = await db.query(
      `
      SELECT
        lr.id,
        lr.church_id,

        c.name AS church_name,

        lr.name,
        lr.phone,
        lr.email,

        lr.package_code,
        lr.package_name,
        lr.amount,

        lr.transfer_content,
        lr.payment_image,

        lr.status,

        lr.reviewed_by,
        lr.reviewed_at,

        lr.reject_reason,
        lr.note,

        lr.created_at,
        lr.updated_at

      FROM license_registrations lr

      INNER JOIN churches c
        ON c.id = lr.church_id

      ${whereSQL}

      ORDER BY
        CASE
          WHEN lr.status = 'pending' THEN 0
          WHEN lr.status = 'approved' THEN 1
          ELSE 2
        END,
        lr.created_at DESC,
        lr.id DESC

      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET ALL LICENSE REGISTRATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách đăng ký",
    });
  }
};

/**
 * ============================================================
 * GET /license/registrations/:id
 * ============================================================
 *
 * Admin xem chi tiết.
 */
exports.getAdminRegistrationById = async (req, res) => {
  try {
    const registrationId = Number(req.params.id);

    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID đăng ký không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        lr.*,
        c.name AS church_name
      FROM license_registrations lr
      INNER JOIN churches c
        ON c.id = lr.church_id
      WHERE lr.id = ?
      LIMIT 1
      `,
      [registrationId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đăng ký",
      });
    }

    const [logs] = await db.query(
      `
      SELECT
        id,
        registration_id,
        old_status,
        new_status,
        changed_by,
        note,
        created_at
      FROM license_registration_logs
      WHERE registration_id = ?
      ORDER BY created_at DESC, id DESC
      `,
      [registrationId],
    );

    return res.json({
      success: true,
      data: {
        ...rows[0],
        logs,
      },
    });
  } catch (error) {
    console.error("GET ADMIN LICENSE REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy chi tiết đăng ký",
    });
  }
};

/**
 * ============================================================
 * PUT /license/registrations/:id/approve
 * ============================================================
 */
exports.approveRegistration = async (req, res) => {
  let connection;

  try {
    const registrationId = Number(req.params.id);
    const adminId = getUserId(req);

    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID đăng ký không hợp lệ",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        id,
        church_id,
        status,
        package_name,
        amount
      FROM license_registrations
      WHERE id = ?
      FOR UPDATE
      `,
      [registrationId],
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đăng ký",
      });
    }

    const registration = rows[0];

    if (registration.status !== "pending") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Yêu cầu này đã được xử lý trước đó",
      });
    }

    await connection.query(
      `
      UPDATE license_registrations
      SET
        status = 'approved',
        reviewed_by = ?,
        reviewed_at = NOW(),
        reject_reason = NULL
      WHERE id = ?
      `,
      [adminId, registrationId],
    );

    await connection.query(
      `
      INSERT INTO license_registration_logs (
        registration_id,
        old_status,
        new_status,
        changed_by,
        note
      )
      VALUES (?, 'pending', 'approved', ?, ?)
      `,
      [registrationId, adminId, "Admin duyệt đăng ký FaithEdu"],
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Đã duyệt đăng ký FaithEdu",
      data: {
        id: registrationId,
        status: "approved",
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("APPROVE LICENSE REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể duyệt đăng ký",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * ============================================================
 * PUT /license/registrations/:id/reject
 * ============================================================
 */
exports.rejectRegistration = async (req, res) => {
  let connection;

  try {
    const registrationId = Number(req.params.id);
    const adminId = getUserId(req);

    const rejectReason = normalizeString(req.body?.reject_reason);

    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID đăng ký không hợp lệ",
      });
    }

    if (!rejectReason) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập lý do từ chối",
      });
    }

    if (rejectReason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Lý do từ chối không được vượt quá 500 ký tự",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        id,
        status
      FROM license_registrations
      WHERE id = ?
      FOR UPDATE
      `,
      [registrationId],
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đăng ký",
      });
    }

    if (rows[0].status !== "pending") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Yêu cầu này đã được xử lý trước đó",
      });
    }

    await connection.query(
      `
      UPDATE license_registrations
      SET
        status = 'rejected',
        reviewed_by = ?,
        reviewed_at = NOW(),
        reject_reason = ?
      WHERE id = ?
      `,
      [adminId, rejectReason, registrationId],
    );

    await connection.query(
      `
      INSERT INTO license_registration_logs (
        registration_id,
        old_status,
        new_status,
        changed_by,
        note
      )
      VALUES (?, 'pending', 'rejected', ?, ?)
      `,
      [registrationId, adminId, rejectReason],
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Đã từ chối đăng ký",
      data: {
        id: registrationId,
        status: "rejected",
        reject_reason: rejectReason,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("REJECT LICENSE REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể từ chối đăng ký",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

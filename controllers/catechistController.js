const db = require("../config/db");
const bcrypt = require("bcrypt");
const { generateCatechistCode } = require("../utils/generateCode");

/**
 * Lấy church_id từ tài khoản đăng nhập
 *
 * Tùy authMiddleware của project có thể là:
 * req.user.church_id
 * hoặc req.user.parish_id
 *
 * Ưu tiên church_id.
 */
const getChurchId = (req) => {
  return req.user?.church_id || req.user?.parish_id || null;
};

/**
 * ================================
 * LẤY DANH SÁCH GIÁO LÝ VIÊN
 * ================================
 */
exports.getAllCatechists = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    console.log("========== GET ALL CATECHISTS ==========");
    console.log("👤 USER:", req.user);
    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        c.*
      FROM catechists c
      WHERE c.church_id = ?
      ORDER BY c.id DESC
      `,
      [churchId],
    );

    console.log("📊 Số lượng GLV:", rows.length);

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("❌ GET ALL CATECHISTS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * ================================
 * LẤY CHI TIẾT GIÁO LÝ VIÊN
 * ================================
 */
exports.getCatechistById = async (req, res) => {
  try {
    const { id } = req.params;
    const churchId = getChurchId(req);

    console.log("========== GET CATECHIST ==========");
    console.log("🆔 CATECHIST ID:", id);
    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const [catechistRows] = await db.query(
      `
      SELECT
        c.*
      FROM catechists c
      WHERE c.id = ?
        AND c.church_id = ?
      LIMIT 1
      `,
      [id, churchId],
    );

    if (catechistRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo lý viên",
      });
    }

    /**
     * Lấy các lớp mà GLV đang dạy
     */
    const [classes] = await db.query(
      `
      SELECT
        cc.id,
        cc.catechist_id,
        cc.class_id,
        cc.role,
        cc.status,
        cc.assigned_date,
        cc.notes,

        c.name AS class_name,
        c.category,
        c.description,
        c.room,
        c.church_id

      FROM catechist_classes cc

      INNER JOIN classes c
        ON c.id = cc.class_id

      WHERE cc.catechist_id = ?
        AND c.church_id = ?

      ORDER BY c.id DESC
      `,
      [id, churchId],
    );

    res.status(200).json({
      success: true,
      data: {
        ...catechistRows[0],
        classes,
      },
    });
  } catch (error) {
    console.error("❌ GET CATECHIST ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * ================================
 * TẠO GIÁO LÝ VIÊN
 * ================================
 */

exports.createCatechist = async (req, res) => {
  let connection;

  try {
    console.log("========== CREATE CATECHIST ==========");
    console.log("📥 req.body:", req.body);
    console.log("👤 req.user:", req.user);

    const churchId = getChurchId(req);

    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const {
      holy_name,
      full_name,
      gender,
      date_of_birth,
      phone,
      email,
      address,

      parish,
      diocese,

      baptism_date,
      baptism_place,
      first_communion_date,
      confirmation_date,
      oath_date,

      father_name,
      father_phone,

      mother_name,
      mother_phone,

      level,
      status,
      notes,

      // Mật khẩu có thể truyền từ frontend
      password,
    } = req.body;

    // =====================================================
    // VALIDATE HỌ TÊN
    // =====================================================

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập họ và tên Giáo lý viên",
      });
    }

    // =====================================================
    // EMAIL BẮT BUỘC
    // =====================================================

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email để tạo tài khoản đăng nhập",
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // =====================================================
    // PASSWORD
    //
    // Không truyền password
    // => mặc định 123456
    // =====================================================

    const accountPassword =
      password && String(password).trim() ? String(password).trim() : "123456";

    // =====================================================
    // SINH MÃ GIÁO LÝ VIÊN
    // =====================================================

    const catechistCode = await generateCatechistCode();

    console.log("🔢 Generated catechist code:", catechistCode);
    console.log("📧 Account email:", cleanEmail);

    // =====================================================
    // HASH PASSWORD
    // =====================================================

    const hashedPassword = await bcrypt.hash(accountPassword, 10);

    // =====================================================
    // CONNECTION
    // =====================================================

    connection = await db.getConnection();

    await connection.beginTransaction();

    // =====================================================
    // KIỂM TRA EMAIL ĐÃ TỒN TẠI
    // =====================================================

    const [existingAccount] = await connection.query(
      `
      SELECT
        id,
        username,
        email,
        church_id,
        role
      FROM admins
      WHERE email = ?
      LIMIT 1
      `,
      [cleanEmail],
    );

    if (existingAccount.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: `Email "${cleanEmail}" đã được sử dụng cho tài khoản khác`,
      });
    }

    // =====================================================
    // INSERT CATECHIST
    // =====================================================

    const catechistSql = `
      INSERT INTO catechists (
        church_id,
        catechist_code,
        holy_name,
        full_name,
        gender,
        date_of_birth,
        phone,
        email,
        address,
        parish,
        diocese,
        baptism_date,
        baptism_place,
        first_communion_date,
        confirmation_date,
        oath_date,
        father_name,
        father_phone,
        mother_name,
        mother_phone,
        level,
        status,
        notes
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `;

    const catechistValues = [
      churchId,
      catechistCode,

      holy_name || null,
      String(full_name).trim(),

      gender || "Nam",

      date_of_birth || null,

      phone || null,
      cleanEmail,
      address || null,

      parish || null,
      diocese || null,

      baptism_date || null,
      baptism_place || null,

      first_communion_date || null,
      confirmation_date || null,
      oath_date || null,

      father_name || null,
      father_phone || null,

      mother_name || null,
      mother_phone || null,

      level || "Dự bị",
      status || "active",

      notes || null,
    ];

    const [catechistResult] = await connection.query(
      catechistSql,
      catechistValues,
    );

    const catechistId = catechistResult.insertId;

    console.log("✅ Catechist created:", catechistId);

    // =====================================================
    // TẠO TÀI KHOẢN
    //
    // username = email
    // role = catechist
    // church_id = giáo xứ hiện tại
    //
    // KHÔNG CÓ catechist_id
    // =====================================================

    const adminSql = `
      INSERT INTO admins (
        church_id,
        username,
        password,
        role,
        account_type,
        is_active,
        full_name,
        saint_name,
        birthday,
        address,
        email,
        phone
      )
      VALUES (
        ?, ?, ?, 'catechist', 'member', 1, ?, ?, ?, ?, ?, ?
      )
    `;

    const adminValues = [
      churchId,

      // Đăng nhập bằng email
      cleanEmail,

      hashedPassword,

      String(full_name).trim(),

      holy_name || null,

      date_of_birth || null,

      address || null,

      cleanEmail,

      phone || null,
    ];

    const [adminResult] = await connection.query(adminSql, adminValues);

    const adminId = adminResult.insertId;

    console.log("✅ Account created:", adminId);

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    console.log("🎉 CREATE CATECHIST + ACCOUNT SUCCESS");

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(201).json({
      success: true,
      message: "Thêm Giáo lý viên và tài khoản đăng nhập thành công",

      data: {
        catechist: {
          id: catechistId,
          church_id: churchId,
          catechist_code: catechistCode,
          full_name: String(full_name).trim(),
        },

        account: {
          id: adminId,
          church_id: churchId,
          username: cleanEmail,
          email: cleanEmail,
          role: "catechist",
        },

        // Cho frontend biết mật khẩu ban đầu
        // để hiển thị cho admin.
        initial_password: accountPassword,
      },
    });
  } catch (error) {
    // =====================================================
    // ROLLBACK
    // =====================================================

    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error("❌ CREATE CATECHIST ERROR");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("SQL Message:", error.sqlMessage);
    console.error("Stack:", error.stack);

    // =====================================================
    // DUPLICATE
    // =====================================================

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email hoặc mã Giáo lý viên đã tồn tại",
        errorCode: error.code,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Không thể tạo Giáo lý viên và tài khoản",
      errorCode: error.code,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * ================================
 * CẬP NHẬT GIÁO LÝ VIÊN
 * ================================
 */
const bcrypt = require("bcryptjs");

exports.updateCatechist = async (req, res) => {
  try {
    const { id } = req.params;
    const churchId = getChurchId(req);

    console.log("========== UPDATE CATECHIST ==========");
    console.log("🆔 ID:", id);
    console.log("⛪ CHURCH ID:", churchId);
    console.log("📥 BODY:", req.body);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // Kiểm tra GLV thuộc giáo xứ
    const [existing] = await db.query(
      `
      SELECT id
      FROM catechists
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [id, churchId],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo lý viên trong giáo xứ này",
      });
    }

    const updateData = { ...req.body };

    // Không cho sửa các field hệ thống
    delete updateData.id;
    delete updateData.church_id;
    delete updateData.catechist_code;
    delete updateData.created_at;
    delete updateData.updated_at;

    // Không cho frontend truyền field xác nhận
    delete updateData.password_confirm;

    // Chuẩn hóa họ tên
    if (updateData.full_name !== undefined) {
      updateData.full_name = String(updateData.full_name).trim();

      if (!updateData.full_name) {
        return res.status(400).json({
          success: false,
          message: "Họ và tên không được để trống",
        });
      }
    }

    // Email
    if (updateData.email !== undefined) {
      updateData.email = String(updateData.email).trim().toLowerCase();

      if (!updateData.email) {
        updateData.email = null;
      }
    }

    // Password
    if (updateData.password !== undefined) {
      const password = String(updateData.password).trim();

      // Nếu password rỗng => không thay đổi
      if (!password) {
        delete updateData.password;
      } else {
        if (password.length < 6) {
          return res.status(400).json({
            success: false,
            message: "Mật khẩu phải có ít nhất 6 ký tự",
          });
        }

        updateData.password = await bcrypt.hash(password, 10);
      }
    }

    // Không có dữ liệu
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Không có dữ liệu cần cập nhật",
      });
    }

    const sql = `
      UPDATE catechists
      SET ?
      WHERE id = ?
        AND church_id = ?
    `;

    const [result] = await db.query(sql, [updateData, id, churchId]);

    console.log("📊 Update result:", result);

    return res.status(200).json({
      success: true,
      message: "Cập nhật Giáo lý viên thành công",
    });
  } catch (error) {
    console.error("❌ UPDATE CATECHIST ERROR:", error);

    // Email bị trùng
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email này đã được sử dụng",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ",
      errorCode: error.code,
    });
  }
};
/**
 * ================================
 * XÓA GIÁO LÝ VIÊN
 * ================================
 */
exports.deleteCatechist = async (req, res) => {
  try {
    const { id } = req.params;
    const churchId = getChurchId(req);

    console.log("========== DELETE CATECHIST ==========");
    console.log("🆔 ID:", id);
    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    /**
     * Kiểm tra tồn tại
     */
    const [existing] = await db.query(
      `
      SELECT id
      FROM catechists
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [id, churchId],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo lý viên trong giáo xứ này",
      });
    }

    /**
     * Xóa phân lớp trước
     *
     * Nếu catechist_classes không có ON DELETE CASCADE
     * thì tránh lỗi FK.
     */
    await db.query(
      `
      DELETE FROM catechist_classes
      WHERE catechist_id = ?
      `,
      [id],
    );

    /**
     * Xóa GLV
     */
    await db.query(
      `
      DELETE FROM catechists
      WHERE id = ?
        AND church_id = ?
      `,
      [id, churchId],
    );

    res.status(200).json({
      success: true,
      message: "Xóa Giáo lý viên thành công",
    });
  } catch (error) {
    console.error("❌ DELETE CATECHIST ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
      errorCode: error.code,
    });
  }
};

/**
 * ================================
 * PHÂN LỚP CHO GIÁO LÝ VIÊN
 * ================================
 */
exports.assignClass = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { catechist_id, class_id, role, status, assigned_date, notes } =
      req.body;

    console.log("========== ASSIGN CLASS ==========");
    console.log("👤 CATECHIST ID:", catechist_id);
    console.log("🏫 CLASS ID:", class_id);
    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    if (!catechist_id || !class_id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu catechist_id hoặc class_id",
      });
    }

    /**
     * Kiểm tra GLV thuộc giáo xứ hiện tại
     */
    const [catechists] = await db.query(
      `
      SELECT id, church_id
      FROM catechists
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [catechist_id, churchId],
    );

    if (catechists.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Giáo lý viên không thuộc giáo xứ hiện tại",
      });
    }

    /**
     * Kiểm tra lớp thuộc giáo xứ hiện tại
     */
    const [classes] = await db.query(
      `
      SELECT id, church_id, name
      FROM classes
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [class_id, churchId],
    );

    if (classes.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Lớp học không thuộc giáo xứ hiện tại",
      });
    }

    /**
     * Phân lớp
     */
    const sql = `
      INSERT INTO catechist_classes (
        catechist_id,
        class_id,
        role,
        status,
        assigned_date,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        role = VALUES(role),
        status = VALUES(status),
        assigned_date = VALUES(assigned_date),
        notes = VALUES(notes)
    `;

    await db.query(sql, [
      catechist_id,
      class_id,
      role || "Trưởng lớp",
      status || "teaching",
      assigned_date || new Date(),
      notes || null,
    ]);

    console.log("✅ Phân lớp thành công");

    res.status(200).json({
      success: true,
      message: "Phân lớp thành công",
    });
  } catch (error) {
    console.error("❌ ASSIGN CLASS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
      errorCode: error.code,
    });
  }
};

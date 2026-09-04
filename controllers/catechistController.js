const db = require("../config/db");
const bcrypt = require("bcrypt");
const { generateCatechistCode } = require("../utils/generateCode");
const { writeLog } = require("../utils/activityLogger");

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
        ?, ?, ?, 'teacher', 'member', 1, ?, ?, ?, ?, ?, ?
      )
    `;

    const adminValues = [
      churchId,

      // Đăng nhập bằng email
      catechistCode,

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
    await writeLog({
      admin_id: req.user?.id || null,
      action: "CREATE",
      target_type: "catechist",
      target_id: catechistId,
      description: `Thêm Giáo lý viên "${String(full_name).trim()}" - mã ${catechistCode}, tạo tài khoản đăng nhập ${cleanEmail}`,
      ip_address: req.ip,
    });

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
exports.updateCatechist = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const churchId = getChurchId(req);

    console.log("========== UPDATE CATECHIST ==========");
    console.log("🆔 ID:", id);
    console.log("⛪ CHURCH ID:", churchId);
    console.log("📥 BODY:", req.body);

    // =====================================================
    // 0. KIỂM TRA CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    await connection.beginTransaction();

    // =====================================================
    // 1. LẤY GIÁO LÝ VIÊN CŨ
    // =====================================================

    const [catechistRows] = await connection.query(
      `
      SELECT *
      FROM catechists
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [id, churchId],
    );

    if (catechistRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo lý viên trong giáo xứ này",
      });
    }

    const oldCatechist = catechistRows[0];

    // =====================================================
    // CATECHIST CODE LÀ MÃ CỐ ĐỊNH
    //
    // KHÔNG CHO PHÉP THAY ĐỔI
    // =====================================================

    const oldCatechistCode = oldCatechist.catechist_code;

    const oldCatechistEmail = oldCatechist.email;

    console.log("👤 OLD CATECHIST:", {
      id: oldCatechist.id,
      full_name: oldCatechist.full_name,
      catechist_code: oldCatechistCode,
      email: oldCatechistEmail,
    });

    // =====================================================
    // 2. COPY DATA
    // =====================================================

    const updateData = {
      ...req.body,
    };

    // =====================================================
    // 3. TÁCH PASSWORD
    // =====================================================

    const newPassword = updateData.password;

    delete updateData.password;
    delete updateData.password_confirm;

    // =====================================================
    // 4. KHÔNG CHO SỬA CATECHIST CODE
    //
    // Nếu frontend gửi catechist_code lên thì bỏ qua
    // =====================================================

    if (updateData.catechist_code !== undefined) {
      console.log(
        "🔒 IGNORE CATECHIST CODE:",
        updateData.catechist_code,
        "→",
        oldCatechistCode,
      );
    }

    delete updateData.catechist_code;

    // =====================================================
    // 5. XÓA FIELD HỆ THỐNG
    // =====================================================

    delete updateData.id;
    delete updateData.church_id;
    delete updateData.created_at;
    delete updateData.updated_at;

    // =====================================================
    // 6. CHUẨN HÓA HỌ TÊN
    // =====================================================

    if (updateData.full_name !== undefined) {
      updateData.full_name = String(updateData.full_name).trim();

      if (!updateData.full_name) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Họ và tên không được để trống",
        });
      }
    }

    // =====================================================
    // 7. CHUẨN HÓA EMAIL
    // =====================================================

    let newCatechistEmail = updateData.email;

    if (newCatechistEmail !== undefined) {
      newCatechistEmail = String(newCatechistEmail).trim().toLowerCase();

      if (!newCatechistEmail) {
        newCatechistEmail = null;
      }

      updateData.email = newCatechistEmail;
    } else {
      newCatechistEmail = oldCatechistEmail;
    }

    console.log("📧 OLD EMAIL:", oldCatechistEmail);
    console.log("📧 NEW EMAIL:", newCatechistEmail);

    // =====================================================
    // 8. KIỂM TRA EMAIL CÓ THAY ĐỔI KHÔNG
    // =====================================================

    const isEmailChanged = newCatechistEmail !== oldCatechistEmail;

    console.log("🔄 EMAIL CHANGED:", isEmailChanged);

    // =====================================================
    // 9. CHECK EMAIL TRÙNG TRONG ADMINS
    //
    // Chỉ kiểm tra khi email thay đổi
    // =====================================================

    if (isEmailChanged && newCatechistEmail) {
      const [duplicateAdminEmailRows] = await connection.query(
        `
          SELECT id, username
          FROM admins
          WHERE email = ?
            AND church_id = ?
            AND username != ?
          LIMIT 1
          `,
        [newCatechistEmail, churchId, oldCatechistCode],
      );

      if (duplicateAdminEmailRows.length > 0) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            `Email "${newCatechistEmail}" ` +
            `đã được sử dụng bởi tài khoản khác`,
        });
      }
    }

    // =====================================================
    // 10. CHECK EMAIL TRÙNG TRONG CATECHISTS
    // =====================================================

    if (isEmailChanged && newCatechistEmail) {
      const [duplicateCatechistEmailRows] = await connection.query(
        `
          SELECT id, catechist_code
          FROM catechists
          WHERE email = ?
            AND church_id = ?
            AND id != ?
          LIMIT 1
          `,
        [newCatechistEmail, churchId, id],
      );

      if (duplicateCatechistEmailRows.length > 0) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            `Email "${newCatechistEmail}" ` +
            `đã được sử dụng bởi Giáo lý viên khác`,
        });
      }
    }

    // =====================================================
    // 11. UPDATE CATECHIST
    //
    // LƯU Ý:
    // updateData ĐÃ BỊ XÓA catechist_code
    // nên KHÔNG BAO GIỜ update mã GLV
    // =====================================================

    if (Object.keys(updateData).length > 0) {
      const [result] = await connection.query(
        `
        UPDATE catechists
        SET ?
        WHERE id = ?
          AND church_id = ?
        `,
        [updateData, id, churchId],
      );

      console.log("📊 UPDATE CATECHIST RESULT:", result);
    }

    // =====================================================
    // 12. USERNAME ADMIN CỐ ĐỊNH
    //
    // username = catechist_code
    //
    // KHÔNG ĐƯỢC ĐỔI
    // =====================================================

    const adminUsername = oldCatechistCode;

    console.log("🔐 ADMIN USERNAME FIXED:", adminUsername);

    // =====================================================
    // 13. UPDATE EMAIL ADMINS
    //
    // CHỈ ĐỒNG BỘ EMAIL
    //
    // KHÔNG UPDATE USERNAME
    // =====================================================

    if (isEmailChanged) {
      console.log("🔄 UPDATE ADMIN EMAIL:", newCatechistEmail);

      const [adminResult] = await connection.query(
        `
          UPDATE admins
          SET email = ?
          WHERE username = ?
            AND church_id = ?
          `,
        [newCatechistEmail, adminUsername, churchId],
      );

      console.log("🔐 UPDATE ADMIN EMAIL RESULT:", adminResult);

      if (adminResult.affectedRows === 0) {
        console.warn(
          "⚠️ Không tìm thấy admin tương ứng với catechist_code:",
          adminUsername,
        );
      } else {
        console.log("✅ ADMIN EMAIL SYNC SUCCESS");

        console.log(`   EMAIL: ${oldCatechistEmail} → ${newCatechistEmail}`);
      }
    } else {
      console.log("ℹ️ Email không thay đổi");
    }

    // =====================================================
    // 14. UPDATE PASSWORD
    //
    // Password nằm trong admins
    // =====================================================

    if (newPassword !== undefined && newPassword !== null) {
      const password = String(newPassword).trim();

      // ---------------------------------------------------
      // Nếu người dùng nhập password mới
      // ---------------------------------------------------

      if (password) {
        if (password.length < 6) {
          await connection.rollback();

          return res.status(400).json({
            success: false,
            message: "Mật khẩu phải có ít nhất 6 ký tự",
          });
        }

        console.log("🔐 UPDATE PASSWORD FOR:", adminUsername);

        const hashedPassword = await bcrypt.hash(password, 10);

        const [passwordResult] = await connection.query(
          `
            UPDATE admins
            SET password = ?
            WHERE username = ?
              AND church_id = ?
            `,
          [hashedPassword, adminUsername, churchId],
        );

        console.log("🔐 UPDATE ADMIN PASSWORD RESULT:", passwordResult);

        if (passwordResult.affectedRows === 0) {
          console.warn(
            "⚠️ Không tìm thấy tài khoản admin tương ứng:",
            adminUsername,
          );
        } else {
          console.log("✅ PASSWORD UPDATED");
        }
      } else {
        console.log("ℹ️ Không nhập password mới → giữ nguyên password cũ");
      }
    }

    // =====================================================
    // 15. COMMIT
    // =====================================================

    await connection.commit();

    console.log("✅ TRANSACTION COMMITTED");

    // =====================================================
    // 16. GHI LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "UPDATE",

        target_type: "catechist",

        target_id: id,

        description:
          `Cập nhật Giáo lý viên "${oldCatechist.full_name}" ` +
          `(${oldCatechistCode || "N/A"})`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ WRITE LOG ERROR:", logError);
    }

    // =====================================================
    // 17. RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      message: "Cập nhật Giáo lý viên thành công",

      data: {
        id: Number(id),

        // =================================================
        // MÃ GLV LUÔN LẤY TỪ DATABASE CŨ
        // KHÔNG NHẬN TỪ REQUEST
        // =================================================

        catechist_code: oldCatechistCode,

        email: newCatechistEmail,

        // =================================================
        // ADMIN
        // =================================================

        admin_synced: true,

        username_synced: false,

        email_synced: isEmailChanged,
      },
    });
  } catch (error) {
    console.error("❌ UPDATE CATECHIST ERROR:", error);

    // =====================================================
    // ROLLBACK
    // =====================================================

    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("❌ ROLLBACK ERROR:", rollbackError);
    }

    // =====================================================
    // DUPLICATE
    // =====================================================

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email hoặc tên đăng nhập đã được sử dụng",
      });
    }

    // =====================================================
    // BAD FIELD
    // =====================================================

    if (error.code === "ER_BAD_FIELD_ERROR") {
      return res.status(500).json({
        success: false,
        message: "Tên cột trong câu SQL không tồn tại",
        errorCode: error.code,
        error: error.message,
      });
    }

    // =====================================================
    // RESPONSE ERROR
    // =====================================================

    return res.status(500).json({
      success: false,

      message: "Lỗi máy chủ",

      errorCode: error.code,

      error: error.message,
    });
  } finally {
    connection.release();
  }
};
/**
 * ================================
 * XÓA GIÁO LÝ VIÊN
 * ================================
 */
exports.deleteCatechist = async (req, res) => {
  const connection = await db.getConnection();

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

    await connection.beginTransaction();

    /**
     * =====================================================
     * 1. Lấy thông tin GLV
     * =====================================================
     *
     * catechist_code chính là username trong admins
     */
    const [existing] = await connection.query(
      `
      SELECT
        id,
        catechist_code,
        full_name,
        email
      FROM catechists
      WHERE id = ?
        AND church_id = ?
      LIMIT 1
      `,
      [id, churchId],
    );

    if (existing.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy Giáo lý viên trong giáo xứ này",
      });
    }

    const catechist = existing[0];

    console.log("👤 GLV:", catechist.full_name);
    console.log("🔑 Catechist code:", catechist.catechist_code);
    console.log("📧 Email:", catechist.email);

    /**
     * =====================================================
     * 2. Xóa phân công lớp
     * =====================================================
     */
    await connection.query(
      `
      DELETE FROM catechist_classes
      WHERE catechist_id = ?
      `,
      [id],
    );

    /**
     * =====================================================
     * 3. Xóa tài khoản admins
     *
     * catechists.catechist_code = admins.username
     *
     * Đồng thời kiểm tra church_id để tránh xóa nhầm
     * tài khoản của giáo xứ khác.
     * =====================================================
     */
    if (catechist.catechist_code) {
      const [adminResult] = await connection.query(
        `
        DELETE FROM admins
        WHERE username = ?
          AND church_id = ?
        `,
        [catechist.catechist_code, churchId],
      );

      console.log("🗑️ Xóa tài khoản admins:", adminResult.affectedRows);
    }

    /**
     * =====================================================
     * 4. Xóa Giáo lý viên
     * =====================================================
     */
    const [catechistResult] = await connection.query(
      `
      DELETE FROM catechists
      WHERE id = ?
        AND church_id = ?
      `,
      [id, churchId],
    );

    /**
     * Kiểm tra thực sự đã xóa
     */
    if (catechistResult.affectedRows === 0) {
      throw new Error("Không thể xóa Giáo lý viên");
    }

    /**
     * =====================================================
     * 5. Commit
     * =====================================================
     */
    await connection.commit();

    console.log("✅ Đã xóa GLV + tài khoản đăng nhập thành công");
    await writeLog({
      admin_id: req.user?.id || null,
      action: "DELETE",
      target_type: "catechist",
      target_id: id,
      description:
        `Xóa Giáo lý viên "${catechist.full_name}" ` +
        `(mã ${catechist.catechist_code}, email ${catechist.email || "không có"}) ` +
        `và tài khoản đăng nhập tương ứng`,
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: "Xóa Giáo lý viên và tài khoản đăng nhập thành công",
    });
  } catch (error) {
    await connection.rollback();

    console.error("❌ DELETE CATECHIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
      errorCode: error.code,
    });
  } finally {
    connection.release();
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
exports.removeClass = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { catechist_id, class_id } = req.body;

    console.log("========== REMOVE CATECHIST FROM CLASS ==========");
    console.log("👤 CATECHIST ID:", catechist_id);
    console.log("🏫 CLASS ID:", class_id);
    console.log("⛪ CHURCH ID:", churchId);

    // =====================================================
    // KIỂM TRA GIÁO XỨ
    // =====================================================
    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // VALIDATE INPUT
    // =====================================================
    if (!catechist_id || !class_id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu catechist_id hoặc class_id",
      });
    }

    // =====================================================
    // KIỂM TRA GIÁO LÝ VIÊN THUỘC GIÁO XỨ
    // =====================================================
    const [catechists] = await db.query(
      `
      SELECT id
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

    // =====================================================
    // KIỂM TRA LỚP THUỘC GIÁO XỨ
    // =====================================================
    const [classes] = await db.query(
      `
      SELECT id, name
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

    // =====================================================
    // KIỂM TRA ĐANG ĐƯỢC PHÂN VÀO LỚP
    // =====================================================
    const [assignment] = await db.query(
      `
      SELECT catechist_id, class_id
      FROM catechist_classes
      WHERE catechist_id = ?
        AND class_id = ?
      LIMIT 1
      `,
      [catechist_id, class_id],
    );

    if (assignment.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Giáo lý viên chưa được phân vào lớp này",
      });
    }

    // =====================================================
    // XÓA PHÂN CÔNG
    // =====================================================
    await db.query(
      `
      DELETE FROM catechist_classes
      WHERE catechist_id = ?
        AND class_id = ?
      `,
      [catechist_id, class_id],
    );

    console.log("✅ Xóa giáo viên khỏi lớp thành công");

    return res.status(200).json({
      success: true,
      message: "Đã xóa giáo lý viên khỏi lớp",
      data: {
        catechist_id: Number(catechist_id),
        class_id: Number(class_id),
      },
    });
  } catch (error) {
    console.error("❌ REMOVE CATECHIST FROM CLASS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa giáo lý viên khỏi lớp",
      errorCode: error.code,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

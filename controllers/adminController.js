const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { writeLog } = require("../utils/activityLogger");
const { createNotification } = require("../services/notification.service");
const fs = require("fs");
const path = require("path");

/* =========================================================
   CREATE ADMIN
========================================================= */
exports.createAdmin = async (req, res) => {
  try {
    const {
      username,
      password,
      role = "admin",
      account_type = "member",
      church_id,

      full_name,
      saint_name,
      email,
      phone,
      birthday,
      hometown,
      address,

      ordination_date,
      position,
      motto,
      bio,
    } = req.body;

    // ============================================================
    // 1. VALIDATE DỮ LIỆU BẮT BUỘC
    // ============================================================

    if (!username || !password || !email || !full_name || !church_id) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng nhập đầy đủ Username, Mật khẩu, Email, Họ tên và Giáo xứ",
      });
    }

    // ============================================================
    // 2. VALIDATE ACCOUNT TYPE
    //
    // DB:
    // ENUM('member', 'vip')
    // ============================================================

    const allowedAccountTypes = ["member", "vip"];

    if (!allowedAccountTypes.includes(account_type)) {
      return res.status(400).json({
        success: false,
        message: "Loại tài khoản không hợp lệ. Chỉ được chọn member hoặc vip",
      });
    }

    // ============================================================
    // 3. VALIDATE ROLE
    // ============================================================

    const allowedRoles = [
      "admin",
      "priest",
      "liturgy_manager",
      "media_manager",
      "catechist",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Vai trò tài khoản không hợp lệ",
      });
    }

    // ============================================================
    // 4. KIỂM TRA GIÁO XỨ
    // ============================================================

    const [churchRows] = await db.query(
      `
      SELECT id
      FROM churches
      WHERE id = ?
      LIMIT 1
      `,
      [church_id],
    );

    if (churchRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Giáo xứ không tồn tại",
      });
    }

    // ============================================================
    // 5. CHUẨN HÓA USERNAME / EMAIL
    // ============================================================

    const finalUsername = String(username).trim().toLowerCase();
    const finalEmail = String(email).trim().toLowerCase();

    // ============================================================
    // 6. KIỂM TRA USERNAME / EMAIL TRÙNG
    //
    // Username và Email là duy nhất toàn hệ thống.
    // ============================================================

    const [exist] = await db.query(
      `
      SELECT id, username, email
      FROM admins
      WHERE username = ?
         OR email = ?
      LIMIT 1
      `,
      [finalUsername, finalEmail],
    );

    if (exist.length > 0) {
      if (
        exist[0].username &&
        exist[0].username.toLowerCase() === finalUsername
      ) {
        return res.status(400).json({
          success: false,
          message: "Username đã tồn tại",
        });
      }

      if (exist[0].email && exist[0].email.toLowerCase() === finalEmail) {
        return res.status(400).json({
          success: false,
          message: "Email đã tồn tại",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Username hoặc Email đã tồn tại",
      });
    }

    // ============================================================
    // 7. HASH PASSWORD
    // ============================================================

    const hash = await bcrypt.hash(password, 10);

    // ============================================================
    // 8. AVATAR
    // ============================================================

    const avatar = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    // ============================================================
    // 9. INSERT ACCOUNT
    // ============================================================

    const [result] = await db.query(
      `
      INSERT INTO admins (
        church_id,
        account_type,
        username,
        password,
        role,

        full_name,
        saint_name,
        email,
        phone,
        avatar,

        birthday,
        hometown,
        address,

        ordination_date,
        position,
        motto,
        bio
      )
      VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
      `,
      [
        Number(church_id),
        account_type,
        finalUsername,
        hash,
        role,

        full_name.trim(),
        saint_name?.trim() || null,
        finalEmail,
        phone?.trim() || null,
        avatar,

        birthday || null,
        hometown?.trim() || null,
        address?.trim() || null,

        ordination_date || null,
        position?.trim() || null,
        motto?.trim() || null,
        bio?.trim() || null,
      ],
    );

    // ============================================================
    // 10. AUDIT LOG
    // ============================================================

    await writeLog({
      admin_id: req.user?.id || null,
      action: "CREATE_ADMIN",
      target_type: "admins",
      target_id: result.insertId,
      description: `Tạo tài khoản ${full_name} (@${finalUsername}), loại ${account_type}, thuộc giáo xứ #${church_id}`,
      ip_address: req.ip,
    });

    // ============================================================
    // 11. NOTIFICATION
    // ============================================================

    await createNotification({
      type: "CREATE_ADMIN",
      title: "Tạo tài khoản mới",
      content: `${full_name} vừa được tạo tài khoản ${account_type}`,
      created_by: req.user?.id || null,
      related_type: "admins",
      related_id: result.insertId,
    });

    // ============================================================
    // 12. RESPONSE
    // ============================================================

    return res.status(201).json({
      success: true,
      message: "Tạo tài khoản thành công",

      data: {
        id: result.insertId,
        church_id: Number(church_id),
        account_type,
        username: finalUsername,
        role,
        full_name,
        email: finalEmail,
      },
    });
  } catch (err) {
    console.error("❌ createAdmin error:", err);

    // ============================================================
    // MYSQL ENUM / UNIQUE ERROR
    // ============================================================

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        message: "Username hoặc Email đã tồn tại",
      });
    }

    if (err.code === "WARN_DATA_TRUNCATED") {
      return res.status(400).json({
        success: false,
        message: "account_type hoặc role không hợp lệ",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Không thể tạo tài khoản",
    });
  }
};
exports.changePassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu tối thiểu 6 ký tự",
      });
    }

    const bcrypt = require("bcryptjs");

    const hash = await bcrypt.hash(password, 10);

    await db.query(`UPDATE admins SET password=? WHERE id=?`, [
      hash,
      req.params.id,
    ]);

    await writeLog({
      admin_id: req.user?.id,
      action: "CHANGE_PASSWORD",
      target_type: "admins",
      target_id: req.params.id,
      description: `Đổi mật khẩu tài khoản ID ${req.params.id}`,
      ip_address: req.ip,
    });

    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
/* =========================================================
   GET ALL
========================================================= */
exports.getAllAdmins = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins ORDER BY id DESC");
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   GET BY ID
========================================================= */
exports.getAdminById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy",
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   UPDATE ADMIN
========================================================= */
exports.updateAdmin = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      role,
      account_type,

      full_name,
      saint_name,
      email,
      phone,
      birthday,
      hometown,
      address,
      ordination_date,
      position,
      motto,
      bio,
    } = req.body;

    const adminId = req.params.id;

    console.log("========================================");
    console.log("========== UPDATE ADMIN ==========");
    console.log("🆔 ADMIN ID:", adminId);
    console.log("📥 BODY:", req.body);
    console.log("========================================");

    // ============================================================
    // 1. LẤY ADMIN HIỆN TẠI
    // ============================================================

    const [old] = await connection.query(
      `
      SELECT *
      FROM admins
      WHERE id = ?
      LIMIT 1
      `,
      [adminId],
    );

    if (!old.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    const currentAdmin = old[0];

    console.log("👤 CURRENT ADMIN:", {
      id: currentAdmin.id,
      username: currentAdmin.username,
      email: currentAdmin.email,
      role: currentAdmin.role,
      church_id: currentAdmin.church_id,
    });

    // ============================================================
    // 2. CHURCH ID
    // ============================================================

    const churchId = currentAdmin.church_id;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // ============================================================
    // 3. ACCOUNT TYPE
    // ============================================================

    const finalAccountType =
      account_type !== undefined && account_type !== null && account_type !== ""
        ? String(account_type).trim().toLowerCase()
        : currentAdmin.account_type || "member";

    if (!["member", "vip"].includes(finalAccountType)) {
      return res.status(400).json({
        success: false,
        message: "Loại tài khoản không hợp lệ. Chỉ được member hoặc vip.",
      });
    }

    // ============================================================
    // 4. EMAIL
    // ============================================================

    const finalEmail =
      email !== undefined && email !== null && email !== ""
        ? String(email).trim().toLowerCase()
        : currentAdmin.email;

    // ============================================================
    // 5. CHECK EMAIL TRÙNG TRONG ADMINS
    // ============================================================

    if (finalEmail && finalEmail !== currentAdmin.email) {
      const [existEmail] = await connection.query(
        `
        SELECT id
        FROM admins
        WHERE email = ?
          AND id != ?
        LIMIT 1
        `,
        [finalEmail, adminId],
      );

      if (existEmail.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email đã được sử dụng bởi tài khoản khác",
        });
      }
    }

    // ============================================================
    // 6. USERNAME = PHẦN TRƯỚC @ CỦA EMAIL
    //
    // admins.username
    //        =
    // catechists.catechist_code
    // ============================================================

    let finalUsername = currentAdmin.username;

    if (finalEmail && finalEmail.includes("@")) {
      const emailUsername = finalEmail
        .split("@")[0]
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");

      if (emailUsername) {
        finalUsername = emailUsername;
      }
    }

    console.log("👤 USERNAME:", currentAdmin.username, "→", finalUsername);

    // ============================================================
    // 7. CHECK USERNAME ADMINS TRÙNG
    // ============================================================

    if (finalUsername !== currentAdmin.username) {
      const [existUsername] = await connection.query(
        `
        SELECT id
        FROM admins
        WHERE username = ?
          AND id != ?
        LIMIT 1
        `,
        [finalUsername, adminId],
      );

      if (existUsername.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Username được tạo từ Email đã tồn tại",
        });
      }
    }

    // ============================================================
    // 8. AVATAR
    // ============================================================

    let avatar = currentAdmin.avatar;

    if (req.file) {
      avatar = `/uploads/avatars/${req.file.filename}`;

      console.log("🖼️ NEW AVATAR:", avatar);
    }

    // ============================================================
    // 9. GIÁ TRỊ MỚI CỦA ADMIN
    // ============================================================

    const finalRole =
      role !== undefined && role !== null && role !== ""
        ? String(role).trim().toLowerCase()
        : currentAdmin.role;

    const finalFullName =
      full_name !== undefined && full_name !== null
        ? String(full_name).trim()
        : currentAdmin.full_name;

    if (!finalFullName) {
      return res.status(400).json({
        success: false,
        message: "Họ và tên không được để trống",
      });
    }

    const finalSaintName =
      saint_name !== undefined && saint_name !== null
        ? String(saint_name).trim()
        : currentAdmin.saint_name;

    const finalPhone =
      phone !== undefined && phone !== null
        ? String(phone).trim()
        : currentAdmin.phone;

    const finalBirthday =
      birthday !== undefined ? birthday || null : currentAdmin.birthday;

    const finalHometown =
      hometown !== undefined && hometown !== null
        ? String(hometown).trim()
        : currentAdmin.hometown;

    const finalAddress =
      address !== undefined && address !== null
        ? String(address).trim()
        : currentAdmin.address;

    const finalOrdinationDate =
      ordination_date !== undefined
        ? ordination_date || null
        : currentAdmin.ordination_date;

    const finalPosition =
      position !== undefined && position !== null
        ? String(position).trim()
        : currentAdmin.position;

    const finalMotto =
      motto !== undefined && motto !== null
        ? String(motto).trim()
        : currentAdmin.motto;

    const finalBio =
      bio !== undefined && bio !== null ? String(bio).trim() : currentAdmin.bio;

    // ============================================================
    // 10. CÓ PHẢI GIÁO LÝ VIÊN KHÔNG?
    // ============================================================

    const isCatechistRole = ["teacher", "catechist"].includes(finalRole);

    console.log("🎓 IS CATECHIST:", isCatechistRole);

    // ============================================================
    // 11. TÌM CATECHIST HIỆN TẠI
    //
    // admins.username
    //        =
    // catechists.catechist_code
    // ============================================================

    const [catechistRows] = await connection.query(
      `
      SELECT *
      FROM catechists
      WHERE catechist_code = ?
        AND church_id = ?
      LIMIT 1
      `,
      [currentAdmin.username, churchId],
    );

    const currentCatechist = catechistRows.length > 0 ? catechistRows[0] : null;

    if (currentCatechist) {
      console.log("🎓 FOUND CATECHIST:", {
        id: currentCatechist.id,
        catechist_code: currentCatechist.catechist_code,
        holy_name: currentCatechist.holy_name,
        full_name: currentCatechist.full_name,
        email: currentCatechist.email,
      });
    } else {
      console.log("⚠️ KHÔNG TÌM THẤY CATECHIST:", currentAdmin.username);
    }

    // ============================================================
    // 12. CHECK CATECHIST CODE MỚI
    // ============================================================

    if (isCatechistRole && finalUsername !== currentAdmin.username) {
      const [duplicateCatechist] = await connection.query(
        `
        SELECT id
        FROM catechists
        WHERE catechist_code = ?
          AND church_id = ?
          AND id != ?
        LIMIT 1
        `,
        [finalUsername, churchId, currentCatechist ? currentCatechist.id : 0],
      );

      if (duplicateCatechist.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Mã Giáo lý viên "${finalUsername}" đã tồn tại`,
        });
      }
    }

    // ============================================================
    // 13. CHECK EMAIL TRÙNG TRONG CATECHISTS
    // ============================================================

    if (
      isCatechistRole &&
      finalEmail &&
      currentCatechist &&
      finalEmail !== currentCatechist.email
    ) {
      const [duplicateCatechistEmail] = await connection.query(
        `
          SELECT id
          FROM catechists
          WHERE email = ?
            AND church_id = ?
            AND id != ?
          LIMIT 1
          `,
        [finalEmail, churchId, currentCatechist.id],
      );

      if (duplicateCatechistEmail.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Email "${finalEmail}" đã được sử dụng bởi Giáo lý viên khác`,
        });
      }
    }

    // ============================================================
    // 14. START TRANSACTION
    // ============================================================

    await connection.beginTransaction();

    console.log("🔄 TRANSACTION START");

    // ============================================================
    // 15. UPDATE ADMINS
    //
    // admins có:
    // saint_name
    // birthday
    // hometown
    // ordination_date
    // position
    // motto
    // bio
    // ============================================================

    const [adminResult] = await connection.query(
      `
      UPDATE admins
      SET
        account_type = ?,
        username = ?,
        role = ?,

        full_name = ?,
        saint_name = ?,
        email = ?,
        phone = ?,
        avatar = ?,

        birthday = ?,
        hometown = ?,
        address = ?,

        ordination_date = ?,
        position = ?,
        motto = ?,
        bio = ?

      WHERE id = ?
      `,
      [
        finalAccountType,
        finalUsername,
        finalRole,

        finalFullName,
        finalSaintName,
        finalEmail,
        finalPhone,
        avatar,

        finalBirthday,
        finalHometown,
        finalAddress,

        finalOrdinationDate,
        finalPosition,
        finalMotto,
        finalBio,

        adminId,
      ],
    );

    console.log("📊 UPDATE ADMINS:", {
      affectedRows: adminResult.affectedRows,
      changedRows: adminResult.changedRows,
    });

    // ============================================================
    // 16. ĐỒNG BỘ CATECHISTS
    //
    // Mapping:
    //
    // admins.username   → catechists.catechist_code
    // admins.saint_name → catechists.holy_name
    // admins.full_name  → catechists.full_name
    // admins.email      → catechists.email
    // admins.phone      → catechists.phone
    // admins.birthday   → catechists.date_of_birth
    // admins.address    → catechists.address
    //
    // KHÔNG dùng:
    // birthday
    // hometown
    // ordination_date
    // position
    // motto
    // bio
    //
    // vì catechists không có các column này.
    // ============================================================

    if (isCatechistRole) {
      // ==========================================================
      // CASE 1: ĐÃ CÓ CATECHIST
      // ==========================================================

      if (currentCatechist) {
        console.log("🔄 UPDATE EXISTING CATECHIST:", currentCatechist.id);

        const [catechistResult] = await connection.query(
          `
            UPDATE catechists
            SET
              catechist_code = ?,
              holy_name = ?,
              full_name = ?,
              email = ?,
              phone = ?,
              date_of_birth = ?,
              address = ?

            WHERE id = ?
              AND church_id = ?
            `,
          [
            finalUsername,
            finalSaintName || null,
            finalFullName,
            finalEmail || null,
            finalPhone || null,
            finalBirthday || null,
            finalAddress || null,

            currentCatechist.id,
            churchId,
          ],
        );

        console.log("📊 UPDATE CATECHISTS:", {
          affectedRows: catechistResult.affectedRows,
          changedRows: catechistResult.changedRows,
        });

        console.log("✅ CATECHIST SYNC SUCCESS");
      }

      // ==========================================================
      // CASE 2: CHƯA CÓ CATECHIST
      //
      // member → teacher
      // member → catechist
      // ==========================================================
      else {
        console.log("➕ CREATE CATECHIST FOR ADMIN");

        // --------------------------------------------------------
        // CHECK CODE
        // --------------------------------------------------------

        const [checkCode] = await connection.query(
          `
          SELECT id
          FROM catechists
          WHERE catechist_code = ?
            AND church_id = ?
          LIMIT 1
          `,
          [finalUsername, churchId],
        );

        if (checkCode.length > 0) {
          throw new Error(`Mã Giáo lý viên "${finalUsername}" đã tồn tại`);
        }

        // --------------------------------------------------------
        // CHECK EMAIL
        // --------------------------------------------------------

        if (finalEmail) {
          const [checkCatechistEmail] = await connection.query(
            `
              SELECT id
              FROM catechists
              WHERE email = ?
                AND church_id = ?
              LIMIT 1
              `,
            [finalEmail, churchId],
          );

          if (checkCatechistEmail.length > 0) {
            throw new Error(
              `Email "${finalEmail}" đã được sử dụng bởi Giáo lý viên khác`,
            );
          }
        }

        // --------------------------------------------------------
        // INSERT
        // --------------------------------------------------------

        const [insertCatechist] = await connection.query(
          `
            INSERT INTO catechists (
              church_id,
              catechist_code,
              holy_name,
              full_name,
              email,
              phone,
              date_of_birth,
              address
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
          [
            churchId,
            finalUsername,
            finalSaintName || null,
            finalFullName,
            finalEmail || null,
            finalPhone || null,
            finalBirthday || null,
            finalAddress || null,
          ],
        );

        console.log("➕ INSERT CATECHIST:", insertCatechist);

        console.log("🎓 NEW CATECHIST ID:", insertCatechist.insertId);

        console.log("✅ CATECHIST CREATED");
      }
    }

    // ============================================================
    // 17. ROLE KHÔNG PHẢI GIÁO LÝ VIÊN
    //
    // Không xóa catechist cũ để giữ:
    // - catechist_classes
    // - lịch sử phân lớp
    // - điểm danh
    // - dữ liệu liên quan
    // ============================================================

    if (!isCatechistRole && currentCatechist) {
      console.log("ℹ️ ROLE KHÔNG PHẢI TEACHER/CATECHIST");

      console.log("ℹ️ GIỮ NGUYÊN CATECHIST ĐỂ BẢO TOÀN LỊCH SỬ");
    }

    // ============================================================
    // 18. COMMIT
    // ============================================================

    await connection.commit();

    console.log("✅ TRANSACTION COMMITTED");

    // ============================================================
    // 19. AUDIT LOG
    // ============================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "UPDATE_ADMIN",

        target_type: "admins",

        target_id: adminId,

        description:
          `Cập nhật tài khoản ${finalFullName} ` +
          `(@${finalUsername}) - ` +
          `role: ${finalRole} - ` +
          `loại tài khoản: ${finalAccountType}`,

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ WRITE LOG ERROR:", logError);
    }

    // ============================================================
    // 20. NOTIFICATION
    // ============================================================

    try {
      await createNotification({
        type: "UPDATE_ADMIN",

        title: "Cập nhật tài khoản",

        content:
          `Tài khoản ${finalFullName} vừa được cập nhật ` +
          `(${finalAccountType === "vip" ? "VIP" : "Member"})`,

        created_by: req.user?.id,

        related_type: "admins",

        related_id: adminId,
      });
    } catch (notificationError) {
      console.error("⚠️ CREATE NOTIFICATION ERROR:", notificationError);
    }

    // ============================================================
    // 21. RESPONSE
    // ============================================================

    return res.json({
      success: true,

      message: "Cập nhật tài khoản thành công!",

      data: {
        id: Number(adminId),

        church_id: churchId,

        account_type: finalAccountType,

        username: finalUsername,

        role: finalRole,

        full_name: finalFullName,

        saint_name: finalSaintName,

        email: finalEmail,

        phone: finalPhone,

        birthday: finalBirthday,

        address: finalAddress,

        catechist_synced: isCatechistRole,

        catechist_code: isCatechistRole ? finalUsername : null,
      },
    });
  } catch (err) {
    console.error("❌ LỖI UPDATE ADMIN:", err);

    // ============================================================
    // ROLLBACK
    // ============================================================

    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("❌ ROLLBACK ERROR:", rollbackError);
    }

    // ============================================================
    // DUPLICATE
    // ============================================================

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Username, email hoặc mã Giáo lý viên đã tồn tại",
        errorCode: err.code,
      });
    }

    // ============================================================
    // UNKNOWN COLUMN
    // ============================================================

    if (err.code === "ER_BAD_FIELD_ERROR") {
      return res.status(500).json({
        success: false,
        message: "Tên cột trong câu SQL không tồn tại trong database",
        errorCode: err.code,
        error: err.message,
      });
    }

    // ============================================================
    // RESPONSE ERROR
    // ============================================================

    return res.status(500).json({
      success: false,

      message: "Lỗi server khi cập nhật tài khoản",

      errorCode: err.code || null,

      error: err.message,
    });
  } finally {
    connection.release();
  }
};
/* =========================================================
   RESET PASSWORD
========================================================= */
exports.resetAdminPassword = async (req, res) => {
  try {
    const { password } = req.body;

    const [admin] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!admin.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const hash = await bcrypt.hash(password, 10);

    await db.query("UPDATE admins SET password=? WHERE id=?", [
      hash,
      req.params.id,
    ]);

    await writeLog({
      admin_id: req.user?.id,
      action: "RESET_PASSWORD",
      target_type: "admins",
      target_id: req.params.id,
      description: `Reset password ${admin[0].full_name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "RESET_PASSWORD",
      title: "Reset mật khẩu",
      content: `${admin[0].full_name} vừa được reset mật khẩu`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: req.params.id,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   DELETE ADMIN
========================================================= */
exports.deleteAdmin = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const admin = rows[0];

    if (admin.avatar) {
      const filePath = path.join(__dirname, "..", admin.avatar);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.query("DELETE FROM admins WHERE id=?", [req.params.id]);

    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_ADMIN",
      target_type: "admins",
      target_id: req.params.id,
      description: `Xóa ${admin.full_name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "DELETE_ADMIN",
      title: "Xóa tài khoản",
      content: `${admin.full_name} vừa bị xóa`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: req.params.id,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   TOGGLE ACTIVE
========================================================= */
exports.toggleActive = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM admins WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const admin = rows[0];
    const newStatus = admin.is_active ? 0 : 1;

    await db.query("UPDATE admins SET is_active=? WHERE id=?", [
      newStatus,
      req.params.id,
    ]);

    await writeLog({
      admin_id: req.user?.id,
      action: "TOGGLE_ACTIVE",
      target_type: "admins",
      target_id: req.params.id,
      description: `${newStatus ? "Bật" : "Tắt"} ${admin.full_name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "TOGGLE_ACTIVE",
      title: "Trạng thái tài khoản",
      content: `${admin.full_name} vừa được cập nhật`,
      created_by: req.user?.id,
      related_type: "admins",
      related_id: req.params.id,
    });

    return res.json({ success: true, is_active: newStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

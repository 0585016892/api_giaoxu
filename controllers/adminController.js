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

    console.log("========== UPDATE ADMIN ==========");
    console.log("🆔 ADMIN ID:", adminId);
    console.log("📥 BODY:", req.body);

    // ============================================================
    // 1. LẤY ACCOUNT CŨ
    // ============================================================

    const [oldRows] = await connection.query(
      `
      SELECT *
      FROM admins
      WHERE id = ?
      LIMIT 1
      `,
      [adminId],
    );

    if (!oldRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    const currentAdmin = oldRows[0];

    console.log("👤 OLD ADMIN:", {
      id: currentAdmin.id,
      username: currentAdmin.username,
      role: currentAdmin.role,
      church_id: currentAdmin.church_id,
    });

    // ============================================================
    // 2. CHURCH ID GIỮ NGUYÊN
    // ============================================================

    const churchId = currentAdmin.church_id;

    // ============================================================
    // 3. XÁC ĐỊNH ROLE MỚI
    // ============================================================

    const finalRole =
      role !== undefined && role !== null && role !== ""
        ? String(role).trim().toLowerCase()
        : currentAdmin.role;

    console.log("🎭 OLD ROLE:", currentAdmin.role);
    console.log("🎭 NEW ROLE:", finalRole);

    // ============================================================
    // 4. ACCOUNT TYPE
    // ============================================================

    const finalAccountType =
      account_type !== undefined && account_type !== null && account_type !== ""
        ? String(account_type).toLowerCase()
        : currentAdmin.account_type || "member";

    if (!["member", "vip"].includes(finalAccountType)) {
      return res.status(400).json({
        success: false,
        message: "Loại tài khoản không hợp lệ. Chỉ được member hoặc vip.",
      });
    }

    // ============================================================
    // 5. EMAIL
    // ============================================================

    const finalEmail =
      email !== undefined && email !== null && email !== ""
        ? String(email).trim().toLowerCase()
        : currentAdmin.email;

    // ============================================================
    // 6. CHECK EMAIL TRÙNG
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
        return res.status(400).json({
          success: false,
          message: "Email đã được sử dụng bởi tài khoản khác",
        });
      }
    }

    // ============================================================
    // 7. TẠO USERNAME TỪ EMAIL
    //
    // username này sẽ đồng bộ:
    //
    // admins.username
    //        =
    // catechists.catechist_code
    // ============================================================

    let finalUsername = currentAdmin.username;

    if (finalEmail && finalEmail.includes("@")) {
      const emailUsername = finalEmail
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");

      if (emailUsername) {
        finalUsername = emailUsername;
      }
    }

    console.log("👤 USERNAME:", currentAdmin.username, "→", finalUsername);

    // ============================================================
    // 8. CHECK USERNAME TRÙNG
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
        return res.status(400).json({
          success: false,
          message: "Username được tạo từ Email đã tồn tại",
        });
      }
    }

    // ============================================================
    // 9. AVATAR
    // ============================================================

    let avatar = currentAdmin.avatar;

    if (req.file) {
      avatar = `/uploads/avatars/${req.file.filename}`;
    }

    // ============================================================
    // 10. GIÁ TRỊ CÒN LẠI
    // ============================================================

    const finalFullName =
      full_name !== undefined && full_name !== null
        ? String(full_name).trim()
        : currentAdmin.full_name;

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
    // 11. KIỂM TRA ROLE CÓ PHẢI GIÁO LÝ VIÊN KHÔNG
    //
    // role:
    // catechist
    // teacher
    // ============================================================

    const isCatechistRole = ["catechist", "teacher"].includes(finalRole);

    const wasCatechistRole = ["catechist", "teacher"].includes(
      currentAdmin.role,
    );

    console.log("🎓 IS CATECHIST ROLE:", isCatechistRole);

    // ============================================================
    // 12. KIỂM TRA CATECHIST HIỆN TẠI
    //
    // Tìm bằng:
    //
    // catechists.catechist_code
    // =
    // admins.username cũ
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

    const oldCatechist = catechistRows.length > 0 ? catechistRows[0] : null;

    console.log(
      "🎓 CATECHIST:",
      oldCatechist
        ? {
            id: oldCatechist.id,
            code: oldCatechist.catechist_code,
            name: oldCatechist.full_name,
          }
        : "KHÔNG CÓ",
    );

    // ============================================================
    // 13. BẮT ĐẦU TRANSACTION
    // ============================================================

    await connection.beginTransaction();

    // ============================================================
    // 14. UPDATE ADMINS
    // ============================================================

    await connection.query(
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

    console.log("✅ ADMINS UPDATED");

    // ============================================================
    // 15. ĐỒNG BỘ CATECHISTS
    //
    // NẾU ACCOUNT LÀ CATECHIST / TEACHER
    // ============================================================

    if (isCatechistRole) {
      // ==========================================================
      // TRƯỜNG HỢP ĐÃ CÓ CATECHIST
      // ==========================================================

      if (oldCatechist) {
        console.log("🔄 UPDATE CATECHIST:", oldCatechist.id);

        await connection.query(
          `
          UPDATE catechists
          SET
            catechist_code = ?,
            full_name = ?,
            email = ?,
            phone = ?,
            saint_name = ?,
            birthday = ?,
            hometown = ?,
            address = ?,
            ordination_date = ?,
            position = ?,
            motto = ?,
            bio = ?
          WHERE id = ?
            AND church_id = ?
          `,
          [
            finalUsername,
            finalFullName,
            finalEmail,
            finalPhone,
            finalSaintName,
            finalBirthday,
            finalHometown,
            finalAddress,
            finalOrdinationDate,
            finalPosition,
            finalMotto,
            finalBio,

            oldCatechist.id,
            churchId,
          ],
        );

        console.log("✅ CATECHIST UPDATED");
      }

      // ==========================================================
      // TRƯỜNG HỢP ACCOUNT CHƯA CÓ CATECHIST
      //
      // Ví dụ:
      // role cũ = member
      // role mới = teacher
      // ==========================================================
      else {
        console.log("➕ CREATE CATECHIST FOR ADMIN");

        // Kiểm tra code lần nữa
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

        await connection.query(
          `
          INSERT INTO catechists (
            church_id,
            catechist_code,
            full_name,
            email,
            phone,
            saint_name,
            birthday,
            hometown,
            address,
            ordination_date,
            position,
            motto,
            bio
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            churchId,
            finalUsername,
            finalFullName,
            finalEmail,
            finalPhone,
            finalSaintName,
            finalBirthday,
            finalHometown,
            finalAddress,
            finalOrdinationDate,
            finalPosition,
            finalMotto,
            finalBio,
          ],
        );

        console.log("✅ CATECHIST CREATED");
      }
    }

    // ============================================================
    // 16. NẾU ĐỔI TỪ CATECHIST → MEMBER
    //
    // KHÔNG XÓA CATECHIST
    //
    // Vì catechists có thể đang có:
    // - class
    // - attendance
    // - lịch sử
    //
    // Chỉ đổi role admin.
    // ============================================================

    if (!isCatechistRole && wasCatechistRole && oldCatechist) {
      console.log(
        "⚠️ ROLE ĐỔI KHỎI CATECHIST:",
        currentAdmin.role,
        "→",
        finalRole,
      );

      // KHÔNG DELETE CATECHIST
      // để giữ dữ liệu lớp học / lịch sử.
    }

    // ============================================================
    // 17. COMMIT
    // ============================================================

    await connection.commit();

    console.log("✅ TRANSACTION COMMITTED");

    // ============================================================
    // 18. AUDIT LOG
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
    // 19. NOTIFICATION
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
    // 20. RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,

      message: "Cập nhật tài khoản thành công!",

      data: {
        id: Number(adminId),

        church_id: churchId,

        account_type: finalAccountType,

        username: finalUsername,

        role: finalRole,

        full_name: finalFullName,

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
      });
    }

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

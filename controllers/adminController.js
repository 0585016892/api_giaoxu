const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { writeLog } = require("../utils/activityLogger");
const fs = require("fs");
const path = require("path");
const { log } = require("console");

/* =========================================================
   CREATE ADMIN
========================================================= */
exports.createAdmin = async (req, res) => {
  let connection;

  try {
    // ============================================================
    // GET BODY
    // ============================================================

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

      // Thông tin GLV
      gender,
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
    } = req.body;

    // ============================================================
    // 1. VALIDATE BẮT BUỘC
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
      "teacher",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Vai trò tài khoản không hợp lệ",
      });
    }

    // ============================================================
    // 4. CHURCH ID
    // ============================================================

    const churchId = Number(church_id);

    if (!Number.isInteger(churchId) || churchId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Giáo xứ không hợp lệ",
      });
    }

    // ============================================================
    // 5. KIỂM TRA GIÁO XỨ
    // ============================================================

    const [churchRows] = await db.query(
      `
      SELECT id
      FROM churches
      WHERE id = ?
      LIMIT 1
      `,
      [churchId],
    );

    if (churchRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Giáo xứ không tồn tại",
      });
    }

    // ============================================================
    // 6. CHUẨN HÓA
    // ============================================================

    const finalUsername = String(username).trim().toLowerCase();

    const finalEmail = String(email).trim().toLowerCase();

    const finalFullName = String(full_name).trim();

    // ============================================================
    // 7. CONNECTION
    // ============================================================

    connection = await db.getConnection();

    const MAX_RETRY = 5;

    // ============================================================
    // 8. TRANSACTION + RETRY
    // ============================================================

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        console.log(
          `========== CREATE ADMIN ATTEMPT ${attempt}/${MAX_RETRY} ==========`,
        );

        await connection.beginTransaction();

        // ========================================================
        // 9. CHECK USERNAME
        // ========================================================

        const [existingUsername] = await connection.query(
          `
            SELECT
              id,
              username,
              email,
              role
            FROM admins
            WHERE username = ?
            LIMIT 1
            `,
          [finalUsername],
        );

        if (existingUsername.length > 0) {
          await connection.rollback();

          return res.status(409).json({
            success: false,
            message: `Username "${finalUsername}" đã tồn tại`,
          });
        }

        // ========================================================
        // 10. CHECK EMAIL
        // ========================================================

        const [existingEmail] = await connection.query(
          `
            SELECT
              id,
              username,
              email,
              role
            FROM admins
            WHERE email = ?
            LIMIT 1
            `,
          [finalEmail],
        );

        if (existingEmail.length > 0) {
          await connection.rollback();

          return res.status(409).json({
            success: false,
            message: `Email "${finalEmail}" đã tồn tại`,
          });
        }

        // ========================================================
        // 11. HASH PASSWORD
        // ========================================================

        const hash = await bcrypt.hash(password, 10);

        // ========================================================
        // 12. AVATAR
        // ========================================================

        const avatar = req.file
          ? `/uploads/avatars/${req.file.filename}`
          : null;

        // ========================================================
        // 13. INSERT ADMIN
        // ========================================================

        const [adminResult] = await connection.query(
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
            churchId,
            account_type,
            finalUsername,
            hash,
            role,

            finalFullName,
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

        const adminId = adminResult.insertId;

        console.log("✅ Admin created:", adminId);

        // ========================================================
        // 14. NẾU LÀ CATECHIST / TEACHER
        //
        // TẠO BẢN GHI CATECHIST
        //
        // username = catechist_code
        //
        // ========================================================

        let catechistId = null;
        let catechistCode = null;

        if (role === "catechist" || role === "teacher") {
          /*
           * ------------------------------------------------------
           * QUY TẮC:
           *
           * username nhập vào chính là base code.
           *
           * Ví dụ:
           *
           * GLV20260049
           *
           * Nếu đã tồn tại ở một trong hai bảng:
           *
           * GLV20260049_1
           *
           * ------------------------------------------------------
           */

          let candidateCode = finalUsername;
          let codeIndex = 0;

          while (true) {
            const [existingCatechist] = await connection.query(
              `
              SELECT id
              FROM catechists
              WHERE catechist_code = ?
              LIMIT 1
              `,
              [candidateCode],
            );

            const [existingAdminCode] = await connection.query(
              `
              SELECT id
              FROM admins
              WHERE username = ?
              LIMIT 1
              `,
              [candidateCode],
            );

            /*
             * Nếu candidate chính là username của admin
             * vừa INSERT ở trên thì đây là trường hợp bình thường.
             *
             * Vì vậy nếu candidate === finalUsername
             * và existingAdminCode là adminId hiện tại
             * thì không xem là duplicate.
             */

            const adminCodeExistsOther =
              existingAdminCode.length > 0 &&
              Number(existingAdminCode[0].id) !== Number(adminId);

            if (existingCatechist.length === 0 && !adminCodeExistsOther) {
              break;
            }

            codeIndex++;

            candidateCode = `${finalUsername}_${codeIndex}`;
          }

          catechistCode = candidateCode;

          console.log("🔑 Catechist code:", catechistCode);

          /*
           * ------------------------------------------------------
           * QUAN TRỌNG
           *
           * Nếu username frontend là:
           *
           * GLV20260049
           *
           * nhưng code đã tồn tại:
           *
           * catechists = GLV20260049
           *
           * thì:
           *
           * catechists = GLV20260049_1
           * admins.username = GLV20260049
           *
           * Hai cái lúc này KHÔNG giống nhau.
           *
           * Vì vậy cần xử lý lại username của admin.
           * ------------------------------------------------------
           */

          if (catechistCode !== finalUsername) {
            /*
             * Xóa admin vừa tạo
             * rồi tạo lại bằng username cuối cùng.
             */

            await connection.query(
              `
              DELETE FROM admins
              WHERE id = ?
              `,
              [adminId],
            );

            // -----------------------------------------------
            // TẠO ADMIN LẠI VỚI USERNAME CUỐI CÙNG
            // -----------------------------------------------

            const [newAdminResult] = await connection.query(
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
                churchId,
                account_type,
                catechistCode,
                hash,
                role,

                finalFullName,
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

            // cập nhật ID admin
            // eslint-disable-next-line no-param-reassign
            var finalAdminId = newAdminResult.insertId;
          } else {
            var finalAdminId = adminId;
          }

          // ====================================================
          // INSERT CATECHIST
          // ====================================================

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
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `;

          const catechistValues = [
            churchId,
            catechistCode,

            saint_name?.trim() || null,
            finalFullName,

            gender || "Nam",

            birthday || null,

            phone?.trim() || null,
            finalEmail,
            address?.trim() || null,

            parish?.trim() || null,
            diocese?.trim() || null,

            baptism_date || null,
            baptism_place?.trim() || null,

            first_communion_date || null,
            confirmation_date || null,
            oath_date || null,

            father_name?.trim() || null,
            father_phone?.trim() || null,

            mother_name?.trim() || null,
            mother_phone?.trim() || null,

            level || "Dự bị",
            status || "active",

            notes?.trim() || null,
          ];

          const [catechistResult] = await connection.query(
            catechistSql,
            catechistValues,
          );

          catechistId = catechistResult.insertId;

          console.log("✅ Catechist created:", catechistId);

          /*
           * Nếu dùng role teacher thì vẫn tạo catechist.
           * Nếu mày chỉ muốn role catechist mới tạo GLV,
           * đổi điều kiện phía trên thành:
           *
           * if (role === "catechist")
           */
        } else {
          var finalAdminId = adminId;
        }

        // ========================================================
        // COMMIT
        // ========================================================

        await connection.commit();

        console.log("🎉 CREATE ADMIN SUCCESS");

        // ========================================================
        // AUDIT LOG
        // ========================================================

        try {
          await writeLog({
            admin_id: req.user?.id || null,

            action:
              role === "catechist" || role === "teacher"
                ? "CREATE_CATECHIST"
                : "CREATE_ADMIN",

            target_type: "admins",

            target_id: finalAdminId,

            description:
              `Tạo tài khoản ${finalFullName} ` +
              `(@${catechistCode || finalUsername}), ` +
              `role ${role}, ` +
              `loại ${account_type}, ` +
              `thuộc giáo xứ #${churchId}`,

            ip_address: req.ip,
          });
        } catch (logError) {
          console.error("⚠️ WRITE LOG ERROR:", logError.message);
        }

        // ========================================================
        // RESPONSE
        // ========================================================

        return res.status(201).json({
          success: true,

          message:
            role === "catechist" || role === "teacher"
              ? "Tạo Giáo lý viên và tài khoản đăng nhập thành công"
              : "Tạo tài khoản thành công",

          data: {
            id: finalAdminId,

            church_id: churchId,

            account_type,

            username: catechistCode || finalUsername,

            role,

            full_name: finalFullName,

            email: finalEmail,

            ...(catechistId
              ? {
                  catechist: {
                    id: catechistId,

                    catechist_code: catechistCode,

                    full_name: finalFullName,
                  },
                }
              : {}),
          },
        });
      } catch (err) {
        // ========================================================
        // ROLLBACK
        // ========================================================

        try {
          await connection.rollback();
        } catch (_) {}

        console.error(`❌ CREATE ADMIN ATTEMPT ${attempt} ERROR`);

        console.error("Message:", err.message);

        console.error("Code:", err.code);

        console.error("SQL Message:", err.sqlMessage);

        // ========================================================
        // DUPLICATE
        //
        // Nếu 2 người cùng tạo một username.
        // ========================================================

        if (err.code === "ER_DUP_ENTRY" && attempt < MAX_RETRY) {
          console.log("⚠️ Duplicate detected → retry");

          continue;
        }

        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            success: false,
            message: "Username, Email hoặc mã Giáo lý viên đã tồn tại",
            errorCode: err.code,
          });
        }

        throw err;
      }
    }

    // ============================================================
    // RETRY FAILED
    // ============================================================

    return res.status(409).json({
      success: false,
      message: "Không thể tạo tài khoản sau nhiều lần thử",
    });
  } catch (err) {
    // ============================================================
    // ROLLBACK
    // ============================================================

    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error("❌ createAdmin error:", err);

    // ============================================================
    // MYSQL UNIQUE
    // ============================================================

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Username, Email hoặc mã Giáo lý viên đã tồn tại",
      });
    }

    // ============================================================
    // ENUM
    // ============================================================

    if (err.code === "WARN_DATA_TRUNCATED") {
      return res.status(400).json({
        success: false,
        message: "account_type hoặc role không hợp lệ",
      });
    }

    // ============================================================
    // RESPONSE
    // ============================================================

    return res.status(500).json({
      success: false,
      message: err.message || "Không thể tạo tài khoản",
      errorCode: err.code,
    });
  } finally {
    if (connection) {
      connection.release();
    }
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
    // 3. USERNAME CỐ ĐỊNH
    //
    // 🔒 KHÔNG BAO GIỜ ĐƯỢC THAY ĐỔI
    //
    // admins.username giữ nguyên giá trị cũ
    //
    // Nếu client gửi:
    // {
    //   username: "abc"
    // }
    //
    // thì cũng BỎ QUA.
    // ============================================================

    const finalUsername = currentAdmin.username;

    console.log("🔒 USERNAME CỐ ĐỊNH:", finalUsername);

    if (req.body.username !== undefined) {
      console.log(
        "⚠️ CLIENT GỬI USERNAME NHƯNG SẼ BỎ QUA:",
        req.body.username,
        "→",
        finalUsername,
      );
    }

    if (req.body.catechist_code !== undefined) {
      console.log(
        "⚠️ CLIENT GỬI CATECHIST CODE NHƯNG SẼ BỎ QUA:",
        req.body.catechist_code,
        "→",
        finalUsername,
      );
    }

    // ============================================================
    // 4. ACCOUNT TYPE
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
    // 5. EMAIL
    // ============================================================

    const finalEmail =
      email !== undefined && email !== null && email !== ""
        ? String(email).trim().toLowerCase()
        : currentAdmin.email;

    // ============================================================
    // 6. CHECK EMAIL TRÙNG TRONG ADMINS
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
    // 7. AVATAR
    // ============================================================

    let avatar = currentAdmin.avatar;

    if (req.file) {
      avatar = `/uploads/avatars/${req.file.filename}`;

      console.log("🖼️ NEW AVATAR:", avatar);
    }

    // ============================================================
    // 8. GIÁ TRỊ MỚI CỦA ADMIN
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
    // 9. CÓ PHẢI GIÁO LÝ VIÊN KHÔNG?
    // ============================================================

    const isCatechistRole = ["teacher", "catechist"].includes(finalRole);

    console.log("🎓 IS CATECHIST:", isCatechistRole);

    // ============================================================
    // 10. TÌM CATECHIST HIỆN TẠI
    //
    // 🔒 DÙ EMAIL CÓ THAY ĐỔI THÌ VẪN TÌM BẰNG
    //
    // admins.username
    //       ↓
    // catechists.catechist_code
    //
    // Username/code là khóa cố định.
    // ============================================================

    const [catechistRows] = await connection.query(
      `
      SELECT *
      FROM catechists
      WHERE catechist_code = ?
        AND church_id = ?
      LIMIT 1
      `,
      [finalUsername, churchId],
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
      console.log("⚠️ KHÔNG TÌM THẤY CATECHIST:", finalUsername);
    }

    // ============================================================
    // 11. CHECK EMAIL TRÙNG TRONG CATECHISTS
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
    // 12. START TRANSACTION
    // ============================================================

    await connection.beginTransaction();

    console.log("🔄 TRANSACTION START");

    // ============================================================
    // 13. UPDATE ADMINS
    //
    // 🔒 QUAN TRỌNG:
    //
    // KHÔNG CÓ:
    //
    // username = ?
    //
    // Username sẽ được giữ nguyên trong database.
    // ============================================================

    const [adminResult] = await connection.query(
      `
      UPDATE admins
      SET
        account_type = ?,
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
      username: finalUsername,
    });

    // ============================================================
    // 14. ĐỒNG BỘ CATECHISTS
    //
    // 🔒 catechist_code KHÔNG ĐƯỢC UPDATE
    //
    // Mapping:
    //
    // admins.username
    //       ↓
    // catechists.catechist_code
    //
    // admins.saint_name
    //       ↓
    // catechists.holy_name
    //
    // admins.full_name
    //       ↓
    // catechists.full_name
    //
    // admins.email
    //       ↓
    // catechists.email
    //
    // admins.phone
    //       ↓
    // catechists.phone
    //
    // admins.birthday
    //       ↓
    // catechists.date_of_birth
    //
    // admins.address
    //       ↓
    // catechists.address
    // ============================================================

    if (isCatechistRole) {
      // ==========================================================
      // CASE 1: ĐÃ CÓ CATECHIST
      // ==========================================================

      if (currentCatechist) {
        console.log("🔄 UPDATE EXISTING CATECHIST:", currentCatechist.id);

        // 🔒 KHÔNG UPDATE catechist_code
        const [catechistResult] = await connection.query(
          `
          UPDATE catechists
          SET
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

          // 🔒 Code cố định
          catechist_code: currentCatechist.catechist_code,
        });

        console.log("✅ CATECHIST SYNC SUCCESS");
      }

      // ==========================================================
      // CASE 2: CHƯA CÓ CATECHIST
      // ==========================================================
      else {
        console.log("➕ CREATE CATECHIST FOR ADMIN");

        // ========================================================
        // 🔒 CODE CATECHIST = USERNAME CỐ ĐỊNH CỦA ADMIN
        // ========================================================

        const fixedCatechistCode = finalUsername;

        console.log("🔒 NEW CATECHIST CODE:", fixedCatechistCode);

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
          [fixedCatechistCode, churchId],
        );

        if (checkCode.length > 0) {
          throw new Error(`Mã Giáo lý viên "${fixedCatechistCode}" đã tồn tại`);
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
        // INSERT CATECHIST
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

            // 🔒 CODE CỐ ĐỊNH
            fixedCatechistCode,

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

        console.log("🔒 CATECHIST CODE:", fixedCatechistCode);

        console.log("✅ CATECHIST CREATED");
      }
    }

    // ============================================================
    // 15. ROLE KHÔNG PHẢI GIÁO LÝ VIÊN
    //
    // KHÔNG XÓA CATECHIST
    //
    // Để bảo toàn:
    // - catechist_classes
    // - phân lớp
    // - điểm danh
    // - lịch sử
    // ============================================================

    if (!isCatechistRole && currentCatechist) {
      console.log("ℹ️ ROLE KHÔNG PHẢI TEACHER/CATECHIST");

      console.log("ℹ️ GIỮ NGUYÊN CATECHIST ĐỂ BẢO TOÀN LỊCH SỬ");

      console.log("🔒 CATECHIST CODE VẪN LÀ:", currentCatechist.catechist_code);
    }

    // ============================================================
    // 16. COMMIT
    // ============================================================

    await connection.commit();

    console.log("✅ TRANSACTION COMMITTED");

    // ============================================================
    // 17. AUDIT LOG
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
    // 18. NOTIFICATION
    // ============================================================

    try {
    } catch (notificationError) {
      console.error("⚠️ CREATE NOTIFICATION ERROR:", notificationError);
    }

    // ============================================================
    // 19. RESPONSE
    // ============================================================

    return res.json({
      success: true,

      message: "Cập nhật tài khoản thành công!",

      data: {
        id: Number(adminId),

        church_id: churchId,

        account_type: finalAccountType,

        // 🔒 USERNAME CỐ ĐỊNH
        username: finalUsername,

        role: finalRole,

        full_name: finalFullName,

        saint_name: finalSaintName,

        email: finalEmail,

        phone: finalPhone,

        birthday: finalBirthday,

        hometown: finalHometown,

        address: finalAddress,

        catechist_synced: isCatechistRole,

        // 🔒 CODE CỐ ĐỊNH
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

        message: "Email hoặc mã Giáo lý viên đã tồn tại",

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
    const adminId = Number(req.params.id);

    console.log("=================================");
    console.log("RESET PASSWORD");
    console.log("adminId:", adminId);
    console.log("password:", password);

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu tối thiểu 6 ký tự",
      });
    }

    // 1. Kiểm tra admin tồn tại
    const [admin] = await db.query(
      `
      SELECT id, username, full_name, password
      FROM admins
      WHERE id = ?
      `,
      [adminId],
    );

    console.log("ADMIN:", admin);

    if (!admin.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    // 2. Hash password mới
    const hash = await bcrypt.hash(password, 10);

    console.log("NEW HASH:", hash);

    // 3. Update
    const [result] = await db.query(
      `
      UPDATE admins
      SET password = ?
      WHERE id = ?
      `,
      [hash, adminId],
    );

    console.log("UPDATE RESULT:", result);

    // 4. Kiểm tra lại DB ngay sau UPDATE
    const [check] = await db.query(
      `
      SELECT id, username, password
      FROM admins
      WHERE id = ?
      `,
      [adminId],
    );

    console.log("PASSWORD AFTER UPDATE:", check[0]?.password);

    // 5. Log
    await writeLog({
      admin_id: req.user?.id,
      action: "RESET_PASSWORD",
      target_type: "admins",
      target_id: adminId,
      description: `Reset password ${admin[0].full_name}`,
      ip_address: req.ip,
    });

    return res.json({
      success: true,
      message: "Đã đổi mật khẩu",
      affectedRows: result.affectedRows,
    });
  } catch (err) {
    console.error("❌ RESET PASSWORD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.resetCatechitsPassword = async (req, res) => {
  try {
    const { password } = req.body;

    // ID gửi từ frontend là ID của catechists
    const catechistId = Number(req.params.id);

    console.log("=================================");
    console.log("RESET PASSWORD");
    console.log("catechistId:", catechistId);
    console.log("password:", password);

    if (!Number.isInteger(catechistId) || catechistId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID giáo lý viên không hợp lệ",
      });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu tối thiểu 6 ký tự",
      });
    }

    // 1. Lấy catechist_code từ bảng catechists
    const [catechists] = await db.query(
      `
      SELECT
        id,
        catechist_code,
        full_name
      FROM catechists
      WHERE id = ?
      LIMIT 1
      `,
      [catechistId],
    );

    console.log("CATECHIST:", catechists);

    if (!catechists.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo lý viên",
      });
    }

    const catechist = catechists[0];

    // 2. Dùng catechist_code tìm tài khoản trong admins
    const [admins] = await db.query(
      `
      SELECT
        id,
        username,
        full_name,
        password
      FROM admins
      WHERE username = ?
      LIMIT 1
      `,
      [catechist.catechist_code],
    );

    console.log("ADMIN:", admins);

    if (!admins.length) {
      return res.status(404).json({
        success: false,
        message:
          `Không tìm thấy tài khoản đăng nhập ` +
          `cho mã ${catechist.catechist_code}`,
      });
    }

    const admin = admins[0];

    console.log("ADMIN ID:", admin.id);
    console.log("ADMIN USERNAME:", admin.username);

    // 3. Hash password mới
    const hash = await bcrypt.hash(String(password), 10);

    console.log("NEW HASH:", hash);

    // 4. Update đúng bảng admins
    const [result] = await db.query(
      `
      UPDATE admins
      SET password = ?
      WHERE id = ?
      `,
      [hash, admin.id],
    );

    console.log("UPDATE RESULT:", result);

    // 5. Kiểm tra lại
    const [check] = await db.query(
      `
      SELECT
        id,
        username,
        password
      FROM admins
      WHERE id = ?
      `,
      [admin.id],
    );

    console.log("PASSWORD AFTER UPDATE:", check[0]?.password);

    // 6. Ghi log
    await writeLog({
      admin_id: req.user?.id,
      action: "RESET_PASSWORD",
      target_type: "admins",
      target_id: admin.id,
      description: `Reset password ${admin.full_name} ` + `(${admin.username})`,
      ip_address: req.ip,
    });

    return res.json({
      success: true,
      message: "Đã đổi mật khẩu thành công",
      affectedRows: result.affectedRows,

      // trả về để debug, sau này có thể bỏ
      catechist_id: catechist.id,
      catechist_code: catechist.catechist_code,
      admin_id: admin.id,
    });
  } catch (err) {
    console.error("❌ RESET PASSWORD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
/* =========================================================
   DELETE ADMIN
========================================================= */
exports.deleteAdmin = async (req, res) => {
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // =====================================================
    // 1. LẤY ADMIN
    // =====================================================
    const [rows] = await connection.query("SELECT * FROM admins WHERE id = ?", [
      req.params.id,
    ]);

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Không tìm thấy tài khoản",
      });
    }

    const admin = rows[0];

    // =====================================================
    // 2. XÓA CATECHIST THEO catechist_code = username
    // =====================================================
    await connection.query("DELETE FROM catechists WHERE catechist_code = ?", [
      admin.username,
    ]);

    // =====================================================
    // 3. XÓA AVATAR
    // =====================================================
    if (admin.avatar) {
      const filePath = path.join(__dirname, "..", admin.avatar);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // =====================================================
    // 4. XÓA ADMIN
    // =====================================================
    await connection.query("DELETE FROM admins WHERE id = ?", [req.params.id]);

    // =====================================================
    // 5. GHI LOG
    // =====================================================
    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_ADMIN",
      target_type: "admins",
      target_id: req.params.id,
      description: `Xóa ${admin.full_name} (${admin.username})`,
      ip_address: req.ip,
    });

    await connection.commit();

    return res.json({
      success: true,
      message: "Đã xóa tài khoản và giáo lý viên liên kết",
    });
  } catch (err) {
    if (connection) {
      await connection.rollback();
    }

    console.error("DELETE ADMIN ERROR:", err);

    return res.status(500).json({
      message: err.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/* =========================================================
   TOGGLE ACTIVE
========================================================= */
exports.toggleActive = async (req, res) => {
  try {
    const adminId = Number(req.params.id);

    if (!Number.isInteger(adminId) || adminId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID tài khoản không hợp lệ",
      });
    }

    // Lấy admin
    const [rows] = await db.query(
      `
      SELECT
        id,
        username,
        full_name,
        role,
        church_id,
        is_active
      FROM admins
      WHERE id = ?
      LIMIT 1
      `,
      [adminId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    const admin = rows[0];

    // Đảo trạng thái admin
    const newStatus = admin.is_active ? 0 : 1;

    // Trạng thái tương ứng của catechist
    const catechistStatus = newStatus ? "active" : "inactive";

    console.log(`🔄 Admin ${adminId}: ${admin.is_active} -> ${newStatus}`);

    console.log(`👤 Catechist ${admin.username}: -> ${catechistStatus}`);

    // Update admins
    await db.query(
      `
      UPDATE admins
      SET is_active = ?
      WHERE id = ?
      `,
      [newStatus, adminId],
    );

    // Update catechists
    const [catechistResult] = await db.query(
      `
      UPDATE catechists
      SET status = ?
      WHERE catechist_code = ?
      `,
      [catechistStatus, admin.username],
    );

    // Ghi log
    await writeLog({
      admin_id: req.user?.id,
      action: "TOGGLE_ACTIVE",
      target_type: "admins",
      target_id: adminId,
      description: `${newStatus ? "Mở khóa" : "Khóa"} ${admin.full_name}`,
      ip_address: req.ip,
    });

    return res.json({
      success: true,
      message: newStatus ? "Đã mở khóa tài khoản" : "Đã khóa tài khoản",
      is_active: newStatus,
      catechist_status: catechistStatus,
      catechist_updated: catechistResult.affectedRows > 0,
    });
  } catch (err) {
    console.error("❌ TOGGLE ACTIVE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.toggleActiveCatechits = async (req, res) => {
  try {
    // ID frontend gửi lên là ID của catechists
    const catechistId = Number(req.params.id);

    if (!Number.isInteger(catechistId) || catechistId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID giáo lý viên không hợp lệ",
      });
    }

    console.log("=================================");
    console.log("TOGGLE ACTIVE");
    console.log("catechistId:", catechistId);

    // =====================================================
    // 1. LẤY GIÁO LÝ VIÊN
    // =====================================================

    const [catechists] = await db.query(
      `
      SELECT
        id,
        catechist_code,
        full_name,
        status
      FROM catechists
      WHERE id = ?
      LIMIT 1
      `,
      [catechistId],
    );

    console.log("CATECHIST:", catechists);

    if (!catechists.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo lý viên",
      });
    }

    const catechist = catechists[0];

    // =====================================================
    // 2. TÌM TÀI KHOẢN ADMINS BẰNG catechist_code
    // =====================================================

    const [admins] = await db.query(
      `
      SELECT
        id,
        username,
        full_name,
        role,
        church_id,
        is_active
      FROM admins
      WHERE username = ?
      LIMIT 1
      `,
      [catechist.catechist_code],
    );

    console.log("ADMIN:", admins);

    if (!admins.length) {
      return res.status(404).json({
        success: false,
        message:
          `Không tìm thấy tài khoản đăng nhập ` +
          `cho mã ${catechist.catechist_code}`,
      });
    }

    const admin = admins[0];

    console.log("ADMIN ID:", admin.id);
    console.log("ADMIN USERNAME:", admin.username);
    console.log("ADMIN CURRENT STATUS:", admin.is_active);

    // =====================================================
    // 3. ĐẢO TRẠNG THÁI
    // =====================================================

    const newStatus = admin.is_active ? 0 : 1;

    const catechistStatus = newStatus ? "active" : "inactive";

    console.log(`🔄 Admin ${admin.id}: ${admin.is_active} -> ${newStatus}`);

    console.log(
      `👤 Catechist ${catechist.id}: ${catechist.status} -> ${catechistStatus}`,
    );

    // =====================================================
    // 4. UPDATE ADMINS
    // =====================================================

    const [adminResult] = await db.query(
      `
      UPDATE admins
      SET is_active = ?
      WHERE id = ?
      `,
      [newStatus, admin.id],
    );

    console.log("ADMIN UPDATE:", adminResult);

    // =====================================================
    // 5. UPDATE CATECHISTS
    // =====================================================

    const [catechistResult] = await db.query(
      `
      UPDATE catechists
      SET status = ?
      WHERE id = ?
      `,
      [catechistStatus, catechistId],
    );

    console.log("CATECHIST UPDATE:", catechistResult);

    // =====================================================
    // 6. GHI LOG
    // =====================================================

    await writeLog({
      admin_id: req.user?.id,
      action: "TOGGLE_ACTIVE",
      target_type: "admins",
      target_id: admin.id,
      description:
        `${newStatus ? "Mở khóa" : "Khóa"} ${admin.full_name} ` +
        `(${admin.username})`,
      ip_address: req.ip,
    });

    // =====================================================
    // 7. RESPONSE
    // =====================================================

    return res.json({
      success: true,

      message: newStatus ? "Đã mở khóa tài khoản" : "Đã khóa tài khoản",

      // admins
      admin_id: admin.id,
      is_active: newStatus,

      // catechists
      catechist_id: catechist.id,
      catechist_code: catechist.catechist_code,
      catechist_status: catechistStatus,

      admin_updated: adminResult.affectedRows > 0,
      catechist_updated: catechistResult.affectedRows > 0,
    });
  } catch (err) {
    console.error("❌ TOGGLE ACTIVE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

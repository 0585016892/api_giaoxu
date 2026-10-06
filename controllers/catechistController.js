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

    console.log("");
    console.log("============================================================");
    console.log("                    GET ALL CATECHISTS");
    console.log("============================================================");

    console.log("👤 USER:", req.user);
    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      console.log("❌ CHURCH ID NOT FOUND");

      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        c.*,

        -- =====================================================
        -- THÔNG TIN TÀI KHOẢN ADMINS
        -- =====================================================

        a.id AS admin_id,
        a.username AS admin_username,
        a.avatar AS avatar,
        a.role AS role

      FROM catechists c

      LEFT JOIN admins a
        ON a.username = c.catechist_code
        AND a.church_id = c.church_id

      WHERE c.church_id = ?

      ORDER BY c.id DESC
      `,
      [churchId],
    );

    console.log("");
    console.log("📊 SỐ LƯỢNG GLV:", rows.length);

    console.log("");
    console.log("--------------- CATECHISTS ----------------");

    console.log(
      "👥 DATA:",
      rows.map((item) => ({
        catechist_id: item.id,
        admin_id: item.admin_id,
        catechist_code: item.catechist_code,
        admin_username: item.admin_username,
        full_name: item.full_name,
        role: item.role,
        church_id: item.church_id,
      })),
    );

    console.log("");
    console.log("============================================================");
    console.log("              ✅ GET ALL CATECHISTS SUCCESS");
    console.log("============================================================");
    console.log("");

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("");
    console.error(
      "============================================================",
    );
    console.error("              ❌ GET ALL CATECHISTS ERROR");
    console.error(
      "============================================================",
    );

    console.error(error);

    return res.status(500).json({
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

    // =========================================================
    // LẤY THÔNG TIN GIÁO LÝ VIÊN
    // =========================================================
    const [catechistRows] = await db.query(
      `
      SELECT
        c.*,
        a.avatar AS avatar

      FROM catechists c

      LEFT JOIN admins a
        ON a.username = c.catechist_code
        AND a.church_id = c.church_id

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

    // =========================================================
    // LẤY CÁC LỚP GIÁO LÝ VIÊN ĐANG DẠY
    // + LẤY PHÒNG TỪ class_schedules
    // =========================================================
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
        c.church_id,

        -- Thông tin lịch học đầu tiên
        schedule.day_of_week,
        schedule.start_time,
        schedule.end_time,
        schedule.room

      FROM catechist_classes cc

      INNER JOIN classes c
        ON c.id = cc.class_id
        AND c.church_id = ?

      LEFT JOIN (
        SELECT
          cs1.class_id,
          cs1.day_of_week,
          cs1.start_time,
          cs1.end_time,
          cs1.room

        FROM class_schedules cs1

        INNER JOIN (
          SELECT
            class_id,
            MIN(id) AS min_id
          FROM class_schedules
          GROUP BY class_id
        ) first_schedule
          ON first_schedule.class_id = cs1.class_id
          AND first_schedule.min_id = cs1.id
      ) schedule
        ON schedule.class_id = c.id

      WHERE cc.catechist_id = ?

      ORDER BY c.id DESC
      `,
      [churchId, id],
    );

    return res.status(200).json({
      success: true,
      data: {
        ...catechistRows[0],
        classes,
      },
    });
  } catch (error) {
    console.error("❌ GET CATECHIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * ================================
 * Lấy văn thư
 * ================================
 */
exports.getPendingAppointments = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // req.user.username = GLV20260001
    const username = req.user?.username;

    if (!username) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản Giáo lý viên",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        cc.id,
        cc.catechist_id,
        cc.class_id,
        cc.role,
        cc.status,
        cc.assigned_date,
        cc.notes,
        cc.appointment_read,

        cl.code AS class_code,
        cl.name AS class_name,

        c.catechist_code,
        c.full_name,
        c.holy_name,

        -- Avatar lấy từ bảng admins
        a.avatar AS avatar

      FROM catechist_classes cc

      INNER JOIN catechists c
        ON c.id = cc.catechist_id
       AND c.church_id = ?

      INNER JOIN classes cl
        ON cl.id = cc.class_id
       AND cl.church_id = ?

      LEFT JOIN admins a
        ON a.username = c.catechist_code
       AND a.church_id = ?

      WHERE c.catechist_code = ?
        AND cc.status = 'teaching'
        AND cc.appointment_read = 0

      ORDER BY
        cc.assigned_date DESC,
        cc.id DESC
      `,
      [churchId, churchId, churchId, username],
    );

    console.log("📨 PENDING APPOINTMENTS:", {
      username,
      churchId,
      count: rows.length,
      data: rows.map((item) => ({
        id: item.id,
        catechist_code: item.catechist_code,
        full_name: item.full_name,
        avatar: item.avatar,
      })),
    });

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("❌ GET PENDING APPOINTMENTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy thư bổ nhiệm",
      errorCode: error.code,
    });
  }
};
exports.readAppointment = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const { id } = req.params;

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    const username = req.user?.username;

    if (!username) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được tài khoản",
      });
    }

    const [result] = await db.query(
      `
      UPDATE catechist_classes cc

      INNER JOIN catechists c
        ON c.id = cc.catechist_id
       AND c.church_id = ?

      SET cc.appointment_read = 1

      WHERE cc.id = ?
        AND c.catechist_code = ?
      `,
      [churchId, id, username],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thư bổ nhiệm",
      });
    }

    console.log("📨 APPOINTMENT READ:", {
      assignmentId: id,
      username,
    });

    return res.status(200).json({
      success: true,
      message: "Đã nhận thư bổ nhiệm",
    });
  } catch (error) {
    console.error("❌ READ APPOINTMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật thư bổ nhiệm",
      errorCode: error.code,
    });
  }
};
// =========================================================
// CREATE CATECHIST
// =========================================================

exports.createCatechist = async (req, res) => {
  let connection;

  try {
    console.log("========== CREATE CATECHIST ==========");
    console.log("📥 req.body:", req.body);
    console.log("👤 req.user:", req.user);

    // =====================================================
    // 1. CHURCH ID
    // =====================================================

    const churchId = getChurchId(req);

    console.log("⛪ CHURCH ID:", churchId);

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // 2. GET BODY
    // =====================================================

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

      password,

      // ===================================================
      // PHÂN LỚP
      // ===================================================

      class_id,
      role,
      class_status,
      assigned_date,
      class_notes,
    } = req.body;

    // =====================================================
    // 3. VALIDATE FULL NAME
    // =====================================================

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập họ và tên Giáo lý viên",
      });
    }

    const cleanFullName = String(full_name).trim();

    // =====================================================
    // 4. VALIDATE EMAIL
    // =====================================================

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email để tạo tài khoản đăng nhập",
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // =====================================================
    // 5. VALIDATE CLASS ID NẾU CÓ
    // =====================================================

    let cleanClassId = null;

    if (
      class_id !== undefined &&
      class_id !== null &&
      String(class_id).trim() !== ""
    ) {
      cleanClassId = Number(class_id);

      if (!Number.isInteger(cleanClassId) || cleanClassId <= 0) {
        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ",
        });
      }
    }

    console.log("🏫 CLASS ID:", cleanClassId);

    // =====================================================
    // 6. PASSWORD
    // =====================================================

    const accountPassword =
      password && String(password).trim() ? String(password).trim() : "123456";

    // =====================================================
    // 7. HASH PASSWORD
    // =====================================================

    const hashedPassword = await bcrypt.hash(accountPassword, 10);

    // =====================================================
    // 8. CONNECTION
    // =====================================================

    connection = await db.getConnection();

    // =====================================================
    // 9. GENERATE BASE CODE
    // =====================================================

    const baseCatechistCode = await generateCatechistCode();

    console.log("🔢 Base catechist code:", baseCatechistCode);

    // =====================================================
    // 10. RETRY
    // =====================================================

    const MAX_RETRY = 5;

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        console.log(`🔄 CREATE ATTEMPT ${attempt}/${MAX_RETRY}`);

        // ===================================================
        // BEGIN TRANSACTION
        // ===================================================

        await connection.beginTransaction();

        // ===================================================
        // 11. CHECK EMAIL TRONG ADMINS
        // ===================================================

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

        // ===================================================
        // 12. TÌM CATECHIST CODE KHÔNG TRÙNG
        // ===================================================

        let catechistCode = baseCatechistCode;
        let codeIndex = 0;

        while (true) {
          const [existingCatechist] = await connection.query(
            `
            SELECT id
            FROM catechists
            WHERE catechist_code = ?
            LIMIT 1
            `,
            [catechistCode],
          );

          const [existingAdmin] = await connection.query(
            `
            SELECT id
            FROM admins
            WHERE username = ?
            LIMIT 1
            `,
            [catechistCode],
          );

          console.log(`🔍 Checking code "${catechistCode}"`, {
            catechistExists: existingCatechist.length > 0,
            adminExists: existingAdmin.length > 0,
          });

          if (existingCatechist.length === 0 && existingAdmin.length === 0) {
            break;
          }

          codeIndex++;

          catechistCode = `${baseCatechistCode}_${codeIndex}`;
        }

        console.log("✅ Final catechist code:", catechistCode);

        // ===================================================
        // 13. NẾU CÓ CLASS → KIỂM TRA LỚP
        // ===================================================

        let classInfo = null;

        if (cleanClassId) {
          const [classRows] = await connection.query(
            `
            SELECT
              id,
              church_id,
              code,
              name
            FROM classes
            WHERE id = ?
              AND church_id = ?
            LIMIT 1
            `,
            [cleanClassId, churchId],
          );

          if (classRows.length === 0) {
            await connection.rollback();

            return res.status(403).json({
              success: false,
              message: "Lớp học không thuộc giáo xứ hiện tại",
            });
          }

          classInfo = classRows[0];

          console.log("🏫 CLASS FOUND:", classInfo);
        }

        // ===================================================
        // 14. INSERT CATECHIST
        // ===================================================

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

          holy_name || null,
          cleanFullName,

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

        // ===================================================
        // 15. INSERT ADMIN ACCOUNT
        // ===================================================

        const username = catechistCode;

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
            ?, ?, ?, 'teacher', 'member', 1,
            ?, ?, ?, ?, ?, ?
          )
        `;

        const adminValues = [
          churchId,
          username,
          hashedPassword,

          cleanFullName,
          holy_name || null,
          date_of_birth || null,
          address || null,
          cleanEmail,
          phone || null,
        ];

        const [adminResult] = await connection.query(adminSql, adminValues);

        const adminId = adminResult.insertId;

        console.log("✅ Account created:", adminId);

        // ===================================================
        // 16. PHÂN LỚP NẾU CÓ
        //
        // appointment_read = 0
        //
        // => GLV đăng nhập sẽ thấy thư bổ nhiệm
        // ===================================================

        let assignment = null;

        if (cleanClassId) {
          const assignmentRole = role || "Giáo lý viên";
          const assignmentStatus = class_status || "teaching";
          const assignmentDate = assigned_date || new Date();
          const assignmentNotes = class_notes || null;

          console.log("📚 CREATE CLASS ASSIGNMENT:", {
            catechist_id: catechistId,
            class_id: cleanClassId,
            role: assignmentRole,
            status: assignmentStatus,
            assigned_date: assignmentDate,
            notes: assignmentNotes,
            appointment_read: 0,
          });

          await connection.query(
            `
            INSERT INTO catechist_classes (
              catechist_id,
              class_id,
              role,
              appointment_read,
              status,
              assigned_date,
              notes
            )
            VALUES (?, ?, ?, 0, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              role = VALUES(role),
              appointment_read = 0,
              status = VALUES(status),
              assigned_date = VALUES(assigned_date),
              notes = VALUES(notes)
            `,
            [
              catechistId,
              cleanClassId,
              assignmentRole,
              assignmentStatus,
              assignmentDate,
              assignmentNotes,
            ],
          );

          assignment = {
            class_id: cleanClassId,
            class_code: classInfo.code,
            class_name: classInfo.name,
            role: assignmentRole,
            status: assignmentStatus,
            assigned_date: assignmentDate,
            notes: assignmentNotes,
            appointment_read: 0,
          };

          console.log("✅ CLASS ASSIGNMENT CREATED");
        } else {
          console.log("ℹ️ Không phân lớp khi tạo GLV");
        }

        // ===================================================
        // 17. COMMIT
        // ===================================================

        await connection.commit();

        console.log("🎉 CREATE CATECHIST + ACCOUNT + CLASS SUCCESS");

        // ===================================================
        // 18. WRITE LOG
        // ===================================================

        try {
          await writeLog({
            admin_id: req.user?.id || null,

            action: "CREATE",

            target_type: "catechist",

            target_id: catechistId,

            description:
              `Thêm Giáo lý viên "${cleanFullName}" ` +
              `- mã ${catechistCode}, ` +
              `tạo tài khoản ${cleanEmail}, ` +
              `username ${username}` +
              (assignment ? `, phân lớp "${assignment.class_name}"` : ""),

            ip_address: req.ip,
          });
        } catch (logError) {
          console.error("⚠️ WRITE LOG ERROR:", logError.message);
        }

        // ===================================================
        // 19. RESPONSE
        // ===================================================

        return res.status(201).json({
          success: true,

          message: assignment
            ? "Thêm Giáo lý viên, tài khoản và phân lớp thành công"
            : "Thêm Giáo lý viên và tài khoản đăng nhập thành công",

          data: {
            catechist: {
              id: catechistId,
              church_id: churchId,
              catechist_code: catechistCode,
              full_name: cleanFullName,
            },

            account: {
              id: adminId,
              church_id: churchId,
              username,
              email: cleanEmail,
              role: "teacher",
              account_type: "member",
            },

            assignment,

            initial_password: accountPassword,
          },
        });
      } catch (error) {
        lastError = error;

        try {
          await connection.rollback();
        } catch (_) {}

        console.error(`❌ CREATE ATTEMPT ${attempt} ERROR`);

        console.error("Message:", error.message);
        console.error("Code:", error.code);
        console.error("SQL Message:", error.sqlMessage);

        // ===================================================
        // DUPLICATE
        // ===================================================

        if (error.code === "ER_DUP_ENTRY") {
          if (attempt < MAX_RETRY) {
            console.log("⚠️ Duplicate detected, retrying...");

            continue;
          }

          return res.status(409).json({
            success: false,
            message:
              "Dữ liệu vừa được tạo bởi một yêu cầu khác, vui lòng thử lại",
            errorCode: error.code,
          });
        }

        throw error;
      }
    }

    // =====================================================
    // RETRY HẾT
    // =====================================================

    console.error("❌ CREATE CATECHIST FAILED AFTER RETRIES");

    return res.status(500).json({
      success: false,
      message: "Không thể tạo Giáo lý viên và tài khoản",
      errorCode: lastError?.code,
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

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email, username hoặc mã Giáo lý viên đã tồn tại",
        errorCode: error.code,
      });
    }

    if (error.code === "ER_BAD_FIELD_ERROR") {
      return res.status(500).json({
        success: false,
        message: "Tên cột trong câu SQL không tồn tại",
        errorCode: error.code,
        error: error.message,
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
    // 1. CHECK CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // 2. BEGIN TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    // =====================================================
    // 3. LẤY GLV HIỆN TẠI
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
    // 4. CATECHIST CODE CỐ ĐỊNH
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
    // 5. COPY BODY
    // =====================================================

    const updateData = {
      ...req.body,
    };

    // =====================================================
    // 6. TÁCH CÁC FIELD KHÔNG THUỘC CATECHISTS
    // =====================================================

    const classIdFromBody = updateData.class_id;
    const assignmentRole = updateData.role || "Giáo lý viên";
    const assignmentStatus = updateData.class_status || "teaching";
    const assignmentDate = updateData.assigned_date || new Date();
    const assignmentNotes = updateData.class_notes || null;

    delete updateData.class_id;
    delete updateData.role;
    delete updateData.class_status;
    delete updateData.assigned_date;
    delete updateData.class_notes;

    // =====================================================
    // 7. PASSWORD
    // =====================================================

    const newPassword = updateData.password;

    delete updateData.password;
    delete updateData.password_confirm;

    // =====================================================
    // 8. KHÔNG CHO SỬA CATECHIST CODE
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
    // 9. KHÔNG CHO SỬA FIELD HỆ THỐNG
    // =====================================================

    delete updateData.id;
    delete updateData.church_id;
    delete updateData.created_at;
    delete updateData.updated_at;

    // =====================================================
    // 10. CHUẨN HÓA HỌ TÊN
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
    // 11. CHUẨN HÓA EMAIL
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

    const isEmailChanged = newCatechistEmail !== oldCatechistEmail;

    console.log("🔄 EMAIL CHANGED:", isEmailChanged);

    // =====================================================
    // 12. CHECK EMAIL ADMINS
    // =====================================================

    if (isEmailChanged && newCatechistEmail) {
      const [duplicateAdminEmailRows] = await connection.query(
        `
          SELECT
            id,
            username
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
    // 13. CHECK EMAIL CATECHISTS
    // =====================================================

    if (isEmailChanged && newCatechistEmail) {
      const [duplicateCatechistEmailRows] = await connection.query(
        `
          SELECT
            id,
            catechist_code
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
    // 14. UPDATE CATECHIST
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
    } else {
      console.log("ℹ️ Không có thông tin hồ sơ cần cập nhật");
    }

    // =====================================================
    // 15. ADMIN USERNAME CỐ ĐỊNH
    // =====================================================

    const adminUsername = oldCatechistCode;

    console.log("🔐 ADMIN USERNAME FIXED:", adminUsername);

    // =====================================================
    // 16. UPDATE EMAIL ADMIN
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
        console.warn("⚠️ Không tìm thấy admin tương ứng:", adminUsername);
      } else {
        console.log("✅ ADMIN EMAIL SYNC SUCCESS");
      }
    } else {
      console.log("ℹ️ Email không thay đổi");
    }

    // =====================================================
    // 17. UPDATE PASSWORD
    // =====================================================

    if (newPassword !== undefined && newPassword !== null) {
      const password = String(newPassword).trim();

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
          console.warn("⚠️ Không tìm thấy tài khoản admin:", adminUsername);
        } else {
          console.log("✅ PASSWORD UPDATED");
        }
      } else {
        console.log("ℹ️ Không nhập password mới → giữ password cũ");
      }
    }

    // =====================================================
    // 18. PHÂN LỚP
    //
    // CHỈ XỬ LÝ KHI FRONTEND GỬI class_id
    //
    // Nếu không gửi class_id:
    // => KHÔNG đụng vào phân lớp hiện tại.
    // =====================================================

    let assignment = null;

    const hasClassId =
      classIdFromBody !== undefined &&
      classIdFromBody !== null &&
      String(classIdFromBody).trim() !== "";

    if (hasClassId) {
      const cleanClassId = Number(classIdFromBody);

      if (!Number.isInteger(cleanClassId) || cleanClassId <= 0) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "class_id không hợp lệ",
        });
      }

      console.log("🏫 UPDATE CLASS ID:", cleanClassId);

      // ===================================================
      // 18.1 CHECK CLASS
      // ===================================================

      const [classRows] = await connection.query(
        `
          SELECT
            id,
            church_id,
            code,
            name
          FROM classes
          WHERE id = ?
            AND church_id = ?
          LIMIT 1
          `,
        [cleanClassId, churchId],
      );

      if (classRows.length === 0) {
        await connection.rollback();

        return res.status(403).json({
          success: false,
          message: "Lớp học không thuộc giáo xứ hiện tại",
        });
      }

      const classInfo = classRows[0];

      // ===================================================
      // 18.2 KIỂM TRA PHÂN LỚP CŨ
      // ===================================================

      const [oldAssignmentRows] = await connection.query(
        `
          SELECT
            id,
            class_id,
            role,
            status,
            assigned_date,
            notes,
            appointment_read
          FROM catechist_classes
          WHERE catechist_id = ?
            AND class_id = ?
          LIMIT 1
          `,
        [id, cleanClassId],
      );

      const isExistingAssignment = oldAssignmentRows.length > 0;

      // ===================================================
      // 18.3 UPSERT PHÂN LỚP
      // ===================================================

      await connection.query(
        `
        INSERT INTO catechist_classes (
          catechist_id,
          class_id,
          role,
          appointment_read,
          status,
          assigned_date,
          notes
        )
        VALUES (?, ?, ?, 0, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          role = VALUES(role),
          status = VALUES(status),
          assigned_date = VALUES(assigned_date),
          notes = VALUES(notes),
          appointment_read =
            CASE
              WHEN
                catechist_classes.role <> VALUES(role)
                OR catechist_classes.status <> VALUES(status)
                OR COALESCE(catechist_classes.notes, '') <>
                   COALESCE(VALUES(notes), '')
              THEN 0
              ELSE catechist_classes.appointment_read
            END
        `,
        [
          id,
          cleanClassId,
          assignmentRole,
          assignmentStatus,
          assignmentDate,
          assignmentNotes,
        ],
      );

      // ===================================================
      // 18.4 LẤY LẠI ASSIGNMENT
      // ===================================================

      const [assignmentRows] = await connection.query(
        `
          SELECT
            cc.id,
            cc.catechist_id,
            cc.class_id,
            cc.role,
            cc.status,
            cc.assigned_date,
            cc.notes,
            cc.appointment_read,

            cl.code AS class_code,
            cl.name AS class_name

          FROM catechist_classes cc

          INNER JOIN classes cl
            ON cl.id = cc.class_id
           AND cl.church_id = ?

          WHERE cc.catechist_id = ?
            AND cc.class_id = ?

          LIMIT 1
          `,
        [churchId, id, cleanClassId],
      );

      if (assignmentRows.length > 0) {
        assignment = assignmentRows[0];
      }

      console.log(
        isExistingAssignment
          ? "🔄 CLASS ASSIGNMENT UPDATED"
          : "🆕 CLASS ASSIGNMENT CREATED",
      );

      console.log("📚 ASSIGNMENT:", assignment);
    } else {
      console.log("ℹ️ Không gửi class_id → giữ nguyên phân lớp");
    }

    // =====================================================
    // 19. COMMIT
    // =====================================================

    await connection.commit();

    console.log("✅ UPDATE TRANSACTION COMMITTED");

    // =====================================================
    // 20. WRITE LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id || null,

        action: "UPDATE",

        target_type: "catechist",

        target_id: id,

        description:
          `Cập nhật Giáo lý viên "${oldCatechist.full_name}" ` +
          `(${oldCatechistCode || "N/A"})` +
          (assignment ? `, phân lớp "${assignment.class_name}"` : ""),

        ip_address: req.ip,
      });
    } catch (logError) {
      console.error("⚠️ WRITE LOG ERROR:", logError);
    }

    // =====================================================
    // 21. RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      message: assignment
        ? "Cập nhật Giáo lý viên và phân lớp thành công"
        : "Cập nhật Giáo lý viên thành công",

      data: {
        id: Number(id),

        catechist_code: oldCatechistCode,

        email: newCatechistEmail,

        admin_synced: true,

        username_synced: false,

        email_synced: isEmailChanged,

        assignment,
      },
    });
  } catch (error) {
    console.error("❌ UPDATE CATECHIST ERROR:", error);

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
        errorCode: error.code,
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
    // FOREIGN KEY
    // =====================================================

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu phân lớp không hợp lệ",
        errorCode: error.code,
      });
    }

    // =====================================================
    // RESPONSE ERROR
    // =====================================================

    return res.status(500).json({
      success: false,

      message: "Không thể cập nhật Giáo lý viên",

      errorCode: error.code,

      error: error.message,
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
    console.log("📥 BODY:", req.body);

    // =====================================================
    // 1. CHECK CHURCH
    // =====================================================

    if (!churchId) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa được gán giáo xứ",
      });
    }

    // =====================================================
    // 2. VALIDATE
    // =====================================================

    if (!catechist_id || !class_id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu catechist_id hoặc class_id",
      });
    }

    // =====================================================
    // 3. KIỂM TRA GIÁO LÝ VIÊN
    // =====================================================

    const [catechists] = await db.query(
      `
      SELECT
        id,
        church_id,
        catechist_code,
        full_name
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

    const catechist = catechists[0];

    console.log("👤 CATECHIST:", {
      id: catechist.id,
      code: catechist.catechist_code,
      name: catechist.full_name,
    });

    // =====================================================
    // 4. KIỂM TRA LỚP
    // =====================================================

    const [classes] = await db.query(
      `
      SELECT
        id,
        church_id,
        code,
        name
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

    const classInfo = classes[0];

    console.log("🏫 CLASS:", {
      id: classInfo.id,
      code: classInfo.code,
      name: classInfo.name,
    });

    // =====================================================
    // 5. PHÂN LỚP
    //
    // appointment_read = 0
    //
    // => Giáo viên sẽ thấy thư bổ nhiệm khi mở hệ thống.
    //
    // Nếu record đã tồn tại:
    // => cập nhật lại và RESET appointment_read = 0
    //
    // =====================================================

    const sql = `
      INSERT INTO catechist_classes (
        catechist_id,
        class_id,
        role,
        appointment_read,
        status,
        assigned_date,
        notes
      )
      VALUES (?, ?, ?, 0, ?, ?, ?)

      ON DUPLICATE KEY UPDATE
        role = VALUES(role),
        appointment_read = 0,
        status = VALUES(status),
        assigned_date = VALUES(assigned_date),
        notes = VALUES(notes)
    `;

    const [result] = await db.query(sql, [
      catechist_id,
      class_id,
      role || "Giáo lý viên",
      status || "teaching",
      assigned_date || new Date(),
      notes || null,
    ]);

    console.log("📊 ASSIGN RESULT:", result);

    console.log("✅ PHÂN LỚP THÀNH CÔNG");
    console.log("📨 appointment_read = 0");

    // =====================================================
    // 6. RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      message: "Phân lớp thành công",

      data: {
        catechist_id: Number(catechist_id),
        catechist_name: catechist.full_name,

        class_id: Number(class_id),
        class_code: classInfo.code,
        class_name: classInfo.name,

        role: role || "Giáo lý viên",

        // 0 = chưa đọc thư bổ nhiệm
        appointment_read: 0,
      },
    });
  } catch (error) {
    console.error("❌ ASSIGN CLASS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể phân lớp",
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
  let connection;

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

    connection = await db.getConnection();
    await connection.beginTransaction();

    /**
     * =====================================================
     * 1. LẤY THÔNG TIN GLV
     *
     * catechists.catechist_code = admins.username
     * =====================================================
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
     * 2. XÓA PHÂN CÔNG LỚP
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
     * 3. XÓA TÀI KHOẢN ADMIN
     *
     * catechists.catechist_code = admins.username
     *
     * Có thêm church_id để không xóa nhầm
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
     * 4. XÓA GIÁO LÝ VIÊN
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

    if (catechistResult.affectedRows === 0) {
      throw new Error("Không thể xóa Giáo lý viên");
    }

    /**
     * =====================================================
     * 5. COMMIT
     * =====================================================
     */
    await connection.commit();

    console.log("✅ Đã xóa GLV + tài khoản đăng nhập thành công");

    /**
     * =====================================================
     * 6. GHI LOG
     * =====================================================
     */
    await writeLog({
      admin_id: req.user?.id || null,
      action: "DELETE",
      target_type: "catechist",
      target_id: id,
      description:
        `Xóa Giáo lý viên "${catechist.full_name}" ` +
        `(mã ${catechist.catechist_code}, ` +
        `email ${catechist.email || "không có"}) ` +
        `và tài khoản đăng nhập tương ứng`,
      ip_address: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: "Xóa Giáo lý viên và tài khoản đăng nhập thành công",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("ROLLBACK ERROR:", rollbackError);
      }
    }

    console.error("❌ DELETE CATECHIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
      errorCode: error.code,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.removeClass = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    const { catechist_id, class_id } = req.body;

    console.log("========================================");
    console.log("REMOVE CATECHIST FROM CLASS");
    console.log("CATECHIST ID:", catechist_id);
    console.log("CLASS ID:", class_id);
    console.log("CHURCH ID:", churchId);
    console.log("========================================");

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

    // =====================================================
    // KIỂM TRA GLV THUỘC GIÁO XỨ
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
    // KIỂM TRA PHÂN CÔNG
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

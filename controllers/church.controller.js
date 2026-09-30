const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");
const fs = require("fs");
const path = require("path");

// ======================================================
// HELPER: XÓA FILE ẢNH VẬT LÝ
// ======================================================

const deletePhysicalFile = (imagePath) => {
  if (!imagePath) return;

  try {
    const relativePath = imagePath.startsWith("/")
      ? imagePath.slice(1)
      : imagePath;

    const fullPath = path.join(__dirname, "../", relativePath);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log("Đã xóa file ảnh cũ:", fullPath);
    }
  } catch (err) {
    console.error("Lỗi xóa file ảnh vật lý:", err.message);
  }
};

// ======================================================
// 1. GET ALL
// SEARCH + FILTER + PAGINATION + SỐ LƯỢNG GIÁO DÂN
// ======================================================

// ======================================================
// HELPER
// ======================================================

const parseNullableId = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "null" ||
    value === "undefined"
  ) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const validateDioceseAndDeanery = async ({ dioceseId, deaneryId }) => {
  // =====================================================
  // KHÔNG CÓ CẢ HAI
  // =====================================================

  if (!dioceseId && !deaneryId) {
    return {
      valid: true,
      diocese: null,
      deanery: null,
    };
  }

  // =====================================================
  // CÓ GIÁO HẠT THÌ BẮT BUỘC PHẢI CÓ GIÁO PHẬN
  // =====================================================

  if (deaneryId && !dioceseId) {
    return {
      valid: false,
      message: "Đã chọn Giáo hạt thì bắt buộc phải chọn Giáo phận",
    };
  }

  let diocese = null;
  let deanery = null;

  // =====================================================
  // CHECK GIÁO PHẬN
  // =====================================================

  if (dioceseId) {
    const [rows] = await db.query(
      `
        SELECT
          id,
          code,
          name,
          type,
          parent_diocese_id,
          is_active

        FROM dioceses

        WHERE id = ?

        LIMIT 1
      `,
      [dioceseId],
    );

    if (!rows.length) {
      return {
        valid: false,
        message: "Giáo phận không tồn tại",
      };
    }

    diocese = rows[0];

    // Phải là Giáo phận, không phải Tổng Giáo phận
    if (diocese.type !== "GIAO_PHAN") {
      return {
        valid: false,
        message: "Giáo xứ chỉ có thể thuộc một Giáo phận",
      };
    }

    if (Number(diocese.is_active) !== 1) {
      return {
        valid: false,
        message: "Giáo phận đang bị khóa",
      };
    }
  }

  // =====================================================
  // CHECK GIÁO HẠT
  // =====================================================

  if (deaneryId) {
    const [rows] = await db.query(
      `
        SELECT
          id,
          diocese_id,
          code,
          name,
          address,
          phone,
          is_active

        FROM deaneries

        WHERE id = ?

        LIMIT 1
      `,
      [deaneryId],
    );

    if (!rows.length) {
      return {
        valid: false,
        message: "Giáo hạt không tồn tại",
      };
    }

    deanery = rows[0];

    if (Number(deanery.is_active) !== 1) {
      return {
        valid: false,
        message: "Giáo hạt đang bị khóa",
      };
    }

    // ===================================================
    // GIÁO HẠT PHẢI THUỘC GIÁO PHẬN ĐÃ CHỌN
    // ===================================================

    if (Number(deanery.diocese_id) !== Number(dioceseId)) {
      return {
        valid: false,
        message: "Giáo hạt không thuộc Giáo phận đã chọn",
      };
    }
  }

  return {
    valid: true,
    diocese,
    deanery,
  };
};

// ======================================================
// 1. GET ALL
// DANH SÁCH GIÁO XỨ
// ======================================================

exports.getAll = async (req, res) => {
  try {
    // =====================================================
    // QUERY PARAMS
    // =====================================================

    let {
      page = 1,
      limit = 10,
      search = "",
      type,
      district,
      ward,
      is_active,

      // NEW
      diocese_id,
      deanery_id,
    } = req.query;

    // =====================================================
    // PAGINATION
    // =====================================================

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (Number.isNaN(page) || page < 1) {
      page = 1;
    }

    if (Number.isNaN(limit) || limit < 1) {
      limit = 10;
    }

    const offset = (page - 1) * limit;

    // =====================================================
    // NORMALIZE IDS
    // =====================================================

    const dioceseId = parseNullableId(diocese_id);
    const deaneryId = parseNullableId(deanery_id);

    // =====================================================
    // WHERE
    // =====================================================

    let where = "WHERE 1=1";

    const params = [];

    // =====================================================
    // SEARCH
    // =====================================================

    if (search && search.trim() !== "") {
      const searchValue = `%${search.trim()}%`;

      where += `
        AND (
          c.name LIKE ?
          OR c.code LIKE ?
          OR c.pastor_name LIKE ?
          OR c.address LIKE ?
          OR d.name LIKE ?
          OR d.code LIKE ?
          OR de.name LIKE ?
          OR de.code LIKE ?
        )
      `;

      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
      );
    }

    // =====================================================
    // TYPE
    // =====================================================

    if (type && type.trim() !== "") {
      where += `
        AND c.type = ?
      `;

      params.push(type.trim());
    }

    // =====================================================
    // DISTRICT
    // =====================================================

    if (district && district.trim() !== "") {
      where += `
        AND c.district = ?
      `;

      params.push(district.trim());
    }

    // =====================================================
    // WARD
    // =====================================================

    if (ward && ward.trim() !== "") {
      where += `
        AND c.ward = ?
      `;

      params.push(ward.trim());
    }

    // =====================================================
    // ACTIVE
    // =====================================================

    if (is_active !== undefined && is_active !== null && is_active !== "") {
      where += `
        AND c.is_active = ?
      `;

      params.push(is_active);
    }

    // =====================================================
    // DIOCESE
    // =====================================================

    if (dioceseId) {
      where += `
        AND c.diocese_id = ?
      `;

      params.push(dioceseId);
    }

    // =====================================================
    // DEANERY
    // =====================================================

    if (deaneryId) {
      where += `
        AND c.deanery_id = ?
      `;

      params.push(deaneryId);
    }

    // =====================================================
    // DEBUG
    // =====================================================

    console.log("====================================");
    console.log("GET ALL CHURCHES");
    console.log("QUERY:", req.query);
    console.log("SEARCH:", search);
    console.log("TYPE:", type);
    console.log("DIOCESE ID:", dioceseId);
    console.log("DEANERY ID:", deaneryId);
    console.log("WHERE:", where);
    console.log("PARAMS:", params);
    console.log("PAGE:", page);
    console.log("LIMIT:", limit);
    console.log("OFFSET:", offset);
    console.log("====================================");

    // =====================================================
    // COUNT
    // =====================================================

    const countSql = `
      SELECT COUNT(*) AS total
      FROM churches c

      LEFT JOIN dioceses d
        ON d.id = c.diocese_id

      LEFT JOIN deaneries de
        ON de.id = c.deanery_id

      ${where}
    `;

    const [[countResult]] = await db.query(countSql, params);

    const total = Number(countResult?.total || 0);

    // =====================================================
    // GET DATA
    // =====================================================

    const dataSql = `
      SELECT
        c.*,

        -- =================================================
        -- DIOCESE
        -- =================================================

        d.id AS diocese_ref_id,
        d.code AS diocese_code,
        d.name AS diocese_name,
        d.type AS diocese_type,
        d.parent_diocese_id AS diocese_parent_id,

        -- =================================================
        -- DEANERY
        -- =================================================

        de.id AS deanery_ref_id,
        de.code AS deanery_code,
        de.name AS deanery_name,
        de.diocese_id AS deanery_diocese_id,

        -- =================================================
        -- PARISHIONERS
        -- =================================================

        COUNT(DISTINCT p.id) AS total_parishioners

      FROM churches c

      LEFT JOIN dioceses d
        ON d.id = c.diocese_id

      LEFT JOIN deaneries de
        ON de.id = c.deanery_id

      LEFT JOIN parishioners p
        ON p.churches_id = c.id

      ${where}

      GROUP BY c.id

      ORDER BY c.created_at DESC

      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, limit, offset];

    const [rows] = await db.query(dataSql, dataParams);

    // =====================================================
    // PROCESS LICENSE
    // =====================================================

    const now = new Date();

    const processedRows = await Promise.all(
      rows.map(async (church) => {
        let licenseStatus = church.license_status || "trial";

        let isExpired = false;

        let daysRemaining = null;

        // =================================================
        // ACTIVE
        // =================================================

        if (licenseStatus === "active") {
          isExpired = false;
          daysRemaining = null;
        }

        // =================================================
        // TRIAL
        // =================================================
        else if (licenseStatus === "trial") {
          if (church.trial_expires_at) {
            const expiresAt = new Date(church.trial_expires_at);

            if (expiresAt <= now) {
              await db.query(
                `
                UPDATE churches
                SET license_status = 'expired'
                WHERE id = ?
                  AND license_status = 'trial'
                `,
                [church.id],
              );

              licenseStatus = "expired";

              isExpired = true;

              daysRemaining = 0;
            } else {
              const diffMs = expiresAt.getTime() - now.getTime();

              daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

              isExpired = false;
            }
          } else {
            await db.query(
              `
              UPDATE churches
              SET license_status = 'expired'
              WHERE id = ?
                AND license_status = 'trial'
              `,
              [church.id],
            );

            licenseStatus = "expired";

            isExpired = true;

            daysRemaining = 0;
          }
        }

        // =================================================
        // EXPIRED
        // =================================================
        else if (licenseStatus === "expired") {
          isExpired = true;
          daysRemaining = 0;
        }

        // =================================================
        // RESPONSE OBJECT
        // =================================================

        return {
          ...church,

          // =================================================
          // DIOCESE
          // =================================================

          diocese_id:
            church.diocese_ref_id !== null
              ? Number(church.diocese_ref_id)
              : null,

          diocese: church.diocese_ref_id
            ? {
                id: Number(church.diocese_ref_id),
                code: church.diocese_code,
                name: church.diocese_name,
                type: church.diocese_type,
                parent_diocese_id:
                  church.diocese_parent_id !== null
                    ? Number(church.diocese_parent_id)
                    : null,
              }
            : null,

          // =================================================
          // DEANERY
          // =================================================

          deanery_id:
            church.deanery_ref_id !== null
              ? Number(church.deanery_ref_id)
              : null,

          deanery: church.deanery_ref_id
            ? {
                id: Number(church.deanery_ref_id),
                code: church.deanery_code,
                name: church.deanery_name,
                diocese_id:
                  church.deanery_diocese_id !== null
                    ? Number(church.deanery_diocese_id)
                    : null,
              }
            : null,

          // =================================================
          // STATISTICS
          // =================================================

          total_parishioners: Number(church.total_parishioners || 0),

          // =================================================
          // LICENSE
          // =================================================

          license_status: licenseStatus,

          trial_started_at: church.trial_started_at || null,

          trial_expires_at: church.trial_expires_at || null,

          activated_at: church.activated_at || null,

          days_remaining: daysRemaining,

          is_expired: isExpired,

          is_trial: licenseStatus === "trial",

          is_active_license: licenseStatus === "active",
        };
      }),
    );

    // =====================================================
    // PAGINATION
    // =====================================================

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      data: processedRows,

      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    console.error("====================================");

    console.error("GET ALL CHURCHES ERROR:", err);

    console.error("====================================");

    return res.status(500).json({
      success: false,
      message: err.message || "Không thể lấy danh sách giáo xứ",
    });
  }
};

// ======================================================
// 2. GET BY ID
// CHI TIẾT + DIOCESE + DEANERY + LICENSE
// ======================================================

exports.getById = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    if (!Number.isInteger(churchId) || churchId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    console.log("==========================================");
    console.log("🏛️ GET CHURCH BY ID");
    console.log("Church ID:", churchId);
    console.log("==========================================");

    // =====================================================
    // QUERY
    // =====================================================

    const sql = `
      SELECT
        -- =================================================
        -- CHURCH
        -- =================================================

        c.id,
        c.name,
        c.type,
        c.code,

        c.diocese_id,
        c.deanery_id,

        c.address,
        c.ward,
        c.district,

        c.phone,
        c.email,
        c.pastor_name,

        c.latitude,
        c.longitude,

        c.description,
        c.image,

        c.is_active,

        -- =================================================
        -- LICENSE
        -- =================================================

        c.license_status,
        c.trial_started_at,
        c.trial_expires_at,
        c.activated_at,

        -- =================================================
        -- SYSTEM
        -- =================================================

        c.created_at,
        c.updated_at,

        -- =================================================
        -- DIOCESE
        -- =================================================

        d.id AS diocese_ref_id,
        d.code AS diocese_code,
        d.name AS diocese_name,
        d.type AS diocese_type,
        d.parent_diocese_id AS diocese_parent_id,

        -- =================================================
        -- ARCHDIOCESE
        -- =================================================

        parent.id AS archdiocese_ref_id,
        parent.code AS archdiocese_code,
        parent.name AS archdiocese_name,
        parent.type AS archdiocese_type,

        -- =================================================
        -- DEANERY
        -- =================================================

        de.id AS deanery_ref_id,
        de.code AS deanery_code,
        de.name AS deanery_name,
        de.diocese_id AS deanery_diocese_id,
        de.address AS deanery_address,
        de.phone AS deanery_phone,
        de.is_active AS deanery_is_active,

        -- =================================================
        -- PARISHIONERS
        -- =================================================

        COUNT(DISTINCT p.id) AS total_parishioners,

        COALESCE(
          SUM(
            CASE
              WHEN p.gender IN ('NAM', 'MALE')
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS total_male,

        COALESCE(
          SUM(
            CASE
              WHEN p.gender IN ('NỮ', 'FEMALE')
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS total_female

      FROM churches c

      LEFT JOIN dioceses d
        ON d.id = c.diocese_id

      LEFT JOIN dioceses parent
        ON parent.id = d.parent_diocese_id

      LEFT JOIN deaneries de
        ON de.id = c.deanery_id

      LEFT JOIN parishioners p
        ON p.churches_id = c.id

      WHERE c.id = ?

      GROUP BY
        c.id,
        c.name,
        c.type,
        c.code,

        c.diocese_id,
        c.deanery_id,

        c.address,
        c.ward,
        c.district,

        c.phone,
        c.email,
        c.pastor_name,

        c.latitude,
        c.longitude,

        c.description,
        c.image,

        c.is_active,

        c.license_status,
        c.trial_started_at,
        c.trial_expires_at,
        c.activated_at,

        c.created_at,
        c.updated_at,

        d.id,
        d.code,
        d.name,
        d.type,
        d.parent_diocese_id,

        parent.id,
        parent.code,
        parent.name,
        parent.type,

        de.id,
        de.code,
        de.name,
        de.diocese_id,
        de.address,
        de.phone,
        de.is_active
    `;

    const [rows] = await db.query(sql, [churchId]);

    if (!rows.length) {
      console.log("❌ Không tìm thấy giáo xứ:", churchId);

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    const church = rows[0];

    // =====================================================
    // DEBUG DATABASE RESULT
    // =====================================================

    console.log("----------- DATABASE RESULT -----------");

    console.log("Church:", {
      id: church.id,
      name: church.name,
      code: church.code,
      diocese_id: church.diocese_id,
      deanery_id: church.deanery_id,
    });

    console.log("Diocese:", {
      id: church.diocese_ref_id,
      code: church.diocese_code,
      name: church.diocese_name,
      type: church.diocese_type,
      parent_id: church.diocese_parent_id,
    });

    console.log("Deanery:", {
      id: church.deanery_ref_id,
      code: church.deanery_code,
      name: church.deanery_name,
      diocese_id: church.deanery_diocese_id,
    });

    console.log("---------------------------------------");

    // =====================================================
    // LICENSE
    // =====================================================

    let licenseStatus = church.license_status || "trial";

    let daysRemaining = null;

    let isExpired = false;

    const now = new Date();

    // =====================================================
    // ACTIVE
    // =====================================================

    if (licenseStatus === "active") {
      daysRemaining = null;
      isExpired = false;
    }

    // =====================================================
    // TRIAL
    // =====================================================
    else if (licenseStatus === "trial") {
      if (!church.trial_expires_at) {
        daysRemaining = null;
        isExpired = false;
      } else {
        const expiresAt = new Date(church.trial_expires_at);

        if (expiresAt <= now) {
          await db.query(
            `
              UPDATE churches
              SET license_status = 'expired'
              WHERE id = ?
                AND license_status = 'trial'
            `,
            [churchId],
          );

          licenseStatus = "expired";
          daysRemaining = 0;
          isExpired = true;
        } else {
          const diffMs = expiresAt.getTime() - now.getTime();

          daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          isExpired = false;
        }
      }
    }

    // =====================================================
    // EXPIRED
    // =====================================================
    else if (licenseStatus === "expired") {
      daysRemaining = 0;
      isExpired = true;
    }

    // =====================================================
    // BUILD DIOCESE OBJECT
    // =====================================================

    const diocese =
      church.diocese_ref_id !== null
        ? {
            id: Number(church.diocese_ref_id),
            code: church.diocese_code,
            name: church.diocese_name,
            type: church.diocese_type,
            parent_diocese_id:
              church.diocese_parent_id !== null
                ? Number(church.diocese_parent_id)
                : null,
          }
        : null;

    // =====================================================
    // BUILD ARCHDIOCESE OBJECT
    // =====================================================

    const archdiocese =
      church.archdiocese_ref_id !== null
        ? {
            id: Number(church.archdiocese_ref_id),
            code: church.archdiocese_code,
            name: church.archdiocese_name,
            type: church.archdiocese_type,
          }
        : null;

    // =====================================================
    // BUILD DEANERY OBJECT
    // =====================================================

    const deanery =
      church.deanery_ref_id !== null
        ? {
            id: Number(church.deanery_ref_id),
            code: church.deanery_code,
            name: church.deanery_name,

            diocese_id:
              church.deanery_diocese_id !== null
                ? Number(church.deanery_diocese_id)
                : null,

            address: church.deanery_address,
            phone: church.deanery_phone,

            is_active: Number(church.deanery_is_active) === 1,
          }
        : null;

    // =====================================================
    // RESPONSE OBJECT
    // =====================================================

    const responseChurch = {
      // ===================================================
      // BASIC
      // ===================================================

      id: Number(church.id),

      name: church.name,

      type: church.type,

      code: church.code,

      // ===================================================
      // ARCHDIOCESE
      // ===================================================

      archdiocese_id: archdiocese?.id ?? null,

      archdiocese,

      // ===================================================
      // DIOCESE
      // ===================================================

      diocese_id: church.diocese_id !== null ? Number(church.diocese_id) : null,

      diocese,

      // ===================================================
      // DEANERY
      // ===================================================

      deanery_id: church.deanery_id !== null ? Number(church.deanery_id) : null,

      deanery,

      // ===================================================
      // ADDRESS
      // ===================================================

      address: church.address,

      ward: church.ward,

      district: church.district,

      // ===================================================
      // CONTACT
      // ===================================================

      phone: church.phone,

      email: church.email,

      pastor_name: church.pastor_name,

      // ===================================================
      // MAP
      // ===================================================

      latitude: church.latitude !== null ? Number(church.latitude) : null,

      longitude: church.longitude !== null ? Number(church.longitude) : null,

      // ===================================================
      // OTHER
      // ===================================================

      description: church.description,

      image: church.image,

      is_active: Number(church.is_active) === 1,

      // ===================================================
      // LICENSE
      // ===================================================

      license_status: licenseStatus,

      trial_started_at: church.trial_started_at || null,

      trial_expires_at: church.trial_expires_at || null,

      activated_at: church.activated_at || null,

      days_remaining: daysRemaining,

      is_expired: isExpired,

      is_trial: licenseStatus === "trial",

      is_active_license: licenseStatus === "active",

      // ===================================================
      // STATISTICS
      // ===================================================

      total_parishioners: Number(church.total_parishioners || 0),

      total_male: Number(church.total_male || 0),

      total_female: Number(church.total_female || 0),

      // ===================================================
      // SYSTEM
      // ===================================================

      created_at: church.created_at,

      updated_at: church.updated_at,
    };

    // =====================================================
    // FINAL DEBUG
    // =====================================================

    console.log("----------- FINAL RESPONSE -----------");

    console.log("Diocese:", JSON.stringify(diocese, null, 2));

    console.log("Deanery:", JSON.stringify(deanery, null, 2));

    console.log("Church:", JSON.stringify(responseChurch, null, 2));

    console.log("--------------------------------------");

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      church: responseChurch,
    });
  } catch (err) {
    console.error("==========================================");
    console.error("❌ GET CHURCH BY ID ERROR");
    console.error("Message:", err.message);
    console.error("Code:", err.code);
    console.error("SQL State:", err.sqlState);
    console.error("SQL Message:", err.sqlMessage);
    console.error("Stack:", err.stack);
    console.error("==========================================");

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin giáo xứ",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
// ======================================================
// 3. CREATE
// ======================================================

exports.create = async (req, res) => {
  try {
    console.log("===== CREATE CHURCH REQUEST =====");

    console.log("BODY:", req.body);

    console.log("FILE:", req.file);

    const {
      name,

      type = "GIAO_HO",

      // NEW
      diocese_id,
      deanery_id,

      address,

      is_active = 1,

      phone,

      email,

      pastor_name,

      district,

      ward,

      latitude,

      longitude,

      description,

      code,
    } = req.body;

    // =====================================================
    // NAME
    // =====================================================

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên giáo xứ/giáo họ không được để trống!",
      });
    }

    // =====================================================
    // NORMALIZE RELATIONS
    // =====================================================

    const dioceseId = parseNullableId(diocese_id);

    const deaneryId = parseNullableId(deanery_id);

    // =====================================================
    // VALIDATE DIOCESE / DEANERY
    // =====================================================

    const relationCheck = await validateDioceseAndDeanery({
      dioceseId,
      deaneryId,
    });

    if (!relationCheck.valid) {
      return res.status(400).json({
        success: false,
        message: relationCheck.message,
      });
    }

    // =====================================================
    // IMAGE
    // =====================================================

    let imagePath = null;

    if (req.file) {
      imagePath = `uploads/church/${req.file.filename}`;
    } else if (req.body.image && typeof req.body.image === "string") {
      imagePath = req.body.image;
    }

    // =====================================================
    // LAT / LNG
    // =====================================================

    const parsedLat =
      latitude && !isNaN(parseFloat(latitude)) ? parseFloat(latitude) : null;

    const parsedLng =
      longitude && !isNaN(parseFloat(longitude)) ? parseFloat(longitude) : null;

    // =====================================================
    // ACTIVE
    // =====================================================

    const parsedIsActive = Number(is_active) === 1 ? 1 : 0;

    // =====================================================
    // VALUES
    // =====================================================

    const values = [
      name.trim(),

      type || "GIAO_HO",

      // NEW
      dioceseId,

      deaneryId,

      address || null,

      parsedIsActive,

      phone || null,

      email || null,

      pastor_name || null,

      district || null,

      ward || null,

      parsedLat,

      parsedLng,

      description || null,

      code || null,

      imagePath,
    ];

    // =====================================================
    // INSERT
    // =====================================================

    const sql = `
      INSERT INTO churches (
        name,
        type,

        diocese_id,
        deanery_id,

        address,
        is_active,
        phone,
        email,
        pastor_name,
        district,
        ward,
        latitude,
        longitude,
        description,
        code,
        image
      )
      VALUES (
        ?,
        ?,

        ?,
        ?,

        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `;

    const [result] = await db.query(sql, values);

    // =====================================================
    // LOG
    // =====================================================

    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user?.id,

          action: "CREATE_CHURCH",

          target_type: "churches",

          target_id: result.insertId,

          description: `Tạo giáo xứ/họ: ${name}`,

          ip_address: req.ip,
        });
      }
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      message: "Created successfully",

      id: result.insertId,

      image: imagePath,

      diocese_id: dioceseId,

      deanery_id: deaneryId,
    });
  } catch (err) {
    console.error("❌ CREATE CHURCH ERROR DETAILS:");

    console.error("Code:", err.code);

    console.error("SQL Message:", err.sqlMessage || err.message);

    return res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
    });
  }
};

// ======================================================
// 4. UPDATE
// ======================================================

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("===== UPDATE CHURCH REQUEST =====");

    console.log("ID:", id);

    console.log("BODY:", req.body);

    console.log("FILE:", req.file);

    const churchId = Number(id);

    if (!churchId || Number.isNaN(churchId)) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    // =====================================================
    // GET OLD
    // =====================================================

    const [oldRows] = await db.query(
      `
        SELECT
          id,
          image,
          diocese_id,
          deanery_id
        FROM churches
        WHERE id = ?
        LIMIT 1
        `,
      [churchId],
    );

    if (!oldRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cơ sở!",
      });
    }

    const oldChurch = oldRows[0];

    const oldImage = oldChurch.image;

    // =====================================================
    // BODY
    // =====================================================

    const {
      name,

      type,

      // NEW
      diocese_id,
      deanery_id,

      address,

      is_active,

      phone,

      email,

      pastor_name,

      district,

      ward,

      latitude,

      longitude,

      description,

      code,
    } = req.body;

    // =====================================================
    // NAME
    // =====================================================

    if (name === undefined || name === null || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên giáo xứ/giáo họ không được để trống!",
      });
    }

    // =====================================================
    // RELATIONS
    // =====================================================

    /*
      Cho phép:
      null
      ""
      undefined

      => bỏ liên kết Giáo phận / Giáo hạt
    */

    const dioceseId = parseNullableId(diocese_id);

    const deaneryId = parseNullableId(deanery_id);

    // =====================================================
    // VALIDATE
    // =====================================================

    const relationCheck = await validateDioceseAndDeanery({
      dioceseId,
      deaneryId,
    });

    if (!relationCheck.valid) {
      return res.status(400).json({
        success: false,
        message: relationCheck.message,
      });
    }

    // =====================================================
    // IMAGE
    // =====================================================

    let newImage = oldImage || null;

    if (req.file) {
      newImage = `uploads/church/${req.file.filename}`;

      if (oldImage && oldImage !== newImage) {
        try {
          deletePhysicalFile(oldImage);
        } catch (fileErr) {
          console.error("Không thể xóa ảnh cũ:", fileErr.message);
        }
      }
    } else if (req.body.image !== undefined) {
      newImage = req.body.image || null;

      if (oldImage && !newImage) {
        try {
          deletePhysicalFile(oldImage);
        } catch (fileErr) {
          console.error("Không thể xóa ảnh cũ:", fileErr.message);
        }
      }
    }

    // =====================================================
    // LAT / LNG
    // =====================================================

    const parsedLat =
      latitude !== undefined && latitude !== "" && !isNaN(parseFloat(latitude))
        ? parseFloat(latitude)
        : null;

    const parsedLng =
      longitude !== undefined &&
      longitude !== "" &&
      !isNaN(parseFloat(longitude))
        ? parseFloat(longitude)
        : null;

    // =====================================================
    // ACTIVE
    // =====================================================

    const parsedIsActive =
      is_active !== undefined ? (Number(is_active) === 1 ? 1 : 0) : 1;

    // =====================================================
    // UPDATE
    // =====================================================

    await db.query(
      `
      UPDATE churches
      SET
        name = ?,
        type = ?,

        diocese_id = ?,
        deanery_id = ?,

        address = ?,
        is_active = ?,
        phone = ?,
        email = ?,
        pastor_name = ?,
        district = ?,
        ward = ?,
        latitude = ?,
        longitude = ?,
        description = ?,
        code = ?,
        image = ?,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
      `,
      [
        name.trim(),

        type || "GIAO_HO",

        // NEW
        dioceseId,
        deaneryId,

        address || null,

        parsedIsActive,

        phone || null,

        email || null,

        pastor_name || null,

        district || null,

        ward || null,

        parsedLat,

        parsedLng,

        description || null,

        code || null,

        newImage,

        churchId,
      ],
    );

    // =====================================================
    // LOG
    // =====================================================

    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user?.id,

          action: "UPDATE_CHURCH",

          target_type: "churches",

          target_id: churchId,

          description: `Cập nhật giáo xứ ${name || churchId}`,

          ip_address: req.ip,
        });
      }
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({
      success: true,

      message: "Updated successfully",

      image: newImage,

      diocese_id: dioceseId,

      deanery_id: deaneryId,
    });
  } catch (err) {
    console.error("❌ UPDATE CHURCH ERROR DETAILS:");

    console.error("Code:", err.code);

    console.error("SQL Message:", err.sqlMessage || err.message);

    return res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message,
    });
  }
};

// ======================================================
// 5. DELETE
// GIỮ NGUYÊN LOGIC XÓA DỮ LIỆU
// ======================================================

exports.remove = async (req, res) => {
  const connection = await db.getConnection();

  let churchImage = null;

  try {
    const churchId = Number(req.params.id);

    if (!churchId || Number.isNaN(churchId)) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    await connection.beginTransaction();

    // =====================================================
    // 1. CHECK CHURCH
    // =====================================================

    const [churchRows] = await connection.query(
      `
        SELECT
          id,
          image
        FROM churches
        WHERE id = ?
        FOR UPDATE
        `,
      [churchId],
    );

    if (!churchRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    churchImage = churchRows[0].image;

    // =====================================================
    // 2. ADMINS
    // =====================================================

    const [adminRows] = await connection.query(
      `
        SELECT id
        FROM admins
        WHERE church_id = ?
        `,
      [churchId],
    );

    const adminIds = adminRows.map((row) => row.id);

    // =====================================================
    // 3. ADMIN DEPENDENCIES
    // =====================================================

    if (adminIds.length) {
      const placeholders = adminIds.map(() => "?").join(",");

      await connection.query(
        `
        DELETE FROM media
        WHERE uploaded_by IN (${placeholders})
        `,
        adminIds,
      );

      await connection.query(
        `
        DELETE FROM push_tokens
        WHERE admin_id IN (${placeholders})
        `,
        adminIds,
      );

      await connection.query(
        `
        DELETE FROM notification_users
        WHERE user_id IN (${placeholders})
        `,
        adminIds,
      );
    }

    // =====================================================
    // 4. NOTIFICATION USERS
    // =====================================================

    await connection.query(
      `
      DELETE nu
      FROM notification_users nu
      INNER JOIN notifications n
        ON n.id = nu.notification_id
      WHERE n.church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 5. NOTIFICATIONS
    // =====================================================

    await connection.query(
      `
      DELETE FROM notifications
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 6. CATECHISTS
    // =====================================================

    const [catechistRows] = await connection.query(
      `
        SELECT id
        FROM catechists
        WHERE church_id = ?
        `,
      [churchId],
    );

    const catechistIds = catechistRows.map((row) => row.id);

    // =====================================================
    // 7. CLASSES
    // =====================================================

    const [classRows] = await connection.query(
      `
        SELECT id
        FROM classes
        WHERE church_id = ?
        `,
      [churchId],
    );

    const classIds = classRows.map((row) => row.id);

    // =====================================================
    // 8. CATECHIST_CLASSES
    // =====================================================

    if (classIds.length || catechistIds.length) {
      const conditions = [];

      const params = [];

      if (classIds.length) {
        const placeholders = classIds.map(() => "?").join(",");

        conditions.push(`class_id IN (${placeholders})`);

        params.push(...classIds);
      }

      if (catechistIds.length) {
        const placeholders = catechistIds.map(() => "?").join(",");

        conditions.push(`catechist_id IN (${placeholders})`);

        params.push(...catechistIds);
      }

      await connection.query(
        `
        DELETE FROM catechist_classes
        WHERE ${conditions.join(" OR ")}
        `,
        params,
      );
    }

    // =====================================================
    // 9. STUDENTS
    // =====================================================

    const [studentRows] = await connection.query(
      `
        SELECT id
        FROM students
        WHERE church_id = ?
        `,
      [churchId],
    );

    const studentIds = studentRows.map((row) => row.id);

    // =====================================================
    // 10. CLASS STUDENTS + RESULTS
    // =====================================================

    if (studentIds.length) {
      const placeholders = studentIds.map(() => "?").join(",");

      await connection.query(
        `
        DELETE FROM class_students
        WHERE student_id IN (${placeholders})
        `,
        studentIds,
      );

      await connection.query(
        `
        DELETE FROM results
        WHERE student_id IN (${placeholders})
        `,
        studentIds,
      );
    }

    // =====================================================
    // 11. CLASS STUDENTS THEO CLASS
    // =====================================================

    if (classIds.length) {
      const placeholders = classIds.map(() => "?").join(",");

      await connection.query(
        `
        DELETE FROM class_students
        WHERE class_id IN (${placeholders})
        `,
        classIds,
      );
    }

    // =====================================================
    // 12. CLASSES
    // =====================================================

    await connection.query(
      `
      DELETE FROM classes
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 13. STUDENTS
    // =====================================================

    await connection.query(
      `
      DELETE FROM students
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 14. CATECHISTS
    // =====================================================

    await connection.query(
      `
      DELETE FROM catechists
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 15. LITURGICAL EVENTS
    // =====================================================

    await connection.query(
      `
      DELETE le
      FROM liturgical_events le
      INNER JOIN liturgical_schedules ls
        ON ls.id = le.schedule_id
      WHERE ls.church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 16. LITURGICAL SCHEDULES
    // =====================================================

    await connection.query(
      `
      DELETE FROM liturgical_schedules
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 17. SACRAMENTS
    // =====================================================

    await connection.query(
      `
      DELETE s
      FROM sacraments s
      INNER JOIN parishioners p
        ON p.id = s.parishioner_id
      WHERE p.churches_id = ?
      `,
      [churchId],
    );

    await connection.query(
      `
      DELETE s
      FROM sacraments s
      INNER JOIN parishioners p
        ON p.id = s.spouse_parishioner_id
      WHERE p.churches_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 18. PARISHIONERS SELF REFERENCE
    // =====================================================

    await connection.query(
      `
      UPDATE parishioners
      SET head_id = NULL
      WHERE churches_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 19. PARISHIONERS
    // =====================================================

    await connection.query(
      `
      DELETE FROM parishioners
      WHERE churches_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 20. SACRAMENTS CÒN LẠI
    // =====================================================

    await connection.query(
      `
      DELETE FROM sacraments
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 21. ADMINS
    // =====================================================

    await connection.query(
      `
      DELETE FROM admins
      WHERE church_id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 22. DELETE CHURCH
    // =====================================================

    await connection.query(
      `
      DELETE FROM churches
      WHERE id = ?
      `,
      [churchId],
    );

    // =====================================================
    // 23. COMMIT
    // =====================================================

    await connection.commit();

    // =====================================================
    // 24. DELETE IMAGE
    // =====================================================

    if (churchImage) {
      try {
        deletePhysicalFile(churchImage);
      } catch (fileErr) {
        console.error("Không thể xóa ảnh giáo xứ:", fileErr.message);
      }
    }

    // =====================================================
    // 25. LOG
    // =====================================================

    try {
      await writeLog({
        admin_id: req.user?.id,

        action: "DELETE_CHURCH",

        target_type: "churches",

        target_id: churchId,

        description: `Xóa giáo xứ và toàn bộ dữ liệu liên quan ID ${churchId}`,

        ip_address: req.ip,
      });
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    return res.json({
      success: true,

      message: "Đã xóa giáo xứ và toàn bộ dữ liệu liên quan",
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      console.error("Rollback error:", rollbackErr.message);
    }

    console.error("DELETE CHURCH ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    connection.release();
  }
};

// ======================================================
// 6. TOGGLE ACTIVE
// ======================================================

exports.toggleActive = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    if (!churchId || Number.isNaN(churchId)) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
        SELECT is_active
        FROM churches
        WHERE id = ?
        `,
      [churchId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giáo xứ",
      });
    }

    const newStatus = rows[0].is_active ? 0 : 1;

    await db.query(
      `
      UPDATE churches
      SET is_active = ?
      WHERE id = ?
      `,
      [newStatus, churchId],
    );

    try {
      await writeLog({
        admin_id: req.user?.id,

        action: "TOGGLE_CHURCH",

        target_type: "churches",

        target_id: churchId,

        description: "Cập nhật trạng thái giáo xứ",

        ip_address: req.ip,
      });
    } catch (logErr) {
      console.error("Lỗi ghi log:", logErr.message);
    }

    return res.json({
      success: true,

      message: "Updated",

      is_active: newStatus,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================================
// 7. SEARCH MAP
// ======================================================

exports.searchMap = async (req, res) => {
  try {
    const { lat, lng, radius = 10, type, diocese_id, deanery_id } = req.query;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "Thiếu latitude hoặc longitude",
      });
    }

    let typeCondition = "";

    const params = [lat, lng, lat];

    // =====================================================
    // TYPE
    // =====================================================

    if (type) {
      typeCondition += " AND c.type = ? ";

      params.push(type);
    }

    // =====================================================
    // DIOCESE
    // =====================================================

    const dioceseId = parseNullableId(diocese_id);

    if (dioceseId) {
      typeCondition += " AND c.diocese_id = ? ";

      params.push(dioceseId);
    }

    // =====================================================
    // DEANERY
    // =====================================================

    const deaneryId = parseNullableId(deanery_id);

    if (deaneryId) {
      typeCondition += " AND c.deanery_id = ? ";

      params.push(deaneryId);
    }

    // =====================================================
    // RADIUS
    // =====================================================

    params.push(Number(radius) || 10);

    // =====================================================
    // QUERY
    // =====================================================

    const [rows] = await db.query(
      `
        SELECT
          c.*,

          d.id AS diocese_ref_id,
          d.code AS diocese_code,
          d.name AS diocese_name,

          de.id AS deanery_ref_id,
          de.code AS deanery_code,
          de.name AS deanery_name,

          (
            6371 * ACOS(
              COS(RADIANS(?)) *
              COS(RADIANS(c.latitude)) *
              COS(
                RADIANS(c.longitude) -
                RADIANS(?)
              ) +
              SIN(RADIANS(?)) *
              SIN(RADIANS(c.latitude))
            )
          ) AS distance

        FROM churches c

        LEFT JOIN dioceses d
          ON d.id = c.diocese_id

        LEFT JOIN deaneries de
          ON de.id = c.deanery_id

        WHERE c.is_active = 1

          AND c.latitude IS NOT NULL

          AND c.longitude IS NOT NULL

          ${typeCondition}

        HAVING distance < ?

        ORDER BY distance ASC
        `,
      params,
    );

    return res.json({
      success: true,

      data: rows,
    });
  } catch (err) {
    console.error("SEARCH MAP ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ======================================================
// 8. ACTIVATE LICENSE
// CHỈ ADMIN HỆ THỐNG
// ======================================================

exports.activateLicense = async (req, res) => {
  try {
    const churchId = Number(req.params.id);

    // ==================================================
    // 1. ID
    // ==================================================

    if (!churchId || Number.isNaN(churchId)) {
      return res.status(400).json({
        success: false,
        message: "ID giáo xứ không hợp lệ",
      });
    }

    // ==================================================
    // 2. LOGIN
    // ==================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Chưa đăng nhập",
      });
    }

    // ==================================================
    // 3. SYSTEM ADMIN
    // ==================================================

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,

        code: "LICENSE_ACTIVATION_FORBIDDEN",

        message: "Chỉ quản trị hệ thống mới có quyền kích hoạt FaithEdu",
      });
    }

    // ==================================================
    // 4. GET CHURCH
    // ==================================================

    const [rows] = await db.query(
      `
        SELECT
          id,
          name,
          code,

          diocese_id,
          deanery_id,

          license_status,
          trial_started_at,
          trial_expires_at,
          activated_at

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

    // ==================================================
    // 5. ALREADY ACTIVE
    // ==================================================

    if (church.license_status === "active") {
      return res.status(200).json({
        success: true,

        already_active: true,

        message: "FaithEdu của giáo xứ này đã được kích hoạt trước đó",

        license: {
          status: "active",

          activated_at: church.activated_at,

          is_expired: false,

          is_active: true,
        },

        church: {
          id: Number(church.id),

          name: church.name,

          code: church.code,

          diocese_id:
            church.diocese_id !== null ? Number(church.diocese_id) : null,

          deanery_id:
            church.deanery_id !== null ? Number(church.deanery_id) : null,
        },
      });
    }

    // ==================================================
    // 6. ACTIVATE
    // ==================================================

    await db.query(
      `
      UPDATE churches

      SET
        license_status = 'active',

        activated_at = NOW(),

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
      `,
      [churchId],
    );

    // ==================================================
    // 7. GET UPDATED
    // ==================================================

    const [updatedRows] = await db.query(
      `
        SELECT
          id,
          name,
          code,

          diocese_id,
          deanery_id,

          license_status,
          trial_started_at,
          trial_expires_at,
          activated_at

        FROM churches

        WHERE id = ?

        LIMIT 1
        `,
      [churchId],
    );

    const updatedChurch = updatedRows[0];

    // ==================================================
    // 8. ACTIVITY LOG
    // ==================================================

    try {
      if (typeof writeLog === "function") {
        await writeLog({
          admin_id: req.user.id,

          action: "ACTIVATE_FAITHEDU_LICENSE",

          target_type: "churches",

          target_id: churchId,

          description: `Kích hoạt FaithEdu cho giáo xứ: ${church.name} (ID: ${churchId})`,

          ip_address: req.ip,
        });
      }
    } catch (logErr) {
      console.error(
        "Lỗi ghi activity log khi kích hoạt license:",
        logErr.message,
      );
    }

    // ==================================================
    // 9. RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      message: "Kích hoạt FaithEdu thành công",

      license: {
        status: updatedChurch.license_status,

        trial_started_at: updatedChurch.trial_started_at,

        trial_expires_at: updatedChurch.trial_expires_at,

        activated_at: updatedChurch.activated_at,

        days_remaining: null,

        is_expired: false,

        is_trial: false,

        is_active: true,
      },

      church: {
        id: Number(updatedChurch.id),

        name: updatedChurch.name,

        code: updatedChurch.code,

        diocese_id:
          updatedChurch.diocese_id !== null
            ? Number(updatedChurch.diocese_id)
            : null,

        deanery_id:
          updatedChurch.deanery_id !== null
            ? Number(updatedChurch.deanery_id)
            : null,
      },
    });
  } catch (err) {
    console.error("==========================================");

    console.error("❌ ACTIVATE LICENSE ERROR");

    console.error("Message:", err.message);

    console.error("Code:", err.code);

    console.error("SQL State:", err.sqlState);

    console.error("SQL Message:", err.sqlMessage);

    console.error("Stack:", err.stack);

    console.error("==========================================");

    return res.status(500).json({
      success: false,

      message: "Lỗi server khi kích hoạt FaithEdu",

      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
// GET /api/dioceses/archdioceses

exports.getArchdioceses = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        code,
        name,
        type,
        is_active
      FROM dioceses
      WHERE type = 'TONG_GIAO_PHAN'
        AND is_active = 1
      ORDER BY name ASC
    `);

    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        type: row.type,
        is_active: Number(row.is_active) === 1,
      })),
      total: rows.length,
    });
  } catch (error) {
    console.error("GET ARCHDIOCESES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Tổng Giáo phận",
    });
  }
};
// GET /api/dioceses/by-parent/:parentDioceseId

exports.getDiocesesByParent = async (req, res) => {
  try {
    const parentDioceseId = Number(req.params.parentDioceseId);

    if (!Number.isInteger(parentDioceseId) || parentDioceseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID Tổng Giáo phận không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        code,
        name,
        type,
        parent_diocese_id,
        is_active
      FROM dioceses
      WHERE parent_diocese_id = ?
        AND type = 'GIAO_PHAN'
        AND is_active = 1
      ORDER BY name ASC
      `,
      [parentDioceseId],
    );

    return res.json({
      success: true,

      data: rows.map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        type: row.type,
        parent_diocese_id:
          row.parent_diocese_id !== null ? Number(row.parent_diocese_id) : null,
        is_active: Number(row.is_active) === 1,
      })),

      total: rows.length,
    });
  } catch (error) {
    console.error("GET DIOCESES BY PARENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Giáo phận",
    });
  }
};
// GET /api/deaneries/by-diocese/:dioceseId

exports.getDeaneriesByDiocese = async (req, res) => {
  try {
    const dioceseId = Number(req.params.dioceseId);

    if (!Number.isInteger(dioceseId) || dioceseId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID Giáo phận không hợp lệ",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        diocese_id,
        code,
        name,
        is_active
      FROM deaneries
      WHERE diocese_id = ?
        AND is_active = 1
      ORDER BY name ASC
      `,
      [dioceseId],
    );

    return res.json({
      success: true,

      data: rows.map((row) => ({
        id: Number(row.id),
        diocese_id: Number(row.diocese_id),
        code: row.code,
        name: row.name,
        is_active: Number(row.is_active) === 1,
      })),

      total: rows.length,
    });
  } catch (error) {
    console.error("GET DEANERIES BY DIOCESE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách Giáo hạt",
    });
  }
};

const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const { writeLog } = require("../utils/activityLogger");
const { createNotification } = require("../services/notificationService");
/* ===============================
   HELPER: Parse JSON safe
=================================*/
const parseJSONSafe = (data, defaultValue = []) => {
  try {
    if (!data) return defaultValue;
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch (err) {
    console.error("JSON parse error:", err);
    return defaultValue;
  }
};

/* ===============================
   CREATE GROUP
=================================*/
exports.createGroup = async (req, res) => {
  const connection = await db.getConnection();

  console.log("========== CREATE GROUP ==========");
  console.log("Body:", req.body);
  console.log("File:", req.file);
  console.log("User:", req.user);

  try {
    await connection.beginTransaction();
    console.log("Transaction started...");

    const {
      name,
      slug,
      patron,
      members_count,
      founding_year,
      description,
      color,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Tên hội đoàn là bắt buộc" });
    }

    /* ==============================
       1. SLUG
    ============================== */
    const finalSlug = slug
      ? slugify(slug, { lower: true, strict: true })
      : slugify(name, { lower: true, strict: true });

    console.log("Generated slug:", finalSlug);

    /* ==============================
       2. IMAGE HANDLE (FIX CHÍNH)
    ============================== */
    let image = null;

    if (req.file) {
      console.log("New image uploaded:", req.file.filename);
      image = `/uploads/groups/${req.file.filename}`;
    } else {
      console.log("No image uploaded");
    }

    console.log("Image path:", image);

    /* ==============================
       3. CHECK SLUG EXISTS
    ============================== */
    const [existing] = await connection.query(
      `SELECT id FROM \`groups\`
   WHERE slug=? AND is_deleted=0`,
      [finalSlug],
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: "Slug đã tồn tại" });
    }

    /* ==============================
       4. INSERT GROUP
    ============================== */
    const [result] = await connection.query(
      `INSERT INTO \`groups\`
   (name, slug, patron, members_count, founding_year,
    description, image, color, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        finalSlug,
        patron,
        members_count || 0,
        founding_year,
        description,
        image,
        color,
        req.user?.id || null,
      ],
    );

    const groupId = result.insertId;
    console.log("Inserted group ID:", groupId);

    /* ==============================
       5. MISSIONS (SAFE PARSE)
    ============================== */
    let missionList = [];
    let timelineList = [];

    try {
      missionList = parseJSONSafe(req.body.missions);
      timelineList = parseJSONSafe(req.body.timeline);
    } catch (err) {
      console.log("Parse error:", err.message);
    }

    console.log("Parsed missions:", missionList);
    console.log("Parsed timeline:", timelineList);

    /* ==============================
       6. INSERT MISSIONS
    ============================== */
    if (Array.isArray(missionList)) {
      for (let i = 0; i < missionList.length; i++) {
        console.log("Insert mission:", missionList[i]);

        await connection.query(
          `INSERT INTO group_missions (group_id, mission, sort_order)
           VALUES (?, ?, ?)`,
          [groupId, missionList[i], i + 1],
        );
      }
    }

    /* ==============================
       7. INSERT TIMELINE
    ============================== */
    if (Array.isArray(timelineList)) {
      for (let i = 0; i < timelineList.length; i++) {
        const item = timelineList[i];

        console.log("Insert timeline:", item);

        await connection.query(
          `INSERT INTO group_timelines (group_id, year, event, sort_order)
           VALUES (?, ?, ?, ?)`,
          [groupId, item.year, item.event, i + 1],
        );
      }
    }

    await connection.commit();
    console.log("Transaction committed successfully ✅");
    await writeLog({
      admin_id: req.user?.id,
      action: "CREATE_GROUP",
      target_type: "groups",
      target_id: groupId,
      description: `Tạo hội đoàn ${name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "CREATE_GROUP",
      title: "Hội đoàn mới",
      content: `${name} vừa được tạo`,
      created_by: req.user?.id,
      related_type: "groups",
      related_id: groupId,
    });
    res.json({
      success: true,
      message: "Tạo hội đoàn thành công",
      data: {
        id: groupId,
        image,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("❌ CREATE GROUP ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    connection.release();
    console.log("Connection released");
  }
};

/* ===============================
   GET LIST
=================================*/
exports.getGroups = async (req, res) => {
  try {
    let { page = 1, limit = 10, search } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let where = "WHERE is_deleted = 0";
    let params = [];

    if (search) {
      where += " AND name LIKE ?";
      params.push(`%${search}%`);
    }

    const [[count]] = await db.query(
      `SELECT COUNT(*) as total FROM \`groups\` ${where}`,
      params,
    );

    const [rows] = await db.query(
      `SELECT * FROM \`groups\`
   ${where}
   ORDER BY created_at DESC
   LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count.total,
        page,
        limit,
        totalPages: Math.ceil(count.total / limit),
      },
    });
  } catch (err) {
    console.error("GET GROUPS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ===============================
   GET DETAIL (theo slug)
=================================*/
exports.getGroupDetail = async (req, res) => {
  try {
    const { slug } = req.params;

    const [[group]] = await db.query(
      `SELECT *
   FROM \`groups\`
   WHERE slug=? AND is_deleted=0`,
      [slug],
    );

    if (!group) {
      return res.status(404).json({ message: "Không tìm thấy hội đoàn" });
    }

    const [missions] = await db.query(
      `SELECT mission FROM group_missions
       WHERE group_id=? ORDER BY sort_order ASC`,
      [group.id],
    );

    const [timeline] = await db.query(
      `SELECT year, event FROM group_timelines
       WHERE group_id=? ORDER BY sort_order ASC`,
      [group.id],
    );

    res.json({
      success: true,
      data: {
        ...group,
        missions: missions.map((m) => m.mission),
        timeline,
      },
    });
  } catch (err) {
    console.error("GET DETAIL ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ===============================
   UPDATE GROUP
=================================*/
exports.updateGroup = async (req, res) => {
  const connection = await db.getConnection();

  console.log("========== UPDATE GROUP ==========");
  console.log("Params:", req.params);
  console.log("Body:", req.body);
  console.log("File:", req.file);
  console.log("User:", req.user);

  try {
    await connection.beginTransaction();
    console.log("Transaction started...");

    const { id } = req.params;

    /* ==============================
       1. CHECK GROUP EXISTS
    ============================== */
    const [[group]] = await connection.query(
      `SELECT *
   FROM \`groups\`
   WHERE id=? AND is_deleted=0`,
      [id],
    );

    console.log("Existing group:", group);

    if (!group) {
      console.log("Group not found!");
      return res.status(404).json({ message: "Không tìm thấy hội đoàn" });
    }

    /* ==============================
       2. HANDLE IMAGE
    ============================== */
    let image = group.image;

    if (req.file) {
      console.log("New image uploaded:", req.file.filename);

      if (group.image) {
        const oldPath = path.join(__dirname, "..", group.image);
        console.log("Old image path:", oldPath);

        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          console.log("Old image deleted");
        }
      }

      image = `/uploads/groups/${req.file.filename}`;
    } else {
      console.log("No new image uploaded");
    }

    /* ==============================
       3. UPDATE GROUP
    ============================== */
    await connection.query(
      `UPDATE \`groups\`
   SET name=?,
       patron=?,
       members_count=?,
       founding_year=?,
       description=?,
       image=?,
       color=?,
       updated_by=?
   WHERE id=?`,
      [
        req.body.name,
        req.body.patron,
        req.body.members_count,
        req.body.founding_year,
        req.body.description,
        image,
        req.body.color,
        req.user?.id || null,
        id,
      ],
    );

    console.log("Group updated successfully");

    /* ==============================
       4. DELETE OLD MISSIONS + TIMELINE
    ============================== */
    await connection.query(`DELETE FROM group_missions WHERE group_id=?`, [id]);
    await connection.query(`DELETE FROM group_timelines WHERE group_id=?`, [
      id,
    ]);

    console.log("Old missions & timelines deleted");

    /* ==============================
       5. INSERT NEW MISSIONS
    ============================== */
    const missionList = parseJSONSafe(req.body.missions);
    const timelineList = parseJSONSafe(req.body.timeline);

    console.log("Parsed missions:", missionList);
    console.log("Parsed timeline:", timelineList);

    if (Array.isArray(missionList)) {
      for (let i = 0; i < missionList.length; i++) {
        console.log(`Insert mission ${i + 1}:`, missionList[i]);

        await connection.query(
          `INSERT INTO group_missions (group_id, mission, sort_order)
           VALUES (?, ?, ?)`,
          [id, missionList[i], i + 1],
        );
      }
    }

    /* ==============================
       6. INSERT NEW TIMELINE
    ============================== */
    if (Array.isArray(timelineList)) {
      for (let i = 0; i < timelineList.length; i++) {
        const item = timelineList[i];

        console.log(`Insert timeline ${i + 1}:`, item);

        await connection.query(
          `INSERT INTO group_timelines (group_id, year, event, sort_order)
           VALUES (?, ?, ?, ?)`,
          [id, item.year, item.event, i + 1],
        );
      }
    }

    await connection.commit();
    console.log("Transaction committed successfully ✅");
    await writeLog({
      admin_id: req.user?.id,
      action: "UPDATE_GROUP",
      target_type: "groups",
      target_id: id,
      description: `Cập nhật hội đoàn ${req.body.name}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "UPDATE_GROUP",
      title: "Cập nhật hội đoàn",
      content: `${req.body.name} vừa được cập nhật`,
      created_by: req.user?.id,
      related_type: "groups",
      related_id: id,
    });
    res.json({
      success: true,
      message: "Cập nhật thành công",
      image,
    });
  } catch (err) {
    await connection.rollback();
    console.error("❌ UPDATE GROUP ERROR:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
    console.log("Connection released");
  }
};

/* ===============================
   DELETE (SOFT DELETE)
=================================*/
exports.deleteGroup = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    await connection.beginTransaction();

    // 1. Lấy thông tin ảnh trước khi xóa bản ghi
    const [rows] = await connection.query(
      "SELECT image FROM `groups` WHERE id=?",
      [id],
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Hội đoàn không tồn tại" });
    }

    const imageName = rows[0].image; // Giả sử lưu là "ten-anh.jpg"

    // 2. Thực hiện xóa bản ghi ở các bảng liên quan
    // Xóa Missions và Timelines trước (tránh lỗi khóa ngoại)
    await connection.query("DELETE FROM group_missions WHERE group_id = ?", [
      id,
    ]);
    await connection.query("DELETE FROM group_timelines WHERE group_id = ?", [
      id,
    ]);

    // 3. Xóa bản ghi chính

    await connection.query("DELETE FROM `groups` WHERE id=?", [id]);
    // 4. Hoàn tất giao dịch Database
    await connection.commit();

    // 5. Xóa file vật lý trong thư mục uploads/groups
    if (imageName) {
      // Xác định đường dẫn: Thư mục gốc / uploads / groups / tên ảnh
      const absolutePath = path.join(
        process.cwd(),
        "uploads",
        "groups",
        imageName,
      );

      // Kiểm tra file có tồn tại không rồi mới xóa
      if (fs.existsSync(absolutePath)) {
        fs.unlink(absolutePath, (err) => {
          if (err) console.error("Lỗi xóa file thực tế:", err);
        });
      }
    }
    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_GROUP",
      target_type: "groups",
      target_id: id,
      description: `Xóa hội đoàn ID ${id}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "DELETE_GROUP",
      title: "Xóa hội đoàn",
      content: `Một hội đoàn vừa bị xóa`,
      created_by: req.user?.id,
      related_type: "groups",
      related_id: id,
    });
    res.json({
      success: true,
      message: "Đã xóa sạch dữ liệu hội đoàn và ảnh liên quan",
    });
  } catch (err) {
    await connection.rollback();
    console.error("DELETE GROUP ERROR:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi xóa dữ liệu" });
  } finally {
    connection.release();
  }
};

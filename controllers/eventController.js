const db = require("../config/db");
const slugify = require("slugify");
const fs = require("fs");
const path = require("path");
const { writeLog } = require("../utils/activityLogger");
const { createNotification } = require("../services/notificationService");
// ================= GET WITH PAGINATION =================
exports.getEvents = async (req, res) => {
  try {
    const { page = 1, limit = 6, category, search } = req.query;

    console.log("📥 QUERY:", req.query);

    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    let params = [];

    if (category) {
      where += " AND e.category = ?";
      params.push(category);
    }

    if (search) {
      where += " AND e.title LIKE ?";
      params.push(`%${search}%`);
    }

    console.log("🧩 WHERE:", where);
    console.log("📦 PARAMS:", params);

    // ==============================
    // 1. GET EVENTS (KHÔNG JOIN)
    // ==============================
    const [events] = await db.query(
      `
      SELECT *
      FROM events e
      ${where}
      ORDER BY e.event_date DESC
      LIMIT ? OFFSET ?
      `,
      [...params, Number(limit), Number(offset)],
    );

    console.log("📊 EVENTS:", events.length);

    if (events.length === 0) {
      return res.json({
        data: [],
        total: 0,
        page: Number(page),
        totalPages: 0,
      });
    }

    // ==============================
    // 2. GET IMAGES
    // ==============================
    const ids = events.map((e) => e.id);

    const [images] = await db.query(
      `
      SELECT event_id, image
      FROM event_images
      WHERE event_id IN (?)
      `,
      [ids],
    );

    console.log("🖼 IMAGES:", images.length);

    // ==============================
    // 3. MAP IMAGES
    // ==============================
    const imageMap = {};

    images.forEach((img) => {
      if (!imageMap[img.event_id]) {
        imageMap[img.event_id] = [];
      }

      imageMap[img.event_id].push(`/uploads/events/${img.image}`);
    });

    const result = events.map((e) => ({
      ...e,
      images: imageMap[e.id] || [],
    }));

    // ==============================
    // 4. COUNT TOTAL
    // ==============================
    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(*) as total
      FROM events e
      ${where}
      `,
      params,
    );

    console.log("📊 TOTAL:", total);

    // ==============================
    // 5. RESPONSE
    // ==============================
    res.json({
      data: result,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.log("❌ GET EVENTS ERROR:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};
// ================= GET DETAIL =================
exports.getEventBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    console.log("📥 SLUG:", slug);

    const [events] = await db.query("SELECT * FROM events WHERE slug=?", [
      slug,
    ]);

    console.log("📦 EVENT FOUND:", events.length);

    if (!events.length) {
      console.log("❌ NOT FOUND");
      return res.status(404).json({ message: "Không tìm thấy" });
    }

    const event = events[0];

    const [images] = await db.query(
      "SELECT image FROM event_images WHERE event_id=?",
      [event.id],
    );

    console.log("🖼 IMAGES:", images);

    event.images = images.map((img) => `/uploads/events/${img.image}`);

    res.json(event);
  } catch (error) {
    console.log("❌ SLUG ERROR:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};
// ================= CREATE =================
exports.createEvent = async (req, res) => {
  try {
    console.log("📥 BODY:", req.body);
    console.log("FILES:", req.files);

    const {
      title,
      event_date,
      event_time,
      location,
      category,
      description,
      full_content,
      meta_title,
      meta_desc,
      youtube_url,
    } = req.body;

    const slug = slugify(title, { lower: true, strict: true });

    console.log("🔗 SLUG:", slug);

    const [result] = await db.query(
      `INSERT INTO events 
      (slug, title, event_date, event_time, location, category,
       description, full_content, meta_title, meta_desc,youtube_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
      [
        slug,
        title,
        event_date,
        event_time,
        location,
        category,
        description,
        full_content,
        meta_title,
        meta_desc,
        youtube_url,
      ],
    );

    console.log("🆕 INSERT RESULT:", result);

    const eventId = result.insertId;

    console.log("🆔 EVENT ID:", eventId);

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        console.log("📸 SAVE IMAGE:", file.filename);

        await db.query(
          "INSERT INTO event_images (event_id, image) VALUES (?, ?)",
          [eventId, file.filename],
        );
      }
    }
    await writeLog({
      admin_id: req.user?.id,
      action: "CREATE_EVENT",
      target_type: "events",
      target_id: eventId,
      description: `Tạo sự kiện ${title}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "CREATE_EVENT",
      title: "Sự kiện mới",
      content: `${title} vừa được tạo`,
      created_by: req.user?.id,
      related_type: "events",
      related_id: eventId,
    });
    res.json({ message: "Tạo sự kiện thành công" });
  } catch (error) {
    console.log("❌ CREATE ERROR:", error);
    res.status(500).json({ message: "Lỗi tạo sự kiện" });
  }
};

// ================= UPDATE =================
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🆔 UPDATE ID:", id);
    console.log("📥 BODY:", req.body);
    console.log("📸 FILES:", req.files);

    const {
      title,
      event_date,
      event_time,
      location,
      category,
      description = "",
      full_content = "",
      meta_title = "",
      meta_desc = "",
      is_active = 1,
      youtube_url = "",
    } = req.body;

    // =========================
    // 1. SLUG
    // =========================
    const slug = slugify(title, { lower: true, strict: true });

    // =========================
    // 2. UPDATE TABLE events (KHÔNG images)
    // =========================
    await db.query(
      `UPDATE events SET
        slug=?,
        title=?,
        event_date=?,
        event_time=?,
        location=?,
        category=?,
        description=?,
        full_content=?,
        meta_title=?,
        meta_desc=?,
        is_active=?,
        youtube_url=?
       WHERE id=?`,
      [
        slug,
        title,
        event_date,
        event_time,
        location,
        category,
        description,
        full_content,
        meta_title,
        meta_desc,
        is_active,
        youtube_url,
        id,
      ],
    );

    // =========================
    // 3. HANDLE IMAGES (TABLE RIÊNG)
    // =========================

    if (req.files && req.files.length > 0) {
      // (OPTION 1) XÓA ảnh cũ trước khi update
      await db.query("DELETE FROM event_images WHERE event_id = ?", [id]);

      // (OPTION 2) insert ảnh mới
      const values = req.files.map((file) => [id, `${file.filename}`]);

      await db.query(
        `INSERT INTO event_images (event_id, image)
         VALUES ?`,
        [values],
      );
    }

    console.log("✅ UPDATE SUCCESS");
    await writeLog({
      admin_id: req.user?.id,
      action: "UPDATE_EVENT",
      target_type: "events",
      target_id: id,
      description: `Cập nhật sự kiện ${title}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "UPDATE_EVENT",
      title: "Cập nhật sự kiện",
      content: `${title} vừa được cập nhật`,
      created_by: req.user?.id,
      related_type: "events",
      related_id: id,
    });
    res.json({
      message: "Cập nhật sự kiện thành công",
    });
  } catch (error) {
    console.log("❌ UPDATE ERROR:", error);
    res.status(500).json({ message: "Lỗi cập nhật sự kiện" });
  }
};
exports.updateEventStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    console.log("📥 UPDATE STATUS:", { id, is_active });

    if (typeof is_active === "undefined") {
      return res.status(400).json({
        message: "Thiếu is_active",
      });
    }

    await db.query("UPDATE events SET is_active=? WHERE id=?", [is_active, id]);
    await writeLog({
      admin_id: req.user?.id,
      action: "UPDATE_EVENT_STATUS",
      target_type: "events",
      target_id: id,
      description: `Cập nhật trạng thái sự kiện`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "EVENT_STATUS",
      title: "Trạng thái sự kiện",
      content: `Sự kiện ID ${id} vừa đổi trạng thái`,
      created_by: req.user?.id,
      related_type: "events",
      related_id: id,
    });
    res.json({
      message: "Cập nhật trạng thái thành công",
      id,
      is_active,
    });
  } catch (error) {
    console.log("❌ UPDATE STATUS ERROR:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};
// ================= DELETE =================
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑 DELETE ID:", id);

    const [images] = await db.query(
      "SELECT image FROM event_images WHERE event_id=?",
      [id],
    );

    console.log("🖼 IMAGES TO DELETE:", images);

    for (let img of images) {
      const imgPath = path.join("uploads/events", img.image);

      console.log("📂 DELETE FILE:", imgPath);

      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    }

    await db.query("DELETE FROM events WHERE id=?", [id]);
    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_EVENT",
      target_type: "events",
      target_id: id,
      description: `Xóa sự kiện ID ${id}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "DELETE_EVENT",
      title: "Xóa sự kiện",
      content: `Một sự kiện vừa bị xóa`,
      created_by: req.user?.id,
      related_type: "events",
      related_id: id,
    });
    console.log("✅ DELETE DONE");

    res.json({ message: "Xóa thành công" });
  } catch (error) {
    console.log("❌ DELETE ERROR:", error);
    res.status(500).json({ message: "Lỗi xóa" });
  }
};

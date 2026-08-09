const db = require("../config/db");
const { writeLog } = require("../utils/activityLogger");
const { createNotification } = require("../services/notification.service");

/* =============================
   GET ALL (FE FORMAT)
============================= */
exports.getAllFe = async (req, res) => {
  console.log("📥 [PRAYER] GET ALL FE");

  try {
    const [rows] = await db.query(
      "SELECT id, title, category, exam_session, content FROM prayers ORDER BY id ASC",
    );

    const formattedData = {};

    rows.forEach((item) => {
      formattedData[item.id] = {
        title: item.title,
        category: item.category,
        exam_session: item.exam_session,
        content: item.content,
      };
    });

    res.status(200).json(formattedData);
  } catch (err) {
    console.error("❌ GET ALL FE ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =============================
   GET ALL (ADMIN - CÓ LỌC THEO EXAM_SESSION)
============================= */
exports.getAll = async (req, res) => {
  console.log("📥 [PRAYER] GET ALL");

  try {
    let {
      search = "",
      category = "",
      exam_session = "",
      page = 1,
      limit = 10,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const offset = (page - 1) * limit;

    let query = "SELECT * FROM prayers WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as total FROM prayers WHERE 1=1";
    let params = [];

    // Tìm kiếm theo tiêu đề
    if (search) {
      query += " AND title LIKE ?";
      countQuery += " AND title LIKE ?";
      params.push(`%${search}%`);
    }

    // Lọc theo chuyên mục
    if (category) {
      query += " AND category = ?";
      countQuery += " AND category = ?";
      params.push(category);
    }

    // Lọc theo đợt khảo kinh
    if (exam_session) {
      query += " AND exam_session = ?";
      countQuery += " AND exam_session = ?";
      params.push(exam_session);
    }

    query += " ORDER BY id DESC LIMIT ? OFFSET ?";

    const [rows] = await db.query(query, [...params, limit, offset]);
    const [countRows] = await db.query(countQuery, params);

    res.json({
      data: rows,
      total: countRows[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error("❌ GET ALL ERROR:", err);

    res.status(500).json({
      message: err.message,
    });
  }
};

/* =============================
   GET BY ID
============================= */
exports.getById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM prayers WHERE id=?", [
      req.params.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Prayer not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =============================
   CREATE + LOG + NOTIFY
============================= */
exports.create = async (req, res) => {
  console.log("📥 CREATE PRAYER");

  try {
    const { title, category, exam_session, content, author } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        message: "Title and content required",
      });
    }

    const [result] = await db.query(
      "INSERT INTO prayers (title, category, exam_session, author, content) VALUES (?, ?, ?, ?, ?)",
      [title, category || null, exam_session || null, author || null, content],
    );

    const id = result.insertId;

    // LOG
    await writeLog({
      admin_id: req.user?.id,
      action: "CREATE_PRAYER",
      target_type: "prayers",
      target_id: id,
      description: `Tạo lời cầu nguyện: ${title} (${exam_session || "Không đợt"})`,
      ip_address: req.ip,
    });

    // NOTIFY
    await createNotification({
      type: "CREATE_PRAYER",
      title: "Lời cầu nguyện mới",
      content: `${title} vừa được tạo`,
      created_by: req.user?.id,
      related_type: "prayers",
      related_id: id,
    });

    res.status(201).json({
      message: "Created successfully",
      id,
    });
  } catch (err) {
    console.error("❌ CREATE ERROR:", err);

    res.status(500).json({
      message: err.message,
    });
  }
};

/* =============================
   UPDATE + LOG
============================= */
/* =============================
   UPDATE + LOG (AN TOÀN & CHI TIẾT LOG)
============================= */
exports.update = async (req, res) => {
  console.log("\n========== UPDATE PRAYER ==========");
  console.log("🆔 Target ID:", req.params.id);
  console.log("📥 Request body:", req.body);

  try {
    const { title, category, exam_session, author, content } = req.body;

    // 1. Kiểm tra đầu vào bắt buộc
    if (!title || !content) {
      console.log("❌ Thiếu dữ liệu bắt buộc: title hoặc content");
      return res.status(400).json({
        success: false,
        message: "Tiêu đề và nội dung không được để trống",
      });
    }

    // 2. Kiểm tra tồn tại bài kinh trong DB
    const [old] = await db.query("SELECT title FROM prayers WHERE id=?", [
      req.params.id,
    ]);

    if (!old.length) {
      console.log(`⚠️ Không tìm thấy bài kinh với ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài kinh cần cập nhật",
      });
    }

    console.log("📝 Tên cũ:", old[0].title);
    console.log("📝 Tên mới:", title);

    // 3. Cập nhật Database
    const updateSql = `
      UPDATE prayers 
      SET title=?, category=?, exam_session=?, author=?, content=? 
      WHERE id=?
    `;
    const updateParams = [
      title,
      category || null,
      exam_session || null,
      author || null,
      content,
      req.params.id,
    ];

    console.log("💾 Đang thực thi UPDATE SQL...");
    await db.query(updateSql, updateParams);
    console.log("✅ Đã cập nhật bảng prayers thành công");

    // 4. Ghi Log Hoạt Động (viết an toàn với try...catch riêng để log không làm crash API)
    try {
      await writeLog({
        admin_id: req.user?.id || null,
        action: "UPDATE_PRAYER",
        target_type: "prayers",
        target_id: req.params.id,
        description: `Cập nhật lời cầu nguyện: ${title}`,
        ip_address: req.ip,
      });
      console.log("✅ Đã ghi Activity Log thành công");
    } catch (logErr) {
      console.error(
        "⚠️ Lỗi phụ khi ghi Activity Log (không chặn API):",
        logErr.message,
      );
    }

    console.log("===================================\n");

    return res.json({
      success: true,
      message: "Cập nhật bài kinh thành công",
    });
  } catch (err) {
    console.error("\n❌ LỖI UPDATE PRAYER");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("===================================\n");

    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật bài kinh",
      error: err.message, // Trả lỗi trực tiếp về FE để xem ngay trên F12
    });
  }
};

/* =============================
   DELETE + LOG + NOTIFY
============================= */
exports.remove = async (req, res) => {
  try {
    const [old] = await db.query("SELECT title FROM prayers WHERE id=?", [
      req.params.id,
    ]);

    if (!old.length) {
      return res.status(404).json({ message: "Not found" });
    }

    const title = old[0].title;

    await db.query("DELETE FROM prayers WHERE id=?", [req.params.id]);

    await writeLog({
      admin_id: req.user?.id,
      action: "DELETE_PRAYER",
      target_type: "prayers",
      target_id: req.params.id,
      description: `Xóa lời cầu nguyện: ${title}`,
      ip_address: req.ip,
    });

    await createNotification({
      type: "DELETE_PRAYER",
      title: "Xóa lời cầu nguyện",
      content: `${title} vừa bị xóa`,
      created_by: req.user?.id,
      related_type: "prayers",
      related_id: req.params.id,
    });

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

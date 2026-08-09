const db = require("../config/db");
const slugify = require("slugify");
const fs = require("fs");
const path = require("path");

// 1. TẠO TÀI LIỆU MỚI (CREATE DOCUMENT)
exports.createDocument = async (req, res) => {
  console.log("\n=========================================");
  console.log("📂 [CREATE DOCUMENT LOG]");
  console.log("⏰ Thời gian :", new Date().toLocaleString("vi-VN"));

  try {
    const { title, description, category, is_featured } = req.body;
    const file = req.file;

    console.log("📥 Form Body  :", {
      title,
      category,
      is_featured,
      description,
    });

    if (!file) {
      console.warn("⚠️ [WARN]: Chưa tải file lên trong request!");
      console.log("=========================================\n");
      return res.status(400).json({
        success: false,
        message: "Chưa tải file lên",
      });
    }

    console.log("📎 File Upload Info:");
    console.log("  - Original Name :", file.originalname);
    console.log("  - Saved Filename :", file.filename);
    console.log("  - File Size     :", `${(file.size / 1024).toFixed(2)} KB`);
    console.log("  - MIME Type     :", file.mimetype);

    const slug = slugify(title || "", {
      lower: true,
      strict: true,
      locale: "vi",
    });

    const relativeFilePath = `uploads/documents/${file.filename}`;
    console.log("🔗 Generated Slug:", slug);
    console.log("📍 Relative Path :", relativeFilePath);

    const [result] = await db.query(
      `
      INSERT INTO documents(
        title,
        slug,
        description,
        category,
        file_name,
        file_url,
        file_size,
        file_type,
        is_featured
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        title,
        slug,
        description || "",
        category,
        file.originalname,
        relativeFilePath,
        file.size,
        file.mimetype,
        is_featured || 0,
      ],
    );

    console.log(
      "✅ [SUCCESS]: Tạo tài liệu thành công với ID =",
      result.insertId,
    );
    console.log("=========================================\n");

    return res.json({
      success: true,
      message: "Thêm tài liệu thành công",
      data: { id: result.insertId, title, slug, file_url: relativeFilePath },
    });
  } catch (err) {
    console.error("❌ [ERROR - CREATE DOCUMENT]:", err);
    console.log("=========================================\n");
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tạo tài liệu",
      error: err.message,
    });
  }
};
// CẬP NHẬT TÀI LIỆU (UPDATE DOCUMENT)
exports.updateDocument = async (req, res) => {
  const { id } = req.params;

  console.log("\n=========================================");
  console.log("📝 [UPDATE DOCUMENT LOG]");
  console.log("⏰ Thời gian  :", new Date().toLocaleString("vi-VN"));
  console.log("📌 Target ID  :", id);

  try {
    const { title, description, category, is_featured } = req.body;
    const newFile = req.file;

    console.log("📥 Form Body  :", {
      title,
      category,
      is_featured,
      description,
    });

    // 1. Kiểm tra tài liệu có tồn tại trong CSDL không
    const [rows] = await db.query(`SELECT * FROM documents WHERE id = ?`, [id]);

    if (rows.length === 0) {
      console.warn(
        `⚠️ [WARN]: Không tìm thấy tài liệu ID = ${id} để cập nhật.`,
      );
      console.log("=========================================\n");
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài liệu cần cập nhật",
      });
    }

    const currentDoc = rows[0];
    let relativeFilePath = currentDoc.file_url;
    let fileName = currentDoc.file_name;
    let fileSize = currentDoc.file_size;
    let fileType = currentDoc.file_type;

    // 2. Nếu người dùng chọn UPLOAD FILE MỚI
    if (newFile) {
      console.log("📎 Phát hiện File mới upload:");
      console.log("  - New Original Name :", newFile.originalname);
      console.log("  - New Saved Filename :", newFile.filename);
      console.log(
        "  - New File Size     :",
        `${(newFile.size / 1024).toFixed(2)} KB`,
      );

      // Xóa file cũ trên đĩa nếu tồn tại
      if (currentDoc.file_url) {
        const oldAbsolutePath = path.join(__dirname, "..", currentDoc.file_url);
        console.log("📁 Kiểm tra và xóa file cũ tại:", oldAbsolutePath);
        if (fs.existsSync(oldAbsolutePath)) {
          fs.unlinkSync(oldAbsolutePath);
          console.log("🗑️ [OLD FILE DELETED]: Đã xóa file cũ thành công!");
        }
      }

      // Cập nhật thông tin file mới
      relativeFilePath = `uploads/documents/${newFile.filename}`;
      fileName = newFile.originalname;
      fileSize = newFile.size;
      fileType = newFile.mimetype;
    } else {
      console.log(
        "ℹ️ Không có file mới, giữ nguyên file cũ:",
        currentDoc.file_name,
      );
    }

    // 3. Tạo slug mới từ title
    const slug = slugify(title || currentDoc.title, {
      lower: true,
      strict: true,
      locale: "vi",
    });

    // 4. Cập nhật vào CSDL MySQL
    await db.query(
      `
      UPDATE documents
      SET
        title = ?,
        slug = ?,
        description = ?,
        category = ?,
        file_name = ?,
        file_url = ?,
        file_size = ?,
        file_type = ?,
        is_featured = ?,
        updated_at = NOW()
      WHERE id = ?
    `,
      [
        title || currentDoc.title,
        slug,
        description !== undefined ? description : currentDoc.description,
        category || currentDoc.category,
        fileName,
        relativeFilePath,
        fileSize,
        fileType,
        is_featured !== undefined
          ? Number(is_featured)
          : currentDoc.is_featured,
        id,
      ],
    );

    console.log(`✅ [SUCCESS]: Đã cập nhật thành công tài liệu ID = ${id}`);
    console.log("=========================================\n");

    return res.json({
      success: true,
      message: "Cập nhật tài liệu thành công",
    });
  } catch (err) {
    console.error("❌ [ERROR - UPDATE DOCUMENT]:", err);
    console.log("=========================================\n");
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật tài liệu",
      error: err.message,
    });
  }
};
// 2. LẤY DANH SÁCH TÀI LIỆU (GET ALL DOCUMENTS)
exports.getDocuments = async (req, res) => {
  console.log("\n=========================================");
  console.log("📚 [GET ALL DOCUMENTS LOG]");
  console.log("⏰ Thời gian :", new Date().toLocaleString("vi-VN"));

  try {
    const [rows] = await db.query(`
      SELECT *
      FROM documents
      ORDER BY created_at DESC
    `);

    console.log(`✅ [SUCCESS]: Tìm thấy ${rows.length} tài liệu trong CSDL.`);
    console.log("=========================================\n");

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("❌ [ERROR - GET DOCUMENTS]:", err);
    console.log("=========================================\n");
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy danh sách tài liệu",
    });
  }
};

// 3. XEM CHI TIẾT TÀI LIỆU (GET DOCUMENT BY ID & INCREMENT VIEW)
exports.getDocumentById = async (req, res) => {
  const { id } = req.params;

  console.log("\n=========================================");
  console.log("🔍 [GET DOCUMENT BY ID LOG]");
  console.log("⏰ Thời gian  :", new Date().toLocaleString("vi-VN"));
  console.log("📌 Target ID  :", id);

  try {
    const [rows] = await db.query(`SELECT * FROM documents WHERE id = ?`, [id]);

    if (!rows.length) {
      console.warn(`⚠️ [WARN]: Không tìm thấy tài liệu có ID = ${id}`);
      console.log("=========================================\n");
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài liệu",
      });
    }

    // Tăng view_count
    await db.query(
      `UPDATE documents SET view_count = view_count + 1 WHERE id = ?`,
      [id],
    );

    const doc = rows[0];
    console.log("✅ [SUCCESS]: Lấy chi tiết tài liệu thành công:");
    console.log("  - Title     :", doc.title);
    console.log("  - Category  :", doc.category);
    console.log("  - View Count:", (doc.view_count || 0) + 1);
    console.log("=========================================\n");

    return res.json({
      success: true,
      data: { ...doc, view_count: (doc.view_count || 0) + 1 },
    });
  } catch (err) {
    console.error("❌ [ERROR - GET DOCUMENT BY ID]:", err);
    console.log("=========================================\n");
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi lấy chi tiết tài liệu",
    });
  }
};

// 4. TĂNG LƯỢT TẢI TÀI LIỆU (DOWNLOAD DOCUMENT)
exports.downloadDocument = async (req, res) => {
  const { id } = req.params;

  console.log("\n=========================================");
  console.log("📥 [DOWNLOAD DOCUMENT LOG]");
  console.log("⏰ Thời gian  :", new Date().toLocaleString("vi-VN"));
  console.log("📌 Target ID  :", id);

  try {
    const [result] = await db.query(
      `UPDATE documents SET download_count = download_count + 1 WHERE id = ?`,
      [id],
    );

    if (result.affectedRows === 0) {
      console.warn(
        `⚠️ [WARN]: Không cập nhật được download_count cho ID = ${id}`,
      );
    } else {
      console.log(
        `✅ [SUCCESS]: Đã tăng download_count cho tài liệu ID = ${id}`,
      );
    }
    console.log("=========================================\n");

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ [ERROR - DOWNLOAD DOCUMENT]:", err);
    console.log("=========================================\n");
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi cập nhật lượt tải",
    });
  }
};

// 5. XÓA TÀI LIỆU & XÓA FILE TRÊN Ổ ĐĨA (DELETE DOCUMENT)
exports.deleteDocument = async (req, res) => {
  const { id } = req.params;

  console.log("\n=========================================");
  console.log("🗑️ [DELETE DOCUMENT LOG]");
  console.log("⏰ Thời gian  :", new Date().toLocaleString("vi-VN"));
  console.log("📌 Target ID  :", id);

  try {
    // 1. Lấy thông tin file_url từ Database
    const [rows] = await db.query(
      `SELECT file_url, title FROM documents WHERE id = ?`,
      [id],
    );

    if (rows.length === 0) {
      console.warn(`⚠️ [WARN]: Tài liệu ID = ${id} không tồn tại trong CSDL.`);
      console.log("=========================================\n");
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài liệu để xóa",
      });
    }

    const doc = rows[0];
    console.log("📄 Tài liệu sẽ xóa:", doc.title);

    // 2. Xóa file vật lý trong thư mục uploads
    if (doc.file_url) {
      const absolutePath = path.join(__dirname, "..", doc.file_url);
      console.log("📁 Kiểm tra file vật lý tại:", absolutePath);

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log("🗑️ [FILE DELETED]: Đã xóa file vật lý thành công!");
      } else {
        console.warn(
          "⚠️ [FILE NOT FOUND]: File vật lý không tồn tại trên đĩa.",
        );
      }
    }

    // 3. Xóa bản ghi trong MySQL
    await db.query(`DELETE FROM documents WHERE id = ?`, [id]);
    console.log(`✅ [SUCCESS]: Đã xóa bản ghi ID = ${id} khỏi CSDL MySQL.`);
    console.log("=========================================\n");

    return res.json({
      success: true,
      message: "Đã xóa tài liệu và file đính kèm thành công",
    });
  } catch (err) {
    console.error("❌ [ERROR - DELETE DOCUMENT]:", err);
    console.log("=========================================\n");
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xóa tài liệu",
      error: err.message,
    });
  }
};

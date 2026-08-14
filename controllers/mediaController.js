const db = require("../config/db");
const fs = require("fs");
const path = require("path");

// =====================================================
// HELPER
// =====================================================

const deleteFile = (filePath) => {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Không thể xóa file:", filePath, error.message);
  }
};

// =====================================================
// GET ALL MEDIA
// =====================================================

exports.getAllMedia = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      category,
      status = "active",
      keyword,
    } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 100);

    const offset = (pageNumber - 1) * limitNumber;

    let where = [];
    let params = [];

    // STATUS
    if (status && status !== "all") {
      where.push("m.status = ?");
      params.push(status);
    }

    // TYPE
    if (type && ["audio", "video"].includes(type)) {
      where.push("m.type = ?");
      params.push(type);
    }

    // CATEGORY
    if (category && category !== "all") {
      where.push("m.category = ?");
      params.push(category);
    }

    // SEARCH
    if (keyword?.trim()) {
      where.push(`
        (
          m.title LIKE ?
          OR m.description LIKE ?
          OR m.author LIKE ?
          OR m.category LIKE ?
        )
      `);

      const search = `%${keyword.trim()}%`;

      params.push(search, search, search, search);
    }

    const whereSQL = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // TOTAL
    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM media m
      ${whereSQL}
      `,
      params,
    );

    const total = Number(countRows[0]?.total || 0);

    // DATA
    const [rows] = await db.query(
      `
      SELECT
        m.*,
        a.full_name AS uploader_name
      FROM media m
      LEFT JOIN admins a
        ON a.id = m.uploaded_by
      ${whereSQL}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limitNumber, offset],
    );

    res.json({
      success: true,

      data: rows,

      pagination: {
        current: pageNumber,
        pageSize: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("Lỗi lấy media:", error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách media",
      error: error.message,
    });
  }
};

// =====================================================
// GET MEDIA DETAIL
// =====================================================

exports.getMediaById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        m.*,
        a.full_name AS uploader_name
      FROM media m
      LEFT JOIN admins a
        ON a.id = m.uploaded_by
      WHERE m.id = ?
      LIMIT 1
      `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy media",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin media",
    });
  }
};

// =====================================================
// CREATE MEDIA
// =====================================================

exports.createMedia = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      category,
      author,
      duration = 0,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tiêu đề",
      });
    }

    if (!["audio", "video"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type phải là audio hoặc video",
      });
    }

    const mediaFile =
      type === "audio" ? req.files?.audio?.[0] : req.files?.video?.[0];

    if (!mediaFile) {
      return res.status(400).json({
        success: false,
        message:
          type === "audio"
            ? "Vui lòng upload file audio"
            : "Vui lòng upload file video",
      });
    }

    const thumbnailFile = req.files?.thumbnail?.[0];

    const relativeFilePath = path.relative(
      path.join(__dirname, ".."),
      mediaFile.path,
    );

    const fileUrl = `/uploads/media/${type}/${mediaFile.filename}`;

    const thumbnailUrl = thumbnailFile
      ? `/uploads/media/thumbnails/${thumbnailFile.filename}`
      : null;

    const [result] = await db.query(
      `
      INSERT INTO media (
        title,
        description,
        type,
        file_name,
        file_path,
        file_url,
        thumbnail_url,
        mime_type,
        file_size,
        duration,
        category,
        author,
        uploaded_by,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
      `,
      [
        title.trim(),
        description || null,
        type,
        mediaFile.originalname,
        relativeFilePath,
        fileUrl,
        thumbnailUrl,
        mediaFile.mimetype,
        mediaFile.size,
        Number(duration) || 0,
        category || null,
        author || null,
        req.user?.id || null,
      ],
    );

    res.status(201).json({
      success: true,

      message:
        type === "audio"
          ? "Upload audio thành công"
          : "Upload video thành công",

      data: {
        id: result.insertId,
        title,
        type,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl,
      },
    });
  } catch (error) {
    console.error("Lỗi tạo media:", error);

    // Xóa file nếu DB insert thất bại
    if (req.files) {
      Object.values(req.files)
        .flat()
        .forEach((file) => {
          deleteFile(file.path);
        });
    }

    res.status(500).json({
      success: false,
      message: "Không thể tạo media",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE MEDIA
// =====================================================

exports.updateMedia = async (req, res) => {
  try {
    const { id } = req.params;

    const { title, description, category, author, duration, status } = req.body;

    const [rows] = await db.query("SELECT * FROM media WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy media",
      });
    }

    const media = rows[0];

    let fileUrl = media.file_url;
    let filePath = media.file_path;
    let fileName = media.file_name;
    let mimeType = media.mime_type;
    let fileSize = media.file_size;

    const newFile =
      media.type === "audio" ? req.files?.audio?.[0] : req.files?.video?.[0];

    const thumbnailFile = req.files?.thumbnail?.[0];

    let thumbnailUrl = media.thumbnail_url;

    // =================================================
    // THAY FILE MEDIA
    // =================================================

    if (newFile) {
      deleteFile(path.join(__dirname, "..", media.file_path));

      const relativePath = path.relative(
        path.join(__dirname, ".."),
        newFile.path,
      );

      filePath = relativePath;

      fileName = newFile.originalname;

      fileUrl = `/uploads/media/${media.type}/${newFile.filename}`;

      mimeType = newFile.mimetype;

      fileSize = newFile.size;
    }

    // =================================================
    // THAY THUMBNAIL
    // =================================================

    if (thumbnailFile) {
      if (media.thumbnail_url) {
        const oldThumbnail = path.join(__dirname, "..", media.thumbnail_url);

        deleteFile(oldThumbnail);
      }

      thumbnailUrl = `/uploads/media/thumbnails/${thumbnailFile.filename}`;
    }

    await db.query(
      `
      UPDATE media
      SET
        title = ?,
        description = ?,
        category = ?,
        author = ?,
        duration = ?,
        status = ?,
        file_name = ?,
        file_path = ?,
        file_url = ?,
        thumbnail_url = ?,
        mime_type = ?,
        file_size = ?
      WHERE id = ?
      `,
      [
        title?.trim() || media.title,

        description !== undefined ? description : media.description,

        category !== undefined ? category : media.category,

        author !== undefined ? author : media.author,

        duration !== undefined ? Number(duration) || 0 : media.duration,

        status || media.status,

        fileName,
        filePath,
        fileUrl,
        thumbnailUrl,
        mimeType,
        fileSize,

        id,
      ],
    );

    res.json({
      success: true,
      message: "Cập nhật media thành công",
    });
  } catch (error) {
    console.error("Lỗi cập nhật media:", error);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật media",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE MEDIA
// =====================================================

exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query("SELECT * FROM media WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy media",
      });
    }

    const media = rows[0];

    // Xóa file chính
    deleteFile(path.join(__dirname, "..", media.file_path));

    // Xóa thumbnail
    if (media.thumbnail_url) {
      deleteFile(path.join(__dirname, "..", media.thumbnail_url));
    }

    await db.query("DELETE FROM media WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Xóa media thành công",
    });
  } catch (error) {
    console.error("Lỗi xóa media:", error);

    res.status(500).json({
      success: false,
      message: "Không thể xóa media",
      error: error.message,
    });
  }
};

// =====================================================
// INCREASE VIEW
// =====================================================

exports.increaseView = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      UPDATE media
      SET views = views + 1
      WHERE id = ?
      `,
      [id],
    );

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật lượt xem",
    });
  }
};

// =====================================================
// INCREASE DOWNLOAD
// =====================================================

exports.increaseDownload = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      UPDATE media
      SET downloads = downloads + 1
      WHERE id = ?
      `,
      [id],
    );

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật lượt tải",
    });
  }
};

// =====================================================
// GET CATEGORIES
// =====================================================

exports.getCategories = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        category,
        COUNT(*) AS total
      FROM media
      WHERE
        category IS NOT NULL
        AND category != ''
        AND status = 'active'
      GROUP BY category
      ORDER BY category ASC
      `,
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Không thể lấy danh mục",
    });
  }
};

exports.changeMediaStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Các trạng thái được phép
    const allowedStatus = ["published", "draft", "active", "hidden"];

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID media",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Thiếu trạng thái",
      });
    }

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Trạng thái không hợp lệ. Chỉ chấp nhận: published, draft, active, hidden",
      });
    }

    // Kiểm tra media có tồn tại không
    const [media] = await db.query(
      `
      SELECT id, title, status
      FROM media
      WHERE id = ?
      `,
      [id],
    );

    if (media.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy media",
      });
    }

    // Đổi trạng thái
    await db.query(
      `
      UPDATE media
      SET
        status = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [status, id],
    );

    return res.json({
      success: true,
      message: `Đã chuyển trạng thái sang ${status}`,
      data: {
        id: Number(id),
        title: media[0].title,
        oldStatus: media[0].status,
        status,
      },
    });
  } catch (error) {
    console.error("❌ CHANGE MEDIA STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đổi trạng thái media",
    });
  }
};

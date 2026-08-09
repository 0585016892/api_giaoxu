const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// 1. GET SETTINGS: Luôn trả về một object hợp lệ
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM settings WHERE id = 1 LIMIT 1",
    );
    // Luôn trả về 1 object đầy đủ dù trong DB có dữ liệu hay không
    const defaultSettings = {
      parish_name: "",
      diocese_code: null,
      parish_logo: "",
      email: "",
      phone: "",
      address: "",
      min_age_communion: 7,
      min_age_confirmation: 12,
      require_baptism_before_marriage: 0,
      facebook_url: "",
      youtube_url: "",
      website_url: "",
      sub_churches_tags: "",
      notification_enabled: 1,
      is_backup: 0,
    };
    res.json({ success: true, data: rows[0] || defaultSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/", async (req, res) => {
  try {
    const data = req.body;
    // Ép kiểu chắc chắn sang số (0 hoặc 1)
    const notification_enabled = data.notification_enabled ? 1 : 0;
    const require_baptism = data.require_baptism_before_marriage ? 1 : 0;
    const is_backup = data.is_backup ? 1 : 0;

    const [check] = await db.query("SELECT id FROM settings WHERE id = 1");
    const params = [
      data.parish_name,
      data.diocese_code,
      data.parish_logo,
      data.email,
      data.phone,
      data.address,
      data.min_age_communion || 7,
      data.min_age_confirmation || 12,
      require_baptism,
      data.facebook_url,
      data.youtube_url,
      data.website_url,
      data.sub_churches_tags,
      notification_enabled,
      is_backup,
    ];

    if (check.length === 0) {
      await db.query(
        "INSERT INTO settings (id, parish_name, diocese_code, parish_logo, email, phone, address, min_age_communion, min_age_confirmation, require_baptism_before_marriage, facebook_url, youtube_url, website_url, sub_churches_tags, notification_enabled, is_backup) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [1, ...params],
      );
    } else {
      await db.query(
        "UPDATE settings SET parish_name=?, diocese_code=?, parish_logo=?, email=?, phone=?, address=?, min_age_communion=?, min_age_confirmation=?, require_baptism_before_marriage=?, facebook_url=?, youtube_url=?, website_url=?, sub_churches_tags=?, notification_enabled=?, is_backup=? WHERE id=1",
        params,
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// 2. PUT: Cập nhật cấu hình
router.put("/", async (req, res) => {
  try {
    const data = req.body;

    // Chuẩn hóa dữ liệu: Đảm bảo Switch luôn là 1 hoặc 0
    const values = [
      data.parish_name || null,
      data.diocese_code || null,
      data.parish_logo || null,
      data.email || null,
      data.phone || null,
      data.address || null,
      data.min_age_communion ?? 7,
      data.min_age_confirmation ?? 12,
      data.require_baptism_before_marriage ? 1 : 0,
      data.facebook_url || null,
      data.youtube_url || null,
      data.website_url || null,
      data.sub_churches_tags || null,
      data.notification_enabled ? 1 : 0,
      data.is_backup ? 1 : 0,
    ];

    const [checkExists] = await db.query(
      "SELECT id FROM settings WHERE id = 1",
    );

    if (checkExists.length === 0) {
      await db.query(
        `INSERT INTO settings (id, parish_name, diocese_code, parish_logo, email, phone, address, min_age_communion, min_age_confirmation, require_baptism_before_marriage, facebook_url, youtube_url, website_url, sub_churches_tags, notification_enabled, is_backup) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, ...values],
      );
    } else {
      await db.query(
        `UPDATE settings SET parish_name=?, diocese_code=?, parish_logo=?, email=?, phone=?, address=?, min_age_communion=?, min_age_confirmation=?, require_baptism_before_marriage=?, facebook_url=?, youtube_url=?, website_url=?, sub_churches_tags=?, notification_enabled=?, is_backup=? WHERE id=1`,
        values,
      );
    }

    res.json({ success: true, message: "Cập nhật thành công" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. DOWNLOAD BACKUP
router.get("/backup/download", async (req, res) => {
  const dbConfig = {
    host: "localhost",
    user: "root",
    password: "",
    database: "prayer_db",
  };
  const fileName = `backup_${Date.now()}.sql`;
  const tempFilePath = path.join(__dirname, "../temp", fileName);

  if (!fs.existsSync(path.join(__dirname, "../temp")))
    fs.mkdirSync(path.join(__dirname, "../temp"));

  const dumpCommand = `/Applications/XAMPP/xamppfiles/bin/mysqldump -h ${dbConfig.host} -u ${dbConfig.user} ${dbConfig.database} > "${tempFilePath}"`;

  exec(dumpCommand, (error) => {
    if (error)
      return res
        .status(500)
        .json({ success: false, message: "Lỗi tạo file backup" });

    res.download(tempFilePath, fileName, () => {
      fs.unlink(tempFilePath, () => {}); // Xóa file sau khi gửi
    });
  });
});

module.exports = router;

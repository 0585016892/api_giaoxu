const cron = require("node-cron");
const { exec } = require("child_process");
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { writeLog } = require("../utils/activityLogger");

const executeBackup = async () => {
  try {
    // 1. Kiểm tra cấu hình
    const [settings] = await db.query(
      "SELECT is_backup FROM settings WHERE id = 1 LIMIT 1",
    );
    if (!settings[0] || settings[0].is_backup !== 1) return;

    // 2. Thiết lập đường dẫn
    const backupDir = path.join(__dirname, "../backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const fileName = `backup_${Date.now()}.sql`;
    const filePath = path.join(backupDir, fileName);

    const mysqldumpPath =
      process.platform === "darwin"
        ? "/Applications/XAMPP/xamppfiles/bin/mysqldump"
        : "mysqldump";
    const passArg = process.env.DB_PASSWORD
      ? `-p"${process.env.DB_PASSWORD}"`
      : "";
    const dumpCommand = `${mysqldumpPath} -h ${process.env.DB_HOST || "localhost"} -u ${process.env.DB_USER || "root"} ${passArg} ${process.env.DB_NAME || "prayer_db"} > "${filePath}"`;

    // 3. Thực thi Backup
    exec(dumpCommand, async (error, stdout, stderr) => {
      if (error) {
        console.error("[Backup Error]:", stderr);
        return;
      }

      console.log(`[Backup System] Thành công: ${fileName}`);

      // 4. Ghi log hệ thống (Thay vì req.user, dùng 'SYSTEM')
      try {
        await writeLog({
          admin_id: null, // Hệ thống tự động nên để null
          action: "AUTO_BACKUP",
          target_type: "database",
          target_id: 0,
          description: `Sao lưu tự động thành công file: ${fileName}`,
          ip_address: "127.0.0.1",
        });
      } catch (logErr) {
        console.error("Lỗi ghi log backup:", logErr);
      }
    });
  } catch (err) {
    console.error("[Backup System] Lỗi:", err.message);
  }
};

const initAutoBackup = () => {
  // Chạy 00:00 Chủ Nhật hàng tuần
  cron.schedule("0 0 * * 0", () => {
    executeBackup();
  });
  console.log("[Backup System] Đã kích hoạt cron job.");
};

module.exports = { initAutoBackup };

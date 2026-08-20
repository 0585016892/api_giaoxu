const UAParser = require("ua-parser-js");
const db = require("../config/db");
exports.trackVisitor = async (req, res) => {
  try {
    const {
      sessionId,
      pageUrl,
      screenWidth,
      screenHeight,
      language,
      timezone,
    } = req.body;

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;

    const userAgent = req.headers["user-agent"] || "";
    const referrer = req.headers.referer || "Direct";

    const parser = new UAParser(userAgent);

    const browserInfo = parser.getBrowser();
    const osInfo = parser.getOS();
    const deviceInfo = parser.getDevice();

    const browser = browserInfo.name || "Unknown";
    const browserVersion = browserInfo.version || "Unknown";
    const os = osInfo.name || "Unknown";
    const device = deviceInfo.type || "Desktop";

    const country = req.headers["cf-ipcountry"] || null;
    const region = req.headers["cf-region"] || null;
    const city = req.headers["cf-ipcity"] || null;

    console.log("\n========== TRACK VISITOR ==========");
    console.log("SESSION:", sessionId);
    console.log("PAGE:", pageUrl);
    console.log("IP:", ip);
    console.log("BROWSER:", browser);
    console.log("OS:", os);
    console.log("DEVICE:", device);

    // =====================================
    // Kiểm tra session trong ngày
    // =====================================

    const [rows] = await db.query(
      `
      SELECT id, visit_count
      FROM website_visitors
      WHERE session_id = ?
        AND page_url = ?
        AND DATE(created_at) = CURDATE()
      LIMIT 1
      `,
      [sessionId, pageUrl],
    );

    // =====================================
    // Đã tồn tại
    // =====================================

    if (rows.length > 0) {
      await db.query(
        `
        UPDATE website_visitors
        SET
          visit_count = visit_count + 1,
          page_url = ?,
          is_online = 1,
          last_seen = NOW(),
          updated_at = NOW(),
          screen_width = ?,
          screen_height = ?,
          language = ?,
          timezone = ?
        WHERE id = ?
        `,
        [pageUrl, screenWidth, screenHeight, language, timezone, rows[0].id],
      );

      console.log("UPDATE VISITOR:", rows[0].id);
    }

    // =====================================
    // Tạo mới
    // =====================================
    else {
      const [result] = await db.query(
        `
        INSERT INTO website_visitors (
          session_id,
          ip_address,
          user_agent,
          page_url,
          is_online,
          country,
          region,
          city,
          browser,
          browser_version,
          os_name,
          device_type,
          referrer,
          landing_page,
          visit_count,
          last_seen,
          screen_width,
          screen_height,
          language,
          timezone,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
        )
        `,
        [
          sessionId,
          ip,
          userAgent,
          pageUrl,
          1,
          country,
          region,
          city,
          browser,
          browserVersion,
          os,
          device,
          referrer,
          pageUrl,
          1,
          new Date(),
          screenWidth,
          screenHeight,
          language,
          timezone,
        ],
      );

      console.log("CREATE VISITOR:", result.insertId);
    }

    console.log("TRACK SUCCESS");
    console.log("=================================\n");

    return res.json({
      success: true,
    });
  } catch (err) {
    console.log("========== TRACK ERROR ==========");
    console.log(err);
    console.log("=================================");

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.getStats = async (req, res) => {
  try {
    // Tổng số người truy cập (mỗi IP chỉ tính 1)
    const [totalRows] = await db.query(`
      SELECT COUNT(DISTINCT ip_address) AS total
      FROM website_visitors
    `);

    // Số người truy cập hôm nay (mỗi IP chỉ tính 1)
    const [todayRows] = await db.query(`
      SELECT COUNT(DISTINCT ip_address) AS total
      FROM website_visitors
      WHERE DATE(created_at) = CURDATE()
    `);

    // Số người đang online (mỗi IP chỉ tính 1)
    const [onlineRows] = await db.query(`
      SELECT COUNT(DISTINCT ip_address) AS total
      FROM website_visitors
      WHERE last_seen >= NOW() - INTERVAL 5 MINUTE
    `);

    // Top trang được truy cập
    // Mỗi IP chỉ tính 1 lần / 1 trang
    const [pageRows] = await db.query(`
      SELECT
        page_url,
        COUNT(DISTINCT ip_address) AS total
      FROM website_visitors
      GROUP BY page_url
      ORDER BY total DESC
      LIMIT 10
    `);

    // Trình duyệt
    const [browserRows] = await db.query(`
      SELECT
        browser,
        COUNT(DISTINCT ip_address) AS total
      FROM website_visitors
      GROUP BY browser
    `);

    // Thiết bị
    const [deviceRows] = await db.query(`
      SELECT
        device_type,
        COUNT(DISTINCT ip_address) AS total
      FROM website_visitors
      GROUP BY device_type
    `);

    // Danh sách người truy cập
    // Lấy 1 record mới nhất của mỗi IP
    const [visitorRows] = await db.query(`
      SELECT w.*
      FROM website_visitors w
      INNER JOIN (
        SELECT
          ip_address,
          MAX(updated_at) AS max_updated_at
        FROM website_visitors
        GROUP BY ip_address
      ) latest
        ON w.ip_address = latest.ip_address
        AND w.updated_at = latest.max_updated_at
      ORDER BY w.updated_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,

      data: {
        totalVisitors: totalRows[0].total,
        todayVisitors: todayRows[0].total,
        onlineUsers: onlineRows[0].total,
        topPages: pageRows,
        browsers: browserRows,
        devices: deviceRows,
        visitors: visitorRows,
      },
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};
exports.getVisitorChart = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(DISTINCT ip_address) AS total
      FROM website_visitors
      WHERE DATE(created_at) >= CURDATE() - INTERVAL 6 DAY
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `);

    const dataMap = {};

    rows.forEach((row) => {
      dataMap[row.date] = Number(row.total);
    });

    const [dates] = await db.query(`
      SELECT
        DATE(CURDATE() - INTERVAL 6 DAY) AS d1,
        DATE(CURDATE() - INTERVAL 5 DAY) AS d2,
        DATE(CURDATE() - INTERVAL 4 DAY) AS d3,
        DATE(CURDATE() - INTERVAL 3 DAY) AS d4,
        DATE(CURDATE() - INTERVAL 2 DAY) AS d5,
        DATE(CURDATE() - INTERVAL 1 DAY) AS d6,
        CURDATE() AS d7
    `);

    const dateList = [
      dates[0].d1,
      dates[0].d2,
      dates[0].d3,
      dates[0].d4,
      dates[0].d5,
      dates[0].d6,
      dates[0].d7,
    ];

    const result = dateList.map((date) => ({
      date,
      total: dataMap[date] || 0,
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

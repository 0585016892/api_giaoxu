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
    const [totalRows] = await db.query(`
      SELECT COUNT(*) total
      FROM website_visitors
    `);

    const [todayRows] = await db.query(`
      SELECT COUNT(*) total
      FROM website_visitors
      WHERE DATE(created_at) = CURDATE()
    `);

    const [onlineRows] = await db.query(`
      SELECT COUNT(*) total
      FROM website_visitors
      WHERE last_seen >= NOW() - INTERVAL 5 MINUTE
    `);

    const [pageRows] = await db.query(`
      SELECT
        page_url,
        COUNT(*) total
      FROM website_visitors
      GROUP BY page_url
      ORDER BY total DESC
      LIMIT 10
    `);

    const [browserRows] = await db.query(`
      SELECT
        browser,
        COUNT(*) total
      FROM website_visitors
      GROUP BY browser
    `);

    const [deviceRows] = await db.query(`
      SELECT
        device_type,
        COUNT(*) total
      FROM website_visitors
      GROUP BY device_type
    `);

    const [visitorRows] = await db.query(`
      SELECT *
      FROM website_visitors
      ORDER BY updated_at DESC
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
        DATE(created_at) date,
        COUNT(*) total
      FROM website_visitors
      WHERE created_at >= CURDATE() - INTERVAL 6 DAY
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `);

    const result = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();

      date.setDate(date.getDate() - i);

      const key = date.toISOString().slice(0, 10);

      const row = rows.find(
        (item) => item.date.toISOString().slice(0, 10) === key,
      );

      result.push({
        date: key,
        total: row ? row.total : 0,
      });
    }

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

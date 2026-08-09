const db = require("../config/db");

// Helper hỗ trợ xuất dữ liệu dạng CSV (UTF-8 with BOM giúp Excel hiển thị tiếng Việt chuẩn)
const exportToCSV = (res, filename, data) => {
  if (!data || !data.length) {
    return res
      .status(404)
      .json({ success: false, message: "Không có dữ liệu để xuất báo cáo!" });
  }

  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) =>
    Object.values(row)
      .map((val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(","),
  );

  const csvContent = "\uFEFF" + [headers, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${filename}_${Date.now()}.csv`,
  );
  return res.status(200).send(csvContent);
};

// =========================================================================
// 1. THỐNG KÊ GIÁO XỨ / GIÁO HỌ (CHURCHES)
// =========================================================================
exports.getChurchStats = async (req, res) => {
  try {
    const { district, type, status, startDate, endDate } = req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (district) {
      whereClause += " AND district = ?";
      queryParams.push(district);
    }
    if (type) {
      whereClause += " AND type = ?";
      queryParams.push(type);
    }
    if (status !== undefined && status !== "") {
      whereClause += " AND is_active = ?";
      queryParams.push(Number(status));
    }
    if (startDate && endDate) {
      whereClause += " AND created_at BETWEEN ? AND ?";
      queryParams.push(startDate, endDate);
    }

    const [total] = await db.query(
      `SELECT COUNT(*) as total FROM churches ${whereClause}`,
      queryParams,
    );
    const [byType] = await db.query(
      `SELECT type as name, COUNT(*) as value FROM churches ${whereClause} GROUP BY type`,
      queryParams,
    );
    const [statusStats] = await db.query(
      `SELECT is_active, COUNT(*) as value FROM churches ${whereClause} GROUP BY is_active`,
      queryParams,
    );
    const [byDistrict] = await db.query(
      `SELECT district as name, COUNT(*) as value FROM churches ${whereClause} AND district IS NOT NULL GROUP BY district ORDER BY value DESC LIMIT 10`,
      queryParams,
    );
    const [createdByYear] = await db.query(
      `SELECT YEAR(created_at) as year, COUNT(*) as total FROM churches ${whereClause} GROUP BY YEAR(created_at) ORDER BY year ASC`,
      queryParams,
    );
    const [latest] = await db.query(
      `SELECT id, name, type, address, pastor_name, district, is_active, created_at FROM churches ${whereClause} ORDER BY created_at DESC LIMIT 10`,
      queryParams,
    );

    return res.json({
      success: true,
      data: {
        overview: { totalChurches: total[0].total },
        byType: byType.map((i) => ({
          name: i.name === "GIAO_XU" ? "Giáo xứ" : "Giáo họ",
          value: i.value,
        })),
        status: statusStats.map((i) => ({
          name: i.is_active === 1 ? "Đang hoạt động" : "Ngừng hoạt động",
          value: i.value,
        })),
        byDistrict,
        createdByYear,
        latest,
      },
    });
  } catch (err) {
    console.error("CHURCH STATS ERROR:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Lỗi máy chủ khi lấy thống kê giáo xứ",
      });
  }
};

// =========================================================================
// 2. THỐNG KÊ KHO TÀI LIỆU (DOCUMENTS)
// =========================================================================
exports.getDocumentStats = async (req, res) => {
  try {
    const { category, status, file_type, startDate, endDate } = req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (category) {
      whereClause += " AND category = ?";
      queryParams.push(category);
    }
    if (status) {
      whereClause += " AND status = ?";
      queryParams.push(status);
    }
    if (file_type) {
      whereClause += " AND file_type = ?";
      queryParams.push(file_type);
    }
    if (startDate && endDate) {
      whereClause += " AND created_at BETWEEN ? AND ?";
      queryParams.push(startDate, endDate);
    }

    const [totalRows] = await db.query(
      `SELECT COUNT(*) as total FROM documents ${whereClause}`,
      queryParams,
    );
    const [sizeRows] = await db.query(
      `SELECT SUM(file_size) as totalSize FROM documents ${whereClause}`,
      queryParams,
    );
    const [byStatus] = await db.query(
      `SELECT status as name, COUNT(*) as value FROM documents ${whereClause} GROUP BY status`,
      queryParams,
    );
    const [byCategory] = await db.query(
      `SELECT category as name, COUNT(*) as value FROM documents ${whereClause} AND category IS NOT NULL GROUP BY category ORDER BY value DESC`,
      queryParams,
    );
    const [monthRows] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%m/%Y') as month, COUNT(*) as total FROM documents ${whereClause} GROUP BY DATE_FORMAT(created_at, '%m/%Y') ORDER BY MIN(created_at) ASC`,
      queryParams,
    );
    const [fileTypes] = await db.query(
      `SELECT file_type as name, COUNT(*) as value FROM documents ${whereClause} GROUP BY file_type ORDER BY value DESC`,
      queryParams,
    );
    const [topViews] = await db.query(
      `SELECT id, title, view_count, download_count, category FROM documents ${whereClause} ORDER BY view_count DESC LIMIT 10`,
      queryParams,
    );
    const [topDownloads] = await db.query(
      `SELECT id, title, view_count, download_count, category FROM documents ${whereClause} ORDER BY download_count DESC LIMIT 10`,
      queryParams,
    );

    return res.json({
      success: true,
      data: {
        overview: {
          totalDocuments: totalRows[0].total,
          totalSize: sizeRows[0].totalSize || 0,
        },
        byStatus,
        byCategory,
        createdByMonth: monthRows,
        fileTypes,
        topViews,
        topDownloads,
      },
    });
  } catch (err) {
    console.error("DOCUMENT STATS ERROR:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Lỗi máy chủ khi lấy thống kê tài liệu",
      });
  }
};

// =========================================================================
// 3. THỐNG KÊ SỰ KIỆN MỤC VỤ (EVENTS)
// =========================================================================
exports.getEventStats = async (req, res) => {
  try {
    const { category, location, is_active, startDate, endDate } = req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (category) {
      whereClause += " AND category = ?";
      queryParams.push(category);
    }
    if (location) {
      whereClause += " AND location LIKE ?";
      queryParams.push(`%${location}%`);
    }
    if (is_active !== undefined && is_active !== "") {
      whereClause += " AND is_active = ?";
      queryParams.push(Number(is_active));
    }
    if (startDate && endDate) {
      whereClause += " AND event_date BETWEEN ? AND ?";
      queryParams.push(startDate, endDate);
    }

    const [totalRows] = await db.query(
      `SELECT COUNT(*) as total FROM events ${whereClause}`,
      queryParams,
    );
    const [pastRows] = await db.query(
      `SELECT COUNT(*) as total FROM events ${whereClause} AND event_date < CURDATE()`,
      queryParams,
    );
    const [categories] = await db.query(
      `SELECT category as name, COUNT(*) as value FROM events ${whereClause} AND category IS NOT NULL GROUP BY category ORDER BY value DESC`,
      queryParams,
    );
    const [monthRows] = await db.query(
      `SELECT DATE_FORMAT(event_date, '%m/%Y') as month, COUNT(*) as total FROM events ${whereClause} GROUP BY DATE_FORMAT(event_date, '%m/%Y') ORDER BY MIN(event_date) ASC`,
      queryParams,
    );
    const [upcoming] = await db.query(
      `SELECT id, title, event_date, event_time, location, category FROM events ${whereClause} AND event_date >= CURDATE() ORDER BY event_date ASC LIMIT 10`,
      queryParams,
    );
    const [latest] = await db.query(
      `SELECT id, title, event_date, location, category, created_at FROM events ${whereClause} ORDER BY created_at DESC LIMIT 10`,
      queryParams,
    );

    return res.json({
      success: true,
      data: {
        overview: {
          totalEvents: totalRows[0].total,
          pastEvents: pastRows[0].total,
        },
        categories,
        createdByMonth: monthRows,
        upcoming,
        latest,
      },
    });
  } catch (err) {
    console.error("EVENT STATS ERROR:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Lỗi máy chủ khi lấy thống kê sự kiện",
      });
  }
};

// =========================================================================
// 4. THỐNG KÊ KẾT QUẢ THI GIÁO LÝ (EXAM RESULTS)
// =========================================================================
exports.getExamResultStats = async (req, res) => {
  try {
    const { class_name, parish, minScore, maxScore, startDate, endDate } =
      req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (class_name) {
      whereClause += " AND class_name = ?";
      queryParams.push(class_name);
    }
    if (parish) {
      whereClause += " AND parish = ?";
      queryParams.push(parish);
    }
    if (minScore !== undefined && maxScore !== undefined) {
      whereClause += " AND score BETWEEN ? AND ?";
      queryParams.push(Number(minScore), Number(maxScore));
    }
    if (startDate && endDate) {
      whereClause += " AND submitted_at BETWEEN ? AND ?";
      queryParams.push(startDate, endDate);
    }

    const [totalRows] = await db.query(
      `SELECT COUNT(*) as total FROM exam_results ${whereClause}`,
      queryParams,
    );
    const [studentRows] = await db.query(
      `SELECT COUNT(DISTINCT full_name) as total FROM exam_results ${whereClause}`,
      queryParams,
    );
    const [avgRows] = await db.query(
      `SELECT AVG(score) as avgScore FROM exam_results ${whereClause}`,
      queryParams,
    );

    const [passStatus] = await db.query(
      `
      SELECT 
        CASE WHEN score >= 50 THEN 'Đạt' ELSE 'Chưa đạt' END as name,
        COUNT(*) as value
      FROM exam_results ${whereClause}
      GROUP BY name
    `,
      queryParams,
    );

    const [scoreDistribution] = await db.query(
      `
      SELECT 
        CASE 
          WHEN score >= 90 THEN '90-100'
          WHEN score >= 80 THEN '80-89'
          WHEN score >= 70 THEN '70-79'
          WHEN score >= 60 THEN '60-69'
          WHEN score >= 50 THEN '50-59'
          ELSE '<50'
        END as name,
        COUNT(*) as value
      FROM exam_results ${whereClause}
      GROUP BY name ORDER BY name DESC
    `,
      queryParams,
    );

    const [topStudents] = await db.query(
      `
      SELECT full_name, class_name, parish, score, correct_answers, total_questions, submitted_at
      FROM exam_results ${whereClause}
      ORDER BY score DESC LIMIT 10
    `,
      queryParams,
    );

    return res.json({
      success: true,
      data: {
        overview: {
          totalExams: totalRows[0].total,
          totalStudents: studentRows[0].total,
          averageScore: Number(avgRows[0].avgScore || 0).toFixed(2),
        },
        passStatus,
        scoreDistribution,
        topStudents,
      },
    });
  } catch (err) {
    console.error("EXAM STATS ERROR:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi thống kê thi giáo lý" });
  }
};

// =========================================================================
// 5. THỐNG KÊ GIÁO DÂN (PARISHIONERS)
// =========================================================================
exports.getParishionerStats = async (req, res) => {
  try {
    const { church_id, gender, marital_status, occupation, status } = req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (church_id) {
      whereClause += " AND p.churches_id = ?";
      queryParams.push(church_id);
    }
    if (gender) {
      whereClause += " AND p.gender = ?";
      queryParams.push(gender);
    }
    if (marital_status) {
      whereClause += " AND p.marital_status = ?";
      queryParams.push(marital_status);
    }
    if (occupation) {
      whereClause += " AND p.occupation = ?";
      queryParams.push(occupation);
    }
    if (status) {
      whereClause += " AND p.status = ?";
      queryParams.push(status);
    }

    const [total] = await db.query(
      `SELECT COUNT(*) as total FROM parishioners p ${whereClause}`,
      queryParams,
    );
    const [genderStats] = await db.query(
      `SELECT gender, COUNT(*) as total FROM parishioners p ${whereClause} GROUP BY gender`,
      queryParams,
    );
    const [maritalStats] = await db.query(
      `SELECT marital_status, COUNT(*) as total FROM parishioners p ${whereClause} GROUP BY marital_status`,
      queryParams,
    );

    const [ageStats] = await db.query(
      `
      SELECT 
        CASE 
          WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) < 18 THEN 'Dưới 18'
          WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 18 AND 35 THEN '18 - 35'
          WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 36 AND 60 THEN '36 - 60'
          ELSE 'Trên 60'
        END AS age_group,
        COUNT(*) as total
      FROM parishioners p ${whereClause} AND date_of_birth IS NOT NULL
      GROUP BY age_group
    `,
      queryParams,
    );

    const [sacrament] = await db.query(
      `
      SELECT 
        SUM(baptism_date IS NOT NULL) as baptism,
        SUM(confirmation_date IS NOT NULL) as confirmation,
        SUM(first_communion_date IS NOT NULL) as communion
      FROM parishioners p ${whereClause}
    `,
      queryParams,
    );

    return res.json({
      success: true,
      data: {
        total: total[0].total,
        gender: genderStats,
        marital: maritalStats,
        age: ageStats,
        sacrament: sacrament[0],
      },
    });
  } catch (err) {
    console.error("PARISHIONER STAT ERROR:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi thống kê giáo dân" });
  }
};

// =========================================================================
// 6. THỐNG KÊ LỊCH PHỤNG VỤ (LITURGICAL)
// =========================================================================
exports.getLiturgicalStats = async (req, res) => {
  try {
    const { church_name, priest, type, year, month } = req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (church_name) {
      whereClause += " AND church_name LIKE ?";
      queryParams.push(`%${church_name}%`);
    }
    if (priest) {
      whereClause += " AND priest LIKE ?";
      queryParams.push(`%${priest}%`);
    }
    if (type) {
      whereClause += " AND type = ?";
      queryParams.push(type);
    }
    if (year) {
      whereClause += " AND YEAR(event_date) = ?";
      queryParams.push(year);
    }
    if (month) {
      whereClause += " AND MONTH(event_date) = ?";
      queryParams.push(month);
    }

    const [total] = await db.query(
      `SELECT COUNT(*) as total FROM liturgical_events ${whereClause}`,
      queryParams,
    );
    const [churchStats] = await db.query(
      `SELECT church_name, COUNT(*) as total FROM liturgical_events ${whereClause} AND church_name IS NOT NULL GROUP BY church_name ORDER BY total DESC`,
      queryParams,
    );
    const [priestStats] = await db.query(
      `SELECT priest, COUNT(*) as total FROM liturgical_events ${whereClause} AND priest IS NOT NULL GROUP BY priest ORDER BY total DESC`,
      queryParams,
    );
    const [typeStats] = await db.query(
      `SELECT type, COUNT(*) as total FROM liturgical_events ${whereClause} GROUP BY type`,
      queryParams,
    );

    return res.json({
      success: true,
      data: {
        total: total[0].total,
        church: churchStats,
        priest: priestStats,
        type: typeStats,
      },
    });
  } catch (err) {
    console.error("LITURGICAL STAT ERROR:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi thống kê lịch phụng vụ" });
  }
};

// =========================================================================
// 7. THỐNG KÊ LƯỢT TRUY CẬP WEBSITE (VISITORS)
// =========================================================================
exports.getVisitorStats = async (req, res) => {
  try {
    const { startDate, endDate, device_type, browser } = req.query;

    let whereClause = "WHERE 1=1";
    let queryParams = [];

    if (device_type) {
      whereClause += " AND device_type = ?";
      queryParams.push(device_type);
    }
    if (browser) {
      whereClause += " AND browser = ?";
      queryParams.push(browser);
    }
    if (startDate && endDate) {
      whereClause += " AND created_at BETWEEN ? AND ?";
      queryParams.push(startDate, endDate);
    }

    const [totalViews] = await db.query(
      `SELECT SUM(visit_count) as total FROM website_visitors ${whereClause}`,
      queryParams,
    );
    const [totalUsers] = await db.query(
      `SELECT COUNT(*) as total FROM website_visitors ${whereClause}`,
      queryParams,
    );
    const [today] = await db.query(
      `SELECT COUNT(*) as total FROM website_visitors ${whereClause} AND DATE(created_at) = CURDATE()`,
      queryParams,
    );
    const [online] = await db.query(
      `SELECT COUNT(*) as total FROM website_visitors ${whereClause} AND updated_at >= NOW() - INTERVAL 5 MINUTE`,
      queryParams,
    );
    const [pages] = await db.query(
      `SELECT page_url, SUM(visit_count) as total FROM website_visitors ${whereClause} GROUP BY page_url ORDER BY total DESC LIMIT 10`,
      queryParams,
    );
    const [device] = await db.query(
      `SELECT device_type, COUNT(*) as total FROM website_visitors ${whereClause} GROUP BY device_type`,
      queryParams,
    );

    return res.json({
      success: true,
      data: {
        totalViews: totalViews[0].total || 0,
        totalUsers: totalUsers[0].total,
        todayVisitors: today[0].total,
        onlineUsers: online[0].total,
        pages,
        device,
      },
    });
  } catch (err) {
    console.error("VISITOR STAT ERROR:", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi thống kê lượt truy cập" });
  }
};

// =========================================================================
// 8. API XUẤT BÁO CÁO (EXPORT CSV / EXCEL FILE)
// =========================================================================
exports.exportReport = async (req, res) => {
  try {
    const { type } = req.params;

    if (type === "church") {
      const [data] = await db.query(
        `SELECT id, name, type, address, pastor_name, district, is_active, created_at FROM churches ORDER BY created_at DESC`,
      );
      return exportToCSV(res, "Bao_Cao_Giao_Xu", data);
    }

    if (type === "document") {
      const [data] = await db.query(
        `SELECT id, title, category, file_type, file_size, view_count, download_count, status, created_at FROM documents ORDER BY created_at DESC`,
      );
      return exportToCSV(res, "Bao_Cao_Tai_Lieu", data);
    }

    if (type === "event") {
      const [data] = await db.query(
        `SELECT id, title, category, event_date, location, is_active, created_at FROM events ORDER BY event_date DESC`,
      );
      return exportToCSV(res, "Bao_Cao_Su_Kien", data);
    }

    if (type === "exam") {
      const [data] = await db.query(
        `SELECT id, full_name, class_name, parish, score, correct_answers, total_questions, submitted_at FROM exam_results ORDER BY submitted_at DESC`,
      );
      return exportToCSV(res, "Bao_Cao_Ket_Qua_Thi", data);
    }

    if (type === "parishioner") {
      const [data] = await db.query(
        `SELECT id, full_name, holy_name, gender, date_of_birth, marital_status, occupation, phone, status FROM parishioners ORDER BY id DESC`,
      );
      return exportToCSV(res, "Bao_Cao_Giao_Dan", data);
    }

    if (type === "liturgical") {
      const [data] = await db.query(
        `SELECT id, title, type, event_date, church_name, priest, created_at FROM liturgical_events ORDER BY event_date DESC`,
      );
      return exportToCSV(res, "Bao_Cao_Lich_Phung_Vu", data);
    }

    if (type === "visitor") {
      const [data] = await db.query(
        `SELECT id, ip_address, country, city, device_type, browser, page_url, visit_count, created_at FROM website_visitors ORDER BY id DESC LIMIT 1000`,
      );
      return exportToCSV(res, "Bao_Cao_Truy_Cap_Website", data);
    }

    return res
      .status(400)
      .json({ success: false, message: "Loại báo cáo không hợp lệ!" });
  } catch (err) {
    console.error("EXPORT REPORT ERROR:", err);
    return res
      .status(500)
      .json({ success: false, message: "Không thể xuất file báo cáo!" });
  }
};

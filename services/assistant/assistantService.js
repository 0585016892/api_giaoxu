// ============================================================
// FAITHEDU - ASSISTANT SERVICE - PHASE 5
// ============================================================

const {
  searchStudents,
  getStudentDetail,

  searchClasses,
  getClassDetail,

  getAttendanceSummary,
  getAttendanceStudents,

  getMonthlyAttendanceStatistics,

  getStudentAttendanceHistory,
  getStudentAttendanceRanking,

  getClassAttendanceRanking,
  compareClasses,

  getParishStatistics,

  getStudentsNeedingAttention,

  getUnassignedStudents,

  getAttendanceAnomalies,

  normalizeText,
} = require("./assistantTools");

// ============================================================
// DATE
// ============================================================

function formatDateISO(date) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDate() {
  return formatDateISO(new Date());
}

function getYesterdayDate() {
  const date = new Date();

  date.setDate(date.getDate() - 1);

  return formatDateISO(date);
}

function getCurrentMonthRange() {
  const now = new Date();

  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: formatDateISO(start),

    endDate: formatDateISO(end),
  };
}

function getPreviousMonthRange() {
  const now = new Date();

  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const end = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    startDate: formatDateISO(start),

    endDate: formatDateISO(end),
  };
}

// ============================================================
// DATE FORMAT - ROBUST
// ============================================================

function formatDateVN(date) {
  if (date === null || date === undefined || date === "") {
    return "Chưa cập nhật";
  }

  try {
    if (date instanceof Date) {
      if (Number.isNaN(date.getTime())) {
        return "Chưa cập nhật";
      }

      return [
        String(date.getDate()).padStart(2, "0"),

        String(date.getMonth() + 1).padStart(2, "0"),

        date.getFullYear(),
      ].join("/");
    }

    const value = String(date).trim();

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return "Chưa cập nhật";
    }

    return [
      String(parsed.getDate()).padStart(2, "0"),

      String(parsed.getMonth() + 1).padStart(2, "0"),

      parsed.getFullYear(),
    ].join("/");
  } catch {
    return "Chưa cập nhật";
  }
}

function formatTimeVN(value) {
  if (!value) {
    return "";
  }

  const text = String(value);

  const match = text.match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return text;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

// ============================================================
// GENDER / STATUS
// ============================================================

function formatGenderVN(gender) {
  if (!gender) {
    return "Chưa cập nhật";
  }

  const value = normalizeText(gender);

  const map = {
    male: "Nam",
    female: "Nữ",
    other: "Khác",
    nam: "Nam",
    nu: "Nữ",
    khac: "Khác",
  };

  return map[value] || gender;
}

function formatStudentStatusVN(status) {
  if (!status) {
    return "Chưa cập nhật";
  }

  const value = normalizeText(status);

  const map = {
    active: "Đang học",
    inactive: "Ngừng học",
    graduated: "Đã tốt nghiệp",
    transferred: "Đã chuyển trường",
  };

  return map[value] || status;
}

// ============================================================
// DATE DETECTION
// ============================================================

function detectDate(message) {
  const original = String(message || "");

  const normalized = normalizeText(original);

  if (normalized.includes("hom nay")) {
    return getTodayDate();
  }

  if (normalized.includes("hom qua")) {
    return getYesterdayDate();
  }

  const isoMatch = original.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (isoMatch) {
    return isoMatch[0];
  }

  const vnMatch = original.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  if (vnMatch) {
    return `${vnMatch[3]}-${vnMatch[2].padStart(2, "0")}-${vnMatch[1].padStart(
      2,
      "0",
    )}`;
  }

  return null;
}

// ============================================================
// MONTH
// ============================================================

function detectMonthRange(message) {
  const normalized = normalizeText(message);

  if (normalized.includes("thang nay")) {
    return getCurrentMonthRange();
  }

  if (normalized.includes("thang truoc")) {
    return getPreviousMonthRange();
  }

  const match = normalized.match(/\bthang\s+(\d{1,2})(?:\/|-|\s+)(\d{4})\b/);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);

  const year = Number(match[2]);

  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return null;
  }

  const start = new Date(year, month - 1, 1);

  const end = new Date(year, month, 0);

  return {
    startDate: formatDateISO(start),

    endDate: formatDateISO(end),
  };
}

// ============================================================
// RANGE DETECTION
// ============================================================

function detectRange(message) {
  const normalized = normalizeText(message);

  const month = detectMonthRange(message);

  if (month) {
    return month;
  }

  if (
    normalized.includes("7 ngay qua") ||
    normalized.includes("7 ngay gan day")
  ) {
    const end = new Date();

    const start = new Date();

    start.setDate(start.getDate() - 6);

    return {
      startDate: formatDateISO(start),

      endDate: formatDateISO(end),
    };
  }

  if (
    normalized.includes("30 ngay qua") ||
    normalized.includes("30 ngay gan day")
  ) {
    const end = new Date();

    const start = new Date();

    start.setDate(start.getDate() - 29);

    return {
      startDate: formatDateISO(start),

      endDate: formatDateISO(end),
    };
  }

  const date = detectDate(message);

  if (date) {
    return {
      startDate: date,
      endDate: date,
    };
  }

  return null;
}

// ============================================================
// ATTENDANCE TYPE
// ============================================================

function detectAttendanceType(message) {
  const normalized = normalizeText(message);

  if (
    normalized.includes("thanh le") ||
    normalized.includes("di le") ||
    normalized.includes("tham du le") ||
    normalized.includes("mass")
  ) {
    return "mass";
  }

  return "catechism";
}

// ============================================================
// STATUS
// ============================================================

function detectAttendanceStatus(message) {
  const normalized = normalizeText(message);

  if (
    normalized.includes("chua diem danh") ||
    normalized.includes("chua duoc diem danh") ||
    normalized.includes("khong diem danh")
  ) {
    return "not_attended";
  }

  if (normalized.includes("vang co phep") || normalized.includes("co phep")) {
    return "excused";
  }

  if (normalized.includes("di tre") || normalized.includes("tre gio")) {
    return "late";
  }

  if (normalized.includes("vang") || normalized.includes("nghi")) {
    return "absent";
  }

  if (normalized.includes("co mat") || normalized.includes("di hoc")) {
    return "present";
  }

  return "all";
}

// ============================================================
// CLASS KEYWORD
// ============================================================

function extractClassKeyword(message) {
  const text = normalizeText(message);

  const match = text.match(
    /\blop\s+(.+?)(?=\s+(hom nay|hom qua|ngay|co|bao nhieu|vang|nghi|di tre|chua|diem danh|thang|danh sach|nhung ai|ai|chuyen can|the nao)\b|$)/,
  );

  if (match?.[1]) {
    return match[1].trim();
  }

  return "";
}

// ============================================================
// STUDENT KEYWORD
// ============================================================

function extractStudentKeyword(message) {
  let text = normalizeText(message);

  const prefixes = [
    "cho toi biet thong tin chi tiet hoc sinh",
    "cho toi thong tin chi tiet hoc sinh",
    "thong tin chi tiet hoc sinh",
    "thong tin hoc sinh",
    "thong tin ve hoc sinh",
    "tim hoc sinh",
    "tim em",
    "tra cuu hoc sinh",
    "tra cuu em",
    "cho toi thong tin",
    "thong tin",
    "hoc sinh",
  ];

  for (const prefix of prefixes) {
    if (text.startsWith(`${prefix} `)) {
      text = text.slice(prefix.length).trim();

      break;
    }
  }

  text = text
    .replace(/\b(hom nay|hom qua|diem danh|chi tiet|thong tin chi tiet)\b/g, "")
    .trim();

  return text;
}

// ============================================================
// RESOLVE CLASS
// ============================================================

async function resolveClassFromMessage({ user, message }) {
  const keyword = extractClassKeyword(message);

  if (!keyword) {
    return null;
  }

  const classes = await searchClasses({
    user,
    keyword,
    limit: 10,
  });

  if (!classes.length) {
    return null;
  }

  const normalized = normalizeText(keyword);

  const exact = classes.find((item) => normalizeText(item.name) === normalized);

  if (exact) {
    return exact;
  }

  const exactCode = classes.find(
    (item) => normalizeText(item.code) === normalized,
  );

  if (exactCode) {
    return exactCode;
  }

  if (classes.length === 1) {
    return classes[0];
  }

  return {
    multiple: true,
    classes,
  };
}

// ============================================================
// INTENT
// ============================================================

function detectIntent(message) {
  const normalized = normalizeText(message);

  // ----------------------------------------------------------
  // HELP
  // ----------------------------------------------------------

  if (
    normalized === "help" ||
    normalized.includes("huong dan") ||
    normalized.includes("lam the nao")
  ) {
    return "help";
  }

  // ----------------------------------------------------------
  // ANOMALY
  // ----------------------------------------------------------

  if (
    normalized.includes("bat thuong") ||
    normalized.includes("du lieu loi") ||
    normalized.includes("trung diem danh") ||
    normalized.includes("duplicate")
  ) {
    return "attendance_anomalies";
  }

  // ----------------------------------------------------------
  // UNASSIGNED
  // ----------------------------------------------------------

  if (
    normalized.includes("chua phan lop") ||
    normalized.includes("khong phan lop") ||
    normalized.includes("chua duoc phan lop")
  ) {
    return "unassigned_students";
  }

  // ----------------------------------------------------------
  // NEED ATTENTION
  // ----------------------------------------------------------

  if (
    normalized.includes("can luu y") ||
    normalized.includes("can quan tam") ||
    normalized.includes("nghi nhieu") ||
    normalized.includes("chuyen can thap") ||
    normalized.includes("duoi 70")
  ) {
    return "students_needing_attention";
  }

  // ----------------------------------------------------------
  // PARISH STATISTICS
  // ----------------------------------------------------------

  if (
    (normalized.includes("tong quan") ||
      normalized.includes("toan giao xu") ||
      normalized.includes("giao xu co bao nhieu")) &&
    !normalized.includes("lop")
  ) {
    return "parish_statistics";
  }

  // ----------------------------------------------------------
  // STUDENT HISTORY
  // ----------------------------------------------------------

  if (
    normalized.includes("lich su diem danh") ||
    normalized.includes("lich su di hoc") ||
    normalized.includes("thang nay nghi") ||
    normalized.includes("nghi nhung ngay nao") ||
    normalized.includes("di tre nhung ngay nao")
  ) {
    return "student_attendance_history";
  }

  // ----------------------------------------------------------
  // RANKING STUDENTS
  // ----------------------------------------------------------

  if (
    normalized.includes("ai nghi nhieu nhat") ||
    normalized.includes("nhung em nghi nhieu") ||
    normalized.includes("hoc sinh nghi nhieu") ||
    normalized.includes("xep hang hoc sinh")
  ) {
    return "student_attendance_ranking";
  }

  // ----------------------------------------------------------
  // CLASS COMPARISON
  // ----------------------------------------------------------

  if (normalized.includes("so sanh") && normalized.includes("lop")) {
    return "class_comparison";
  }

  // ----------------------------------------------------------
  // CLASS RANKING
  // ----------------------------------------------------------

  if (
    normalized.includes("lop nao") &&
    (normalized.includes("chuyen can") ||
      normalized.includes("tot nhat") ||
      normalized.includes("vang nhieu"))
  ) {
    return "class_attendance_ranking";
  }

  // ----------------------------------------------------------
  // ATTENDANCE
  // ----------------------------------------------------------

  const attendanceWords = [
    "diem danh",
    "vang",
    "nghi",
    "di tre",
    "co mat",
    "chua diem danh",
    "di hoc",
    "thanh le",
    "di le",
    "chuyen can",
  ];

  if (attendanceWords.some((word) => normalized.includes(word))) {
    if (
      normalized.includes("thang") ||
      normalized.includes("tuan") ||
      normalized.includes("ngay qua") ||
      normalized.includes("chuyen can")
    ) {
      return "attendance_period_statistics";
    }

    if (
      normalized.includes("nhung ai") ||
      normalized.includes("ai") ||
      normalized.includes("danh sach") ||
      normalized.includes("em nao")
    ) {
      return "attendance_students";
    }

    return "attendance_summary";
  }

  // ----------------------------------------------------------
  // STUDENT DETAIL
  // ----------------------------------------------------------

  if (normalized.includes("thong tin") && normalized.includes("hoc sinh")) {
    return "student_detail";
  }

  if (normalized.includes("thong tin")) {
    return "student_detail";
  }

  // ----------------------------------------------------------
  // STUDENT SEARCH
  // ----------------------------------------------------------

  if (
    normalized.includes("tim hoc sinh") ||
    normalized.includes("tim em") ||
    normalized.includes("hoc sinh")
  ) {
    return "student_search";
  }

  // ----------------------------------------------------------
  // CLASS
  // ----------------------------------------------------------

  if (normalized.includes("lop")) {
    return "class_detail";
  }

  return "unknown";
}

// ============================================================
// RESPONSES
// ============================================================

function buildStudentDetailResponse(student) {
  if (!student) {
    return "Mình không tìm thấy học sinh phù hợp.";
  }

  const lines = [
    "👤 **THÔNG TIN HỌC SINH**",
    "",
    `**${student.name}**`,
    "",
    `- Mã học sinh: **${student.code || "Chưa có"}**`,
    `- Giới tính: **${formatGenderVN(student.gender)}**`,
    `- Ngày sinh: **${formatDateVN(student.date_of_birth)}**`,
    `- Trạng thái: **${formatStudentStatusVN(student.status)}**`,
    "",
    "### Lớp học",
  ];

  if (Array.isArray(student.classes) && student.classes.length) {
    student.classes.forEach((item) => {
      lines.push(`- ${item.name}${item.code ? ` (${item.code})` : ""}`);
    });
  } else if (student.class_names) {
    lines.push(`- ${student.class_names}`);
  } else {
    lines.push("- Chưa được phân lớp");
  }

  lines.push("");
  lines.push("### Phụ huynh");

  lines.push(`- Cha: **${student.father_name || "Chưa cập nhật"}**`);

  if (student.father_phone) {
    lines.push(`- SĐT cha: **${student.father_phone}**`);
  }

  lines.push(`- Mẹ: **${student.mother_name || "Chưa cập nhật"}**`);

  if (student.mother_phone) {
    lines.push(`- SĐT mẹ: **${student.mother_phone}**`);
  }

  return lines.join("\n");
}

function buildStudentSearchResponse(students) {
  if (!students?.length) {
    return [
      "🔎 **KHÔNG TÌM THẤY HỌC SINH**",
      "",
      "Không tìm thấy học sinh phù hợp trong giáo xứ.",
    ].join("\n");
  }

  if (students.length === 1) {
    return buildStudentDetailResponse(students[0]);
  }

  return [
    "🔎 **KẾT QUẢ TÌM KIẾM**",
    "",
    `Tìm thấy **${students.length} học sinh**:`,
    "",
    ...students.map(
      (student, index) =>
        `${index + 1}. **${student.name}** — ${
          student.code || "Chưa có mã"
        } — ${student.class_names || "Chưa phân lớp"}`,
    ),
  ].join("\n");
}

// ============================================================
// ATTENDANCE RESPONSE
// ============================================================

function buildAttendanceResponse(data) {
  const s = data?.statistics || {};

  return [
    "📊 **ĐIỂM DANH**",
    "",
    `Ngày: **${formatDateVN(data?.date)}**`,
    `Loại: **${data?.attendance_type_label || ""}**`,
    data?.class?.name
      ? `Lớp: **${data.class.name}**`
      : "Phạm vi: **Toàn giáo xứ**",
    "",
    `- Tổng số: **${s.total || 0}**`,
    `- Có mặt: **${s.present || 0}**`,
    `- Đi trễ: **${s.late || 0}**`,
    `- Vắng: **${s.absent || 0}**`,
    `- Có phép: **${s.excused || 0}**`,
    `- Chưa điểm danh: **${s.not_attended || 0}**`,
    "",
    `### Tỷ lệ tham dự: **${Number(s.attendance_rate || 0).toFixed(2)}%**`,
  ].join("\n");
}

// ============================================================
// PERIOD RESPONSE
// ============================================================

function buildPeriodResponse(data) {
  const s = data?.statistics || {};

  return [
    "📈 **THỐNG KÊ CHUYÊN CẦN**",
    "",
    data?.class?.name
      ? `Lớp: **${data.class.name}**`
      : "Phạm vi: **Toàn giáo xứ**",
    `Thời gian: **${formatDateVN(data?.start_date)} → ${formatDateVN(
      data?.end_date,
    )}**`,
    `Loại: **${data?.attendance_type_label || ""}**`,
    "",
    `- Số lượt điểm danh: **${s.total_records || 0}**`,
    `- Số buổi: **${s.attendance_days || 0}**`,
    `- Có mặt: **${s.present || 0}**`,
    `- Đi trễ: **${s.late || 0}**`,
    `- Vắng: **${s.absent || 0}**`,
    `- Có phép: **${s.excused || 0}**`,
    "",
    `### Tỷ lệ tham dự: **${Number(s.attendance_rate || 0).toFixed(2)}%**`,
  ].join("\n");
}

// ============================================================
// STUDENT HISTORY RESPONSE
// ============================================================

function buildStudentHistoryResponse(data) {
  if (!data) {
    return "Không tìm thấy dữ liệu học sinh.";
  }

  if (data.multiple) {
    return buildStudentSearchResponse(data.students);
  }

  const s = data.statistics || {};

  const lines = [
    "📚 **LỊCH SỬ ĐIỂM DANH HỌC SINH**",
    "",
    `Học sinh: **${data.student?.name || ""}**`,
    `Mã HS: **${data.student?.code || "Chưa có"}**`,
    `Thời gian: **${formatDateVN(data.start_date)} → ${formatDateVN(
      data.end_date,
    )}**`,
    `Loại: **${data.attendance_type_label}**`,
    "",
    "### Tổng hợp",
    "",
    `- Có mặt: **${s.present || 0}**`,
    `- Đi trễ: **${s.late || 0}**`,
    `- Vắng: **${s.absent || 0}**`,
    `- Có phép: **${s.excused || 0}**`,
    "",
    `### Tỷ lệ tham dự: **${Number(s.attendance_rate || 0).toFixed(2)}%**`,
  ];

  const rows = data.data || [];

  if (rows.length) {
    lines.push("");
    lines.push("### Chi tiết");

    rows.slice(0, 20).forEach((row) => {
      lines.push(
        `- ${formatDateVN(row.attendance_date)}: **${
          row.attendance_status || "Không xác định"
        }**${row.class_name ? ` — ${row.class_name}` : ""}${
          row.check_in_time ? ` — ${formatTimeVN(row.check_in_time)}` : ""
        }`,
      );
    });
  }

  return lines.join("\n");
}

// ============================================================
// STUDENT RANKING RESPONSE
// ============================================================

function buildStudentRankingResponse(rows, title = "HỌC SINH CHUYÊN CẦN THẤP") {
  if (!rows?.length) {
    return [`📊 **${title}**`, "", "Không có học sinh phù hợp."].join("\n");
  }

  const lines = [`📊 **${title}**`, ""];

  rows.forEach((row, index) => {
    lines.push(`${index + 1}. **${row.name}** — ${row.code || ""}`);

    lines.push(
      `   Chuyên cần: **${row.attendance_rate}%** | Vắng: **${
        row.absent
      }** | Trễ: **${row.late}**`,
    );
  });

  return lines.join("\n");
}

// ============================================================
// CLASS RANKING
// ============================================================

function buildClassRankingResponse(rows) {
  if (!rows?.length) {
    return "Không có dữ liệu lớp để thống kê.";
  }

  const lines = ["🏫 **XẾP HẠNG CHUYÊN CẦN CÁC LỚP**", ""];

  rows.forEach((row, index) => {
    lines.push(`${index + 1}. **${row.name}** — **${row.attendance_rate}%**`);

    lines.push(
      `   Có mặt: ${row.present} | Trễ: ${row.late} | Vắng: ${row.absent}`,
    );
  });

  return lines.join("\n");
}

// ============================================================
// PARISH RESPONSE
// ============================================================

function buildParishResponse(data) {
  const s = data?.students || {};

  const a = data?.attendance || {};

  return [
    "⛪ **TỔNG QUAN GIÁO XỨ**",
    "",
    `Thời gian: **${formatDateVN(data?.start_date)} → ${formatDateVN(
      data?.end_date,
    )}**`,
    `Loại: **${data?.attendance_type_label}**`,
    "",
    "### Học sinh",
    `- Tổng số: **${s.total || 0}**`,
    `- Đang học: **${s.active || 0}**`,
    `- Chưa phân lớp: **${s.unassigned || 0}**`,
    "",
    "### Lớp học",
    `- Tổng số lớp: **${data?.classes?.total || 0}**`,
    "",
    "### Điểm danh",
    `- Số lượt: **${a.total_records || 0}**`,
    `- Số buổi: **${a.attendance_days || 0}**`,
    `- Có mặt: **${a.present || 0}**`,
    `- Đi trễ: **${a.late || 0}**`,
    `- Vắng: **${a.absent || 0}**`,
    `- Có phép: **${a.excused || 0}**`,
    "",
    `### Tỷ lệ tham dự: **${Number(a.attendance_rate || 0).toFixed(2)}%**`,
  ].join("\n");
}

// ============================================================
// NEED ATTENTION RESPONSE
// ============================================================

function buildNeedAttentionResponse(rows) {
  if (!rows?.length) {
    return [
      "✅ **HỌC SINH CẦN LƯU Ý**",
      "",
      "Hiện không phát hiện học sinh có tỷ lệ chuyên cần dưới ngưỡng theo dõi.",
    ].join("\n");
  }

  const lines = [
    "⚠️ **HỌC SINH CẦN LƯU Ý**",
    "",
    `Phát hiện **${rows.length} học sinh** có chuyên cần thấp.`,
    "",
  ];

  rows.forEach((row, index) => {
    lines.push(`${index + 1}. **${row.name}** — ${row.code || ""}`);

    lines.push(
      `   Chuyên cần: **${row.attendance_rate}%** | Vắng: **${
        row.absent
      }** | Trễ: **${row.late}**`,
    );
  });

  return lines.join("\n");
}

// ============================================================
// UNASSIGNED RESPONSE
// ============================================================

function buildUnassignedResponse(rows) {
  if (!rows?.length) {
    return [
      "✅ **HỌC SINH CHƯA PHÂN LỚP**",
      "",
      "Không có học sinh chưa được phân lớp.",
    ].join("\n");
  }

  const lines = [
    "📋 **HỌC SINH CHƯA PHÂN LỚP**",
    "",
    `Có **${rows.length} học sinh** trong danh sách tra cứu.`,
    "",
  ];

  rows.forEach((row, index) => {
    lines.push(`${index + 1}. **${row.name}** — ${row.code || "Chưa có mã"}`);
  });

  return lines.join("\n");
}

// ============================================================
// ANOMALY RESPONSE
// ============================================================

function buildAnomalyResponse(data) {
  if (!data?.anomalies?.length) {
    return [
      "✅ **KIỂM TRA DỮ LIỆU**",
      "",
      "Không phát hiện bất thường trong khoảng thời gian được kiểm tra.",
    ].join("\n");
  }

  const lines = [
    "⚠️ **BẤT THƯỜNG ĐIỂM DANH**",
    "",
    `Phát hiện **${data.anomalies.length} vấn đề**.`,
    "",
  ];

  data.anomalies.forEach((item, index) => {
    lines.push(`${index + 1}. **${item.message}**`);

    if (item.student_name) {
      lines.push(
        `   Học sinh: ${item.student_name}${
          item.student_code ? ` (${item.student_code})` : ""
        }`,
      );
    }

    if (item.attendance_date) {
      lines.push(`   Ngày: ${formatDateVN(item.attendance_date)}`);
    }
  });

  return lines.join("\n");
}

// ============================================================
// HELP
// ============================================================

function buildHelpResponse() {
  return [
    "🤖 **TRỢ LÝ FAITHEDU - PHASE 5**",
    "",
    "Bạn có thể hỏi mình về:",
    "",
    "### Học sinh",
    "- Tìm học sinh Trần Hưng",
    "- Thông tin học sinh Trần Hưng",
    "- Lịch sử điểm danh Trần Hưng",
    "",
    "### Điểm danh",
    "- Hôm nay lớp Ấu 1 điểm danh thế nào?",
    "- Hôm nay lớp Ấu 1 những ai vắng?",
    "- Hôm nay lớp Ấu 1 ai chưa điểm danh?",
    "",
    "### Chuyên cần",
    "- Trần Hưng tháng này nghỉ bao nhiêu?",
    "- Những em nào nghỉ nhiều nhất?",
    "- Học sinh nào cần lưu ý?",
    "",
    "### Lớp",
    "- Lớp nào chuyên cần tốt nhất?",
    "- So sánh lớp Ấu 1 và Ấu 2",
    "",
    "### Giáo xứ",
    "- Tổng quan giáo xứ",
    "- Có bao nhiêu học sinh chưa phân lớp?",
    "",
    "### Kiểm tra dữ liệu",
    "- Có dữ liệu điểm danh bất thường không?",
  ].join("\n");
}

// ============================================================
// UNKNOWN
// ============================================================

function buildUnknownResponse() {
  return [
    "Mình chưa xác định được câu hỏi.",
    "",
    "Bạn có thể thử:",
    "",
    "- Tìm học sinh Trần Hưng",
    "- Lịch sử điểm danh Trần Hưng",
    "- Học sinh nào cần lưu ý?",
    "- Lớp nào chuyên cần tốt nhất?",
    "- Tổng quan giáo xứ",
    "- Có học sinh nào chưa phân lớp?",
    "- Có dữ liệu điểm danh bất thường không?",
  ].join("\n");
}

// ============================================================
// MAIN CHAT
// ============================================================

async function chat({ user, message }) {
  const text = String(message || "").trim();

  if (!text) {
    const error = new Error("Bạn hãy nhập câu hỏi.");

    error.code = "ASSISTANT_MESSAGE_REQUIRED";

    error.status = 400;

    throw error;
  }

  const intent = detectIntent(text);

  console.log("");
  console.log("============================================================");
  console.log("              FAITHEDU ASSISTANT PHASE 5");
  console.log("============================================================");
  console.log("USER ID:", user?.id);
  console.log("ROLE:", user?.role);
  console.log("CHURCH ID:", user?.church_id);
  console.log("MESSAGE:", text);
  console.log("INTENT:", intent);

  // ==========================================================
  // HELP
  // ==========================================================

  if (intent === "help") {
    const reply = buildHelpResponse();

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: null,
    };
  }

  // ==========================================================
  // STUDENT SEARCH
  // ==========================================================

  if (intent === "student_search") {
    const keyword = extractStudentKeyword(text);

    console.log("[ASSISTANT] STUDENT KEYWORD:", keyword);

    const students = await searchStudents({
      user,
      keyword,
      limit: 20,
    });

    const reply = buildStudentSearchResponse(students);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: students,
    };
  }

  // ==========================================================
  // STUDENT DETAIL
  // ==========================================================

  if (intent === "student_detail") {
    const keyword = extractStudentKeyword(text);

    const result = await getStudentDetail({
      user,
      keyword,
    });

    if (result?.multiple) {
      const reply = buildStudentSearchResponse(result.students);

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: result.students,
      };
    }

    const reply = buildStudentDetailResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // STUDENT HISTORY
  // ==========================================================

  if (intent === "student_attendance_history") {
    const keyword = extractStudentKeyword(text);

    const range = detectRange(text) || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    const result = await getStudentAttendanceHistory({
      user,
      keyword,
      startDate: range.startDate,
      endDate: range.endDate,
      attendanceType: type,
    });

    const reply = buildStudentHistoryResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // CLASS DETAIL
  // ==========================================================

  if (intent === "class_detail") {
    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (!classInfo) {
      const reply = "Mình không tìm thấy lớp phù hợp.";

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: null,
      };
    }

    if (classInfo.multiple) {
      const reply = classInfo.classes
        .map(
          (item, index) =>
            `${index + 1}. **${item.name}** — ${
              item.student_count || 0
            } học sinh`,
        )
        .join("\n");

      const answer = ["🏫 **CÓ NHIỀU LỚP PHÙ HỢP**", "", reply].join("\n");

      return {
        success: true,
        intent,
        reply: answer,
        answer,
        data: classInfo.classes,
      };
    }

    const result = await getClassDetail({
      user,
      classId: classInfo.id,
    });

    const reply = [
      "🏫 **THÔNG TIN LỚP**",
      "",
      `Tên lớp: **${result.name}**`,
      `Mã lớp: **${result.code || "Chưa có"}**`,
      `Sĩ số: **${result.student_count} học sinh**`,
      "",
      "### Danh sách",
      ...result.students.map(
        (student, index) =>
          `${index + 1}. **${student.name}** — ${student.code || ""}`,
      ),
    ].join("\n");

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // ATTENDANCE SUMMARY
  // ==========================================================

  if (intent === "attendance_summary") {
    const type = detectAttendanceType(text);

    const date = detectDate(text) || getTodayDate();

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (classInfo?.multiple) {
      const reply = classInfo.classes
        .map((item, index) => `${index + 1}. **${item.name}**`)
        .join("\n");

      return {
        success: true,
        intent,
        reply: `Có nhiều lớp phù hợp:\n\n${reply}`,
        answer: `Có nhiều lớp phù hợp:\n\n${reply}`,
        data: classInfo.classes,
      };
    }

    if (type === "catechism" && !classInfo) {
      const reply = "Bạn hãy cho mình biết lớp cần xem điểm danh.";

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: null,
      };
    }

    const result = await getAttendanceSummary({
      user,
      classId: classInfo?.id,
      date,
      attendanceType: type,
    });

    const reply = buildAttendanceResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // ATTENDANCE STUDENTS
  // ==========================================================

  if (intent === "attendance_students") {
    const type = detectAttendanceType(text);

    const status = detectAttendanceStatus(text);

    const date = detectDate(text) || getTodayDate();

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (type === "catechism" && !classInfo) {
      const reply = "Bạn hãy cho mình biết lớp cần xem.";

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: null,
      };
    }

    const result = await getAttendanceStudents({
      user,
      classId: classInfo?.id,
      date,
      attendanceType: type,
      status,
    });

    const lines = [
      "📋 **DANH SÁCH ĐIỂM DANH**",
      "",
      `Ngày: **${formatDateVN(date)}**`,
      `Loại: **${result.attendance_type_label}**`,
      "",
    ];

    if (!result.data?.length) {
      lines.push("Không có học sinh phù hợp.");
    } else {
      result.data.forEach((student, index) => {
        lines.push(`${index + 1}. **${student.name}** — ${student.code || ""}`);
      });
    }

    const reply = lines.join("\n");

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // PERIOD STATISTICS
  // ==========================================================

  if (intent === "attendance_period_statistics") {
    const type = detectAttendanceType(text);

    const range = detectRange(text) || getCurrentMonthRange();

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (type === "catechism" && !classInfo) {
      const reply = "Bạn hãy cho mình biết lớp cần thống kê.";

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: null,
      };
    }

    const result = await getMonthlyAttendanceStatistics({
      user,
      classId: classInfo?.id,
      startDate: range.startDate,
      endDate: range.endDate,
      attendanceType: type,
    });

    const reply = buildPeriodResponse({
      ...result,
      attendance_type_label: type === "mass" ? "Thánh lễ" : "Học giáo lý",
    });

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // STUDENT RANKING
  // ==========================================================

  if (intent === "student_attendance_ranking") {
    const range = detectRange(text) || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    const result = await getStudentAttendanceRanking({
      user,
      startDate: range.startDate,
      endDate: range.endDate,
      attendanceType: type,
      classId: classInfo?.id,
      limit: 20,
    });

    const reply = buildStudentRankingResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // CLASS RANKING
  // ==========================================================

  if (intent === "class_attendance_ranking") {
    const range = detectRange(text) || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    const result = await getClassAttendanceRanking({
      user,
      startDate: range.startDate,
      endDate: range.endDate,
      attendanceType: type,
      limit: 50,
    });

    const reply = buildClassRankingResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // CLASS COMPARISON
  // ==========================================================

  if (intent === "class_comparison") {
    const classes = await searchClassesFromMessage(user, text);

    if (classes.length < 2) {
      const reply = "Bạn hãy ghi rõ ít nhất 2 lớp để mình so sánh.";

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: null,
      };
    }

    const range = detectRange(text) || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    const result = await compareClasses({
      user,
      classIds: classes.map((item) => item.id),
      startDate: range.startDate,
      endDate: range.endDate,
      attendanceType: type,
    });

    const lines = ["⚖️ **SO SÁNH CHUYÊN CẦN**", ""];

    result.forEach((row) => {
      lines.push(`- **${row.name}**: ${row.attendance_rate}%`);

      lines.push(
        `  Có mặt ${row.present} | Trễ ${row.late} | Vắng ${row.absent}`,
      );
    });

    const reply = lines.join("\n");

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // PARISH STATISTICS
  // ==========================================================

  if (intent === "parish_statistics") {
    const range = detectRange(text) || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    const result = await getParishStatistics({
      user,
      startDate: range.startDate,
      endDate: range.endDate,
      attendanceType: type,
    });

    const reply = buildParishResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // NEED ATTENTION
  // ==========================================================

  if (intent === "students_needing_attention") {
    const range = detectRange(text) || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    const result = await getStudentsNeedingAttention({
      user,
      startDate: range.startDate,
      endDate: range.endDate,
      attendanceType: type,
      threshold: 70,
      limit: 30,
    });

    const reply = buildNeedAttentionResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // UNASSIGNED
  // ==========================================================

  if (intent === "unassigned_students") {
    const result = await getUnassignedStudents({
      user,
      limit: 50,
    });

    const reply = buildUnassignedResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // ANOMALIES
  // ==========================================================

  if (intent === "attendance_anomalies") {
    const range = detectRange(text) || getCurrentMonthRange();

    const result = await getAttendanceAnomalies({
      user,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: 50,
    });

    const reply = buildAnomalyResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // UNKNOWN
  // ==========================================================

  const reply = buildUnknownResponse();

  return {
    success: true,
    intent: "unknown",
    reply,
    answer: reply,
    data: null,
  };
}

// ============================================================
// FIND MULTIPLE CLASS NAMES
// ============================================================

async function searchClassesFromMessage(user, message) {
  const normalized = normalizeText(message);

  const classNames = [];

  const matches = normalized.matchAll(
    /\blop\s+([a-z0-9à-ỹđĐ\s]+?)(?=\s+(va|và|voi|với|so|chuyen|chuyên|thang|tháng|nay|này)\b|$)/gi,
  );

  for (const match of matches) {
    const value = match?.[1]?.trim();

    if (value) {
      classNames.push(value);
    }
  }

  const unique = [...new Set(classNames)];

  const result = [];

  for (const keyword of unique) {
    const classes = await require("./assistantTools").searchClasses({
      user,
      keyword,
      limit: 10,
    });

    if (classes.length === 1) {
      result.push(classes[0]);
    }
  }

  return result;
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  chat,

  detectIntent,
  detectDate,
  detectRange,
  detectMonthRange,

  detectAttendanceType,
  detectAttendanceStatus,

  extractClassKeyword,
  extractStudentKeyword,

  resolveClassFromMessage,
};

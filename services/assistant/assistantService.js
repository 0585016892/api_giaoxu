// ============================================================
// FAITHEDU - ASSISTANT SERVICE - PHASE 4
// ============================================================
//
// Native rule-based assistant.
// Không AI.
// Không OpenAI.
// Không ghi DB.
//
// ============================================================

const {
  searchStudents,
  getStudentDetail,
  searchClasses,
  getClassDetail,
  getAttendanceSummary,
  getAttendanceStudents,
  getMonthlyAttendanceStatistics,
  normalizeText,
} = require("./assistantTools");

// ============================================================
// DATE FORMAT
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

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      return `${day}/${month}/${year}`;
    }

    if (typeof date === "string") {
      const value = date.trim();

      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

      if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`;
      }

      const parsed = new Date(value);

      if (Number.isNaN(parsed.getTime())) {
        return "Chưa cập nhật";
      }

      const day = String(parsed.getDate()).padStart(2, "0");
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const year = parsed.getFullYear();

      return `${day}/${month}/${year}`;
    }

    if (typeof date === "number") {
      const parsed = new Date(date);

      if (Number.isNaN(parsed.getTime())) {
        return "Chưa cập nhật";
      }

      const day = String(parsed.getDate()).padStart(2, "0");
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const year = parsed.getFullYear();

      return `${day}/${month}/${year}`;
    }

    return "Chưa cập nhật";
  } catch (error) {
    console.log("[ASSISTANT] FORMAT DATE ERROR:", error?.message);

    return "Chưa cập nhật";
  }
}

// ============================================================
// TIME
// ============================================================

function formatTimeVN(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }

    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");

    return `${hours}:${minutes}`;
  }

  const text = String(value);

  const match = text.match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return text;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

// ============================================================
// FORMAT
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
    deleted: "Đã xóa",
  };

  return map[value] || status;
}

// ============================================================
// DATE
// ============================================================

function getTodayDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getYesterdayDate() {
  const now = new Date();

  now.setDate(now.getDate() - 1);

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentMonthRange() {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
  };
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ============================================================
// DETECT DATE
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
    const day = vnMatch[1].padStart(2, "0");
    const month = vnMatch[2].padStart(2, "0");
    const year = vnMatch[3];

    return `${year}-${month}-${day}`;
  }

  const dashMatch = original.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);

  if (dashMatch) {
    const day = dashMatch[1].padStart(2, "0");
    const month = dashMatch[2].padStart(2, "0");
    const year = dashMatch[3];

    return `${year}-${month}-${day}`;
  }

  return null;
}

// ============================================================
// MONTH RANGE
// ============================================================

function detectMonthRange(message) {
  const normalized = normalizeText(message);

  if (normalized.includes("thang nay")) {
    return getCurrentMonthRange();
  }

  if (normalized.includes("thang truoc")) {
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth() - 1;

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);

    return {
      startDate: formatDateISO(start),
      endDate: formatDateISO(end),
    };
  }

  const monthMatch = normalized.match(
    /\bthang\s+(\d{1,2})(?:\/|-|\s+)(\d{4})\b/,
  );

  if (monthMatch) {
    const month = Number(monthMatch[1]);
    const year = Number(monthMatch[2]);

    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);

      return {
        startDate: formatDateISO(start),
        endDate: formatDateISO(end),
      };
    }
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
    normalized.includes("tham du thanh le") ||
    normalized.includes("tham du le") ||
    normalized.includes("mass")
  ) {
    return "mass";
  }

  return "catechism";
}

// ============================================================
// ATTENDANCE STATUS
// ============================================================

function detectAttendanceStatus(message) {
  const normalized = normalizeText(message);

  if (
    normalized.includes("chua diem danh") ||
    normalized.includes("chua duoc diem danh") ||
    normalized.includes("khong diem danh") ||
    normalized.includes("chua danh")
  ) {
    return "not_attended";
  }

  if (normalized.includes("vang co phep") || normalized.includes("co phep")) {
    return "excused";
  }

  if (normalized.includes("di tre") || normalized.includes("tre")) {
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
// INTENT
// ============================================================

function detectIntent(message) {
  const normalized = normalizeText(message);

  // ----------------------------------------------------------
  // HELP
  // ----------------------------------------------------------

  const helpWords = [
    "huong dan",
    "lam the nao",
    "cach",
    "su dung",
    "khong biet",
    "bi loi",
    "loi gi",
  ];

  const hasDataKeyword =
    normalized.includes("hoc sinh") ||
    normalized.includes("lop") ||
    normalized.includes("diem danh") ||
    normalized.includes("vang") ||
    normalized.includes("di tre") ||
    normalized.includes("di le") ||
    normalized.includes("thanh le");

  if (helpWords.some((word) => normalized.includes(word)) && !hasDataKeyword) {
    return "help";
  }

  // ----------------------------------------------------------
  // ATTENDANCE
  // ----------------------------------------------------------

  const attendanceKeywords = [
    "diem danh",
    "vang",
    "di tre",
    "co mat",
    "chua diem danh",
    "di hoc",
    "thanh le",
    "di le",
    "chuyen can",
    "tham du",
  ];

  if (attendanceKeywords.some((word) => normalized.includes(word))) {
    if (
      normalized.includes("thang") ||
      normalized.includes("tuan") ||
      normalized.includes("khoang thoi gian") ||
      normalized.includes("thong ke") ||
      normalized.includes("chuyen can")
    ) {
      return "attendance_period_statistics";
    }

    if (
      normalized.includes("ai") ||
      normalized.includes("nhung ai") ||
      normalized.includes("danh sach") ||
      normalized.includes("nhung em") ||
      normalized.includes("em nao")
    ) {
      return "attendance_students";
    }

    return "attendance_summary";
  }

  // ----------------------------------------------------------
  // STUDENT DETAIL
  // ----------------------------------------------------------

  if (
    normalized.includes("thong tin chi tiet") &&
    normalized.includes("hoc sinh")
  ) {
    return "student_detail";
  }

  if (normalized.includes("thong tin") && normalized.includes("hoc sinh")) {
    return "student_detail";
  }

  // "cho toi thong tin tran hung"
  if (
    normalized.includes("cho toi thong tin") ||
    normalized.includes("tra cuu thong tin")
  ) {
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

  if (
    normalized.includes("lop") &&
    (normalized.includes("bao nhieu") ||
      normalized.includes("danh sach") ||
      normalized.includes("co nhung") ||
      normalized.includes("thong tin") ||
      normalized.includes("hoc sinh") ||
      normalized.includes("si so"))
  ) {
    return "class_detail";
  }

  return "unknown";
}

// ============================================================
// CLASS KEYWORD
// ============================================================

function extractClassKeyword(message) {
  const original = String(message || "").trim();
  const normalized = normalizeText(original);

  const match = normalized.match(
    /\blop\s+(.+?)(?=\s+(hom nay|hom qua|ngay|co|bao nhieu|vang|di tre|chua|diem danh|thang|danh sach|nhung ai|ai|the nao|nhu the nao|chuyen can)\b|$)/,
  );

  if (match?.[1]) {
    return match[1].trim();
  }

  const index = normalized.indexOf("lop ");

  if (index >= 0) {
    return normalized
      .slice(index + 4)
      .split(
        /\s+(hom nay|hom qua|bao nhieu|danh sach|vang|di tre|chua|diem danh|thang|chuyen can)\b/,
      )[0]
      .trim();
  }

  return "";
}

// ============================================================
// STUDENT KEYWORD
// ============================================================

function extractStudentKeyword(message) {
  let text = String(message || "").trim();

  text = normalizeText(text);

  // ----------------------------------------------------------
  // Prefix dài -> ngắn
  // ----------------------------------------------------------

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
    if (text.startsWith(prefix + " ")) {
      text = text.slice(prefix.length).trim();
      break;
    }

    if (text === prefix) {
      text = "";
      break;
    }
  }

  // ----------------------------------------------------------
  // Remove suffix
  // ----------------------------------------------------------

  text = text
    .replace(
      /\b(hom nay|hom qua|ngay\s+\d+|diem danh|chi tiet|thong tin chi tiet)\b/g,
      "",
    )
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

  const normalizedKeyword = normalizeText(keyword);

  const exact = classes.find(
    (item) => normalizeText(item.name) === normalizedKeyword,
  );

  if (exact) {
    return exact;
  }

  const exactCode = classes.find(
    (item) => normalizeText(item.code) === normalizedKeyword,
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
// STUDENT FORMAT
// ============================================================

function formatStudentBasic(student, index) {
  const prefix = typeof index === "number" ? `${index + 1}. ` : "";

  return [
    `${prefix}**${student.name || "Chưa có tên"}**`,
    `   Mã HS: **${student.code || "Chưa có"}**`,
    `   Lớp: **${student.class_names || "Chưa phân lớp"}**`,
  ].join("\n");
}

// ============================================================
// STUDENT SEARCH RESPONSE
// ============================================================

function buildStudentSearchResponse(students) {
  if (!students?.length) {
    return [
      "🔎 **KHÔNG TÌM THẤY HỌC SINH**",
      "",
      "Mình không tìm thấy học sinh phù hợp trong giáo xứ.",
      "",
      "Bạn có thể thử:",
      "- Tìm theo họ tên",
      "- Tìm theo mã học sinh",
      "- Tìm theo số điện thoại",
    ].join("\n");
  }

  if (students.length === 1) {
    return buildStudentDetailResponse(students[0]);
  }

  const lines = [
    "🔎 **KẾT QUẢ TÌM KIẾM HỌC SINH**",
    "",
    `Mình tìm thấy **${students.length} học sinh** phù hợp:`,
    "",
  ];

  students.forEach((student, index) => {
    lines.push(formatStudentBasic(student, index));
    lines.push("");
  });

  return lines.join("\n");
}

// ============================================================
// STUDENT DETAIL
// ============================================================

function buildStudentDetailResponse(student) {
  if (!student) {
    return "Mình không tìm thấy học sinh phù hợp.";
  }

  const lines = [
    "👤 **THÔNG TIN HỌC SINH**",
    "",
    `**${student.name || "Chưa có tên"}**`,
    "",
    `- Mã học sinh: **${student.code || "Chưa có"}**`,
    `- Giới tính: **${formatGenderVN(student.gender)}**`,
    `- Ngày sinh: **${formatDateVN(student.date_of_birth)}**`,
    `- Trạng thái: **${formatStudentStatusVN(student.status)}**`,
    "",
    "### Lớp học",
  ];

  if (Array.isArray(student.classes) && student.classes.length) {
    student.classes.forEach((classItem) => {
      lines.push(
        `- ${classItem.name || "Chưa có tên"}${
          classItem.code ? ` (${classItem.code})` : ""
        }`,
      );
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

  if (student.phone || student.email) {
    lines.push("");
    lines.push("### Liên hệ học sinh");

    if (student.phone) {
      lines.push(`- Điện thoại: **${student.phone}**`);
    }

    if (student.email) {
      lines.push(`- Email: **${student.email}**`);
    }
  }

  return lines.join("\n");
}

// ============================================================
// CLASS RESPONSE
// ============================================================

function buildClassResponse(data) {
  if (!data) {
    return "Mình không tìm thấy lớp phù hợp.";
  }

  if (data.multiple) {
    const lines = [
      "🏫 **CÓ NHIỀU LỚP PHÙ HỢP**",
      "",
      "Bạn vui lòng chọn đúng lớp:",
      "",
    ];

    data.classes.forEach((item, index) => {
      lines.push(
        `${index + 1}. **${item.name}**${
          item.code ? ` — ${item.code}` : ""
        } — ${item.student_count || 0} học sinh`,
      );
    });

    return lines.join("\n");
  }

  const lines = [
    "🏫 **THÔNG TIN LỚP**",
    "",
    `Tên lớp: **${data.name || "Chưa có"}**`,
    `Mã lớp: **${data.code || "Chưa có"}**`,
    `Sĩ số: **${data.student_count || 0} học sinh**`,
  ];

  if (Array.isArray(data.students) && data.students.length) {
    lines.push("");
    lines.push("### Danh sách học sinh");

    data.students.forEach((student, index) => {
      lines.push(
        `${index + 1}. **${student.name}** — ${student.code || "Chưa có mã"}`,
      );
    });
  }

  return lines.join("\n");
}

// ============================================================
// ATTENDANCE RESPONSE
// ============================================================

function buildAttendanceResponse(data) {
  if (!data) {
    return "Mình không tìm thấy dữ liệu điểm danh phù hợp.";
  }

  const className = data.class?.name || "Toàn giáo xứ";

  const statistics = data.statistics || {};

  const attendanceRate = Number(statistics.attendance_rate || 0).toFixed(2);

  return [
    "📊 **THỐNG KÊ ĐIỂM DANH**",
    "",
    `Lớp: **${className}**`,
    `Ngày: **${formatDateVN(data.date)}**`,
    `Loại: **${data.attendance_type_label}**`,
    "",
    "### Tổng quan",
    "",
    `- Tổng số: **${statistics.total || 0}**`,
    `- Có mặt: **${statistics.present || 0}**`,
    `- Đi trễ: **${statistics.late || 0}**`,
    `- Vắng: **${statistics.absent || 0}**`,
    `- Có phép: **${statistics.excused || 0}**`,
    `- Chưa điểm danh: **${statistics.not_attended || 0}**`,
    "",
    `### Tỷ lệ tham dự: **${attendanceRate}%**`,
  ].join("\n");
}

// ============================================================
// ATTENDANCE STUDENTS RESPONSE
// ============================================================

function buildAttendanceStudentsResponse(data) {
  if (!data) {
    return "Không có dữ liệu điểm danh.";
  }

  const statusLabel = {
    all: "Tất cả",
    present: "Có mặt",
    absent: "Vắng",
    late: "Đi trễ",
    excused: "Có phép",
    not_attended: "Chưa điểm danh",
  };

  const rows = data.data || [];

  const lines = [
    "📋 **DANH SÁCH ĐIỂM DANH**",
    "",
    `Ngày: **${formatDateVN(data.date)}**`,
    `Loại: **${data.attendance_type_label}**`,
    `Trạng thái: **${statusLabel[data.status] || data.status}**`,
    "",
  ];

  if (!rows.length) {
    lines.push("Không có học sinh phù hợp.");
    return lines.join("\n");
  }

  rows.forEach((student, index) => {
    const checkIn = student.check_in_time
      ? ` — ${formatTimeVN(student.check_in_time)}`
      : "";

    lines.push(
      `${index + 1}. **${student.name}** — ${
        student.code || "Chưa có mã"
      }${checkIn}`,
    );
  });

  lines.push("");
  lines.push(`Tổng cộng: **${rows.length} học sinh**`);

  return lines.join("\n");
}

// ============================================================
// PERIOD RESPONSE
// ============================================================

function buildPeriodStatisticsResponse(data) {
  if (!data) {
    return "Không có dữ liệu thống kê.";
  }

  const s = data.statistics || {};

  const lines = ["📈 **THỐNG KÊ CHUYÊN CẦN**", ""];

  if (data.class?.name) {
    lines.push(`Lớp: **${data.class.name}**`);
  } else {
    lines.push("Phạm vi: **Toàn giáo xứ**");
  }

  lines.push(
    `Thời gian: **${formatDateVN(
      data.start_date,
    )} → ${formatDateVN(data.end_date)}**`,
  );

  lines.push(`Loại: **${data.attendance_type_label}**`);

  lines.push("");

  if (s.total_students !== undefined) {
    lines.push(`- Tổng số học sinh: **${s.total_students}**`);
  }

  if (s.attendance_days !== undefined) {
    lines.push(`- Số buổi có dữ liệu: **${s.attendance_days}**`);
  }

  lines.push(`- Tổng lượt điểm danh: **${s.total_records || 0}**`);

  lines.push(`- Có mặt: **${s.present || 0}**`);

  lines.push(`- Đi trễ: **${s.late || 0}**`);

  lines.push(`- Vắng: **${s.absent || 0}**`);

  lines.push(`- Có phép: **${s.excused || 0}**`);

  lines.push(`- Tổng tham dự: **${s.attended || 0}**`);

  lines.push("");

  lines.push(
    `### Tỷ lệ tham dự: **${Number(s.attendance_rate || 0).toFixed(2)}%**`,
  );

  return lines.join("\n");
}

// ============================================================
// HELP
// ============================================================

function buildHelpResponse() {
  return [
    "🤖 **TRỢ LÝ FAITHEDU**",
    "",
    "Mình có thể hỗ trợ bạn tra cứu dữ liệu giáo xứ.",
    "",
    "### Học sinh",
    "- Tìm học sinh Nguyễn Văn An",
    "- Thông tin học sinh Nguyễn Văn An",
    "- Tìm học sinh theo mã HS",
    "",
    "### Lớp học",
    "- Lớp Ấu 1 có bao nhiêu học sinh?",
    "- Danh sách học sinh lớp Ấu 1",
    "",
    "### Điểm danh",
    "- Hôm nay lớp Ấu 1 điểm danh thế nào?",
    "- Hôm nay lớp Ấu 1 những ai vắng?",
    "- Hôm nay lớp Ấu 1 những ai đi trễ?",
    "- Hôm nay lớp Ấu 1 ai chưa điểm danh?",
    "",
    "### Thống kê",
    "- Tháng này lớp Ấu 1 chuyên cần thế nào?",
    "- Tháng 9/2026 lớp Ấu 1 chuyên cần thế nào?",
    "- Hôm nay có bao nhiêu em đi lễ?",
  ].join("\n");
}

// ============================================================
// UNKNOWN
// ============================================================

function buildUnknownResponse() {
  return [
    "Mình chưa xác định được bạn muốn tra cứu nội dung nào.",
    "",
    "Bạn có thể thử:",
    "",
    "- **Tìm học sinh Nguyễn Văn An**",
    "- **Cho tôi thông tin Nguyễn Văn An**",
    "- **Lớp Ấu 1 có bao nhiêu học sinh?**",
    "- **Lớp Ấu 1 hôm nay điểm danh thế nào?**",
    "- **Hôm nay lớp Ấu 1 những ai vắng?**",
    "- **Hôm nay lớp Ấu 1 những ai đi trễ?**",
    "- **Hôm nay có bao nhiêu em đi lễ?**",
    "- **Tháng này lớp Ấu 1 chuyên cần thế nào?**",
  ].join("\n");
}

// ============================================================
// MAIN CHAT
// ============================================================

async function chat({ user, message }) {
  const text = String(message || "").trim();

  if (!text) {
    return {
      success: false,
      message: "Bạn hãy nhập câu hỏi cần tra cứu.",
    };
  }

  if (text.length > 500) {
    const error = new Error("Câu hỏi không được vượt quá 500 ký tự.");

    error.code = "ASSISTANT_MESSAGE_TOO_LONG";
    error.status = 400;

    throw error;
  }

  const intent = detectIntent(text);

  console.log("");
  console.log("============================================================");
  console.log("                 FAITHEDU ASSISTANT PHASE 4");
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
    return {
      success: true,
      intent,
      reply: buildHelpResponse(),
      answer: buildHelpResponse(),
      data: null,
    };
  }

  // ==========================================================
  // STUDENT DETAIL
  // ==========================================================

  if (intent === "student_detail") {
    const keyword = extractStudentKeyword(text);

    console.log("[ASSISTANT] STUDENT KEYWORD:", keyword);

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
  // CLASS
  // ==========================================================

  if (intent === "class_detail") {
    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (!classInfo) {
      const reply =
        "Mình không tìm thấy lớp phù hợp. Bạn hãy cho mình tên hoặc mã lớp cụ thể.";

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: null,
      };
    }

    if (classInfo.multiple) {
      const reply = buildClassResponse(classInfo);

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: classInfo.classes,
      };
    }

    const result = await getClassDetail({
      user,
      classId: classInfo.id,
    });

    const reply = buildClassResponse(result);

    return {
      success: true,
      intent,
      reply,
      answer: reply,
      data: result,
    };
  }

  // ==========================================================
  // ATTENDANCE PERIOD
  // ==========================================================

  if (intent === "attendance_period_statistics") {
    const attendanceType = detectAttendanceType(text);

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (classInfo?.multiple) {
      const reply = buildClassResponse(classInfo);

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: classInfo.classes,
      };
    }

    if (attendanceType === "catechism" && !classInfo) {
      const reply =
        "Bạn hãy cho mình biết lớp cần thống kê, ví dụ: **Tháng này lớp Ấu 1 chuyên cần thế nào?**";

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: null,
      };
    }

    const monthRange = detectMonthRange(text);

    let startDate;
    let endDate;

    if (monthRange) {
      startDate = monthRange.startDate;
      endDate = monthRange.endDate;
    } else {
      const date = detectDate(text);

      if (date) {
        startDate = date;
        endDate = date;
      } else {
        const current = getCurrentMonthRange();

        startDate = current.startDate;
        endDate = current.endDate;
      }
    }

    console.log("[ASSISTANT] PERIOD:", startDate, "→", endDate);

    const result = await getMonthlyAttendanceStatistics({
      user,
      classId: classInfo?.id || null,
      startDate,
      endDate,
      attendanceType,
    });

    const reply = buildPeriodStatisticsResponse(result);

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
    const attendanceType = detectAttendanceType(text);

    const status = detectAttendanceStatus(text);

    const date = detectDate(text) || getTodayDate();

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (classInfo?.multiple) {
      const reply = buildClassResponse(classInfo);

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: classInfo.classes,
      };
    }

    if (attendanceType === "catechism" && !classInfo) {
      const reply =
        "Bạn hãy cho mình biết lớp cần xem, ví dụ: **Hôm nay lớp Ấu 1 những ai vắng?**";

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
      classId: classInfo?.id || null,
      date,
      attendanceType,
      status,
    });

    const reply = buildAttendanceStudentsResponse(result);

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
    const attendanceType = detectAttendanceType(text);

    const date = detectDate(text) || getTodayDate();

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (classInfo?.multiple) {
      const reply = buildClassResponse(classInfo);

      return {
        success: true,
        intent,
        reply,
        answer: reply,
        data: classInfo.classes,
      };
    }

    // --------------------------------------------------------
    // MASS
    // --------------------------------------------------------

    if (attendanceType === "mass") {
      const result = await getAttendanceSummary({
        user,
        date,
        attendanceType: "mass",
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

    // --------------------------------------------------------
    // CATECHISM
    // --------------------------------------------------------

    if (!classInfo) {
      const reply =
        "Bạn hãy cho mình biết lớp cần xem điểm danh, ví dụ: **Hôm nay lớp Ấu 1 điểm danh thế nào?**";

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
      classId: classInfo.id,
      date,
      attendanceType: "catechism",
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
// EXPORT
// ============================================================

module.exports = {
  chat,

  detectIntent,
  detectDate,
  detectMonthRange,

  detectAttendanceType,
  detectAttendanceStatus,

  extractClassKeyword,
  extractStudentKeyword,

  resolveClassFromMessage,
};

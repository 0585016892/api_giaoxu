// ============================================================
// FAITHEDU - ASSISTANT SERVICE - PHASE 3
// ============================================================
// Không AI.
// Không OpenAI.
// Không ghi dữ liệu.
//
// Flow:
//
// message
//   ↓
// normalize
//   ↓
// detect intent
//   ↓
// extract class / student / date / status
//   ↓
// assistantTools
//   ↓
// response builder
// ============================================================

const {
  searchStudents,
  getStudentDetail,

  searchClasses,
  getClassDetail,
  getClassStudents,

  getAttendanceSummary,
  getAttendanceStudents,

  getMonthlyAttendanceStatistics,

  normalizeText,
} = require("./assistantTools");

// ============================================================
// DATE
// ============================================================

function formatDateVN(date) {
  if (!date) {
    return "Chưa cập nhật";
  }

  try {
    /**
     * ========================================================
     * MYSQL DATE dạng string
     * Ví dụ:
     * 2005-08-21
     * ========================================================
     */
    if (typeof date === "string") {
      const value = date.trim();

      if (!value) {
        return "Chưa cập nhật";
      }

      /**
       * YYYY-MM-DD
       */
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

      if (match) {
        const [, year, month, day] = match;

        return `${day}/${month}/${year}`;
      }

      /**
       * Trường hợp string nhưng không đúng YYYY-MM-DD
       */
      const parsed = new Date(value);

      if (Number.isNaN(parsed.getTime())) {
        return "Chưa cập nhật";
      }

      const day = String(parsed.getDate()).padStart(2, "0");
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const year = parsed.getFullYear();

      return `${day}/${month}/${year}`;
    }

    /**
     * ========================================================
     * MYSQL DATE / DATETIME trả về JavaScript Date
     * ========================================================
     */
    if (date instanceof Date) {
      if (Number.isNaN(date.getTime())) {
        return "Chưa cập nhật";
      }

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      return `${day}/${month}/${year}`;
    }

    /**
     * ========================================================
     * Trường hợp timestamp / number
     * ========================================================
     */
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
function formatGenderVN(gender) {
  if (!gender) {
    return "Chưa cập nhật";
  }

  const value = String(gender).trim().toLowerCase();

  const genderMap = {
    male: "Nam",
    female: "Nữ",
    other: "Khác",
    nam: "Nam",
    nữ: "Nữ",
    nu: "Nữ",
    khac: "Khác",
    khác: "Khác",
  };

  return genderMap[value] || gender;
}

function formatStudentStatusVN(status) {
  if (!status) {
    return "Chưa cập nhật";
  }

  const value = String(status).trim().toLowerCase();

  const statusMap = {
    active: "Đang học",
    inactive: "Ngừng học",
    graduated: "Đã tốt nghiệp",
    transferred: "Đã chuyển trường",
    deleted: "Đã xóa",
  };

  return statusMap[value] || status;
}
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

// ============================================================
// DATE DETECTION
// ============================================================

function detectDate(message) {
  const normalized = normalizeText(message);

  if (normalized.includes("hom nay")) {
    return getTodayDate();
  }

  if (normalized.includes("hom qua")) {
    return getYesterdayDate();
  }

  // YYYY-MM-DD
  const isoMatch = message.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (isoMatch) {
    return isoMatch[0];
  }

  // DD/MM/YYYY
  const vnMatch = message.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  if (vnMatch) {
    const day = vnMatch[1].padStart(2, "0");
    const month = vnMatch[2].padStart(2, "0");
    const year = vnMatch[3];

    return `${year}-${month}-${day}`;
  }

  // DD-MM-YYYY
  const dashMatch = message.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);

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

function getCurrentMonthRange() {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month, 1);

  const end = new Date(year, month + 1, 0);

  const format = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  };

  return {
    startDate: format(start),
    endDate: format(end),
  };
}

function detectMonthRange(message) {
  const normalized = normalizeText(message);

  // "tháng này"
  if (normalized.includes("thang nay")) {
    return getCurrentMonthRange();
  }

  // "tháng 9/2026"
  const monthMatch = normalized.match(
    /\bthang\s+(\d{1,2})(?:\/|-|\s+)(\d{4})\b/,
  );

  if (monthMatch) {
    const month = Number(monthMatch[1]);

    const year = Number(monthMatch[2]);

    if (month >= 1 && month <= 12 && year >= 2000) {
      const start = new Date(year, month - 1, 1);

      const end = new Date(year, month, 0);

      const format = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");

        return `${y}-${m}-${d}`;
      };

      return {
        startDate: format(start),
        endDate: format(end),
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
    normalized.includes("khong diem danh")
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
    "loi",
    "bi loi",
  ];

  if (helpWords.some((word) => normalized.includes(word))) {
    // Nếu đồng thời có dữ liệu điểm danh/học sinh
    // thì ưu tiên data intent.
    const hasDataKeyword =
      normalized.includes("hoc sinh") ||
      normalized.includes("lop") ||
      normalized.includes("diem danh") ||
      normalized.includes("vang") ||
      normalized.includes("di tre") ||
      normalized.includes("di le");

    if (!hasDataKeyword) {
      return "help";
    }
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
      normalized.includes("thong ke")
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
    normalized.includes("thong tin") &&
    (normalized.includes("hoc sinh") || normalized.includes("em "))
  ) {
    return "student_detail";
  }

  // ----------------------------------------------------------
  // STUDENT SEARCH
  // ----------------------------------------------------------

  if (
    normalized.includes("hoc sinh") ||
    normalized.includes("tim em") ||
    normalized.includes("tim hoc sinh") ||
    normalized.includes("em nao")
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

  // ----------------------------------------------------------
  // DEFAULT
  // ----------------------------------------------------------

  return "unknown";
}

// ============================================================
// CLASS KEYWORD
// ============================================================
//
// Ví dụ:
// "lớp Ấu 1"
// "lớp Ấu 1 hôm nay vắng ai"
// "Ấu 1 có bao nhiêu học sinh"
//
// Không cố parse bằng regex phức tạp.
// Lấy phần sau chữ "lớp", hoặc fallback tìm class bằng
// toàn bộ message.
// ============================================================

function extractClassKeyword(message) {
  const original = String(message || "").trim();

  const normalized = normalizeText(original);

  const match = normalized.match(
    /\blop\s+(.+?)(?=\s+(hom nay|hom qua|ngay|co|bao nhieu|v[aă]ng|di tre|chua|diem danh|thang|danh sach|nhung ai|ai|the nao|nhu the nao)\b|$)/,
  );

  if (match && match[1]) {
    return match[1].trim();
  }

  // fallback:
  // Nếu có "lớp" nhưng regex không lấy được,
  // lấy chuỗi sau "lớp".
  const index = normalized.indexOf("lop ");

  if (index >= 0) {
    return normalized
      .slice(index + 4)
      .trim()
      .split(
        /\s+(hom nay|hom qua|bao nhieu|danh sach|v[aă]ng|di tre|chua|diem danh|thang)\b/,
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

  text = text
    .replace(
      /^(cho toi|cho mình|cho minh|tim|tìm|tra cuu|tra cứu|thong tin|thông tin)\s*/i,
      "",
    )
    .replace(/^(hoc sinh|học sinh)\s*/i, "")
    .trim();

  text = text.replace(
    /\b(hom nay|hom qua|ngay|diem danh|thong tin chi tiet|chi tiet)\b/gi,
    "",
  );

  return text.trim();
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

  // Exact name
  const exact = classes.find(
    (item) => normalizeText(item.name) === normalizedKeyword,
  );

  if (exact) {
    return exact;
  }

  // Exact code
  const exactCode = classes.find(
    (item) => normalizeText(item.code) === normalizedKeyword,
  );

  if (exactCode) {
    return exactCode;
  }

  // Nếu chỉ có một kết quả
  if (classes.length === 1) {
    return classes[0];
  }

  // Nếu nhiều kết quả thì không tự đoán
  return {
    multiple: true,
    classes,
  };
}

// ============================================================
// FORMAT STUDENT
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
// BUILD STUDENT SEARCH RESPONSE
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
// BUILD STUDENT DETAIL
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
    `- Ngày sinh: **${formatDateVN(student.date_of_birth) || "Chưa cập nhật"}**`,
    `- Trạng thái: **${formatStudentStatusVN(student.status)}**`,
    "",
    "### Lớp học",
  ];

  if (student.classes && student.classes.length) {
    student.classes.forEach((classItem) => {
      lines.push(
        `- ${classItem.name || "Chưa có tên"}${
          classItem.code ? ` (${classItem.code})` : ""
        }`,
      );
    });
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
// BUILD CLASS RESPONSE
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

  if (data.students && data.students.length) {
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
// BUILD ATTENDANCE SUMMARY
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
// BUILD ATTENDANCE STUDENTS
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
    const checkIn = student.check_in_time ? ` — ${student.check_in_time}` : "";

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
// BUILD PERIOD STATISTICS
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
    `Thời gian: **${formatDateVN(data.start_date)} → ${formatDateVN(data.end_date)}**`,
  );

  lines.push(`Loại: **${data.attendance_type_label}**`);

  lines.push("");
  lines.push("### Tổng hợp");
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
  console.log("                 FAITHEDU ASSISTANT PHASE 3");
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
      reply: buildUnknownResponse(),
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
      return {
        success: true,
        intent,
        reply: buildStudentSearchResponse(result.students),
        data: result.students,
      };
    }

    return {
      success: true,
      intent,
      reply: buildStudentDetailResponse(result),
      data: result,
    };
  }

  // ==========================================================
  // STUDENT SEARCH
  // ==========================================================

  if (intent === "student_search") {
    const keyword = extractStudentKeyword(text);

    const students = await searchStudents({
      user,
      keyword,
      limit: 20,
    });

    return {
      success: true,
      intent,
      reply: buildStudentSearchResponse(students),
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
      return {
        success: true,
        intent,
        reply:
          "Mình không tìm thấy lớp phù hợp. Bạn hãy cho mình tên hoặc mã lớp cụ thể.",
      };
    }

    if (classInfo.multiple) {
      return {
        success: true,
        intent,
        reply: buildClassResponse(classInfo),
        data: classInfo.classes,
      };
    }

    const result = await getClassDetail({
      user,
      classId: classInfo.id,
    });

    return {
      success: true,
      intent,
      reply: buildClassResponse(result),
      data: result,
    };
  }

  // ==========================================================
  // ATTENDANCE PERIOD STATISTICS
  // ==========================================================

  if (intent === "attendance_period_statistics") {
    const attendanceType = detectAttendanceType(text);

    const classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (classInfo?.multiple) {
      return {
        success: true,
        intent,
        reply: buildClassResponse(classInfo),
        data: classInfo.classes,
      };
    }

    // --------------------------------------------------------
    // Nếu là giáo lý mà không có lớp
    // --------------------------------------------------------

    if (attendanceType === "catechism" && !classInfo) {
      return {
        success: true,
        intent,
        reply:
          "Bạn hãy cho mình biết lớp cần thống kê, ví dụ: **Tháng này lớp Ấu 1 chuyên cần thế nào?**",
      };
    }

    const monthRange = detectMonthRange(text);

    let startDate;
    let endDate;

    if (monthRange) {
      startDate = monthRange.startDate;

      endDate = monthRange.endDate;
    } else {
      const today = getTodayDate();

      startDate = today;
      endDate = today;
    }

    const result = await getMonthlyAttendanceStatistics({
      user,

      classId: classInfo?.id || null,

      startDate,
      endDate,

      attendanceType,
    });

    return {
      success: true,
      intent,
      reply: buildPeriodStatisticsResponse(result),
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
      return {
        success: true,
        intent,
        reply: buildClassResponse(classInfo),
        data: classInfo.classes,
      };
    }

    if (attendanceType === "catechism" && !classInfo) {
      return {
        success: true,
        intent,
        reply:
          "Bạn hãy cho mình biết lớp cần xem, ví dụ: **Hôm nay lớp Ấu 1 những ai vắng?**",
      };
    }

    const result = await getAttendanceStudents({
      user,

      classId: classInfo?.id || null,

      date,

      attendanceType,

      status,
    });

    return {
      success: true,
      intent,
      reply: buildAttendanceStudentsResponse(result),
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
      return {
        success: true,
        intent,
        reply: buildClassResponse(classInfo),
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

      return {
        success: true,
        intent,
        reply: buildAttendanceResponse(result),
        data: result,
      };
    }

    // --------------------------------------------------------
    // CATECHISM
    // --------------------------------------------------------

    if (!classInfo) {
      return {
        success: true,
        intent,
        reply:
          "Bạn hãy cho mình biết lớp cần xem điểm danh, ví dụ: **Hôm nay lớp Ấu 1 điểm danh thế nào?**",
      };
    }

    const result = await getAttendanceSummary({
      user,

      classId: classInfo.id,

      date,

      attendanceType: "catechism",
    });

    return {
      success: true,
      intent,
      reply: buildAttendanceResponse(result),
      data: result,
    };
  }

  // ==========================================================
  // UNKNOWN
  // ==========================================================

  return {
    success: true,
    intent: "unknown",
    reply: buildUnknownResponse(),
  };
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  chat,

  detectIntent,
  detectDate,
  detectAttendanceType,
  detectAttendanceStatus,

  extractClassKeyword,
  extractStudentKeyword,
};

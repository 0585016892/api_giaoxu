// ============================================================
// FAITHEDU - ASSISTANT SERVICE
// PHASE 5.1 → 5.7
//
// 5.1 Smart Intent
// 5.2 Conversation Context
// 5.3 Rich Response Blocks
// 5.4 Smart Statistics
// 5.5 Suggestions
// 5.6 Natural Date Range
// 5.7 Anomaly Detection
//
// IMPORTANT:
// - READ ONLY
// - KHÔNG INSERT
// - KHÔNG UPDATE
// - KHÔNG DELETE
// - KHÔNG GỌI AI / OPENAI / API NGOÀI
// - church_id lấy từ JWT / user
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
// CONFIG
// ============================================================

const MAX_CONTEXTS = 500;

const MAX_STUDENT_RESULTS = 20;
const MAX_CLASS_RESULTS = 20;

const MAX_BLOCK_ITEMS = 20;
const MAX_SUGGESTIONS = 6;

const DEFAULT_RANKING_LIMIT = 10;
const MAX_RANKING_LIMIT = 20;

// ============================================================
// CONVERSATION CONTEXT
// ============================================================
//
// Context hiện tại lưu trong RAM.
//
// Key:
// church_id:user_id
//
// Context giúp xử lý:
//
// "Tìm Trần Hưng"
// → "Tháng này nghỉ mấy buổi?"
//
// hoặc:
//
// "Xem lớp Ấu 1"
// → "Hôm nay thế nào?"
//
// hoặc:
//
// "Ai nghỉ nhiều nhất tháng này?"
// → "Còn lớp Ấu 2 thì sao?"
//
// Lưu ý:
// - Context không chứa token/password.
// - Context chỉ chứa ID / tên / filter cần thiết.
// - Đây là read-only.
// ============================================================

const conversationContexts = new Map();

function getContextKey(user) {
  if (!user?.id || !user?.church_id) {
    return null;
  }

  return `${user.church_id}:${user.id}`;
}

function getConversationContext(user) {
  const key = getContextKey(user);

  if (!key) {
    return {
      lastIntent: null,
      lastStudent: null,
      lastClass: null,
      lastDateRange: null,
      lastAttendanceType: null,
      lastResults: null,
    };
  }

  if (!conversationContexts.has(key)) {
    conversationContexts.set(key, {
      lastIntent: null,
      lastStudent: null,
      lastClass: null,
      lastDateRange: null,
      lastAttendanceType: null,
      lastResults: null,
      updatedAt: Date.now(),
    });
  }

  const context = conversationContexts.get(key);

  context.updatedAt = Date.now();

  return context;
}

function saveConversationContext(user, patch = {}) {
  const key = getContextKey(user);

  if (!key) {
    return;
  }

  const current = getConversationContext(user);

  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };

  conversationContexts.set(key, next);

  // ----------------------------------------------------------
  // Giới hạn RAM
  // ----------------------------------------------------------

  if (conversationContexts.size <= MAX_CONTEXTS) {
    return;
  }

  let oldestKey = null;
  let oldestTime = Infinity;

  for (const [contextKey, value] of conversationContexts.entries()) {
    if ((value?.updatedAt || 0) < oldestTime) {
      oldestTime = value.updatedAt || 0;
      oldestKey = contextKey;
    }
  }

  if (oldestKey) {
    conversationContexts.delete(oldestKey);
  }
}

// ============================================================
// DATE HELPERS
// ============================================================

function formatDateISO(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function getTodayDate() {
  return formatDateISO(new Date());
}

function getYesterdayDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  return formatDateISO(date);
}

function getCurrentWeekRange() {
  const now = new Date();

  const day = now.getDay();

  // Việt Nam:
  // Thứ 2 = ngày đầu tuần
  // Chủ nhật = ngày cuối tuần
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
    label: "Tuần này",
    type: "week",
  };
}

function getPreviousWeekRange() {
  const current = getCurrentWeekRange();

  const start = new Date(`${current.startDate}T00:00:00`);
  const end = new Date(`${current.endDate}T00:00:00`);

  start.setDate(start.getDate() - 7);
  end.setDate(end.getDate() - 7);

  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
    label: "Tuần trước",
    type: "week",
  };
}

function getCurrentMonthRange() {
  const now = new Date();

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
    label: "Tháng này",
    type: "month",
  };
}

function getPreviousMonthRange() {
  const now = new Date();

  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
    label: "Tháng trước",
    type: "month",
  };
}

function getLastNDaysRange(days) {
  const safeDays = Math.max(1, Number(days) || 1);

  const end = new Date();
  const start = new Date();

  start.setDate(start.getDate() - (safeDays - 1));

  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
    label: `${safeDays} ngày gần đây`,
    type: "rolling",
  };
}

// ============================================================
// DATE VALIDATION
// ============================================================

function isValidDateString(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function normalizeDateOrder(range) {
  if (!range?.startDate || !range?.endDate) {
    return null;
  }

  if (range.startDate <= range.endDate) {
    return range;
  }

  return {
    ...range,
    startDate: range.endDate,
    endDate: range.startDate,
  };
}

// ============================================================
// ROBUST DATE FORMAT
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

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }

    const vnMatch = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

    if (vnMatch) {
      return `${vnMatch[1].padStart(2, "0")}/${vnMatch[2].padStart(
        2,
        "0",
      )}/${vnMatch[3]}`;
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
// DATE LABEL
// ============================================================

function getDateRangeLabel(range) {
  if (!range) {
    return "";
  }

  if (range.label) {
    return range.label;
  }

  if (range.startDate && range.endDate && range.startDate === range.endDate) {
    return formatDateVN(range.startDate);
  }

  return `${formatDateVN(range.startDate)} → ${formatDateVN(range.endDate)}`;
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
// ATTENDANCE TYPE
// ============================================================

function detectAttendanceType(message) {
  const normalized = normalizeText(message);

  if (
    normalized.includes("thanh le") ||
    normalized.includes("di le") ||
    normalized.includes("tham du le") ||
    normalized.includes("du le") ||
    normalized.includes("mass")
  ) {
    return "mass";
  }

  return "catechism";
}

function getAttendanceTypeLabel(type) {
  return type === "mass" ? "Thánh lễ" : "Học giáo lý";
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

  if (
    normalized.includes("vang co phep") ||
    normalized.includes("co phep") ||
    normalized.includes("nghi co phep")
  ) {
    return "excused";
  }

  if (
    normalized.includes("di tre") ||
    normalized.includes("tre gio") ||
    normalized.includes("tre")
  ) {
    return "late";
  }

  if (
    normalized.includes("vang") ||
    normalized.includes("nghi") ||
    normalized.includes("vang mat")
  ) {
    return "absent";
  }

  if (
    normalized.includes("co mat") ||
    normalized.includes("di hoc") ||
    normalized.includes("tham du")
  ) {
    return "present";
  }

  return "all";
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

  // ----------------------------------------------------------
  // YYYY-MM-DD
  // ----------------------------------------------------------

  const isoMatch = original.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (isoMatch) {
    const date = isoMatch[0];

    if (isValidDateString(date)) {
      return date;
    }
  }

  // ----------------------------------------------------------
  // DD/MM/YYYY
  // DD-MM-YYYY
  // ----------------------------------------------------------

  const vnMatch = original.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);

  if (vnMatch) {
    const date = `${vnMatch[3]}-${vnMatch[2].padStart(
      2,
      "0",
    )}-${vnMatch[1].padStart(2, "0")}`;

    if (isValidDateString(date)) {
      return date;
    }
  }

  return null;
}

// ============================================================
// MONTH DETECTION
// ============================================================

function detectMonthRange(message) {
  const normalized = normalizeText(message);

  if (normalized.includes("thang nay")) {
    return getCurrentMonthRange();
  }

  if (normalized.includes("thang truoc")) {
    return getPreviousMonthRange();
  }

  // ----------------------------------------------------------
  // tháng 9/2026
  // tháng 9-2026
  // tháng 9 2026
  // ----------------------------------------------------------

  const match = normalized.match(/\bthang\s+(\d{1,2})(?:[\/\-]|\s+)(\d{4})\b/);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const year = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  if (year < 2000 || year > 2100) {
    return null;
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(end),
    label: `Tháng ${month}/${year}`,
    type: "month",
  };
}

// ============================================================
// RANGE DETECTION
// ============================================================

function detectRange(message) {
  const original = String(message || "");
  const normalized = normalizeText(original);

  // ----------------------------------------------------------
  // Hôm nay
  // ----------------------------------------------------------

  if (normalized.includes("hom nay")) {
    const date = getTodayDate();

    return {
      startDate: date,
      endDate: date,
      label: "Hôm nay",
      type: "day",
    };
  }

  // ----------------------------------------------------------
  // Hôm qua
  // ----------------------------------------------------------

  if (normalized.includes("hom qua")) {
    const date = getYesterdayDate();

    return {
      startDate: date,
      endDate: date,
      label: "Hôm qua",
      type: "day",
    };
  }

  // ----------------------------------------------------------
  // Tuần này
  // ----------------------------------------------------------

  if (normalized.includes("tuan nay") || normalized.includes("tuan hien tai")) {
    return getCurrentWeekRange();
  }

  // ----------------------------------------------------------
  // Tuần trước
  // ----------------------------------------------------------

  if (normalized.includes("tuan truoc")) {
    return getPreviousWeekRange();
  }

  // ----------------------------------------------------------
  // 7 ngày
  // ----------------------------------------------------------

  if (
    normalized.includes("7 ngay qua") ||
    normalized.includes("7 ngay gan day") ||
    normalized.includes("7 ngay gan nhat") ||
    normalized.includes("7 ngay")
  ) {
    return getLastNDaysRange(7);
  }

  // ----------------------------------------------------------
  // 30 ngày
  // ----------------------------------------------------------

  if (
    normalized.includes("30 ngay qua") ||
    normalized.includes("30 ngay gan day") ||
    normalized.includes("30 ngay gan nhat") ||
    normalized.includes("30 ngay")
  ) {
    return getLastNDaysRange(30);
  }

  // ----------------------------------------------------------
  // Khoảng ngày:
  //
  // 1/9 đến 30/9/2026
  // 01/09/2026 đến 30/09/2026
  // 1-9-2026 đến 30-9-2026
  // ----------------------------------------------------------

  const rangeMatch = original.match(
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(?:den|-|toi)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/i,
  );

  if (rangeMatch) {
    const startDate = `${rangeMatch[3]}-${rangeMatch[2].padStart(
      2,
      "0",
    )}-${rangeMatch[1].padStart(2, "0")}`;

    const endDate = `${rangeMatch[6]}-${rangeMatch[5].padStart(
      2,
      "0",
    )}-${rangeMatch[4].padStart(2, "0")}`;

    if (isValidDateString(startDate) && isValidDateString(endDate)) {
      return normalizeDateOrder({
        startDate,
        endDate,
        label: `${formatDateVN(startDate)} → ${formatDateVN(endDate)}`,
        type: "custom",
      });
    }
  }

  // ----------------------------------------------------------
  // tháng
  // ----------------------------------------------------------

  const month = detectMonthRange(message);

  if (month) {
    return month;
  }

  // ----------------------------------------------------------
  // ngày cụ thể
  // ----------------------------------------------------------

  const date = detectDate(message);

  if (date) {
    return {
      startDate: date,
      endDate: date,
      label: formatDateVN(date),
      type: "day",
    };
  }

  return null;
}

// ============================================================
// CLASS KEYWORD
// ============================================================

function extractClassKeyword(message) {
  const text = normalizeText(message);

  // ----------------------------------------------------------
  // "lớp Ấu 1"
  // "lớp 6A"
  // "lớp giáo lý Ấu 1"
  // ----------------------------------------------------------

  const match = text.match(
    /\blop\s+(.+?)(?=\s+(?:hom nay|hom qua|ngay|co|bao nhieu|vang|nghi|di tre|chua|diem danh|thang|tuan|danh sach|nhung ai|ai|chuyen can|the nao|tot nhat|thap nhat|va|voi|so sanh)\b|$)/,
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
  ];

  for (const prefix of prefixes) {
    if (text === prefix) {
      text = "";
      break;
    }

    if (text.startsWith(`${prefix} `)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }

  text = text
    .replace(
      /\b(hom nay|hom qua|diem danh|chi tiet|thong tin chi tiet|thang nay|thang truoc|tuan nay|tuan truoc)\b/g,
      "",
    )
    .trim();

  // ----------------------------------------------------------
  // Xóa các cụm hành động còn sót
  // ----------------------------------------------------------

  text = text
    .replace(
      /\b(nghi bao nhieu buoi|nghi nhung ngay nao|di tre nhung ngay nao|lich su|lich su diem danh|the nao|ra sao)\b/g,
      "",
    )
    .trim();

  // ----------------------------------------------------------
  // Nếu câu có "lớp" thì không lấy lớp làm tên học sinh
  // ----------------------------------------------------------

  text = text.replace(/\blop\s+.+$/i, "").trim();

  return text;
}

// ============================================================
// MULTIPLE CLASS SEARCH
// ============================================================

async function searchClassesFromMessage(user, message) {
  const normalized = normalizeText(message);

  const keywords = [];

  // ----------------------------------------------------------
  // Tách:
  // lớp Ấu 1 và lớp Ấu 2
  // lớp Ấu 1 với Ấu 2
  // so sánh lớp Ấu 1 và Ấu 2
  // ----------------------------------------------------------

  const matches = normalized.matchAll(
    /\blop\s+(.+?)(?=\s+(?:va|voi|so|chuyen|thang|thang nay|tuan|hom nay|hom qua|tot nhat|thap nhat|the nao)\b|$)/gi,
  );

  for (const match of matches) {
    const value = match?.[1]?.trim();

    if (value) {
      keywords.push(value);
    }
  }

  // ----------------------------------------------------------
  // Trường hợp "lớp Ấu 1 và Ấu 2"
  // ----------------------------------------------------------

  if (!keywords.length) {
    const compact = normalized.match(
      /\blop\s+(.+?)\s+(?:va|voi)\s+(.+?)(?=\s+(?:thang|tuan|so|chuyen|tot|thap|the nao)\b|$)/,
    );

    if (compact) {
      if (compact[1]) {
        keywords.push(compact[1].trim());
      }

      if (compact[2]) {
        keywords.push(compact[2].trim());
      }
    }
  }

  const unique = [...new Set(keywords.filter(Boolean))];

  const result = [];

  for (const keyword of unique) {
    const classes = await searchClasses({
      user,
      keyword,
      limit: 10,
    });

    if (!classes.length) {
      continue;
    }

    const normalizedKeyword = normalizeText(keyword);

    const exact = classes.find(
      (item) =>
        normalizeText(item.name) === normalizedKeyword ||
        normalizeText(item.code) === normalizedKeyword,
    );

    if (exact) {
      result.push(exact);
      continue;
    }

    if (classes.length === 1) {
      result.push(classes[0]);
    }
  }

  const map = new Map();

  for (const item of result) {
    if (item?.id != null) {
      map.set(String(item.id), item);
    }
  }

  return [...map.values()];
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
    limit: MAX_CLASS_RESULTS,
  });

  if (!classes.length) {
    return null;
  }

  const normalizedKeyword = normalizeText(keyword);

  const exact = classes.find(
    (item) =>
      normalizeText(item.name) === normalizedKeyword ||
      normalizeText(item.code) === normalizedKeyword,
  );

  if (exact) {
    return exact;
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
// ENTITY RESOLUTION FROM CONTEXT
// ============================================================

async function resolveStudentFromContext({ user, message, context }) {
  const keyword = extractStudentKeyword(message);

  if (keyword) {
    const students = await searchStudents({
      user,
      keyword,
      limit: MAX_STUDENT_RESULTS,
    });

    if (students.length === 1) {
      return {
        student: students[0],
        multiple: false,
        students,
      };
    }

    if (students.length > 1) {
      return {
        student: null,
        multiple: true,
        students,
      };
    }
  }

  if (context?.lastStudent?.id) {
    try {
      const student = await getStudentDetail({
        user,
        keyword: context.lastStudent.code || context.lastStudent.name,
      });

      if (student && !student.multiple) {
        return {
          student,
          multiple: false,
          students: [student],
        };
      }
    } catch {
      // Context chỉ là fallback.
      // Nếu không resolve được thì bỏ qua.
    }
  }

  return {
    student: null,
    multiple: false,
    students: [],
  };
}

// ============================================================
// SMART INTENT - 5.1
// ============================================================

function detectIntent(message, context = {}) {
  const normalized = normalizeText(message);

  // ==========================================================
  // HELP
  // ==========================================================

  if (
    normalized === "help" ||
    normalized === "tro giup" ||
    normalized.includes("huong dan") ||
    normalized.includes("lam the nao") ||
    normalized.includes("co the hoi gi")
  ) {
    return "help";
  }

  // ==========================================================
  // ANOMALY
  // ==========================================================

  if (
    normalized.includes("bat thuong") ||
    normalized.includes("du lieu loi") ||
    normalized.includes("du lieu sai") ||
    normalized.includes("trung diem danh") ||
    normalized.includes("duplicate") ||
    normalized.includes("diem danh trung") ||
    normalized.includes("kiem tra du lieu")
  ) {
    return "attendance_anomalies";
  }

  // ==========================================================
  // UNASSIGNED
  // ==========================================================

  if (
    normalized.includes("chua phan lop") ||
    normalized.includes("khong phan lop") ||
    normalized.includes("chua duoc phan lop") ||
    normalized.includes("chua co lop")
  ) {
    return "unassigned_students";
  }

  // ==========================================================
  // PARISH STATISTICS
  // ==========================================================

  if (
    (normalized.includes("tong quan") ||
      normalized.includes("toan giao xu") ||
      normalized.includes("giao xu co bao nhieu") ||
      normalized.includes("thong ke giao xu") ||
      normalized.includes("tong so hoc sinh")) &&
    !normalized.includes("lop")
  ) {
    return "parish_statistics";
  }

  // ==========================================================
  // CLASS COMPARISON
  // ==========================================================

  if (normalized.includes("so sanh") && normalized.includes("lop")) {
    return "class_comparison";
  }

  // ==========================================================
  // CLASS RANKING
  // ==========================================================

  if (
    normalized.includes("lop nao") &&
    (normalized.includes("chuyen can") ||
      normalized.includes("tot nhat") ||
      normalized.includes("thap nhat") ||
      normalized.includes("vang nhieu") ||
      normalized.includes("nghi nhieu"))
  ) {
    return "class_attendance_ranking";
  }

  // ==========================================================
  // STUDENT RANKING
  // ==========================================================

  if (
    normalized.includes("ai nghi nhieu nhat") ||
    normalized.includes("nhung em nghi nhieu") ||
    normalized.includes("hoc sinh nghi nhieu") ||
    normalized.includes("xep hang hoc sinh") ||
    normalized.includes("ai vang nhieu nhat") ||
    normalized.includes("hoc sinh nao nghi nhieu nhat")
  ) {
    return "student_attendance_ranking";
  }

  // ==========================================================
  // NEED ATTENTION
  // ==========================================================

  if (
    normalized.includes("can luu y") ||
    normalized.includes("can quan tam") ||
    normalized.includes("hoc sinh yeu") ||
    normalized.includes("chuyen can thap") ||
    normalized.includes("duoi 70") ||
    normalized.includes("nghi nhieu")
  ) {
    return "students_needing_attention";
  }

  // ==========================================================
  // STUDENT HISTORY
  // ==========================================================

  if (
    normalized.includes("lich su diem danh") ||
    normalized.includes("lich su di hoc") ||
    normalized.includes("nghi nhung ngay nao") ||
    normalized.includes("nghi bao nhieu buoi") ||
    normalized.includes("di tre nhung ngay nao") ||
    normalized.includes("di tre bao nhieu") ||
    normalized.includes("thang nay nghi")
  ) {
    return "student_attendance_history";
  }

  // ==========================================================
  // ATTENDANCE
  // ==========================================================

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
    // --------------------------------------------------------
    // Khoảng thời gian
    // --------------------------------------------------------

    if (
      normalized.includes("thang") ||
      normalized.includes("tuan") ||
      normalized.includes("ngay qua") ||
      normalized.includes("ngay gan") ||
      normalized.includes("chuyen can") ||
      normalized.includes("7 ngay") ||
      normalized.includes("30 ngay")
    ) {
      return "attendance_period_statistics";
    }

    // --------------------------------------------------------
    // Danh sách
    // --------------------------------------------------------

    if (
      normalized.includes("nhung ai") ||
      normalized.includes("ai ") ||
      normalized.includes("danh sach") ||
      normalized.includes("em nao")
    ) {
      return "attendance_students";
    }

    return "attendance_summary";
  }

  // ==========================================================
  // STUDENT DETAIL
  // ==========================================================

  if (normalized.includes("thong tin") && normalized.includes("hoc sinh")) {
    return "student_detail";
  }

  // "Thông tin Trần Hưng"
  if (normalized.startsWith("thong tin ") && !normalized.includes("lop")) {
    return "student_detail";
  }

  // ==========================================================
  // STUDENT SEARCH
  // ==========================================================

  if (
    normalized.includes("tim hoc sinh") ||
    normalized.includes("tim em") ||
    normalized.includes("tra cuu hoc sinh")
  ) {
    return "student_search";
  }

  // ==========================================================
  // CLASS
  // ==========================================================

  if (
    normalized.includes("thong tin lop") ||
    normalized.includes("danh sach lop") ||
    normalized.includes("lop nao") ||
    normalized.includes("lop ")
  ) {
    return "class_detail";
  }

  // ==========================================================
  // CONTEXT FOLLOW-UP
  // ==========================================================

  if (
    context?.lastStudent &&
    (normalized.includes("con ") ||
      normalized.includes("the nao") ||
      normalized.includes("ra sao") ||
      normalized.includes("thang nay") ||
      normalized.includes("thang truoc"))
  ) {
    return "student_attendance_history";
  }

  if (
    context?.lastClass &&
    (normalized.includes("the nao") ||
      normalized.includes("ra sao") ||
      normalized.includes("hom nay") ||
      normalized.includes("thang nay") ||
      normalized.includes("thang truoc"))
  ) {
    return "attendance_period_statistics";
  }

  return "unknown";
}

// ============================================================
// RESPONSE BLOCK HELPERS - 5.3
// ============================================================

function createBlock(type, data = {}) {
  return {
    type,
    data,
  };
}

function createSuggestion(label, message, icon = null) {
  return {
    label,
    message,
    ...(icon ? { icon } : {}),
  };
}

function uniqueSuggestions(items) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    if (!item?.message) {
      continue;
    }

    const key = normalizeText(item.message);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);

    if (result.length >= MAX_SUGGESTIONS) {
      break;
    }
  }

  return result;
}

// ============================================================
// STATISTICS HELPERS - 5.4
// ============================================================

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(2)}%`;
}

function getAttendanceRateLevel(rate) {
  const value = toNumber(rate);

  if (value >= 90) {
    return {
      level: "excellent",
      label: "Rất tốt",
    };
  }

  if (value >= 80) {
    return {
      level: "good",
      label: "Tốt",
    };
  }

  if (value >= 70) {
    return {
      level: "warning",
      label: "Cần theo dõi",
    };
  }

  return {
    level: "critical",
    label: "Cần lưu ý",
  };
}

function calculateAttendanceRate(statistics = {}) {
  const present = toNumber(statistics.present);
  const late = toNumber(statistics.late);
  const absent = toNumber(statistics.absent);
  const excused = toNumber(statistics.excused);

  const denominator = present + late + absent + excused;

  if (!denominator) {
    return 0;
  }

  return ((present + late) / denominator) * 100;
}

// ============================================================
// STUDENT RESPONSE
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
// STUDENT BLOCK
// ============================================================

function buildStudentBlock(student) {
  if (!student) {
    return null;
  }

  return createBlock("student_card", {
    id: student.id,
    name: student.name,
    code: student.code || null,
    gender: formatGenderVN(student.gender),
    date_of_birth: formatDateVN(student.date_of_birth),
    status: formatStudentStatusVN(student.status),
    classes: Array.isArray(student.classes)
      ? student.classes
      : student.class_names
        ? [
            {
              name: student.class_names,
            },
          ]
        : [],
    father_name: student.father_name || null,
    mother_name: student.mother_name || null,
    father_phone: student.father_phone || null,
    mother_phone: student.mother_phone || null,
  });
}

// ============================================================
// ATTENDANCE RESPONSE
// ============================================================

function buildAttendanceResponse(data) {
  const s = data?.statistics || {};

  const rate =
    s.attendance_rate != null
      ? toNumber(s.attendance_rate)
      : calculateAttendanceRate(s);

  const level = getAttendanceRateLevel(rate);

  return [
    "📊 **ĐIỂM DANH**",
    "",
    `Ngày: **${formatDateVN(data?.date)}**`,
    `Loại: **${
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type)
    }**`,
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
    `### Tỷ lệ tham dự: **${rate.toFixed(2)}%**`,
    `Mức đánh giá: **${level.label}**`,
  ].join("\n");
}

function buildAttendanceBlock(data) {
  const s = data?.statistics || {};

  const rate =
    s.attendance_rate != null
      ? toNumber(s.attendance_rate)
      : calculateAttendanceRate(s);

  const level = getAttendanceRateLevel(rate);

  return createBlock("attendance_summary", {
    date: data?.date || null,
    start_date: data?.start_date || data?.date || null,
    end_date: data?.end_date || data?.date || null,
    attendance_type: data?.attendance_type || null,
    attendance_type_label:
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type),
    class: data?.class || null,
    statistics: {
      total: toNumber(s.total),
      present: toNumber(s.present),
      late: toNumber(s.late),
      absent: toNumber(s.absent),
      excused: toNumber(s.excused),
      not_attended: toNumber(s.not_attended),
      attendance_rate: Number(rate.toFixed(2)),
    },
    level,
  });
}

// ============================================================
// PERIOD RESPONSE
// ============================================================

function buildPeriodResponse(data) {
  const s = data?.statistics || {};

  const rate =
    s.attendance_rate != null
      ? toNumber(s.attendance_rate)
      : calculateAttendanceRate(s);

  const level = getAttendanceRateLevel(rate);

  return [
    "📈 **THỐNG KÊ CHUYÊN CẦN**",
    "",
    data?.class?.name
      ? `Lớp: **${data.class.name}**`
      : "Phạm vi: **Toàn giáo xứ**",
    `Thời gian: **${formatDateVN(
      data?.start_date,
    )} → ${formatDateVN(data?.end_date)}**`,
    `Loại: **${
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type)
    }**`,
    "",
    `- Số lượt điểm danh: **${s.total_records || 0}**`,
    `- Số buổi: **${s.attendance_days || 0}**`,
    `- Có mặt: **${s.present || 0}**`,
    `- Đi trễ: **${s.late || 0}**`,
    `- Vắng: **${s.absent || 0}**`,
    `- Có phép: **${s.excused || 0}**`,
    "",
    `### Tỷ lệ tham dự: **${rate.toFixed(2)}%**`,
    `Mức đánh giá: **${level.label}**`,
  ].join("\n");
}

function buildStatisticsBlock(data) {
  const s = data?.statistics || {};

  const rate =
    s.attendance_rate != null
      ? toNumber(s.attendance_rate)
      : calculateAttendanceRate(s);

  return createBlock("statistics", {
    scope: data?.class?.name ? "class" : "parish",
    class: data?.class || null,

    start_date: data?.start_date || null,
    end_date: data?.end_date || null,

    attendance_type: data?.attendance_type || null,

    attendance_type_label:
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type),

    total_records: toNumber(s.total_records),
    attendance_days: toNumber(s.attendance_days),
    present: toNumber(s.present),
    late: toNumber(s.late),
    absent: toNumber(s.absent),
    excused: toNumber(s.excused),
    not_attended: toNumber(s.not_attended),

    attendance_rate: Number(rate.toFixed(2)),
    level: getAttendanceRateLevel(rate),
  });
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

  const rate =
    s.attendance_rate != null
      ? toNumber(s.attendance_rate)
      : calculateAttendanceRate(s);

  const lines = [
    "📚 **LỊCH SỬ ĐIỂM DANH HỌC SINH**",
    "",
    `Học sinh: **${data.student?.name || ""}**`,
    `Mã HS: **${data.student?.code || "Chưa có"}**`,
    `Thời gian: **${formatDateVN(
      data.start_date,
    )} → ${formatDateVN(data.end_date)}**`,
    `Loại: **${data.attendance_type_label || ""}**`,
    "",
    "### Tổng hợp",
    "",
    `- Có mặt: **${s.present || 0}**`,
    `- Đi trễ: **${s.late || 0}**`,
    `- Vắng: **${s.absent || 0}**`,
    `- Có phép: **${s.excused || 0}**`,
    "",
    `### Tỷ lệ tham dự: **${rate.toFixed(2)}%**`,
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

function buildStudentHistoryBlock(data) {
  if (!data || data.multiple) {
    return null;
  }

  const s = data.statistics || {};

  const rate =
    s.attendance_rate != null
      ? toNumber(s.attendance_rate)
      : calculateAttendanceRate(s);

  return createBlock("attendance_history", {
    student: data.student || null,

    start_date: data.start_date || null,
    end_date: data.end_date || null,

    attendance_type: data.attendance_type || null,

    attendance_type_label: data.attendance_type_label || null,

    statistics: {
      present: toNumber(s.present),
      late: toNumber(s.late),
      absent: toNumber(s.absent),
      excused: toNumber(s.excused),
      attendance_rate: Number(rate.toFixed(2)),
    },

    rows: Array.isArray(data.data) ? data.data.slice(0, MAX_BLOCK_ITEMS) : [],
  });
}

// ============================================================
// RANKING RESPONSE
// ============================================================

function buildStudentRankingResponse(rows, title = "HỌC SINH CHUYÊN CẦN THẤP") {
  if (!rows?.length) {
    return [`📊 **${title}**`, "", "Không có học sinh phù hợp."].join("\n");
  }

  const lines = [`📊 **${title}**`, ""];

  rows.forEach((row, index) => {
    lines.push(`${index + 1}. **${row.name}** — ${row.code || "Chưa có mã"}`);

    lines.push(
      `   Chuyên cần: **${formatPercent(
        row.attendance_rate,
      )}** | Vắng: **${row.absent || 0}** | Trễ: **${row.late || 0}**`,
    );
  });

  return lines.join("\n");
}

function buildRankingBlock(rows) {
  return createBlock("ranking", {
    ranking_type: "student",
    rows: (rows || []).slice(0, MAX_BLOCK_ITEMS).map((row, index) => ({
      rank: index + 1,
      id: row.id,
      name: row.name,
      code: row.code || null,
      class_name: row.class_name || null,
      attendance_rate: toNumber(row.attendance_rate),
      present: toNumber(row.present),
      late: toNumber(row.late),
      absent: toNumber(row.absent),
      excused: toNumber(row.excused),
    })),
  });
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
    lines.push(
      `${index + 1}. **${row.name}** — **${formatPercent(
        row.attendance_rate,
      )}**`,
    );

    lines.push(
      `   Có mặt: ${row.present || 0} | Trễ: ${
        row.late || 0
      } | Vắng: ${row.absent || 0}`,
    );
  });

  return lines.join("\n");
}

function buildClassRankingBlock(rows) {
  return createBlock("ranking", {
    ranking_type: "class",

    rows: (rows || []).slice(0, MAX_BLOCK_ITEMS).map((row, index) => ({
      rank: index + 1,
      id: row.id,
      name: row.name,
      code: row.code || null,
      student_count: toNumber(row.student_count),
      attendance_rate: toNumber(row.attendance_rate),
      present: toNumber(row.present),
      late: toNumber(row.late),
      absent: toNumber(row.absent),
      excused: toNumber(row.excused),
    })),
  });
}

// ============================================================
// PARISH RESPONSE
// ============================================================

function buildParishResponse(data) {
  const s = data?.students || {};
  const a = data?.attendance || {};

  const rate =
    a.attendance_rate != null
      ? toNumber(a.attendance_rate)
      : calculateAttendanceRate(a);

  return [
    "⛪ **TỔNG QUAN GIÁO XỨ**",
    "",
    `Thời gian: **${formatDateVN(
      data?.start_date,
    )} → ${formatDateVN(data?.end_date)}**`,
    `Loại: **${
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type)
    }**`,
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
    `### Tỷ lệ tham dự: **${rate.toFixed(2)}%**`,
  ].join("\n");
}

function buildParishBlock(data) {
  const s = data?.students || {};
  const a = data?.attendance || {};

  const rate =
    a.attendance_rate != null
      ? toNumber(a.attendance_rate)
      : calculateAttendanceRate(a);

  return createBlock("parish_statistics", {
    start_date: data?.start_date || null,
    end_date: data?.end_date || null,

    attendance_type: data?.attendance_type || null,

    attendance_type_label:
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type),

    students: {
      total: toNumber(s.total),
      active: toNumber(s.active),
      unassigned: toNumber(s.unassigned),
    },

    classes: {
      total: toNumber(data?.classes?.total),
    },

    attendance: {
      total_records: toNumber(a.total_records),
      attendance_days: toNumber(a.attendance_days),
      present: toNumber(a.present),
      late: toNumber(a.late),
      absent: toNumber(a.absent),
      excused: toNumber(a.excused),
      attendance_rate: Number(rate.toFixed(2)),
    },
  });
}

// ============================================================
// NEED ATTENTION
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
    lines.push(`${index + 1}. **${row.name}** — ${row.code || "Chưa có mã"}`);

    lines.push(
      `   Chuyên cần: **${formatPercent(
        row.attendance_rate,
      )}** | Vắng: **${row.absent || 0}** | Trễ: **${row.late || 0}**`,
    );
  });

  return lines.join("\n");
}

function buildNeedAttentionBlock(rows) {
  return createBlock("warning", {
    category: "students_needing_attention",

    count: rows?.length || 0,

    students: (rows || []).slice(0, MAX_BLOCK_ITEMS).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code || null,
      class_name: row.class_name || null,
      attendance_rate: toNumber(row.attendance_rate),
      absent: toNumber(row.absent),
      late: toNumber(row.late),
    })),
  });
}

// ============================================================
// UNASSIGNED
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

function buildUnassignedBlock(rows) {
  return createBlock("student_list", {
    list_type: "unassigned",

    count: rows?.length || 0,

    students: (rows || []).slice(0, MAX_BLOCK_ITEMS).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code || null,
      gender: formatGenderVN(row.gender),
      status: formatStudentStatusVN(row.status),
    })),
  });
}

// ============================================================
// ATTENDANCE STUDENT LIST
// ============================================================

function buildAttendanceStudentsResponse(data) {
  const lines = [
    "📋 **DANH SÁCH ĐIỂM DANH**",
    "",
    `Ngày: **${formatDateVN(data?.date)}**`,
    `Loại: **${
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type)
    }**`,
  ];

  if (data?.class?.name) {
    lines.push(`Lớp: **${data.class.name}**`);
  }

  if (data?.status && data.status !== "all") {
    lines.push(`Trạng thái: **${data.status}**`);
  }

  lines.push("");

  if (!data?.data?.length) {
    lines.push("Không có học sinh phù hợp.");
  } else {
    data.data.forEach((student, index) => {
      lines.push(
        `${index + 1}. **${student.name}** — ${student.code || "Chưa có mã"}`,
      );
    });
  }

  return lines.join("\n");
}

function buildAttendanceStudentsBlock(data) {
  return createBlock("attendance_list", {
    date: data?.date || null,

    attendance_type: data?.attendance_type || null,

    attendance_type_label:
      data?.attendance_type_label ||
      getAttendanceTypeLabel(data?.attendance_type),

    class: data?.class || null,

    status: data?.status || "all",

    total: toNumber(data?.total, data?.data?.length || 0),

    students: (data?.data || []).slice(0, MAX_BLOCK_ITEMS).map((student) => ({
      id: student.id,
      name: student.name,
      code: student.code || null,
      attendance_status: student.attendance_status || null,
      check_in_time: student.check_in_time || null,
    })),
  });
}

// ============================================================
// ANOMALY RESPONSE - 5.7
// ============================================================

function getAnomalySeverity(item) {
  const type = normalizeText(
    item?.type || item?.code || item?.anomaly_type || "",
  );

  if (
    type.includes("duplicate") ||
    type.includes("trung") ||
    type.includes("invalid")
  ) {
    return "high";
  }

  if (
    type.includes("missing") ||
    type.includes("mismatch") ||
    type.includes("class")
  ) {
    return "medium";
  }

  return "low";
}

function buildAnomalyResponse(data) {
  const anomalies = data?.anomalies || [];

  if (!anomalies.length) {
    return [
      "✅ **KIỂM TRA DỮ LIỆU**",
      "",
      "Không phát hiện bất thường trong khoảng thời gian được kiểm tra.",
    ].join("\n");
  }

  const lines = [
    "⚠️ **BẤT THƯỜNG ĐIỂM DANH**",
    "",
    `Phát hiện **${anomalies.length} vấn đề**.`,
    "",
  ];

  anomalies.forEach((item, index) => {
    lines.push(`${index + 1}. **${item.message || "Dữ liệu bất thường"}**`);

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

function buildAnomalyBlock(data) {
  const anomalies = data?.anomalies || [];

  return createBlock("warning", {
    category: "attendance_anomalies",

    count: anomalies.length,

    anomalies: anomalies.slice(0, MAX_BLOCK_ITEMS).map((item) => ({
      type: item.type || item.code || item.anomaly_type || "unknown",

      severity: getAnomalySeverity(item),

      message: item.message || "Dữ liệu bất thường",

      student_id: item.student_id || null,

      student_name: item.student_name || null,

      student_code: item.student_code || null,

      class_id: item.class_id || null,

      class_name: item.class_name || null,

      attendance_date: item.attendance_date || null,
    })),
  });
}

// ============================================================
// HELP
// ============================================================

function buildHelpResponse() {
  return [
    "🤖 **TRỢ LÝ FAITHEDU**",
    "",
    "Bạn có thể hỏi mình về:",
    "",
    "### Học sinh",
    "- Tìm học sinh Trần Hưng",
    "- Thông tin học sinh Trần Hưng",
    "- Lịch sử điểm danh Trần Hưng",
    "- Trần Hưng tháng này nghỉ bao nhiêu buổi?",
    "",
    "### Điểm danh",
    "- Hôm nay lớp Ấu 1 điểm danh thế nào?",
    "- Hôm nay lớp Ấu 1 những ai vắng?",
    "- Hôm nay lớp Ấu 1 ai chưa điểm danh?",
    "",
    "### Chuyên cần",
    "- Những em nào nghỉ nhiều nhất tháng này?",
    "- Học sinh nào cần lưu ý?",
    "- Lớp nào chuyên cần tốt nhất?",
    "- So sánh lớp Ấu 1 và lớp Ấu 2",
    "",
    "### Thời gian",
    "- Hôm nay",
    "- Hôm qua",
    "- Tuần này",
    "- Tuần trước",
    "- Tháng này",
    "- Tháng trước",
    "- 7 ngày qua",
    "- 30 ngày qua",
    "- Tháng 9/2026",
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
    "- Trần Hưng tháng này nghỉ bao nhiêu buổi?",
    "- Học sinh nào cần lưu ý?",
    "- Lớp nào chuyên cần tốt nhất?",
    "- So sánh lớp Ấu 1 và lớp Ấu 2",
    "- Tổng quan giáo xứ",
    "- Có học sinh nào chưa phân lớp?",
    "- Có dữ liệu điểm danh bất thường không?",
  ].join("\n");
}

// ============================================================
// SUGGESTIONS - 5.5
// ============================================================

function buildStudentSuggestions(student) {
  if (!student) {
    return uniqueSuggestions([
      createSuggestion("Tìm học sinh khác", "Tìm học sinh Nguyễn Văn An"),
    ]);
  }

  const name = student.name;

  return uniqueSuggestions([
    createSuggestion("Xem lịch sử điểm danh", `Lịch sử điểm danh ${name}`),

    createSuggestion(
      "Tháng này nghỉ bao nhiêu?",
      `${name} tháng này nghỉ bao nhiêu buổi?`,
    ),

    createSuggestion(
      "Những ngày nào vắng?",
      `${name} tháng này nghỉ những ngày nào?`,
    ),

    createSuggestion(
      "Đi trễ những ngày nào?",
      `${name} tháng này đi trễ những ngày nào?`,
    ),
  ]);
}

function buildAttendanceSuggestions({ classInfo, date, type }) {
  const className = classInfo?.name;

  const dateText = date === getTodayDate() ? "hôm nay" : formatDateVN(date);

  const suggestions = [];

  if (className) {
    suggestions.push(
      createSuggestion(
        "Ai vắng?",
        `${dateText} lớp ${className} những ai vắng?`,
      ),
    );

    suggestions.push(
      createSuggestion(
        "Ai chưa điểm danh?",
        `${dateText} lớp ${className} ai chưa điểm danh?`,
      ),
    );

    suggestions.push(
      createSuggestion(
        "Xem chuyên cần tháng này",
        `Lớp ${className} tháng này chuyên cần thế nào?`,
      ),
    );
  } else if (type === "mass") {
    suggestions.push(
      createSuggestion(
        "Ai vắng Thánh lễ?",
        `${dateText} những ai vắng Thánh lễ?`,
      ),
    );

    suggestions.push(
      createSuggestion(
        "Thống kê Thánh lễ",
        "Tháng này Thánh lễ chuyên cần thế nào?",
      ),
    );
  }

  return uniqueSuggestions(suggestions);
}

// ============================================================
// META
// ============================================================

function buildMeta({
  intent,
  range = null,
  resultCount = 0,
  attendanceType = null,
}) {
  return {
    intent,
    readOnly: true,

    dateRange: range
      ? {
          startDate: range.startDate || null,
          endDate: range.endDate || null,
          label: getDateRangeLabel(range),
          type: range.type || null,
        }
      : null,

    attendanceType,

    resultCount: Number(resultCount) || 0,

    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// STANDARD RESPONSE
// ============================================================

function createResponse({
  intent,
  reply,
  data = null,
  blocks = [],
  suggestions = [],
  range = null,
  attendanceType = null,
  resultCount = 0,
}) {
  return {
    success: true,

    intent,

    reply,

    // Giữ answer để frontend cũ không bị lỗi.
    answer: reply,

    data,

    blocks: Array.isArray(blocks) ? blocks : [],

    suggestions: uniqueSuggestions(suggestions),

    meta: buildMeta({
      intent,
      range,
      resultCount,
      attendanceType,
    }),
  };
}

// ============================================================
// MAIN CHAT - PHASE 5
// ============================================================

async function chat({ user, message }) {
  const text = String(message || "").trim();

  if (!text) {
    const error = new Error("Bạn hãy nhập câu hỏi.");

    error.code = "ASSISTANT_MESSAGE_REQUIRED";
    error.status = 400;

    throw error;
  }

  // ==========================================================
  // CONTEXT
  // ==========================================================

  const context = getConversationContext(user);

  // ==========================================================
  // INTENT
  // ==========================================================

  const intent = detectIntent(text, context);

  console.log("");
  console.log("============================================================");
  console.log("              FAITHEDU ASSISTANT PHASE 5");
  console.log("============================================================");
  console.log("USER ID:", user?.id);
  console.log("ROLE:", user?.role);
  console.log("CHURCH ID:", user?.church_id);
  console.log("MESSAGE:", text);
  console.log("INTENT:", intent);

  console.log(
    "[ASSISTANT] CONTEXT STUDENT:",
    context?.lastStudent?.name || null,
  );

  console.log("[ASSISTANT] CONTEXT CLASS:", context?.lastClass?.name || null);

  // ==========================================================
  // HELP
  // ==========================================================

  if (intent === "help") {
    const reply = buildHelpResponse();

    const response = createResponse({
      intent,
      reply,
      blocks: [
        createBlock("info", {
          title: "Bạn có thể hỏi mình",
          readOnly: true,
        }),
      ],
      suggestions: [
        createSuggestion("Tìm học sinh", "Tìm học sinh Trần Hưng"),
        createSuggestion("Xem chuyên cần", "Học sinh nào cần lưu ý?"),
        createSuggestion("Xem lớp", "Lớp nào chuyên cần tốt nhất?"),
        createSuggestion("Tổng quan", "Tổng quan giáo xứ"),
      ],
    });

    saveConversationContext(user, {
      lastIntent: intent,
    });

    return response;
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
      limit: MAX_STUDENT_RESULTS,
    });

    const reply = buildStudentSearchResponse(students);

    const blocks =
      students.length === 1
        ? [buildStudentBlock(students[0])]
        : [
            createBlock("student_list", {
              list_type: "search",
              count: students.length,
              students: students.slice(0, MAX_BLOCK_ITEMS).map((student) => ({
                id: student.id,
                name: student.name,
                code: student.code || null,
                class_names: student.class_names || null,
                status: formatStudentStatusVN(student.status),
              })),
            }),
          ];

    const suggestions =
      students.length === 1
        ? buildStudentSuggestions(students[0])
        : [createSuggestion("Tìm theo mã học sinh", "Tìm học sinh HS000001")];

    saveConversationContext(user, {
      lastIntent: intent,
      lastStudent:
        students.length === 1
          ? {
              id: students[0].id,
              name: students[0].name,
              code: students[0].code || null,
            }
          : null,
      lastClass: null,
      lastResults: students,
    });

    return createResponse({
      intent,
      reply,
      data: students,
      blocks,
      suggestions,
      resultCount: students.length,
    });
  }

  // ==========================================================
  // STUDENT DETAIL
  // ==========================================================

  if (intent === "student_detail") {
    const keyword = extractStudentKeyword(text);

    let result;

    if (keyword) {
      result = await getStudentDetail({
        user,
        keyword,
      });
    } else if (context?.lastStudent?.id) {
      result = await getStudentDetail({
        user,
        keyword: context.lastStudent.code || context.lastStudent.name,
      });
    } else {
      result = null;
    }

    if (result?.multiple) {
      const reply = buildStudentSearchResponse(result.students);

      saveConversationContext(user, {
        lastIntent: intent,
        lastResults: result.students,
      });

      return createResponse({
        intent,
        reply,
        data: result.students,
        blocks: [
          createBlock("student_list", {
            list_type: "search",
            count: result.students.length,
            students: result.students
              .slice(0, MAX_BLOCK_ITEMS)
              .map((student) => ({
                id: student.id,
                name: student.name,
                code: student.code || null,
                class_names: student.class_names || null,
              })),
          }),
        ],
        suggestions: [
          createSuggestion("Tìm chính xác hơn", "Tìm học sinh Trần Hưng"),
        ],
        resultCount: result.students.length,
      });
    }

    const reply = buildStudentDetailResponse(result);

    const suggestions = buildStudentSuggestions(result);

    if (result) {
      saveConversationContext(user, {
        lastIntent: intent,
        lastStudent: {
          id: result.id,
          name: result.name,
          code: result.code || null,
        },
        lastResults: [result],
      });
    }

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: result ? [buildStudentBlock(result)] : [],
      suggestions,
      resultCount: result ? 1 : 0,
    });
  }

  // ==========================================================
  // STUDENT HISTORY
  // ==========================================================

  if (intent === "student_attendance_history") {
    const range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

    const type =
      detectAttendanceType(text) || context?.lastAttendanceType || "catechism";

    const studentResult = await resolveStudentFromContext({
      user,
      message: text,
      context,
    });

    if (studentResult.multiple) {
      const reply = buildStudentSearchResponse(studentResult.students);

      return createResponse({
        intent,
        reply,
        data: studentResult.students,
        blocks: [
          createBlock("student_list", {
            list_type: "search",
            count: studentResult.students.length,
            students: studentResult.students
              .slice(0, MAX_BLOCK_ITEMS)
              .map((student) => ({
                id: student.id,
                name: student.name,
                code: student.code || null,
                class_names: student.class_names || null,
              })),
          }),
        ],
        suggestions: [
          createSuggestion(
            "Chọn học sinh cụ thể",
            `Lịch sử điểm danh ${studentResult.students[0]?.name || "học sinh"}`,
          ),
        ],
        range,
        attendanceType: type,
        resultCount: studentResult.students.length,
      });
    }

    if (!studentResult.student) {
      const reply =
        "Bạn cho mình biết tên hoặc mã học sinh cần xem lịch sử điểm danh nhé.";

      return createResponse({
        intent,
        reply,
        suggestions: [createSuggestion("Ví dụ", "Lịch sử điểm danh Trần Hưng")],
        range,
        attendanceType: type,
      });
    }

    const result = await getStudentAttendanceHistory({
      user,

      keyword: studentResult.student.code || studentResult.student.name,

      startDate: range.startDate,
      endDate: range.endDate,

      attendanceType: type,
    });

    const reply = buildStudentHistoryResponse(result);

    const suggestions = buildStudentSuggestions(studentResult.student);

    saveConversationContext(user, {
      lastIntent: intent,
      lastStudent: {
        id: studentResult.student.id,
        name: studentResult.student.name,
        code: studentResult.student.code || null,
      },
      lastDateRange: range,
      lastAttendanceType: type,
      lastResults: result?.data || [],
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [buildStudentHistoryBlock(result)].filter(Boolean),
      suggestions,
      range,
      attendanceType: type,
      resultCount: result?.data?.length || 0,
    });
  }

  // ==========================================================
  // CLASS DETAIL
  // ==========================================================

  if (intent === "class_detail") {
    let classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    // --------------------------------------------------------
    // Context fallback
    // --------------------------------------------------------

    if (!classInfo && context?.lastClass?.id) {
      classInfo = context.lastClass;
    }

    if (!classInfo) {
      const reply = "Mình không tìm thấy lớp phù hợp.";

      return createResponse({
        intent,
        reply,
        suggestions: [createSuggestion("Ví dụ", "Thông tin lớp Ấu 1")],
      });
    }

    if (classInfo.multiple) {
      const classes = classInfo.classes || [];

      const reply = [
        "🏫 **CÓ NHIỀU LỚP PHÙ HỢP**",
        "",
        ...classes.map(
          (item, index) =>
            `${index + 1}. **${item.name}** — ${
              item.student_count || 0
            } học sinh`,
        ),
      ].join("\n");

      return createResponse({
        intent,
        reply,
        data: classes,
        blocks: [
          createBlock("class_list", {
            count: classes.length,
            classes: classes.slice(0, MAX_BLOCK_ITEMS).map((item) => ({
              id: item.id,
              name: item.name,
              code: item.code || null,
              student_count: toNumber(item.student_count),
            })),
          }),
        ],
        suggestions: [
          createSuggestion(
            "Ví dụ",
            `Thông tin lớp ${classes[0]?.name || "Ấu 1"}`,
          ),
        ],
        resultCount: classes.length,
      });
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
      ...(result.students || []).map(
        (student, index) =>
          `${index + 1}. **${student.name}** — ${student.code || ""}`,
      ),
    ].join("\n");

    saveConversationContext(user, {
      lastIntent: intent,
      lastClass: {
        id: result.id,
        name: result.name,
        code: result.code || null,
      },
      lastResults: result.students || [],
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [
        createBlock("class_card", {
          id: result.id,
          name: result.name,
          code: result.code || null,
          student_count: toNumber(result.student_count),
          students: (result.students || [])
            .slice(0, MAX_BLOCK_ITEMS)
            .map((student) => ({
              id: student.id,
              name: student.name,
              code: student.code || null,
            })),
        }),
      ],
      suggestions: [
        createSuggestion(
          "Xem điểm danh hôm nay",
          `Hôm nay lớp ${result.name} điểm danh thế nào?`,
        ),
        createSuggestion(
          "Xem chuyên cần",
          `Lớp ${result.name} tháng này chuyên cần thế nào?`,
        ),
      ],
      resultCount: result.students?.length || 0,
    });
  }

  // ==========================================================
  // ATTENDANCE SUMMARY
  // ==========================================================

  if (intent === "attendance_summary") {
    const type = detectAttendanceType(text);

    const range = detectRange(text) ||
      context?.lastDateRange || {
        startDate: getTodayDate(),
        endDate: getTodayDate(),
        label: "Hôm nay",
        type: "day",
      };

    // Summary chỉ lấy một ngày.
    const date = range.startDate || getTodayDate();

    let classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (!classInfo && context?.lastClass?.id) {
      classInfo = context.lastClass;
    }

    if (classInfo?.multiple) {
      const reply = classInfo.classes
        .map((item, index) => `${index + 1}. **${item.name}**`)
        .join("\n");

      return createResponse({
        intent,
        reply: `Có nhiều lớp phù hợp:\n\n${reply}`,
        data: classInfo.classes,
        blocks: [
          createBlock("class_list", {
            count: classInfo.classes.length,
            classes: classInfo.classes
              .slice(0, MAX_BLOCK_ITEMS)
              .map((item) => ({
                id: item.id,
                name: item.name,
                code: item.code || null,
                student_count: toNumber(item.student_count),
              })),
          }),
        ],
        suggestions: [],
        range,
        attendanceType: type,
        resultCount: classInfo.classes.length,
      });
    }

    // --------------------------------------------------------
    // Học giáo lý bắt buộc class
    // --------------------------------------------------------

    if (type === "catechism" && !classInfo) {
      const reply = "Bạn hãy cho mình biết lớp cần xem điểm danh.";

      return createResponse({
        intent,
        reply,
        suggestions: [
          createSuggestion("Ví dụ", "Hôm nay lớp Ấu 1 điểm danh thế nào?"),
        ],
        range,
        attendanceType: type,
      });
    }

    const result = await getAttendanceSummary({
      user,
      classId: classInfo?.id,
      date,
      attendanceType: type,
    });

    const normalizedResult = {
      ...result,

      attendance_type: type,

      attendance_type_label:
        result?.attendance_type_label || getAttendanceTypeLabel(type),

      date,

      class: result?.class || classInfo || null,
    };

    const reply = buildAttendanceResponse(normalizedResult);

    const suggestions = buildAttendanceSuggestions({
      classInfo,
      date,
      type,
    });

    saveConversationContext(user, {
      lastIntent: intent,

      lastClass: classInfo
        ? {
            id: classInfo.id,
            name: classInfo.name,
            code: classInfo.code || null,
          }
        : null,

      lastDateRange: {
        startDate: date,
        endDate: date,
        label: date === getTodayDate() ? "Hôm nay" : formatDateVN(date),
        type: "day",
      },

      lastAttendanceType: type,

      lastResults: result?.data || [],
    });

    return createResponse({
      intent,
      reply,
      data: normalizedResult,
      blocks: [buildAttendanceBlock(normalizedResult)].filter(Boolean),
      suggestions,
      range: {
        startDate: date,
        endDate: date,
        label: date === getTodayDate() ? "Hôm nay" : formatDateVN(date),
        type: "day",
      },
      attendanceType: type,
      resultCount: result?.statistics?.total || result?.data?.length || 0,
    });
  }

  // ==========================================================
  // ATTENDANCE STUDENTS
  // ==========================================================

  if (intent === "attendance_students") {
    const type = detectAttendanceType(text);
    const status = detectAttendanceStatus(text);

    const range = detectRange(text) ||
      context?.lastDateRange || {
        startDate: getTodayDate(),
        endDate: getTodayDate(),
        label: "Hôm nay",
        type: "day",
      };

    const date = range.startDate;

    let classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (!classInfo && context?.lastClass?.id) {
      classInfo = context.lastClass;
    }

    if (type === "catechism" && !classInfo) {
      const reply = "Bạn hãy cho mình biết lớp cần xem.";

      return createResponse({
        intent,
        reply,
        suggestions: [
          createSuggestion("Ví dụ", "Hôm nay lớp Ấu 1 những ai vắng?"),
        ],
        range,
        attendanceType: type,
      });
    }

    const result = await getAttendanceStudents({
      user,
      classId: classInfo?.id,
      date,
      attendanceType: type,
      status,
    });

    const normalizedResult = {
      ...result,

      date,

      attendance_type: type,

      attendance_type_label:
        result?.attendance_type_label || getAttendanceTypeLabel(type),

      class: result?.class || classInfo || null,

      status,
    };

    const reply = buildAttendanceStudentsResponse(normalizedResult);

    saveConversationContext(user, {
      lastIntent: intent,

      lastClass: classInfo
        ? {
            id: classInfo.id,
            name: classInfo.name,
            code: classInfo.code || null,
          }
        : context.lastClass || null,

      lastDateRange: {
        startDate: date,
        endDate: date,
        label: date === getTodayDate() ? "Hôm nay" : formatDateVN(date),
        type: "day",
      },

      lastAttendanceType: type,

      lastResults: result?.data || [],
    });

    return createResponse({
      intent,
      reply,
      data: normalizedResult,
      blocks: [buildAttendanceStudentsBlock(normalizedResult)],
      suggestions: buildAttendanceSuggestions({
        classInfo,
        date,
        type,
      }),
      range: {
        startDate: date,
        endDate: date,
        label: date === getTodayDate() ? "Hôm nay" : formatDateVN(date),
        type: "day",
      },
      attendanceType: type,
      resultCount: result?.total || result?.data?.length || 0,
    });
  }

  // ==========================================================
  // PERIOD STATISTICS - 5.4 / 5.6
  // ==========================================================

  if (intent === "attendance_period_statistics") {
    const type = detectAttendanceType(text);

    let range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

    let classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (!classInfo && context?.lastClass?.id) {
      classInfo = context.lastClass;
    }

    if (classInfo?.multiple) {
      const reply = [
        "Có nhiều lớp phù hợp:",
        "",
        ...classInfo.classes.map(
          (item, index) => `${index + 1}. **${item.name}**`,
        ),
      ].join("\n");

      return createResponse({
        intent,
        reply,
        data: classInfo.classes,
        blocks: [
          createBlock("class_list", {
            count: classInfo.classes.length,
            classes: classInfo.classes
              .slice(0, MAX_BLOCK_ITEMS)
              .map((item) => ({
                id: item.id,
                name: item.name,
                code: item.code || null,
              })),
          }),
        ],
        range,
        attendanceType: type,
        resultCount: classInfo.classes.length,
      });
    }

    if (type === "catechism" && !classInfo) {
      const reply = "Bạn hãy cho mình biết lớp cần thống kê.";

      return createResponse({
        intent,
        reply,
        suggestions: [
          createSuggestion("Ví dụ", "Lớp Ấu 1 tháng này chuyên cần thế nào?"),
        ],
        range,
        attendanceType: type,
      });
    }

    const result = await getMonthlyAttendanceStatistics({
      user,

      classId: classInfo?.id,

      startDate: range.startDate,

      endDate: range.endDate,

      attendanceType: type,
    });

    const normalizedResult = {
      ...result,

      start_date: result?.start_date || range.startDate,

      end_date: result?.end_date || range.endDate,

      attendance_type: type,

      attendance_type_label:
        result?.attendance_type_label || getAttendanceTypeLabel(type),

      class: result?.class || classInfo || null,
    };

    const reply = buildPeriodResponse(normalizedResult);

    saveConversationContext(user, {
      lastIntent: intent,

      lastClass: classInfo
        ? {
            id: classInfo.id,
            name: classInfo.name,
            code: classInfo.code || null,
          }
        : context.lastClass || null,

      lastDateRange: range,

      lastAttendanceType: type,

      lastResults: normalizedResult,
    });

    return createResponse({
      intent,
      reply,
      data: normalizedResult,
      blocks: [buildStatisticsBlock(normalizedResult)],
      suggestions: [
        ...(classInfo
          ? [
              createSuggestion(
                "Xem danh sách vắng",
                `Lớp ${classInfo.name} ${getDateRangeLabel(
                  range,
                )} những ai vắng?`,
              ),
            ]
          : []),

        createSuggestion(
          "So với tháng trước",
          classInfo
            ? `Lớp ${classInfo.name} so với tháng trước thế nào?`
            : "Chuyên cần tháng này so với tháng trước thế nào?",
        ),
      ],
      range,
      attendanceType: type,
      resultCount: normalizedResult?.statistics?.total_records || 0,
    });
  }

  // ==========================================================
  // STUDENT RANKING
  // ==========================================================

  if (intent === "student_attendance_ranking") {
    const range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    let classInfo = await resolveClassFromMessage({
      user,
      message: text,
    });

    if (!classInfo && context?.lastClass?.id) {
      classInfo = context.lastClass;
    }

    const result = await getStudentAttendanceRanking({
      user,

      startDate: range.startDate,

      endDate: range.endDate,

      attendanceType: type,

      classId: classInfo?.id,

      limit: DEFAULT_RANKING_LIMIT,
    });

    const rows = Array.isArray(result) ? result : result?.data || [];

    const title = "HỌC SINH NGHỈ NHIỀU NHẤT";

    const reply = buildStudentRankingResponse(rows, title);

    saveConversationContext(user, {
      lastIntent: intent,
      lastClass: classInfo
        ? {
            id: classInfo.id,
            name: classInfo.name,
            code: classInfo.code || null,
          }
        : context.lastClass || null,
      lastDateRange: range,
      lastAttendanceType: type,
      lastResults: rows,
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [buildRankingBlock(rows)],
      suggestions: [
        createSuggestion(
          "Học sinh cần lưu ý",
          `Học sinh cần lưu ý ${getDateRangeLabel(range)}?`,
        ),

        createSuggestion(
          "Xếp hạng lớp",
          `Lớp nào chuyên cần tốt nhất ${getDateRangeLabel(range)}?`,
        ),
      ],
      range,
      attendanceType: type,
      resultCount: rows.length,
    });
  }

  // ==========================================================
  // CLASS RANKING
  // ==========================================================

  if (intent === "class_attendance_ranking") {
    const range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    // --------------------------------------------------------
    // MASS không có class bắt buộc.
    // Class ranking với mass không có ý nghĩa nếu
    // dữ liệu mass class_id có thể null.
    // --------------------------------------------------------

    if (type === "mass") {
      const reply =
        "Điểm danh Thánh lễ không được xếp hạng theo lớp vì Thánh lễ không bắt buộc gắn với lớp.";

      return createResponse({
        intent,
        reply,
        suggestions: [
          createSuggestion(
            "Xem xếp hạng học sinh",
            `Học sinh nào tham dự Thánh lễ ít nhất ${getDateRangeLabel(
              range,
            )}?`,
          ),
          createSuggestion(
            "Thống kê Thánh lễ",
            `Thánh lễ ${getDateRangeLabel(range)} thế nào?`,
          ),
        ],
        range,
        attendanceType: type,
      });
    }

    const result = await getClassAttendanceRanking({
      user,

      startDate: range.startDate,

      endDate: range.endDate,

      attendanceType: type,

      limit: 50,
    });

    const rows = Array.isArray(result) ? result : result?.data || [];

    const reply = buildClassRankingResponse(rows);

    saveConversationContext(user, {
      lastIntent: intent,
      lastDateRange: range,
      lastAttendanceType: type,
      lastResults: rows,
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [buildClassRankingBlock(rows)],
      suggestions: [
        createSuggestion(
          "Lớp thấp nhất",
          `Lớp nào chuyên cần thấp nhất ${getDateRangeLabel(range)}?`,
        ),

        createSuggestion("So sánh hai lớp", "So sánh lớp Ấu 1 và lớp Ấu 2"),
      ],
      range,
      attendanceType: type,
      resultCount: rows.length,
    });
  }

  // ==========================================================
  // CLASS COMPARISON
  // ==========================================================

  if (intent === "class_comparison") {
    const classes = await searchClassesFromMessage(user, text);

    if (classes.length < 2) {
      const reply = "Bạn hãy ghi rõ ít nhất 2 lớp để mình so sánh.";

      return createResponse({
        intent,
        reply,
        suggestions: [
          createSuggestion("Ví dụ", "So sánh lớp Ấu 1 và lớp Ấu 2"),
        ],
      });
    }

    const range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    if (type === "mass") {
      const reply =
        "Không thể so sánh chuyên cần theo lớp đối với Thánh lễ vì điểm danh Thánh lễ không bắt buộc gắn với lớp.";

      return createResponse({
        intent,
        reply,
        range,
        attendanceType: type,
      });
    }

    const result = await compareClasses({
      user,

      classIds: classes.map((item) => item.id),

      startDate: range.startDate,

      endDate: range.endDate,

      attendanceType: type,
    });

    const lines = [
      "⚖️ **SO SÁNH CHUYÊN CẦN**",
      "",
      `Thời gian: **${getDateRangeLabel(range)}**`,
      "",
    ];

    result.forEach((row) => {
      lines.push(`- **${row.name}**: ${formatPercent(row.attendance_rate)}`);

      lines.push(
        `  Có mặt ${row.present || 0} | Trễ ${
          row.late || 0
        } | Vắng ${row.absent || 0}`,
      );
    });

    // --------------------------------------------------------
    // Smart winner
    // --------------------------------------------------------

    if (result.length >= 2) {
      const sorted = [...result].sort(
        (a, b) => toNumber(b.attendance_rate) - toNumber(a.attendance_rate),
      );

      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      if (best && worst && best.id !== worst.id) {
        lines.push("");
        lines.push(
          `**Nhận xét:** ${best.name} đang có tỷ lệ chuyên cần cao hơn trong nhóm so sánh.`,
        );
      }
    }

    const reply = lines.join("\n");

    saveConversationContext(user, {
      lastIntent: intent,
      lastDateRange: range,
      lastAttendanceType: type,
      lastResults: result,
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [
        createBlock("comparison", {
          rows: (result || []).map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code || null,
            attendance_rate: toNumber(row.attendance_rate),
            present: toNumber(row.present),
            late: toNumber(row.late),
            absent: toNumber(row.absent),
            excused: toNumber(row.excused),
          })),
        }),
      ],
      suggestions: [
        createSuggestion("Xem lớp thấp nhất", "Lớp nào chuyên cần thấp nhất?"),

        createSuggestion(
          "Xem học sinh nghỉ nhiều",
          "Những em nào nghỉ nhiều nhất?",
        ),
      ],
      range,
      attendanceType: type,
      resultCount: result?.length || 0,
    });
  }

  // ==========================================================
  // PARISH STATISTICS
  // ==========================================================

  if (intent === "parish_statistics") {
    const range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

    const type = detectAttendanceType(text);

    const result = await getParishStatistics({
      user,

      startDate: range.startDate,

      endDate: range.endDate,

      attendanceType: type,
    });

    const normalizedResult = {
      ...result,

      start_date: result?.start_date || range.startDate,

      end_date: result?.end_date || range.endDate,

      attendance_type: type,

      attendance_type_label:
        result?.attendance_type_label || getAttendanceTypeLabel(type),
    };

    const reply = buildParishResponse(normalizedResult);

    saveConversationContext(user, {
      lastIntent: intent,
      lastDateRange: range,
      lastAttendanceType: type,
      lastResults: normalizedResult,
    });

    return createResponse({
      intent,
      reply,
      data: normalizedResult,
      blocks: [buildParishBlock(normalizedResult)],
      suggestions: [
        createSuggestion(
          "Học sinh cần lưu ý",
          `Học sinh nào cần lưu ý ${getDateRangeLabel(range)}?`,
        ),

        createSuggestion(
          "Lớp chuyên cần tốt",
          `Lớp nào chuyên cần tốt nhất ${getDateRangeLabel(range)}?`,
        ),

        createSuggestion(
          "Học sinh chưa phân lớp",
          "Có bao nhiêu học sinh chưa phân lớp?",
        ),
      ],
      range,
      attendanceType: type,
      resultCount: normalizedResult?.students?.total || 0,
    });
  }

  // ==========================================================
  // NEED ATTENTION
  // ==========================================================

  if (intent === "students_needing_attention") {
    const range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

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

    saveConversationContext(user, {
      lastIntent: intent,
      lastDateRange: range,
      lastAttendanceType: type,
      lastResults: result,
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [buildNeedAttentionBlock(result)],
      suggestions: [
        createSuggestion(
          "Ai nghỉ nhiều nhất?",
          `Những em nào nghỉ nhiều nhất ${getDateRangeLabel(range)}?`,
        ),

        createSuggestion(
          "Xem lớp thấp nhất",
          `Lớp nào chuyên cần thấp nhất ${getDateRangeLabel(range)}?`,
        ),
      ],
      range,
      attendanceType: type,
      resultCount: result?.length || 0,
    });
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

    saveConversationContext(user, {
      lastIntent: intent,
      lastResults: result,
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [buildUnassignedBlock(result)],
      suggestions: [
        createSuggestion("Tổng quan giáo xứ", "Tổng quan giáo xứ"),

        createSuggestion("Học sinh cần lưu ý", "Học sinh nào cần lưu ý?"),
      ],
      resultCount: result?.length || 0,
    });
  }

  // ==========================================================
  // ANOMALIES - 5.7
  // ==========================================================

  if (intent === "attendance_anomalies") {
    const range =
      detectRange(text) || context?.lastDateRange || getCurrentMonthRange();

    const result = await getAttendanceAnomalies({
      user,

      startDate: range.startDate,

      endDate: range.endDate,

      limit: 50,
    });

    const reply = buildAnomalyResponse(result);

    saveConversationContext(user, {
      lastIntent: intent,
      lastDateRange: range,
      lastResults: result?.anomalies || [],
    });

    return createResponse({
      intent,
      reply,
      data: result,
      blocks: [buildAnomalyBlock(result)],
      suggestions: [
        createSuggestion(
          "Kiểm tra tháng trước",
          "Có dữ liệu điểm danh bất thường tháng trước không?",
        ),

        createSuggestion(
          "Tổng quan giáo xứ",
          `Tổng quan giáo xứ ${getDateRangeLabel(range)}`,
        ),
      ],
      range,
      resultCount: result?.anomalies?.length || 0,
    });
  }

  // ==========================================================
  // UNKNOWN
  // ==========================================================

  const reply = buildUnknownResponse();

  return createResponse({
    intent: "unknown",
    reply,

    blocks: [
      createBlock("info", {
        title: "Gợi ý câu hỏi",
      }),
    ],

    suggestions: [
      createSuggestion("Tìm học sinh", "Tìm học sinh Trần Hưng"),

      createSuggestion("Xem chuyên cần", "Học sinh nào cần lưu ý?"),

      createSuggestion("Xem lớp", "Lớp nào chuyên cần tốt nhất?"),

      createSuggestion("Tổng quan", "Tổng quan giáo xứ"),
    ],
  });
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
  searchClassesFromMessage,

  getConversationContext,
};

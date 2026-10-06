// services/assistant/assistantService.js

const { findBestKnowledge } = require("./assistantKnowledge");

const {
  searchStudents,
  searchClasses,
  getClassStudents,
  getAttendanceSummary,
  normalizeText,
} = require("./assistantTools");

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const MIN_KNOWLEDGE_SCORE = 4;

/**
 * ============================================================
 * DATE HELPERS
 * ============================================================
 */

function formatDateLocal(date) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatDateLocal(new Date());
}

function getYesterday() {
  const date = new Date();

  date.setDate(date.getDate() - 1);

  return formatDateLocal(date);
}

/**
 * ============================================================
 * DETECT DATE
 * ============================================================
 */

function detectDate(question) {
  const normalized = normalizeText(question);

  if (normalized.includes("hom nay") || normalized.includes("hôm nay")) {
    return getToday();
  }

  if (normalized.includes("hom qua") || normalized.includes("hôm qua")) {
    return getYesterday();
  }

  /**
   * YYYY-MM-DD
   */

  const isoMatch = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);

  if (isoMatch) {
    const year = isoMatch[1];
    const month = String(Number(isoMatch[2])).padStart(2, "0");

    const day = String(Number(isoMatch[3])).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /**
   * DD/MM/YYYY
   */

  const vnMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);

  if (vnMatch) {
    const day = String(Number(vnMatch[1])).padStart(2, "0");

    const month = String(Number(vnMatch[2])).padStart(2, "0");

    const year = vnMatch[3];

    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * ============================================================
 * DETECT ATTENDANCE TYPE
 * ============================================================
 */

function detectAttendanceType(question) {
  const normalized = normalizeText(question);

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

/**
 * ============================================================
 * DETECT INTENT
 * ============================================================
 */

function detectIntent(message) {
  const normalized = normalizeText(message);

  /**
   * ----------------------------------------------------------
   * ATTENDANCE DATA
   * ----------------------------------------------------------
   */

  if (
    (normalized.includes("diem danh") ||
      normalized.includes("vang") ||
      normalized.includes("co mat") ||
      normalized.includes("di tre")) &&
    (normalized.includes("hom nay") ||
      normalized.includes("hom qua") ||
      normalized.includes("ngay") ||
      normalized.includes("lop") ||
      normalized.includes("hoc sinh"))
  ) {
    return "attendance_summary";
  }

  /**
   * ----------------------------------------------------------
   * STUDENT SEARCH
   * ----------------------------------------------------------
   */

  if (
    normalized.includes("hoc sinh") &&
    (normalized.includes("nao") ||
      normalized.includes("tim") ||
      normalized.includes("tim kiem") ||
      normalized.includes("thong tin") ||
      normalized.includes("thuoc lop") ||
      normalized.includes("lop nao"))
  ) {
    return "student_search";
  }

  /**
   * ----------------------------------------------------------
   * CLASS
   * ----------------------------------------------------------
   */

  if (
    (normalized.includes("lop") || normalized.includes("danh sach lop")) &&
    (normalized.includes("bao nhieu") ||
      normalized.includes("co nhung") ||
      normalized.includes("danh sach") ||
      normalized.includes("hoc sinh"))
  ) {
    return "class_lookup";
  }

  /**
   * ----------------------------------------------------------
   * DEFAULT
   * ----------------------------------------------------------
   */

  return "knowledge";
}

/**
 * ============================================================
 * EXTRACT CLASS KEYWORD
 * ============================================================
 */

function extractClassKeyword(message) {
  const normalized = normalizeText(message);

  /**
   * Các câu thường gặp:
   *
   * "lớp Ấu 1"
   * "lớp au 1"
   * "lớp 6"
   * "lớp khai tâm"
   */

  const match = normalized.match(
    /\blop\s+(.+?)(?:\s+(?:hom nay|hom qua|co|vang|diem danh|co bao nhieu|bao nhieu))?$/i,
  );

  if (match?.[1]) {
    return match[1].trim();
  }

  /**
   * Fallback:
   */

  const index = normalized.indexOf("lop ");

  if (index >= 0) {
    let value = normalized.substring(index + 4).trim();

    const stopWords = [
      "hom nay",
      "hom qua",
      "co bao nhieu",
      "bao nhieu",
      "hoc sinh",
      "vang",
      "diem danh",
      "di tre",
    ];

    for (const stopWord of stopWords) {
      const stopIndex = value.indexOf(` ${stopWord}`);

      if (stopIndex >= 0) {
        value = value.substring(0, stopIndex);
      }
    }

    return value.trim();
  }

  return null;
}

/**
 * ============================================================
 * EXTRACT STUDENT KEYWORD
 * ============================================================
 */

function extractStudentKeyword(message) {
  const normalized = normalizeText(message);

  const patterns = [
    "hoc sinh ",
    "tim hoc sinh ",
    "hoc sinh ten ",
    "thong tin hoc sinh ",
  ];

  for (const pattern of patterns) {
    const index = normalized.indexOf(pattern);

    if (index >= 0) {
      return normalized.substring(index + pattern.length).trim();
    }
  }

  return null;
}

/**
 * ============================================================
 * BUILD KNOWLEDGE RESPONSE
 * ============================================================
 */

function buildArticleResponse(article) {
  if (!article) {
    return null;
  }

  const lines = [];

  lines.push(`**${article.title}**`);

  if (article.description) {
    lines.push("");
    lines.push(article.description);
  }

  if (article.steps?.length) {
    lines.push("");
    lines.push("**Các bước thực hiện:**");

    article.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }

  if (article.tips?.length) {
    lines.push("");
    lines.push("**Lưu ý:**");

    article.tips.forEach((tip) => {
      lines.push(`- ${tip}`);
    });
  }

  return lines.join("\n");
}

/**
 * ============================================================
 * ATTENDANCE RESPONSE
 * ============================================================
 */

function buildAttendanceResponse(data) {
  if (!data) {
    return "Mình không tìm thấy lớp học phù hợp trong giáo xứ của bạn.";
  }

  const { class: classInfo, date, summary } = data;

  return [
    `**Điểm danh lớp ${classInfo.name}**`,
    "",
    `Ngày: **${date}**`,
    "",
    `- Có mặt: **${summary.present}**`,
    `- Đi trễ: **${summary.late}**`,
    `- Vắng: **${summary.absent}**`,
    `- Có phép: **${summary.excused}**`,
    "",
    `Tổng số lượt điểm danh: **${summary.total}**`,
  ].join("\n");
}

/**
 * ============================================================
 * STUDENT RESPONSE
 * ============================================================
 */

function buildStudentResponse(students) {
  if (!students.length) {
    return "Mình không tìm thấy học sinh phù hợp trong giáo xứ của bạn.";
  }

  if (students.length === 1) {
    const student = students[0];

    return [
      `**${student.name}**`,
      "",
      `Mã học sinh: **${student.student_code || "Chưa có"}**`,
      `Lớp: **${student.class_name || "Chưa phân lớp"}**`,
    ].join("\n");
  }

  const lines = [`Mình tìm thấy **${students.length} học sinh** phù hợp:`, ""];

  students.forEach((student, index) => {
    lines.push(
      `${index + 1}. **${student.name}** — ${
        student.class_name || "Chưa phân lớp"
      }`,
    );
  });

  return lines.join("\n");
}

/**
 * ============================================================
 * CLASS RESPONSE
 * ============================================================
 */

function buildClassResponse(data) {
  if (!data) {
    return "Mình không tìm thấy lớp phù hợp trong giáo xứ của bạn.";
  }

  const lines = [
    `**${data.class.name}**`,
    "",
    `Số học sinh: **${data.total}**`,
  ];

  if (data.students.length) {
    lines.push("");
    lines.push("Danh sách:");

    data.students.slice(0, 20).forEach((student, index) => {
      lines.push(`${index + 1}. ${student.name}`);
    });

    if (data.students.length > 20) {
      lines.push("");
      lines.push(`... và ${data.students.length - 20} học sinh khác.`);
    }
  }

  return lines.join("\n");
}

/**
 * ============================================================
 * CHAT
 * ============================================================
 */

async function chatWithAssistant({ message, user }) {
  console.log("");
  console.log("============================================================");
  console.log("                 FAITHEDU ASSISTANT");
  console.log("============================================================");

  console.log("👤 USER ID:", user?.id);
  console.log("🎭 ROLE:", user?.role);
  console.log("⛪ CHURCH ID:", user?.church_id);
  console.log("💬 MESSAGE:", message);

  if (!message || typeof message !== "string") {
    const error = new Error("Nội dung câu hỏi không hợp lệ.");

    error.code = "INVALID_MESSAGE";

    throw error;
  }

  const cleanMessage = message.trim();

  if (!cleanMessage) {
    const error = new Error("Vui lòng nhập câu hỏi.");

    error.code = "EMPTY_MESSAGE";

    throw error;
  }

  if (cleanMessage.length > 500) {
    const error = new Error("Câu hỏi quá dài. Vui lòng nhập ngắn gọn hơn.");

    error.code = "MESSAGE_TOO_LONG";

    throw error;
  }

  /**
   * ==========================================================
   * INTENT
   * ==========================================================
   */

  const intent = detectIntent(cleanMessage);

  console.log("🎯 INTENT:", intent);

  /**
   * ==========================================================
   * ATTENDANCE
   * ==========================================================
   */

  if (intent === "attendance_summary") {
    const classKeyword = extractClassKeyword(cleanMessage);

    const date = detectDate(cleanMessage) || getToday();

    const attendanceType = detectAttendanceType(cleanMessage);

    console.log("🏫 CLASS KEYWORD:", classKeyword);

    console.log("📅 DATE:", date);

    console.log("📝 ATTENDANCE TYPE:", attendanceType);

    if (!classKeyword) {
      return {
        success: true,
        type: "need_clarification",

        answer: "Bạn muốn xem điểm danh của lớp nào?",

        suggestions: [
          {
            id: "attendance-today",
            title: "Xem điểm danh hôm nay",
            type: "prompt",
          },
        ],
      };
    }

    const classes = await searchClasses({
      user,
      keyword: classKeyword,
    });

    if (!classes.length) {
      return {
        success: true,
        type: "not_found",

        answer: `Mình không tìm thấy lớp **${classKeyword}** trong giáo xứ của bạn.`,
      };
    }

    if (classes.length > 1) {
      return {
        success: true,
        type: "need_clarification",

        answer: "Mình tìm thấy nhiều lớp phù hợp. Bạn muốn xem lớp nào?",

        suggestions: classes.map((item) => ({
          id: `class-${item.id}`,
          title: item.name,
          type: "class",
          class_id: item.id,
        })),
      };
    }

    const classId = classes[0].id;

    const data = await getAttendanceSummary({
      user,
      classId,
      date,
      attendanceType,
    });

    return {
      success: true,

      type: "data",

      data_type: "attendance_summary",

      answer: buildAttendanceResponse(data),

      data: data,
    };
  }

  /**
   * ==========================================================
   * STUDENT SEARCH
   * ==========================================================
   */

  if (intent === "student_search") {
    const keyword = extractStudentKeyword(cleanMessage);

    if (!keyword) {
      return {
        success: true,

        type: "need_clarification",

        answer: "Bạn cho mình biết tên hoặc mã học sinh cần tìm nhé.",
      };
    }

    const students = await searchStudents({
      user,
      keyword,
    });

    return {
      success: true,

      type: "data",

      data_type: "students",

      answer: buildStudentResponse(students),

      data: students,
    };
  }

  /**
   * ==========================================================
   * CLASS LOOKUP
   * ==========================================================
   */

  if (intent === "class_lookup") {
    const classKeyword = extractClassKeyword(cleanMessage);

    if (!classKeyword) {
      return {
        success: true,

        type: "need_clarification",

        answer: "Bạn muốn xem thông tin của lớp nào?",
      };
    }

    const classes = await searchClasses({
      user,
      keyword: classKeyword,
    });

    if (!classes.length) {
      return {
        success: true,

        type: "not_found",

        answer: `Mình không tìm thấy lớp **${classKeyword}**.`,
      };
    }

    if (classes.length > 1) {
      return {
        success: true,

        type: "need_clarification",

        answer: "Mình tìm thấy nhiều lớp phù hợp. Bạn chọn lớp nào?",

        suggestions: classes.map((item) => ({
          id: `class-${item.id}`,
          title: item.name,
          type: "class",
          class_id: item.id,
        })),
      };
    }

    const data = await getClassStudents({
      user,
      classId: classes[0].id,
    });

    return {
      success: true,

      type: "data",

      data_type: "class_students",

      answer: buildClassResponse(data),

      data,
    };
  }

  /**
   * ==========================================================
   * KNOWLEDGE SEARCH
   * ==========================================================
   */

  const { article, results } = findBestKnowledge(cleanMessage);

  console.log(
    "📚 KNOWLEDGE:",
    results.map((item) => ({
      id: item.id,
      title: item.title,
      score: item.score,
    })),
  );

  if (article && article.score >= MIN_KNOWLEDGE_SCORE) {
    return {
      success: true,

      type: "article",

      answer: buildArticleResponse(article),

      article: {
        id: article.id,
        title: article.title,
        category: article.category,
      },

      suggestions: results
        .filter((item) => item.id !== article.id)
        .slice(0, 3)
        .map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
        })),
    };
  }

  /**
   * ==========================================================
   * FALLBACK
   * ==========================================================
   */

  return {
    success: true,

    type: "fallback",

    answer:
      "Mình chưa hiểu chính xác câu hỏi này. Bạn có thể hỏi về học sinh, lớp học, điểm danh, tài khoản hoặc các chức năng của FaithEdu.",

    suggestions: results.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
    })),
  };
}

module.exports = {
  chatWithAssistant,
  detectIntent,
  detectDate,
  detectAttendanceType,
};

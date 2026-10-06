// services/assistant/assistantService.js

const { findBestKnowledge } = require("./assistantKnowledge");

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const MIN_CONFIDENCE_SCORE = 4;

/**
 * ============================================================
 * BUILD ARTICLE RESPONSE
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
 * BUILD SUGGESTIONS
 * ============================================================
 */

function buildSuggestions(results = []) {
  return results.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
  }));
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
  console.log("👤 USERNAME:", user?.username);
  console.log("🎭 ROLE:", user?.role);
  console.log("⛪ CHURCH ID:", user?.church_id);
  console.log("💬 MESSAGE:", message);

  /**
   * ==========================================================
   * 1. VALIDATE
   * ==========================================================
   */

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
   * 2. SEARCH
   * ==========================================================
   */

  const { article, results } = findBestKnowledge(cleanMessage);

  console.log(
    "🔎 SEARCH RESULTS:",
    results.map((item) => ({
      id: item.id,
      title: item.title,
      score: item.score,
      matchedKeywords: item.matchedKeywords,
    })),
  );

  /**
   * ==========================================================
   * 3. FOUND
   * ==========================================================
   */

  if (article && article.score >= MIN_CONFIDENCE_SCORE) {
    const answer = buildArticleResponse(article);

    console.log("✅ MATCH:", article.id);
    console.log("📊 SCORE:", article.score);

    console.log("============================================================");

    return {
      success: true,

      type: "article",

      answer,

      article: {
        id: article.id,
        title: article.title,
        category: article.category,
      },

      suggestions: buildSuggestions(
        results.filter((item) => item.id !== article.id),
      ),
    };
  }

  /**
   * ==========================================================
   * 4. NOT FOUND
   * ==========================================================
   */

  console.log("⚠️ NO STRONG MATCH");

  console.log("============================================================");

  return {
    success: true,

    type: "fallback",

    answer:
      "Mình chưa tìm thấy hướng dẫn phù hợp với câu hỏi này. Bạn có thể thử hỏi theo một trong các nội dung dưới đây:",

    suggestions: buildSuggestions(results),

    help: {
      title: "Trung tâm trợ giúp FaithEdu",
      description:
        "Bạn có thể tìm hướng dẫn về học sinh, lớp học, điểm danh, tài khoản, thi & điểm và các chức năng khác.",
    },
  };
}

module.exports = {
  chatWithAssistant,
};

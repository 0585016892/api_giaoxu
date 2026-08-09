const openRouterService = require("./openRouterService");

const embeddingService = require("./embeddingService");

const vectorService = require("./vectorService");

const db = require("../config/db");

async function chatStream(question, callback) {
  const embedding = await embeddingService.createEmbedding(question);

  const results = await vectorService.search(embedding, question);

  const ids = results.map((x) => x.chunkId);

  const [docs] = await db.query(
    `
            SELECT *
            FROM knowledge_chunks
            WHERE id IN (?)
            `,
    [ids],
  );

  const context = docs
    .map(
      (doc) => `
Tiêu đề:
${doc.title}

Nội dung:
${doc.content}
`,
    )
    .join("\n");

  // ==========================
  // TRẢ THẲNG DỮ LIỆU KINH
  // ==========================

  // ===============================
  // EXACT RAG RESPONSE
  // ===============================

  if (
    docs.length > 0 &&
    (question.toLowerCase().includes("kinh") ||
      question.toLowerCase().includes("lời") ||
      question.toLowerCase().includes("sự kiện") ||
      question.toLowerCase().includes("bài giáo lý"))
  ) {
    callback(docs[0].content);

    return;
  }
  await openRouterService.askOpenRouterStream(question, context, callback);
}

module.exports = {
  chatStream,
};

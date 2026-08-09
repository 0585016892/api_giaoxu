const db = require("../config/db");

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];

    normA += vecA[i] * vecA[i];

    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function search(questionEmbedding, question) {
  const [rows] = await db.query(`
    SELECT 
      ke.id,
      ke.chunk_id,
      ke.embedding,
      kc.title,
      kc.content
    FROM knowledge_embeddings ke

    JOIN knowledge_chunks kc

    ON ke.chunk_id = kc.id
  `);
  let result = rows
    .map((row) => ({
      chunkId: row.chunk_id,

      score: cosineSimilarity(questionEmbedding, JSON.parse(row.embedding)),
    }))
    .sort((a, b) => {
      return b.score - a.score;
    });

  // ==========================
  // ƯU TIÊN KINH NGUYỆN
  // ==========================

  if (question && question.toLowerCase().includes("kinh")) {
    result = result.map((item) => {
      if (item.title && item.title.toLowerCase().includes("kinh")) {
        item.score += 0.2;
      }

      return item;
    });
  }

  // ==========================
  // ƯU TIÊN BÀI GIÁO LÝ
  // ==========================

  if (
    question &&
    (question.toLowerCase().includes("bài") ||
      question.toLowerCase().includes("giáo lý"))
  ) {
    result = result.map((item) => {
      if (item.title && item.title.toLowerCase().includes("bài")) {
        item.score += 0.15;
      }

      return item;
    });
  }

  result.sort((a, b) => b.score - a.score);

  // ==========================
  // LOẠI BỎ TRÙNG
  // ==========================

  const unique = [];

  const ids = new Set();

  for (const item of result) {
    if (!ids.has(item.chunkId)) {
      ids.add(item.chunkId);

      unique.push(item);
    }
  }

  return unique.slice(0, 1);
}

module.exports = {
  search,
  cosineSimilarity,
};

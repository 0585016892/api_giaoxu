const db = require("../config/db");
const embeddingService = require("./embeddingService");

async function trainEmbeddings(progressCallback) {
  const [chunks] = await db.query(`
    SELECT *
    FROM knowledge_chunks
  `);

  const total = chunks.length;

  let completed = 0;

  for (const chunk of chunks) {
    const embedding = await embeddingService.createEmbedding(
      `
        ${chunk.title}

        ${chunk.content}
        `,
    );

    await db.query(
      `
      INSERT INTO knowledge_embeddings
      (
        chunk_id,
        embedding
      )
      VALUES (?,?)
      `,
      [chunk.id, JSON.stringify(embedding)],
    );

    completed++;

    const percent = Math.round((completed / total) * 100);

    console.log(`Embedding ${completed}/${total} (${percent}%)`);

    if (progressCallback) {
      progressCallback({
        completed,
        total,
        percent,
        current: chunk.title,
      });
    }
  }
}

module.exports = {
  trainEmbeddings,
};

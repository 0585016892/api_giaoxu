const db = require("../config/db");

async function syncTable({ tableName, sourceType, titleField, contentField }) {
  await db.query(
    `
      DELETE FROM knowledge_chunks
      WHERE source_type = ?
    `,
    [sourceType],
  );

  const [rows] = await db.query(`
      SELECT *
      FROM ${tableName}
  `);

  for (const row of rows) {
    const title = row[titleField] || "Không có tiêu đề";

    const content = row[contentField] || "";

    await db.query(
      `
      INSERT INTO knowledge_chunks
      (
          source_type,
          source_id,
          title,
          content,
          metadata
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [sourceType, row.id, title, content, JSON.stringify(row)],
    );
  }
}

module.exports = {
  syncTable,
};

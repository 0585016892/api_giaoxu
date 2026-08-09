const db = require("../config/db");

async function saveMessage(sessionId, role, message) {
  await db.query(
    `
        INSERT INTO chatbot_messages
        (
            session_id,
            role,
            message
        )
        VALUES (?,?,?)
        `,
    [sessionId, role, message],
  );
}

async function getHistory(sessionId) {
  const [rows] = await db.query(
    `
        SELECT *
        FROM chatbot_messages
        WHERE session_id = ?

        ORDER BY created_at ASC
        `,
    [sessionId],
  );

  return rows;
}

module.exports = {
  saveMessage,
  getHistory,
};

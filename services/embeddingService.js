const axios = require("axios");

async function createEmbedding(text) {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/embeddings",
    {
      input: text,
      model: process.env.EMBEDDING_MODEL,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    },
  );

  return response.data.data[0].embedding;
}

module.exports = {
  createEmbedding,
};

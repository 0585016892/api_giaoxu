const axios = require("axios");

async function askOpenRouterStream(question, context, onToken) {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",

      {
        model: process.env.OPENROUTER_MODEL,

        stream: true,

        temperature: 0,

        messages: [
          {
            role: "system",

            content: `
Bạn là trợ lý AI của giáo xứ.

QUY TẮC BẮT BUỘC:

1. Chỉ được sử dụng thông tin trong CONTEXT.
2. Nếu CONTEXT có nội dung phù hợp:
   - Trả lời đầy đủ.
   - Giữ nguyên nội dung.
   - Không tóm tắt.
   - Không chỉnh sửa câu chữ.

3. Nếu CONTEXT không có:
"Tôi chưa tìm thấy thông tin này trong dữ liệu của giáo xứ."

4. Không tự tạo thêm thông tin.


====================
CONTEXT
====================

${context}

====================
`,
          },

          {
            role: "user",

            content: question,
          },
        ],
      },

      {
        responseType: "stream",

        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,

          "Content-Type": "application/json",

          "HTTP-Referer": "https://giaoxudongquan.site",

          "X-Title": "AI Giao Xu",
        },
      },
    );

    let buffer = "";

    response.data.on("data", (chunk) => {
      buffer += chunk.toString();

      const lines = buffer.split("\n");

      buffer = lines.pop();

      for (const line of lines) {
        const text = line.trim();

        if (!text.startsWith("data:")) continue;

        const data = text.replace("data:", "").trim();

        if (data === "[DONE]") {
          return;
        }

        try {
          const json = JSON.parse(data);

          const token = json?.choices?.[0]?.delta?.content;

          if (token) {
            onToken(token);
          }
        } catch (err) {
          console.log("STREAM JSON ERROR:", err.message);
        }
      }
    });

    response.data.on("end", () => {
      console.log("✅ OpenRouter stream finished");
    });

    response.data.on("error", (err) => {
      console.log("❌ STREAM ERROR:", err.message);
    });
  } catch (error) {
    console.log("❌ OPENROUTER ERROR:", error.response?.data || error.message);

    if (error.response?.status === 402) {
      throw new Error("OpenRouter hết hạn mức sử dụng (Payment Required)");
    }

    if (error.response?.status === 401) {
      throw new Error("OpenRouter API Key không hợp lệ");
    }

    throw error;
  }
}

module.exports = {
  askOpenRouterStream,
};

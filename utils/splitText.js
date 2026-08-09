//tạo hàm chia dữ liệu
function splitText(text, chunkSize = 1000) {
  if (!text) {
    return [];
  }

  const chunks = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  return chunks;
}

module.exports = splitText;

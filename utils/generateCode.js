const db = require("../config/db"); // Import kết nối MySQL/Pool của bạn

const generateCatechistCode = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `GLV${currentYear}`;

  // Tìm mã GLV lớn nhất trong năm hiện tại
  const sql = `SELECT catechist_code FROM catechists WHERE catechist_code LIKE ? ORDER BY id DESC LIMIT 1`;
  const [rows] = await db.query(sql, [`${prefix}%`]);

  if (rows.length === 0) {
    return `${prefix}0001`;
  }

  // Cắt lấy 4 số cuối và tăng lên 1
  const lastCode = rows[0].catechist_code;
  const lastSequence = parseInt(lastCode.slice(-4), 10);
  const newSequence = String(lastSequence + 1).padStart(4, "0");

  return `${prefix}${newSequence}`;
};

module.exports = { generateCatechistCode };

const db = require("../config/db");

const generateCatechistCode = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `GLV${currentYear}`;

  const sql = `
    SELECT catechist_code
    FROM catechists
    WHERE catechist_code REGEXP ?
    ORDER BY id DESC
    LIMIT 1
  `;

  const [rows] = await db.query(sql, [`^${prefix}[0-9]{4}(_[0-9]+)?$`]);

  // Chưa có mã nào
  if (rows.length === 0) {
    return `${prefix}0001`;
  }

  /*
   * Lấy mã gốc:
   *
   * GLV20260049
   * GLV20260049_1
   * GLV20260049_2
   *
   * đều lấy sequence = 49
   */
  const lastCode = rows[0].catechist_code;

  const match = lastCode.match(new RegExp(`^${prefix}(\\d{4})(?:_\\d+)?$`));

  if (!match) {
    return `${prefix}0001`;
  }

  const lastSequence = parseInt(match[1], 10);

  const newSequence = String(lastSequence + 1).padStart(4, "0");

  return `${prefix}${newSequence}`;
};

module.exports = {
  generateCatechistCode,
};

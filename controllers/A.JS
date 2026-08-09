const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  console.log("=====CALL API LOGIN=====");

  try {
    const { email, password } = req.body;

    const [rows] = await db.query(`SELECT * FROM admins WHERE email=?`, [
      email,
    ]);
    console.log("DB RESPONSE:", rows);
    if (rows.length === 0)
      return res.status(401).json({ message: "Sai tài khoản" });

    const user = rows[0];

    if (user.is_active === 0)
      return res.status(403).json({ message: "Tài khoản bị khóa" });

    const match = await bcrypt.compare(password, user.password);
    console.log(match);

    if (!match) return res.status(401).json({ message: "Sai mật khẩu" });

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

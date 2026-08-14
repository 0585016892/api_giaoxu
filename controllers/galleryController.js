const db = require("../config/db");

// Lấy toàn bộ ảnh
exports.getAllImages = async (req, res) => {
  try {
    let images = [];

    // Churches
    const [churches] = await db.query(`
      SELECT
        id,
        name,
        image,
        'church' AS type
      FROM churches
      WHERE image IS NOT NULL
    `);

    images.push(...churches);

    // Event Images
    const [eventImages] = await db.query(`
      SELECT
        id,
        image,
        'image' AS type
      FROM event_images
      WHERE image IS NOT NULL
    `);

    images.push(...eventImages);

    // Groups
    const [groups] = await db.query(`
  SELECT
    id,
    name,
    image,
    'group' AS type
  FROM \`groups\`
  WHERE image IS NOT NULL
`);

    images.push(...groups);

    // Slides
    const [slides] = await db.query(`
      SELECT
        id,
        title,
        image,
        'slide' AS type
      FROM slides
      WHERE image IS NOT NULL
    `);

    images.push(...slides);

    // Admins
    const [admins] = await db.query(`
      SELECT
        id,
        full_name,
        avatar AS image,
        'admin' AS type
      FROM admins
      WHERE avatar IS NOT NULL
    `);

    images.push(...admins);

    res.status(200).json({
      success: true,
      total: images.length,
      data: images,
    });
  } catch (error) {
    console.error("Get Images Error:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách ảnh",
      error: error.message,
    });
  }
};

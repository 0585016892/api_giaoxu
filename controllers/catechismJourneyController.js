const db = require("../config/db");

/**
 * Lấy church_id từ tài khoản đã đăng nhập.
 * Tuyệt đối không nhận church_id từ query hoặc body của frontend.
 */
const getChurchId = (req) => {
  const churchId = Number(req.user?.church_id ?? req.user?.parish_id);

  return Number.isInteger(churchId) && churchId > 0 ? churchId : null;
};

/**
 * Chuẩn hóa chuỗi để so sánh category không phụ thuộc dấu tiếng Việt.
 */
const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Ánh xạ category của classes sang catechism_type của lessons.
 * Chỉ ánh xạ những chương trình đã xác định rõ.
 */
const CATEGORY_TYPE_MAP = {
  "giao ly khai tam": "khai_tam",
  "khai tam": "khai_tam",

  "giao ly den ban tiec thanh": "den_ban_tiec_thanh",
  "den ban tiec thanh": "den_ban_tiec_thanh",

  "giao ly lon len trong chua thanh": "lon_len_trong_chua_thanh",
  "lon len trong chua thanh": "lon_len_trong_chua_thanh",

  "giao ly hon nhan": "hon_nhan",
  "hon nhan": "hon_nhan",

  "lop kinh thanh": "kinh_thanh",
  "giao ly kinh thanh": "kinh_thanh",
  "kinh thanh": "kinh_thanh",

  "giao ly du tong": "du_tong",
  "du tong": "du_tong",
};

const getCatechismType = (category) =>
  CATEGORY_TYPE_MAP[normalizeText(category)] || null;

/**
 * GET /api/catechism-journey/classes
 *
 * Trả về lớp thuộc giáo xứ đang đăng nhập,
 * kèm số bài học tương ứng.
 */
exports.getClasses = async (req, res) => {
  try {
    const churchId = getChurchId(req);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ của tài khoản.",
      });
    }

    const [classes] = await db.execute(
      `
        SELECT
          id,
          name,
          code,
          category,
          academic_year,
          level_order,
          description,
          status
        FROM classes
        WHERE church_id = ?
          AND status = 'active'
        ORDER BY
          category ASC,
          level_order IS NULL ASC,
          level_order ASC,
          name ASC,
          id ASC
      `,
      [churchId],
    );

    const [lessons] = await db.execute(
      `
        SELECT id, title, catechism_type
        FROM lessons
        WHERE church_id = ?
        ORDER BY id ASC
      `,
      [churchId],
    );

    const lessonsByType = new Map();

    for (const lesson of lessons) {
      const type = lesson.catechism_type;

      if (!lessonsByType.has(type)) {
        lessonsByType.set(type, []);
      }

      lessonsByType.get(type).push(lesson);
    }

    const result = classes.map((item) => {
      const catechismType = getCatechismType(item.category);
      const matchedLessons = catechismType
        ? lessonsByType.get(catechismType) || []
        : [];

      return {
        ...item,
        catechism_type: catechismType,
        lesson_count: matchedLessons.length,
        has_lessons: matchedLessons.length > 0,
        mapping_supported: Boolean(catechismType),
      };
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[CatechismJourney] getClasses error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải danh sách lớp hành trình giáo lý.",
    });
  }
};

/**
 * GET /api/catechism-journey/classes/:classId
 *
 * Lấy chi tiết một lớp và các bài học tương ứng.
 * Không có bảng chapters: nhóm bài chỉ là dữ liệu giao diện.
 */
exports.getClassJourney = async (req, res) => {
  try {
    const churchId = getChurchId(req);
    const classId = Number(req.params.classId);

    if (!churchId) {
      return res.status(401).json({
        success: false,
        message: "Không xác định được giáo xứ của tài khoản.",
      });
    }

    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID lớp không hợp lệ.",
      });
    }

    const [classRows] = await db.execute(
      `
        SELECT
          id,
          name,
          code,
          category,
          academic_year,
          level_order,
          description,
          status
        FROM classes
        WHERE id = ?
          AND church_id = ?
          AND status = 'active'
        LIMIT 1
      `,
      [classId, churchId],
    );

    if (!classRows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lớp học trong giáo xứ của bạn.",
      });
    }

    const classInfo = classRows[0];
    const catechismType = getCatechismType(classInfo.category);

    let lessons = [];

    if (catechismType) {
      const [lessonRows] = await db.execute(
        `
          SELECT id, title, catechism_type
          FROM lessons
          WHERE church_id = ?
            AND catechism_type = ?
          ORDER BY id ASC
        `,
        [churchId, catechismType],
      );

      lessons = lessonRows;
    }

    return res.json({
      success: true,
      data: {
        class: {
          ...classInfo,
          catechism_type: catechismType,
        },

        // Nhóm ảo ở frontend, KHÔNG phải bảng chapters.
        chapters: lessons.length
          ? [
              {
                id: "all-lessons",
                title: "Hành trình bài học",
                lessons: lessons.map((lesson, index) => ({
                  ...lesson,
                  order: index + 1,
                })),
              },
            ]
          : [],

        lesson_count: lessons.length,
        mapping_supported: Boolean(catechismType),
        message: !catechismType
          ? "Danh mục lớp này chưa có loại bài học tương ứng."
          : lessons.length === 0
            ? "Chương trình này chưa có bài học tại giáo xứ."
            : null,
      },
    });
  } catch (error) {
    console.error("[CatechismJourney] getClassJourney error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải hành trình bài học.",
    });
  }
};

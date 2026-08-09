const db = require("../config/db");

// ================================================
// HÀM BỔ TRỢ: CHUẨN HÓA VĂN BẢN VÀ TÁCH TỪ
// ================================================
const normalizeAndTokenize = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Bỏ dấu tiếng Việt
    .replace(/[.,!?;:()"“”\n\r]/g, " ") // Bỏ tất cả dấu câu và xuống dòng
    .trim()
    .split(/\s+/) // Tách thành mảng các từ
    .filter(Boolean);
};

// Khoảng cách Levenshtein giữa 2 từ
const levenshteinDistance = (a, b) => {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][a - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
};

// So sánh 2 từ có giống nhau không
const isWordSimilar = (word1, word2) => {
  if (word1 === word2) return true;
  if (word1.length > 3 && word2.length > 3) {
    return levenshteinDistance(word1, word2) <= 1;
  }
  return false;
};

// ================================================
// HÀM CHẤM ĐIỂM 1 BÀI KINH (THUẬT TOÁN LCS)
// ================================================
const evaluateEssay = (originalText, userText) => {
  const origWords = normalizeAndTokenize(originalText);
  const userWords = normalizeAndTokenize(userText);

  if (origWords.length === 0) {
    return {
      score: 100,
      totalQuestions: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      feedback: "Bài kinh gốc không có nội dung.",
    };
  }

  // Thuật toán Longest Common Subsequence (LCS)
  const n = origWords.length;
  const m = userWords.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (isWordSimilar(origWords[i - 1], userWords[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedWordsCount = dp[n][m];
  const totalOriginalWords = n;
  const totalUserWords = m;

  let score = Math.round((matchedWordsCount / totalOriginalWords) * 100);

  // Phạt điểm nếu viết thừa quá nhiều từ không liên quan
  if (totalUserWords > totalOriginalWords * 1.5) {
    score = Math.max(0, score - 10);
  }

  score = Math.min(100, Math.max(0, score));

  return {
    score,
    totalQuestions: totalOriginalWords,
    correctAnswers: matchedWordsCount,
    wrongAnswers: Math.max(0, totalOriginalWords - matchedWordsCount),
    userWordsCount: totalUserWords,
  };
};

// ================================================
// SUBMIT KẾT QUẢ KIỂM TRA (HỖ TRỢ MÃ EXAM_CODE)
// ================================================
exports.createExamResult = async (req, res) => {
  try {
    console.log("\n========== CREATE EXAM SESSION RESULT ==========");
    console.log("📥 Request body:", req.body);

    const {
      fullName,
      className,
      parish,
      exam_session,
      batch,
      exam_code,
      answers,
    } = req.body;
    const sessionName = exam_session || batch;

    // 1. Kiểm tra dữ liệu bắt buộc
    if (
      !fullName ||
      !sessionName ||
      !Array.isArray(answers) ||
      answers.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Vui lòng nhập đầy đủ họ tên, đợt kiểm tra và danh sách bài làm!",
      });
    }

    let totalScoreSum = 0;
    let totalQuestionsSum = 0;
    let correctAnswersSum = 0;
    let wrongAnswersSum = 0;
    const evaluatedDetails = [];

    // 2. Duyệt qua từng bài kinh trong đợt để chấm điểm
    for (const item of answers) {
      let finalOriginalContent = item.originalContent;
      let finalPrayerTitle = item.prayerTitle;

      if (!finalOriginalContent && item.prayerId) {
        const [rows] = await db.query(
          "SELECT title, content FROM prayers WHERE id = ?",
          [item.prayerId],
        );
        if (rows.length > 0) {
          finalOriginalContent = rows[0].content;
          finalPrayerTitle = finalPrayerTitle || rows[0].title;
        }
      }

      const evalResult = evaluateEssay(
        finalOriginalContent || "",
        item.userContent || "",
      );

      totalScoreSum += evalResult.score;
      totalQuestionsSum += evalResult.totalQuestions;
      correctAnswersSum += evalResult.correctAnswers;
      wrongAnswersSum += evalResult.wrongAnswers;

      evaluatedDetails.push({
        prayerId: item.prayerId,
        prayerTitle: finalPrayerTitle,
        userContent: item.userContent || "",
        score: evalResult.score,
        totalQuestions: evalResult.totalQuestions,
        correctAnswers: evalResult.correctAnswers,
        wrongAnswers: evalResult.wrongAnswers,
      });
    }

    // 3. Tính điểm trung bình đợt
    const averageScore = Math.round(totalScoreSum / evaluatedDetails.length);

    let overallFeedback = "";
    if (averageScore >= 90) {
      overallFeedback = `Xuất sắc! Bạn thuộc rất tốt cả ${evaluatedDetails.length} bài kinh trong đợt này.`;
    } else if (averageScore >= 75) {
      overallFeedback = `Rất tốt! Bạn thuộc hầu hết các bài kinh, chỉ sai sót nhỏ.`;
    } else if (averageScore >= 50) {
      overallFeedback = `Đạt yêu cầu đợt kiểm tra. Cần ôn luyện thêm các bài chưa thuộc kĩ.`;
    } else {
      overallFeedback = `Chưa đạt! Bạn cần học lại các bài kinh trong đợt này.`;
    }

    console.log("👤 Người kiểm tra:", fullName);
    console.log("📌 Đợt kiểm tra:", sessionName);
    console.log("🔑 Mã tra cứu:", exam_code || "Không có");
    console.log("📊 Điểm trung bình đợt:", averageScore);

    // 4. Lệnh SQL lưu thông tin kèm exam_code
    const sql = `
      INSERT INTO exam_results (
        full_name,
        class_name,
        parish,
        exam_code,
        exam_session_name,
        prayer_id,
        prayer_title,
        user_content,
        score,
        total_questions,
        correct_answers,
        wrong_answers,
        feedback
      )
      VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      fullName,
      className || null,
      parish || null,
      exam_code || null, // Lưu mã tra cứu
      sessionName,
      JSON.stringify(evaluatedDetails), // Lưu mảng chi tiết bài làm dưới dạng JSON string
      averageScore,
      totalQuestionsSum,
      correctAnswersSum,
      wrongAnswersSum,
      overallFeedback,
    ];

    const [result] = await db.query(sql, values);

    console.log(`✅ Lưu kết quả thành công - ID: ${result.insertId}`);
    console.log("========================================\n");

    return res.status(201).json({
      success: true,
      message: "Chấm điểm đợt kiểm tra thành công",
      data: {
        id: result.insertId,
        fullName,
        className,
        parish,
        exam_code,
        exam_session: sessionName,
        batch: sessionName,
        score: averageScore,
        totalQuestions: totalQuestionsSum,
        correctAnswers: correctAnswersSum,
        wrongAnswers: wrongAnswersSum,
        feedback: overallFeedback,
        details: evaluatedDetails,
      },
    });
  } catch (error) {
    console.error("\n❌ LỖI CREATE EXAM RESULT");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi chấm điểm bài kiểm tra theo đợt",
      error: error.message,
    });
  }
};

// ================================
// LẤY TẤT CẢ KẾT QUẢ
// ================================
exports.getExamResults = async (req, res) => {
  try {
    const sql = `
      SELECT *
      FROM exam_results
      ORDER BY submitted_at DESC
    `;
    const [rows] = await db.query(sql);

    const formattedRows = rows.map((row) => {
      let details = [];
      try {
        details = row.user_content ? JSON.parse(row.user_content) : [];
      } catch (e) {
        details = row.user_content;
      }

      return {
        ...row,
        exam_session: row.exam_session_name,
        details: details,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedRows,
    });
  } catch (error) {
    console.error("Lỗi getExamResults:", error.message);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách kết quả",
      error: error.message,
    });
  }
};

// ================================
// TRA CỨU KẾT QUẢ THEO MÃ EXAM_CODE
// ================================
exports.getExamResultByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const sql = `SELECT * FROM exam_results WHERE exam_code = ?`;
    const [rows] = await db.query(sql, [code]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả kiểm tra với mã này!",
      });
    }

    const item = rows[0];
    try {
      item.details = item.user_content ? JSON.parse(item.user_content) : [];
    } catch (e) {
      item.details = item.user_content;
    }
    item.exam_session = item.exam_session_name;

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Lỗi getExamResultByCode:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tra cứu kết quả",
      error: error.message,
    });
  }
};

// ================================
// LẤY KẾT QUẢ THEO ID
// ================================
exports.getExamResultById = async (req, res) => {
  try {
    const { id } = req.params;
    const sql = `SELECT * FROM exam_results WHERE id = ?`;
    const [rows] = await db.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả kiểm tra",
      });
    }

    const item = rows[0];
    try {
      item.details = item.user_content ? JSON.parse(item.user_content) : [];
    } catch (e) {
      item.details = item.user_content;
    }
    item.exam_session = item.exam_session_name;

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Lỗi getExamResultById:", error.message);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy kết quả kiểm tra",
      error: error.message,
    });
  }
};

// ================================
// XÓA KẾT QUẢ
// ================================
exports.deleteExamResult = async (req, res) => {
  try {
    const { id } = req.params;
    const sql = `DELETE FROM exam_results WHERE id = ?`;
    const [result] = await db.query(sql, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kết quả để xóa",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Xóa kết quả thành công",
    });
  } catch (error) {
    console.error("Lỗi deleteExamResult:", error.message);
    return res.status(500).json({
      success: false,
      message: "Không thể xóa kết quả",
      error: error.message,
    });
  }
};

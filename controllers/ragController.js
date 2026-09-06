const { syncTable } = require("../services/syncService");
const { trainEmbeddings } = require("../services/trainEmbeddingService");

// ========================================
// 1. ĐỒNG BỘ DỮ LIỆU RAG (SYNC DATA)
// ========================================
exports.train = async (req, res) => {
  try {
    const io = req.app.get("io");

    const steps = [
      "Đang đồng bộ nhà thờ",
      "Đang đồng bộ sự kiện",
      "Đang đồng bộ nhóm & hội đoàn",
      "Đang đồng bộ bài giáo lý",
      "Đang đồng bộ kinh nguyện",
      "Đang đồng bộ slide banner",
    ];

    let currentStep = 0;

    const emitProgress = (msg) => {
      if (io) {
        const percent = Math.round((currentStep / steps.length) * 100);
        io.emit("rag_train_progress", {
          step: msg,
          percent: percent,
          status: "processing",
        });
      }
    };

    // Step 1: Churches
    emitProgress(steps[currentStep++]);
    await syncTable({
      tableName: "churches",
      sourceType: "church",
      titleField: "name",
      contentField: "address",
    });

    // Step 2: Events
    emitProgress(steps[currentStep++]);
    await syncTable({
      tableName: "events",
      sourceType: "event",
      titleField: "title",
      contentField: "meta_desc",
    });

    // Step 3: Groups
    emitProgress(steps[currentStep++]);
    await syncTable({
      tableName: "groups",
      sourceType: "group",
      titleField: "name",
      contentField: "description",
    });

    // Step 4: Lessons
    emitProgress(steps[currentStep++]);
    await syncTable({
      tableName: "lessons",
      sourceType: "lesson",
      titleField: "title",
      contentField: "content",
    });

    // Step 5: Prayers
    emitProgress(steps[currentStep++]);
    await syncTable({
      tableName: "prayers",
      sourceType: "prayer",
      titleField: "title",
      contentField: "content",
    });

    // Step 6: Slides
    emitProgress(steps[currentStep++]);
    await syncTable({
      tableName: "slides",
      sourceType: "slide",
      titleField: "title",
      contentField: "subtitle",
    });

    // Hoàn thành
    if (io) {
      io.emit("rag_train_progress", {
        step: "Hoàn thành đồng bộ dữ liệu giáo xứ",
        percent: 100,
        status: "completed",
      });
    }

    return res.json({
      success: true,
      message: "Đồng bộ dữ liệu giáo xứ thành công",
    });
  } catch (error) {
    console.error("❌ SYNC RAG ERROR:", error);
    if (req.app.get("io")) {
      req.app.get("io").emit("rag_train_progress", {
        step: "Lỗi đồng bộ: " + error.message,
        percent: 0,
        status: "error",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================================
// 2. TẠO VECTOR EMBEDDING (TRAIN VECTOR)
// ========================================
exports.trainEmbedding = async (req, res) => {
  try {
    const io = req.app.get("io");

    // Service trainEmbeddings gọi callback phát Socket từng item
    // Callback truyền vào dạng: { current, total, percent, message }
    await trainEmbeddings((progressData) => {
      if (io) {
        io.emit("rag_embedding_progress", {
          current: progressData.current,
          total: progressData.total,
          percent:
            progressData.percent ||
            Math.round((progressData.current / progressData.total) * 100),
          message:
            progressData.message ||
            `Embedding ${progressData.current}/${progressData.total}`,
          status: "processing",
        });
      }
    });

    // Hoàn tất
    if (io) {
      io.emit("rag_embedding_progress", {
        current: 100,
        total: 100,
        percent: 100,
        message: "Hoàn tất tạo AI Knowledge Vector Base!",
        status: "completed",
      });
    }

    return res.json({
      success: true,
      message: "Tạo embedding vector thành công",
    });
  } catch (error) {
    console.error("❌ EMBEDDING ERROR:", error);
    if (req.app.get("io")) {
      req.app.get("io").emit("rag_embedding_progress", {
        message: "Lỗi tạo embedding: " + error.message,
        percent: 0,
        status: "error",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

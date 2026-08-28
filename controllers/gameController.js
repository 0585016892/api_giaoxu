const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

/**
 * =========================================================
 * GAME CONTROLLER
 * =========================================================
 *
 * Supported game types:
 *
 * 1. quiz
 * 2. matching
 * 3. wheel
 * 4. memory
 * 5. crossword
 * 6. sorting
 * 7. drag_drop
 * 8. true_false
 *
 * =========================================================
 */

const GAME_TYPES = [
  "quiz",
  "matching",
  "wheel",
  "memory",
  "crossword",
  "sorting",
  "drag_drop",
  "true_false",
];

const GAMES_UPLOAD_DIR = path.join(process.cwd(), "uploads", "games");

/**
 * =========================================================
 * AUTH
 * =========================================================
 */

const getAuthUser = (req) => {
  if (!req.user) {
    throw new Error("Không xác định được người dùng đăng nhập");
  }

  const id = Number(req.user.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("ID người dùng không hợp lệ");
  }

  return {
    id,
    role: req.user.role || null,
  };
};

/**
 * =========================================================
 * LOGGER
 * =========================================================
 */

const getRequestInfo = (req) => ({
  ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",

  userAgent: req.headers["user-agent"] || "unknown",
});

const logInfo = (action, data = {}) => {
  console.log(
    `[GAME][${action}]`,
    JSON.stringify({
      time: new Date().toISOString(),
      ...data,
    }),
  );
};

const logError = (action, error, data = {}) => {
  console.error(
    `[GAME][${action}]`,
    JSON.stringify({
      time: new Date().toISOString(),
      error: error?.message || String(error),
      ...data,
    }),
  );

  if (error?.stack) {
    console.error(error.stack);
  }
};

/**
 * =========================================================
 * BASIC HELPERS
 * =========================================================
 */

const isObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const parseNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const parseJsonField = (value, fallback = {}) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("Dữ liệu JSON gửi lên không hợp lệ");
  }
};

const parseGameData = (data) => {
  if (!data) {
    return {};
  }

  if (typeof data === "object") {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error("Dữ liệu game trong database không hợp lệ");
  }
};

const normalizeGameType = (type) => {
  if (!type) {
    return "quiz";
  }

  const normalized = String(type).trim().toLowerCase();

  if (!GAME_TYPES.includes(normalized)) {
    throw new Error(`Loại game không hợp lệ. Hỗ trợ: ${GAME_TYPES.join(", ")}`);
  }

  return normalized;
};

/**
 * =========================================================
 * FILE DIRECTORY
 * =========================================================
 */

const getGameDirectory = (gameId) => {
  return path.join(GAMES_UPLOAD_DIR, `game${gameId}`);
};

const createGameDirectory = (gameId) => {
  const gameDir = getGameDirectory(gameId);

  fs.mkdirSync(gameDir, {
    recursive: true,
  });

  return gameDir;
};

const deleteGameDirectory = (gameId) => {
  try {
    const gameDir = getGameDirectory(gameId);

    if (fs.existsSync(gameDir)) {
      fs.rmSync(gameDir, {
        recursive: true,
        force: true,
      });
    }
  } catch (error) {
    logError("DELETE_DIRECTORY_ERROR", error, {
      game_id: gameId,
    });
  }
};

const getExtension = (fileName = "") => {
  return path.extname(fileName).toLowerCase();
};

const saveFile = (file, gameDir, baseName) => {
  if (!file) {
    return null;
  }

  const extension = getExtension(file.originalname);

  const fileName = `${baseName}${extension}`;

  const filePath = path.join(gameDir, fileName);

  fs.writeFileSync(filePath, file.buffer);

  const gameId = path.basename(gameDir).replace("game", "");

  return `/uploads/games/game${gameId}/${fileName}`;
};

/**
 * =========================================================
 * VALIDATORS
 * =========================================================
 */

/**
 * QUIZ
 *
 * {
 *   id,
 *   question,
 *   options: [],
 *   correctAnswer
 * }
 */

const validateQuiz = (data) => {
  const questions = Array.isArray(data.questions) ? data.questions : [];

  questions.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Quiz câu ${index + 1} không hợp lệ`);
    }

    if (!item.question && !item.text) {
      throw new Error(`Quiz câu ${index + 1} thiếu nội dung`);
    }

    if (!Array.isArray(item.options) && !Array.isArray(item.answers)) {
      throw new Error(`Quiz câu ${index + 1} thiếu đáp án`);
    }
  });

  return {
    questions,
  };
};

/**
 * =========================================================
 * MATCHING
 *
 * {
 *   pairs: [
 *     {
 *       id,
 *       left,
 *       right
 *     }
 *   ]
 * }
 * =========================================================
 */

const validateMatching = (data) => {
  const pairs = Array.isArray(data.pairs)
    ? data.pairs
    : Array.isArray(data.questions)
      ? data.questions
      : [];

  pairs.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Matching item ${index + 1} không hợp lệ`);
    }

    const left = item.left ?? item.question ?? item.term;

    const right = item.right ?? item.answer ?? item.match;

    if (!left || !right) {
      throw new Error(`Matching item ${index + 1} phải có left và right`);
    }
  });

  return {
    pairs,
  };
};

/**
 * =========================================================
 * WHEEL
 *
 * {
 *   wheel: {
 *     items: [],
 *     wheelColor,
 *     pointerColor,
 *     spinsPerPlayer,
 *     autoSpin,
 *     showResult,
 *     allowReplay
 *   }
 * }
 * =========================================================
 */

const validateWheel = (data) => {
  const wheel = isObject(data.wheel) ? data.wheel : {};

  const items = Array.isArray(wheel.items)
    ? wheel.items
    : Array.isArray(data.questions)
      ? data.questions
      : [];

  let totalProbability = 0;

  const normalizedItems = items.map((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Ô vòng quay ${index + 1} không hợp lệ`);
    }

    if (!item.label) {
      throw new Error(`Ô vòng quay ${index + 1} thiếu nội dung`);
    }

    const probability = parseNumber(item.probability, 0);

    totalProbability += probability;

    return {
      id: item.id ?? index + 1,

      label: String(item.label),

      value: item.value ?? "",

      color: item.color || "#6C4BFF",

      probability,
    };
  });

  return {
    wheel: {
      items: normalizedItems,

      wheelColor: wheel.wheelColor || "#6C4BFF",

      pointerColor: wheel.pointerColor || "#FFD54F",

      spinsPerPlayer: parseNumber(wheel.spinsPerPlayer, 1),

      autoSpin: parseBoolean(wheel.autoSpin, false),

      showResult: parseBoolean(wheel.showResult, true),

      allowReplay: parseBoolean(wheel.allowReplay, false),
    },
  };
};

/**
 * =========================================================
 * MEMORY
 *
 * {
 *   cards: [
 *     {
 *       id,
 *       content,
 *       image,
 *       pairId
 *     }
 *   ]
 * }
 * =========================================================
 */

const validateMemory = (data) => {
  const cards = Array.isArray(data.cards)
    ? data.cards
    : Array.isArray(data.questions)
      ? data.questions
      : [];

  cards.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Thẻ memory ${index + 1} không hợp lệ`);
    }

    if (item.id === undefined && item.cardId === undefined) {
      throw new Error(`Thẻ memory ${index + 1} thiếu ID`);
    }

    if (item.pairId === undefined && item.matchId === undefined) {
      throw new Error(`Thẻ memory ${index + 1} thiếu pairId`);
    }
  });

  return {
    cards,
  };
};

/**
 * =========================================================
 * CROSSWORD
 *
 * {
 *   crossword: {
 *     rows,
 *     cols,
 *     words: []
 *   }
 * }
 * =========================================================
 */

const validateCrossword = (data) => {
  const crossword = isObject(data.crossword) ? data.crossword : {};

  const words = Array.isArray(crossword.words)
    ? crossword.words
    : Array.isArray(data.questions)
      ? data.questions
      : [];

  words.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Từ hàng ngang/dọc ${index + 1} không hợp lệ`);
    }

    if (!item.word && !item.answer) {
      throw new Error(`Ô chữ ${index + 1} thiếu từ`);
    }

    if (!item.clue && !item.question) {
      throw new Error(`Ô chữ ${index + 1} thiếu gợi ý`);
    }
  });

  return {
    crossword: {
      rows: parseNumber(crossword.rows, 10),

      cols: parseNumber(crossword.cols, 10),

      words,
    },
  };
};

/**
 * =========================================================
 * SORTING
 *
 * {
 *   sorting: {
 *     items: []
 *   }
 * }
 * =========================================================
 */

const validateSorting = (data) => {
  const sorting = isObject(data.sorting) ? data.sorting : {};

  const items = Array.isArray(sorting.items)
    ? sorting.items
    : Array.isArray(data.questions)
      ? data.questions
      : [];

  items.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Sorting item ${index + 1} không hợp lệ`);
    }

    if (!item.text && !item.label && !item.value) {
      throw new Error(`Sorting item ${index + 1} thiếu nội dung`);
    }
  });

  return {
    sorting: {
      items,
    },
  };
};

/**
 * =========================================================
 * DRAG DROP
 *
 * {
 *   dragDrop: {
 *     items: [],
 *     targets: []
 *   }
 * }
 * =========================================================
 */

const validateDragDrop = (data) => {
  const dragDrop = isObject(data.dragDrop) ? data.dragDrop : {};

  const items = Array.isArray(dragDrop.items)
    ? dragDrop.items
    : Array.isArray(data.questions)
      ? data.questions
      : [];

  const targets = Array.isArray(dragDrop.targets) ? dragDrop.targets : [];

  items.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Drag Drop item ${index + 1} không hợp lệ`);
    }

    if (item.id === undefined && !item.itemId) {
      throw new Error(`Drag Drop item ${index + 1} thiếu ID`);
    }

    if (item.targetId === undefined && item.correctTargetId === undefined) {
      throw new Error(`Drag Drop item ${index + 1} thiếu targetId`);
    }
  });

  return {
    dragDrop: {
      items,
      targets,
    },
  };
};

/**
 * =========================================================
 * TRUE FALSE
 * =========================================================
 */

const validateTrueFalse = (data) => {
  const questions = Array.isArray(data.questions) ? data.questions : [];

  questions.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`Câu ${index + 1} không hợp lệ`);
    }

    if (!item.question && !item.text) {
      throw new Error(`Câu ${index + 1} thiếu nội dung`);
    }

    if (
      item.answer === undefined &&
      item.correctAnswer === undefined &&
      item.isTrue === undefined
    ) {
      throw new Error(`Câu ${index + 1} thiếu đáp án`);
    }
  });

  return {
    questions,
  };
};

/**
 * =========================================================
 * VALIDATE TYPE DATA
 * =========================================================
 */

const validateTypeData = (type, gameData) => {
  switch (type) {
    case "quiz":
      return validateQuiz(gameData);

    case "matching":
      return validateMatching(gameData);

    case "wheel":
      return validateWheel(gameData);

    case "memory":
      return validateMemory(gameData);

    case "crossword":
      return validateCrossword(gameData);

    case "sorting":
      return validateSorting(gameData);

    case "drag_drop":
      return validateDragDrop(gameData);

    case "true_false":
      return validateTrueFalse(gameData);

    default:
      throw new Error("Loại game không được hỗ trợ");
  }
};

/**
 * =========================================================
 * NORMALIZE GAME DATA
 * =========================================================
 */

const buildGameData = ({
  name,
  description = "",
  type = "quiz",

  thumbnail = null,

  background = {},

  theme = {},

  settings = {},

  media = {},

  questions = [],

  pairs = [],

  wheel = {},

  cards = [],

  crossword = {},

  sorting = {},

  dragDrop = {},
}) => {
  const normalizedType = normalizeGameType(type);

  /**
   * Gom toàn bộ dữ liệu riêng
   * để validator xử lý
   */

  const typeData = validateTypeData(normalizedType, {
    questions,
    pairs,
    wheel,
    cards,
    crossword,
    sorting,
    dragDrop,
  });

  /**
   * DATA CHUNG
   */

  const gameData = {
    name: String(name).trim(),

    description: String(description || "").trim(),

    type: normalizedType,

    thumbnail,

    background: {
      image: background?.image || null,

      color: background?.color || "#F8F9FC",
    },

    theme: {
      primary: theme?.primary || "#6C4BFF",

      secondary: theme?.secondary || "#FFD54F",

      font: theme?.font || "Baloo 2",

      borderRadius:
        theme?.borderRadius !== undefined
          ? parseNumber(theme.borderRadius, 20)
          : 20,
    },

    settings: {
      timeLimit:
        settings?.timeLimit !== undefined
          ? parseNumber(settings.timeLimit, 60)
          : 60,

      shuffleQuestions: parseBoolean(settings?.shuffleQuestions, false),

      shuffleAnswers: parseBoolean(settings?.shuffleAnswers, false),

      showScore: parseBoolean(settings?.showScore, true),

      showTimer: parseBoolean(settings?.showTimer, true),

      showProgress: parseBoolean(settings?.showProgress, false),

      allowHint: parseBoolean(settings?.allowHint, false),

      allowSkip: parseBoolean(settings?.allowSkip, false),
    },

    media: {
      backgroundMusic: media?.backgroundMusic || null,

      correctSound: media?.correctSound || null,

      wrongSound: media?.wrongSound || null,
    },

    ...typeData,
  };

  return gameData;
};

/**
 * =========================================================
 * PARSE REQUEST GAME DATA
 * =========================================================
 */

const parseRequestGameData = (body, fallback = {}) => {
  return {
    name: body.name ?? fallback.name,

    description: body.description ?? fallback.description ?? "",

    type: body.type ?? fallback.type ?? "quiz",

    background: parseJsonField(
      body.backgroundConfig,
      fallback.background || {},
    ),

    theme: parseJsonField(body.theme, fallback.theme || {}),

    settings: parseJsonField(body.settings, fallback.settings || {}),

    media: parseJsonField(body.media, fallback.media || {}),

    questions: parseJsonField(body.questions, fallback.questions || []),

    pairs: parseJsonField(body.pairs, fallback.pairs || []),

    wheel: parseJsonField(body.wheel, fallback.wheel || {}),

    cards: parseJsonField(body.cards, fallback.cards || []),

    crossword: parseJsonField(body.crossword, fallback.crossword || {}),

    sorting: parseJsonField(body.sorting, fallback.sorting || {}),

    dragDrop: parseJsonField(body.dragDrop, fallback.dragDrop || {}),
  };
};

/**
 * =========================================================
 * SAVE GAME FILES
 * =========================================================
 */

const processGameFiles = ({ files = {}, gameId, oldData = {} }) => {
  let thumbnailPath = oldData.thumbnail || null;

  let backgroundPath = oldData.background?.image || null;

  let backgroundMusicPath = oldData.media?.backgroundMusic || null;

  let correctSoundPath = oldData.media?.correctSound || null;

  let wrongSoundPath = oldData.media?.wrongSound || null;

  if (!Object.keys(files).length) {
    return {
      thumbnailPath,
      backgroundPath,
      backgroundMusicPath,
      correctSoundPath,
      wrongSoundPath,
    };
  }

  const gameDir = createGameDirectory(gameId);

  if (files.thumbnail?.[0]) {
    thumbnailPath = saveFile(files.thumbnail[0], gameDir, "thumbnail");
  }

  if (files.background?.[0]) {
    backgroundPath = saveFile(files.background[0], gameDir, "background");
  }

  if (files.backgroundMusic?.[0]) {
    backgroundMusicPath = saveFile(
      files.backgroundMusic[0],
      gameDir,
      "background-music",
    );
  }

  if (files.correctSound?.[0]) {
    correctSoundPath = saveFile(
      files.correctSound[0],
      gameDir,
      "correct-sound",
    );
  }

  if (files.wrongSound?.[0]) {
    wrongSoundPath = saveFile(files.wrongSound[0], gameDir, "wrong-sound");
  }

  return {
    thumbnailPath,
    backgroundPath,
    backgroundMusicPath,
    correctSoundPath,
    wrongSoundPath,
  };
};

/**
 * =========================================================
 * CREATE GAME
 * =========================================================
 */

const createGame = async (req, res) => {
  const startTime = Date.now();

  let gameId = null;

  let user = null;

  const requestInfo = getRequestInfo(req);

  try {
    user = getAuthUser(req);

    const teacherId = user.id;

    const requestData = parseRequestGameData(req.body || {});

    if (typeof requestData.name !== "string" || !requestData.name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên game là bắt buộc",
      });
    }

    const gameType = normalizeGameType(requestData.type);

    logInfo("CREATE_START", {
      teacher_id: teacherId,
      type: gameType,
      name: requestData.name,
      files: Object.keys(req.files || {}),
      ...requestInfo,
    });

    /**
     * Tạo data ban đầu
     */

    const initialGameData = buildGameData({
      ...requestData,
      type: gameType,
      thumbnail: null,
      background: {
        ...requestData.background,
        image: null,
      },
      media: {
        ...requestData.media,
        backgroundMusic: null,
        correctSound: null,
        wrongSound: null,
      },
    });

    /**
     * INSERT DB
     */

    const [result] = await pool.execute(
      `
        INSERT INTO games (
          teacher_id,
          data
        )
        VALUES (?, ?)
        `,
      [teacherId, JSON.stringify(initialGameData)],
    );

    gameId = result.insertId;

    /**
     * FILES
     */

    const {
      thumbnailPath,
      backgroundPath,
      backgroundMusicPath,
      correctSoundPath,
      wrongSoundPath,
    } = processGameFiles({
      files: req.files || {},
      gameId,
      oldData: {},
    });

    /**
     * FINAL DATA
     */

    const finalGameData = buildGameData({
      ...requestData,

      type: gameType,

      thumbnail: thumbnailPath,

      background: {
        ...requestData.background,
        image: backgroundPath || requestData.background?.image || null,
      },

      media: {
        ...requestData.media,

        backgroundMusic:
          backgroundMusicPath || requestData.media?.backgroundMusic || null,

        correctSound:
          correctSoundPath || requestData.media?.correctSound || null,

        wrongSound: wrongSoundPath || requestData.media?.wrongSound || null,
      },
    });

    /**
     * UPDATE DATA
     */

    await pool.execute(
      `
      UPDATE games
      SET data = ?
      WHERE id = ?
      `,
      [JSON.stringify(finalGameData), gameId],
    );

    logInfo("CREATE_SUCCESS", {
      game_id: gameId,
      teacher_id: teacherId,
      type: gameType,
      durationMs: Date.now() - startTime,
      ...requestInfo,
    });

    return res.status(201).json({
      success: true,

      message: "Tạo game thành công",

      data: {
        id: gameId,

        teacher_id: teacherId,

        ...finalGameData,
      },
    });
  } catch (error) {
    logError("CREATE_ERROR", error, {
      game_id: gameId,
      user_id: user?.id,
      durationMs: Date.now() - startTime,
      ...requestInfo,
    });

    if (gameId) {
      try {
        await pool.execute(
          `
          DELETE FROM games
          WHERE id = ?
          `,
          [gameId],
        );
      } catch (rollbackError) {
        logError("CREATE_ROLLBACK_ERROR", rollbackError, {
          game_id: gameId,
        });
      }

      deleteGameDirectory(gameId);
    }

    return res.status(400).json({
      success: false,

      message: error.message || "Không thể tạo game",
    });
  }
};

/**
 * =========================================================
 * GET ALL GAMES
 * =========================================================
 */

const getAllGames = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
        SELECT
          id,
          teacher_id,
          data,
          created_at,
          updated_at
        FROM games
        ORDER BY id DESC
      `);

    const games = rows.map((game) => ({
      id: game.id,

      teacher_id: game.teacher_id,

      ...parseGameData(game.data),

      created_at: game.created_at,

      updated_at: game.updated_at,
    }));

    return res.json({
      success: true,
      data: games,
    });
  } catch (error) {
    logError("GET_ALL_ERROR", error);

    return res.status(500).json({
      success: false,

      message: "Không thể lấy danh sách game",
    });
  }
};

/**
 * =========================================================
 * GET GAMES BY TEACHER
 * =========================================================
 */

const getGamesByTeacher = async (req, res) => {
  try {
    const user = getAuthUser(req);

    const requestedTeacherId = Number(req.params.teacherId);

    const isAdmin = user.role === "admin";

    const teacherId = isAdmin ? requestedTeacherId : user.id;

    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      return res.status(400).json({
        success: false,

        message: "teacherId không hợp lệ",
      });
    }

    const [rows] = await pool.execute(
      `
          SELECT
            id,
            teacher_id,
            data,
            created_at,
            updated_at
          FROM games
          WHERE teacher_id = ?
          ORDER BY id DESC
          `,
      [teacherId],
    );

    const games = rows.map((game) => ({
      id: game.id,

      teacher_id: game.teacher_id,

      ...parseGameData(game.data),

      created_at: game.created_at,

      updated_at: game.updated_at,
    }));

    return res.json({
      success: true,
      data: games,
    });
  } catch (error) {
    logError("GET_BY_TEACHER_ERROR", error);

    return res.status(500).json({
      success: false,

      message: "Không thể lấy danh sách game",
    });
  }
};

/**
 * =========================================================
 * GET GAME BY ID
 * =========================================================
 */

const getGameById = async (req, res) => {
  const id = Number(req.params.id);

  try {
    const user = getAuthUser(req);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,

        message: "ID game không hợp lệ",
      });
    }

    const [rows] = await pool.execute(
      `
        SELECT
          id,
          teacher_id,
          data,
          created_at,
          updated_at
        FROM games
        WHERE id = ?
        LIMIT 1
        `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,

        message: "Không tìm thấy game",
      });
    }

    const game = rows[0];

    const isAdmin = user.role === "admin";

    if (!isAdmin && Number(game.teacher_id) !== Number(user.id)) {
      return res.status(403).json({
        success: false,

        message: "Bạn không có quyền xem game này",
      });
    }

    return res.json({
      success: true,

      data: {
        id: game.id,

        teacher_id: game.teacher_id,

        ...parseGameData(game.data),

        created_at: game.created_at,

        updated_at: game.updated_at,
      },
    });
  } catch (error) {
    logError("GET_BY_ID_ERROR", error, {
      game_id: id,
    });

    return res.status(500).json({
      success: false,

      message: "Không thể lấy game",
    });
  }
};

/**
 * =========================================================
 * UPDATE GAME
 * =========================================================
 */

const updateGame = async (req, res) => {
  const id = Number(req.params.id);

  const requestInfo = getRequestInfo(req);

  try {
    const user = getAuthUser(req);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,

        message: "ID game không hợp lệ",
      });
    }

    /**
     * GET OLD GAME
     */

    const [rows] = await pool.execute(
      `
        SELECT
          id,
          teacher_id,
          data
        FROM games
        WHERE id = ?
        LIMIT 1
        `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,

        message: "Không tìm thấy game",
      });
    }

    const oldGame = rows[0];

    const isAdmin = user.role === "admin";

    if (!isAdmin && Number(oldGame.teacher_id) !== Number(user.id)) {
      return res.status(403).json({
        success: false,

        message: "Bạn không có quyền cập nhật game này",
      });
    }

    const oldData = parseGameData(oldGame.data);

    /**
     * PARSE REQUEST
     */

    const requestData = parseRequestGameData(req.body || {}, oldData);

    if (typeof requestData.name !== "string" || !requestData.name.trim()) {
      return res.status(400).json({
        success: false,

        message: "Tên game không hợp lệ",
      });
    }

    const gameType = normalizeGameType(requestData.type);

    /**
     * PROCESS FILES
     */

    const {
      thumbnailPath,
      backgroundPath,
      backgroundMusicPath,
      correctSoundPath,
      wrongSoundPath,
    } = processGameFiles({
      files: req.files || {},
      gameId: id,
      oldData,
    });

    /**
     * BUILD FINAL DATA
     */

    const finalGameData = buildGameData({
      ...requestData,

      type: gameType,

      thumbnail: thumbnailPath,

      background: {
        ...requestData.background,

        image: backgroundPath,
      },

      media: {
        ...requestData.media,

        backgroundMusic: backgroundMusicPath,

        correctSound: correctSoundPath,

        wrongSound: wrongSoundPath,
      },
    });

    /**
     * UPDATE DB
     */

    await pool.execute(
      `
      UPDATE games
      SET
        data = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [JSON.stringify(finalGameData), id],
    );

    logInfo("UPDATE_SUCCESS", {
      game_id: id,

      user_id: user.id,

      type: gameType,

      ...requestInfo,
    });

    return res.json({
      success: true,

      message: "Cập nhật game thành công",

      data: {
        id,

        teacher_id: oldGame.teacher_id,

        ...finalGameData,
      },
    });
  } catch (error) {
    logError("UPDATE_ERROR", error, {
      game_id: id,
      user_id: req.user?.id,
      ...requestInfo,
    });

    return res.status(400).json({
      success: false,

      message: error.message || "Không thể cập nhật game",
    });
  }
};

/**
 * =========================================================
 * DELETE GAME
 * =========================================================
 */

const deleteGame = async (req, res) => {
  const id = Number(req.params.id);

  try {
    const user = getAuthUser(req);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,

        message: "ID game không hợp lệ",
      });
    }

    const [rows] = await pool.execute(
      `
        SELECT
          id,
          teacher_id
        FROM games
        WHERE id = ?
        LIMIT 1
        `,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,

        message: "Không tìm thấy game",
      });
    }

    const game = rows[0];

    const isAdmin = user.role === "admin";

    if (!isAdmin && Number(game.teacher_id) !== Number(user.id)) {
      return res.status(403).json({
        success: false,

        message: "Bạn không có quyền xóa game này",
      });
    }

    await pool.execute(
      `
      DELETE FROM games
      WHERE id = ?
      `,
      [id],
    );

    deleteGameDirectory(id);

    logInfo("DELETE_SUCCESS", {
      game_id: id,

      user_id: user.id,

      teacher_id: game.teacher_id,
    });

    return res.json({
      success: true,

      message: "Xóa game thành công",
    });
  } catch (error) {
    logError("DELETE_ERROR", error, {
      game_id: id,
    });

    return res.status(500).json({
      success: false,

      message: "Không thể xóa game",
    });
  }
};

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = {
  createGame,

  getAllGames,

  getGamesByTeacher,

  getGameById,

  updateGame,

  deleteGame,

  GAME_TYPES,
};

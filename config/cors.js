const { isOriginAllowed } = require("../services/cors.service");

const corsOptions = {
  origin: (origin, callback) => {
    console.log("🌍 Origin:", origin || "NO ORIGIN");

    // Postman / server-to-server
    if (!origin) {
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      console.log("✅ CORS OK:", origin);

      return callback(null, true);
    }

    console.log("❌ CORS BLOCK:", origin);

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning",
  ],
};

module.exports = {
  corsOptions,
};

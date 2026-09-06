const errorHandler = (err, req, res, next) => {
  console.error("❌ SERVER ERROR:", err);

  // CORS error
  if (err.message && err.message.startsWith("CORS blocked:")) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};

module.exports = {
  errorHandler,
};

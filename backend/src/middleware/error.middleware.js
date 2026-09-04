function errorHandler(err, req, res, next) {
  console.error("Error:", err);

  const statusCode = err.statusCode || 500;

  /*
    err.statusCode is only ever set deliberately by our own code (validation
    failures, "not found", "invalid credentials", etc.) — those messages are
    safe to show a user. A bare 500 means something unexpected blew up
    (a DB error, a bug, mysql2 rejecting a query) and err.message can
    contain internal details — table/column names, query fragments,
    file paths — that shouldn't reach the client. In production, mask
    those; the real message is still logged above for debugging.
  */
  const isUnexpected = !err.statusCode;
  const exposeDetails = !isUnexpected || process.env.NODE_ENV !== "production";
  const message = exposeDetails ? (err.message || "Internal server error") : "Something went wrong. Please try again.";

  res.status(statusCode).json({
    success: false,
    message
  });
}

module.exports = {
  errorHandler
};

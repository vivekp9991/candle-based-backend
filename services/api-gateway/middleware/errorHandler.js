// Basic error handler middleware (can be expanded)
module.exports = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
};
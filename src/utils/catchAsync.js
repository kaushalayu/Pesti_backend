/**
 * Wraps async route handlers to avoid repetitive try/catch blocks.
 * @param {Function} fn - Async express route handler
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = catchAsync;

/**
 * Paginate query results.
 * @param {Query} query - Mongoose query object
 * @param {Object} reqQuery - req.query object containing page and limit
 */
const paginate = async (query, reqQuery) => {
  const page = Math.max(1, parseInt(reqQuery.page, 10) || 1);
  const limit = Math.min(100, parseInt(reqQuery.limit, 10) || 10);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    query.skip(skip).limit(limit),
    query.model.countDocuments(query.getFilter()),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

module.exports = { paginate };

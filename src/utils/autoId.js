/**
 * Generates a sequential branch-aware ID.
 * @param {Model} Model - Mongoose model to query
 * @param {string} prefix - e.g. 'EMP-LKO', 'RCP-LKO-2026'
 * @param {string} field - The field storing the ID, e.g. 'employeeId'
 * @param {number} padLength - Zero-padding length (default 3)
 */
const generateAutoId = async (Model, prefix, field, padLength = 3) => {
  const regex = new RegExp(`^${prefix}-`);
  const last = await Model.findOne({ [field]: regex })
    .sort({ [field]: -1 })
    .select(field)
    .lean();

  let nextNum = 1;
  if (last) {
    const parts = last[field].split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `${prefix}-${String(nextNum).padStart(padLength, '0')}`;
};

module.exports = { generateAutoId };

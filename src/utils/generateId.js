const generateUniqueId = (type, branchCode, employeeCode) => {
  const now = new Date();
  
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const date = `${yy}${mm}${dd}`;
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  const branch = branchCode || 'HQ';
  const emp = employeeCode || 'S00';
  
  return `${type}-${branch}-${emp}-${date}-${random}`;
};

module.exports = { generateUniqueId };

const CompanySettings = require('../models/CompanySettings');
const catchAsync = require('../utils/catchAsync');

const getCompanySettings = catchAsync(async (req, res) => {
  let settings = await CompanySettings.findOne();
  
  if (!settings) {
    settings = await CompanySettings.create({});
  }
  
  res.status(200).json({
    status: 'success',
    data: settings
  });
});

const updateCompanySettings = catchAsync(async (req, res) => {
  let updateData = { ...req.body };
  
  // Handle file upload for logo
  if (req.file) {
    updateData.logo = `/uploads/${req.file.filename}`;
  }
  
  const settings = await CompanySettings.findOne();
  
  if (!settings) {
    const newSettings = await CompanySettings.create(updateData);
    return res.status(201).json({
      status: 'success',
      data: newSettings
    });
  }
  
  const updatedSettings = await CompanySettings.findByIdAndUpdate(
    settings._id,
    updateData,
    { returnDocument: 'after', runValidators: true }
  );
  
  res.status(200).json({
    status: 'success',
    data: updatedSettings
  });
});

module.exports = {
  getCompanySettings,
  updateCompanySettings
};

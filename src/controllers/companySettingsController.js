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
  const settings = await CompanySettings.findOne();
  
  if (!settings) {
    const newSettings = await CompanySettings.create(req.body);
    return res.status(201).json({
      status: 'success',
      data: newSettings
    });
  }
  
  const updatedSettings = await CompanySettings.findByIdAndUpdate(
    settings._id,
    req.body,
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

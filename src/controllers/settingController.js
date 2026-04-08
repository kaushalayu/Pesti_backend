const Setting = require('../models/Setting');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.getSetting = catchAsync(async (req, res) => {
  const setting = await Setting.findOne({ key: req.params.key });
  res.status(200).json({
    success: true,
    data: setting ? setting.value : null
  });
});

exports.getAllSettings = catchAsync(async (req, res) => {
  const settings = await Setting.find({});
  const result = {};
  settings.forEach(s => {
    result[s.key] = s.value;
  });
  res.status(200).json({
    success: true,
    data: result
  });
});

exports.setSetting = catchAsync(async (req, res, next) => {
  const { key, value, description } = req.body;
  
  if (!key) {
    return next(new AppError('Setting key is required', 400));
  }

  const setting = await Setting.findOneAndUpdate(
    { key },
    { 
      value, 
      description,
      updatedBy: req.user._id,
      updatedAt: new Date()
    },
    { returnDocument: 'after', upsert: true }
  );

  res.status(200).json({
    success: true,
    message: `Setting "${key}" updated successfully`,
    data: setting
  });
});

exports.deleteSetting = catchAsync(async (req, res, next) => {
  const setting = await Setting.findOneAndDelete({ key: req.params.key });
  
  if (!setting) {
    return next(new AppError('Setting not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Setting deleted successfully'
  });
});

exports.getAttDropdowns = catchAsync(async (req, res) => {
  const preTreatmentTypes = await Setting.findOne({ key: 'att_pre_treatment_types' });
  const preChemicals = await Setting.findOne({ key: 'att_pre_chemicals' });
  const preApplicationMethods = await Setting.findOne({ key: 'att_pre_application_methods' });
  const preBaseSolutions = await Setting.findOne({ key: 'att_pre_base_solutions' });
  const preChecklist = await Setting.findOne({ key: 'att_pre_checklist' });

  const postTreatmentTypes = await Setting.findOne({ key: 'att_post_treatment_types' });
  const postChemicals = await Setting.findOne({ key: 'att_post_chemicals' });
  const postApplicationMethods = await Setting.findOne({ key: 'att_post_application_methods' });
  const postBaseSolutions = await Setting.findOne({ key: 'att_post_base_solutions' });

  res.status(200).json({
    success: true,
    data: {
      preTreatmentTypes: preTreatmentTypes?.value || [],
      preChemicals: preChemicals?.value || [],
      preApplicationMethods: preApplicationMethods?.value || [],
      preBaseSolutions: preBaseSolutions?.value || [],
      preChecklist: preChecklist?.value || [],
      postTreatmentTypes: postTreatmentTypes?.value || [],
      postChemicals: postChemicals?.value || [],
      postApplicationMethods: postApplicationMethods?.value || [],
      postBaseSolutions: postBaseSolutions?.value || []
    }
  });
});

exports.updateAttDropdowns = catchAsync(async (req, res, next) => {
  const { 
    preTreatmentTypes,
    preChemicals,
    preApplicationMethods,
    preBaseSolutions,
    preChecklist,
    postTreatmentTypes,
    postChemicals,
    postApplicationMethods,
    postBaseSolutions
  } = req.body;

  const updates = [];
  
  if (preTreatmentTypes !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_pre_treatment_types' },
      { value: preTreatmentTypes, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (preChemicals !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_pre_chemicals' },
      { value: preChemicals, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (preApplicationMethods !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_pre_application_methods' },
      { value: preApplicationMethods, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (preBaseSolutions !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_pre_base_solutions' },
      { value: preBaseSolutions, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (preChecklist !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_pre_checklist' },
      { value: preChecklist, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (postTreatmentTypes !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_post_treatment_types' },
      { value: postTreatmentTypes, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (postChemicals !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_post_chemicals' },
      { value: postChemicals, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (postApplicationMethods !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_post_application_methods' },
      { value: postApplicationMethods, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }
  if (postBaseSolutions !== undefined) {
    updates.push(Setting.findOneAndUpdate(
      { key: 'att_post_base_solutions' },
      { value: postBaseSolutions, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true }
    ));
  }

  await Promise.all(updates);

  res.status(200).json({
    success: true,
    message: 'ATT settings updated successfully'
  });
});
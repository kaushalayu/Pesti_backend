const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');

// @desc    Create new Lead
// @route   POST /api/leads
// @access  Private
exports.createLead = catchAsync(async (req, res, next) => {
  const payload = {
    ...req.body,
    assignedBy: req.user._id,
    branchId: (req.user.role === 'super_admin' && req.body.branchId) ? req.body.branchId : req.user.branchId,
  };

  if (!payload.branchId) {
    return next(new AppError('Branch is required to create a lead.', 400));
  }

  const lead = await Lead.create(payload);

  res.status(201).json({
    success: true,
    data: lead,
  });
});

// @desc    Get all Leads (Paginated)
// @route   GET /api/leads
// @access  Private
exports.getLeads = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Role Filtering:
  // super_admin  → all leads
  // branch_admin / office → only their branch leads
  // sales / technician → only leads assigned to them
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (branchId) queryObj.branchId = branchId;
  } else if (req.user.role === 'sales' || req.user.role === 'technician') {
    queryObj.assignedTo = req.user._id;
  }

  // Filter: assignedToMe (for non-admin users to see only their leads)
  if (req.query.assignedToMe === 'true') {
    queryObj.assignedTo = req.user._id;
  }

  // Search
  if (queryObj.search) {
    const searchRegex = { $regex: queryObj.search, $options: 'i' };
    queryObj.$or = [{ name: searchRegex }, { phone: searchRegex }, { email: searchRegex }];
    delete queryObj.search;
  }

  // Date filters
  if (queryObj.startDate && queryObj.endDate) {
    queryObj.createdAt = { $gte: new Date(queryObj.startDate), $lte: new Date(queryObj.endDate) };
    delete queryObj.startDate;
    delete queryObj.endDate;
  }

  // Next follow-up filter
  if (queryObj.followUpDue) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (queryObj.followUpDue === 'today') {
      queryObj.nextFollowUp = { $gte: today, $lt: tomorrow };
    } else if (queryObj.followUpDue === 'overdue') {
      queryObj.nextFollowUp = { $lt: today };
    } else if (queryObj.followUpDue === 'upcoming') {
      queryObj.nextFollowUp = { $gte: tomorrow };
    }
    delete queryObj.followUpDue;
  }

  let query = Lead.find(queryObj)
    .populate('assignedTo', 'name employeeId phone')
    .populate('assignedBy', 'name employeeId')
    .populate('branchId', 'branchName branchCode city');

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({
    success: true,
    count: data.length,
    pagination,
    data,
  });
});

// @desc    Get single Lead
// @route   GET /api/leads/:id
// @access  Private
exports.getLead = catchAsync(async (req, res, next) => {
  const lead = await Lead.findById(req.params.id)
    .populate('assignedTo', 'name employeeId phone')
    .populate('assignedBy', 'name employeeId')
    .populate('branchId', 'branchName branchCode city address');

  if (!lead) {
    return next(new AppError('No lead found with that ID', 404));
  }

  // Role validation
  if (req.user.role === 'technician' || req.user.role === 'sales') {
    if (lead.assignedTo?._id?.toString() !== req.user._id.toString()) {
      return next(new AppError('Permission Denied - You can only view your assigned leads', 403));
    }
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const leadBranchId = lead.branchId?._id?.toString() || lead.branchId?.toString();
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (leadBranchId !== userBranchId) {
      return next(new AppError('Permission Denied', 403));
    }
  }

  res.status(200).json({
    success: true,
    data: lead,
  });
});

// @desc    Update Lead (only notes, requirement, nextFollowUp allowed - core details locked)
// @route   PUT /api/leads/:id
// @access  Private
exports.updateLead = catchAsync(async (req, res, next) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return next(new AppError('No lead found with that ID', 404));

  // Branch admin can only update leads in their branch
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const leadBranchId = lead.branchId?._id?.toString() || lead.branchId?.toString();
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
    if (leadBranchId !== userBranchId) return next(new AppError('Permission Denied', 403));
  } else if (req.user.role === 'sales' || req.user.role === 'technician') {
    if (lead.assignedTo?.toString() !== req.user._id.toString()) {
      return next(new AppError('You can only update your assigned leads', 403));
    }
  }

  // Core lead details are LOCKED after creation - only these fields allowed
  const allowedUpdates = ['notes', 'requirement', 'nextFollowUp'];
  const updates = {};
  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No editable fields provided. Only notes, requirement and nextFollowUp can be updated.', 400));
  }

  const updatedLead = await Lead.findByIdAndUpdate(req.params.id, updates, {
    returnDocument: 'after', runValidators: true,
  }).populate('assignedTo', 'name employeeId').populate('branchId', 'branchName');

  res.status(200).json({ success: true, data: updatedLead });
});

// @desc    Assign Lead to User/Branch
// @route   POST /api/leads/:id/assign
// @access  Private (super_admin, branch_admin, sales)
exports.assignLead = catchAsync(async (req, res, next) => {
  const { assignedTo, branchId } = req.body;

  const lead = await Lead.findById(req.params.id);
  if (!lead) return next(new AppError('No lead found with that ID', 404));

  if (req.user.role === 'super_admin') {
    // Super admin: any branch, any user
    if (branchId) lead.branchId = branchId;
    if (assignedTo) {
      const user = await User.findById(assignedTo);
      if (!user) return next(new AppError('User not found', 404));
      lead.assignedTo = assignedTo;
    }
  } else if (req.user.role === 'branch_admin') {
    // Branch admin: only within their branch
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
    const leadBranchId = lead.branchId?._id?.toString() || lead.branchId?.toString();
    if (leadBranchId !== userBranchId) return next(new AppError('You can only assign leads within your branch', 403));
    if (!assignedTo) return next(new AppError('assignedTo is required', 400));
    const user = await User.findById(assignedTo).select('branchId');
    if (!user) return next(new AppError('User not found', 404));
    const empBranchId = user.branchId?._id?.toString() || user.branchId?.toString();
    if (empBranchId !== userBranchId) return next(new AppError('Can only assign to employees in your branch', 400));
    lead.assignedTo = assignedTo;
  } else if (req.user.role === 'sales') {
    // Sales: can assign to any user in any branch (they are lead hunters)
    if (!assignedTo) return next(new AppError('assignedTo is required', 400));
    const user = await User.findById(assignedTo).select('_id name');
    if (!user) return next(new AppError('User not found', 404));
    // If branchId provided, update branch too
    if (branchId) lead.branchId = branchId;
    lead.assignedTo = assignedTo;
  } else {
    return next(new AppError('You do not have permission to assign leads', 403));
  }

  lead.assignedBy = req.user._id;
  lead.assignedAt = new Date();
  await lead.save();

  const populated = await Lead.findById(lead._id)
    .populate('assignedTo', 'name employeeId phone role')
    .populate('assignedBy', 'name')
    .populate('branchId', 'branchName branchCode');

  res.status(200).json({ success: true, message: 'Lead assigned successfully', data: populated });
});

// @desc    Update Lead Status
// @route   PATCH /api/leads/:id/status
// @access  Private
exports.updateLeadStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['NEW', 'CONTACTED', 'VISIT_DONE', 'DEMO_SCHEDULED', 'QUALIFIED', 'CONVERTED', 'LOST', 'JUNK'];

  if (!validStatuses.includes(status)) return next(new AppError('Invalid status', 400));

  const lead = await Lead.findById(req.params.id);
  if (!lead) return next(new AppError('No lead found with that ID', 404));

  // Permission check
  if (req.user.role !== 'super_admin') {
    if (req.user.role === 'branch_admin' || req.user.role === 'office') {
      const leadBranchId = lead.branchId?._id?.toString() || lead.branchId?.toString();
      const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
      if (leadBranchId !== userBranchId) return next(new AppError('Permission Denied', 403));
    } else if (req.user.role === 'sales' || req.user.role === 'technician') {
      if (lead.assignedTo?.toString() !== req.user._id.toString()) {
        return next(new AppError('You can only update your assigned leads', 403));
      }
    }
  }

  lead.status = status;
  lead.lastContactedAt = new Date();
  if (status === 'CONVERTED') lead.convertedAt = new Date();
  await lead.save();

  res.status(200).json({ success: true, data: lead });
});

// @desc    Add Follow-up
// @route   POST /api/leads/:id/followup
// @access  Private
exports.addFollowUp = catchAsync(async (req, res, next) => {
  const { notes, outcome, nextFollowUp } = req.body;

  const lead = await Lead.findById(req.params.id);
  if (!lead) return next(new AppError('No lead found with that ID', 404));

  // Permission: super_admin → any lead | branch_admin/office → branch leads | sales/technician → assigned leads
  if (req.user.role !== 'super_admin') {
    if (req.user.role === 'branch_admin' || req.user.role === 'office') {
      const leadBranchId = lead.branchId?._id?.toString() || lead.branchId?.toString();
      const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
      if (leadBranchId !== userBranchId) return next(new AppError('Permission Denied', 403));
    } else if (req.user.role === 'sales' || req.user.role === 'technician') {
      if (lead.assignedTo?.toString() !== req.user._id.toString()) {
        return next(new AppError('You can only add follow-ups to your assigned leads', 403));
      }
    } else {
      return next(new AppError('Permission Denied', 403));
    }
  }

  lead.followups.push({
    date: new Date(),
    notes: notes || '',
    outcome: outcome || null,
    nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
    createdBy: req.user._id
  });

  if (nextFollowUp) {
    lead.nextFollowUp = new Date(nextFollowUp);
  }

  lead.lastContactedAt = new Date();

  // Calculate lead score based on engagement
  const score = calculateLeadScore(lead);
  lead.leadScore = score;

  await lead.save();

  const updatedLead = await Lead.findById(lead._id)
    .populate('assignedTo', 'name employeeId')
    .populate({ path: 'followups.createdBy', select: 'name' });

  res.status(200).json({
    success: true,
    message: 'Follow-up added',
    data: updatedLead,
  });
});

// @desc    Convert Lead to Service Form
// @route   POST /api/leads/:id/convert
// @access  Private
exports.convertLead = catchAsync(async (req, res, next) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return next(new AppError('No lead found with that ID', 404));
  }

  if (lead.status === 'CONVERTED') {
    return next(new AppError('Lead already converted', 400));
  }

  lead.status = 'CONVERTED';
  lead.convertedAt = new Date();
  lead.conversionDate = new Date();
  
  await lead.save();

  res.status(200).json({
    success: true,
    message: 'Lead converted to customer',
    data: lead,
  });
});

// @desc    Get Follow-ups (All leads with upcoming followups)
// @route   GET /api/leads/followups
// @access  Private
exports.getFollowUps = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Role Filtering
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (branchId) {
      queryObj.branchId = branchId;
    }
  } else if (req.user.role === 'technician' || req.user.role === 'sales') {
    queryObj.assignedTo = req.user._id;
  }

  // Default: show leads with upcoming followups
  if (!queryObj.filter) {
    queryObj.nextFollowUp = { $ne: null };
  }
  let query = Lead.find(queryObj)
    .select('name phone city status priority nextFollowUp branchId assignedTo serviceInterest budget')
    .populate('assignedTo', 'name employeeId')
    .populate('branchId', 'branchName branchCode');

  if (req.query.sort) {
    query = query.sort(req.query.sort.split(',').join(' '));
  } else {
    query = query.sort('nextFollowUp');
  }

  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({
    success: true,
    count: data.length,
    pagination,
    data,
  });
});

// @desc    Delete Lead
// @route   DELETE /api/leads/:id
// @access  Private (Super Admin ONLY)
exports.deleteLead = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return next(new AppError('Only Super Admin can delete leads', 403));
  }

  const lead = await Lead.findByIdAndDelete(req.params.id);
  if (!lead) return next(new AppError('No lead found with that ID', 404));

  res.status(200).json({ success: true, message: 'Lead deleted successfully' });
});

// @desc    Get Lead Stats
// @route   GET /api/leads/stats
// @access  Private (all roles)
exports.getLeadStats = catchAsync(async (req, res, next) => {
  let matchObj = {};

  if (req.user.role === 'super_admin') {
    matchObj = {}; // all leads
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString();
    if (branchId) matchObj.branchId = new mongoose.Types.ObjectId(branchId);
  } else if (req.user.role === 'sales' || req.user.role === 'technician') {
    matchObj.assignedTo = new mongoose.Types.ObjectId(req.user._id);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [statusStats, priorityStats, todayFollowups, overdueFollowups, totalLeads, newToday] = await Promise.all([
    Lead.aggregate([{ $match: matchObj }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: matchObj }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Lead.countDocuments({ ...matchObj, nextFollowUp: { $gte: today, $lt: tomorrow } }),
    Lead.countDocuments({ ...matchObj, nextFollowUp: { $lt: today } }),
    Lead.countDocuments(matchObj),
    Lead.countDocuments({ ...matchObj, createdAt: { $gte: today } }),
  ]);

  res.status(200).json({
    success: true,
    data: { statusStats, priorityStats, todayFollowups, overdueFollowups, totalLeads, newToday }
  });
});

// Helper function to calculate lead score
function calculateLeadScore(lead) {
  let score = 0;
  
  // Follow-up interactions
  score += lead.followups?.length * 10 || 0;
  
  // Status based
  const statusScores = {
    'NEW': 10,
    'CONTACTED': 20,
    'VISIT_DONE': 40,
    'DEMO_SCHEDULED': 50,
    'QUALIFIED': 70,
    'CONVERTED': 100
  };
  score += statusScores[lead.status] || 0;
  
  // Priority based
  const priorityScores = {
    'URGENT': 20,
    'HIGH': 15,
    'MEDIUM': 10,
    'LOW': 5
  };
  score += priorityScores[lead.priority] || 0;
  
  // Budget availability
  if (lead.budget) score += 10;
  if (lead.budgetRange) score += 5;
  
  return Math.min(score, 100);
}

module.exports = exports;
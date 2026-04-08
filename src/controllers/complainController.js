const Complain = require('../models/Complain');
const User = require('../models/User');
const Branch = require('../models/Branch');

const createComplain = async (req, res, next) => {
  try {
    const complain = new Complain({
      userId: req.user._id,
      branchId: req.user.branchId,
      orderNo: req.body.orderNo || '',
      receiptNo: req.body.receiptNo || '',
      employeeId: req.body.employeeId || '',
      customerName: req.body.customerName || '',
      customerPhone: req.body.customerPhone || '',
      complainType: req.body.complainType,
      description: req.body.description,
      priority: req.body.priority || 'MEDIUM'
    });

    await complain.save();

    res.status(201).json({
      success: true,
      message: 'Complain submitted successfully',
      data: complain
    });
  } catch (error) {
    next(error);
  }
};

const getMyComplains = async (req, res, next) => {
  try {
    const complains = await Complain.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      data: complains
    });
  } catch (error) {
    next(error);
  }
};

const getAllComplains = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can view all complains'
      });
    }

    const { status, priority, branchId } = req.query;
    
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    if (priority && priority !== 'all') {
      query.priority = priority;
    }
    if (branchId && branchId !== 'all') {
      query.assignedToBranch = branchId;
    }

    const complains = await Complain.find(query)
      .populate('userId', 'name phone')
      .populate('branchId', 'branchName branchCode')
      .populate('assignedTo', 'name phone')
      .populate('assignedToBranch', 'branchName branchCode')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      data: complains
    });
  } catch (error) {
    next(error);
  }
};

const assignComplain = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can assign complains'
      });
    }

    const { id } = req.params;
    const { assignedToBranch, notes } = req.body;

    const complain = await Complain.findById(id);

    if (!complain) {
      return res.status(404).json({
        success: false,
        message: 'Complain not found'
      });
    }

    complain.status = 'ASSIGNED';
    complain.assignedToBranch = assignedToBranch || null;
    complain.assignedBy = req.user._id;
    if (notes) {
      complain.resolution = notes;
    }

    await complain.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Complain assigned successfully',
      data: complain
    });
  } catch (error) {
    next(error);
  }
};

const getBranches = async (req, res, next) => {
  try {
    const branches = await Branch.find({ status: 'ACTIVE' })
      .select('branchName branchCode city')
      .sort({ branchName: 1 });

    res.status(200).json({
      success: true,
      data: branches
    });
  } catch (error) {
    next(error);
  }
};

const updateComplainStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;

    const complain = await Complain.findById(id);

    if (!complain) {
      return res.status(404).json({
        success: false,
        message: 'Complain not found'
      });
    }

    if (status === 'SOLVED') {
      complain.status = 'SOLVED';
      complain.resolution = resolution || '';
      complain.resolvedAt = new Date();
      complain.resolvedBy = req.user._id;
    } else if (status === 'IN_PROGRESS') {
      complain.status = 'IN_PROGRESS';
    }

    await complain.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Complain status updated',
      data: complain
    });
  } catch (error) {
    next(error);
  }
};

const getBranchUsers = async (req, res, next) => {
  try {
    const { branchId } = req.query;
    
    const query = { role: { $in: ['employee', 'branch_admin'] } };
    if (branchId) {
      query.branchId = branchId;
    }

    const users = await User.find(query)
      .select('name phone branchId')
      .populate('branchId', 'branchName');

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createComplain,
  getMyComplains,
  getAllComplains,
  assignComplain,
  getBranches,
  updateComplainStatus,
  getBranchUsers
};

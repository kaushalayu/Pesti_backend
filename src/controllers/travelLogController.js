const TravelLog = require('../models/TravelLog');
const ServiceForm = require('../models/ServiceForm');
const User = require('../models/User');
const EmployeeLedger = require('../models/EmployeeLedger');
const BranchLedger = require('../models/BranchLedger');

const RATE_PER_KM = 10;

const getTravelLogs = async (req, res, next) => {
  try {
    let query = { employeeId: req.user._id };
    
    // Admin can see all logs from their branch
    if (req.user.role === 'super_admin' || req.user.role === 'branch_admin') {
      query = req.user.role === 'super_admin' ? {} : { branchId: req.user.branchId };
    }
    
    const logs = await TravelLog.find(query)
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};

const getMyActiveLog = async (req, res, next) => {
  try {
    const activeLog = await TravelLog.findOne({
      employeeId: req.user._id,
      status: 'DRAFT'
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: activeLog
    });
  } catch (error) {
    next(error);
  }
};

const startTravel = async (req, res, next) => {
  try {
    const { purpose, purposeNotes, formId, fromLocation, toLocation, vehicleNo, startMeter, startMeterPhoto } = req.body;

    const existingDraft = await TravelLog.findOne({
      employeeId: req.user._id,
      status: 'DRAFT'
    });

    if (existingDraft) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active travel log. Complete or cancel it first.'
      });
    }

    const travelLog = new TravelLog({
      employeeId: req.user._id,
      branchId: req.user.branchId,
      purpose: purpose || 'OTHER',
      purposeNotes: purposeNotes || '',
      formId: formId || null,
      fromLocation: fromLocation || '',
      toLocation: toLocation || '',
      vehicleNo: vehicleNo || '',
      startMeter: parseFloat(startMeter) || 0,
      startMeterPhoto: startMeterPhoto || null,
      startTime: new Date(),
      status: 'DRAFT',
      ratePerKm: RATE_PER_KM
    });

    await travelLog.save();

    res.status(201).json({
      success: true,
      message: 'Travel started successfully',
      data: travelLog
    });
  } catch (error) {
    next(error);
  }
};

const updateTravel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { purpose, purposeNotes, formId, fromLocation, toLocation, vehicleNo, startMeter, startMeterPhoto } = req.body;

    const travelLog = await TravelLog.findOne({
      _id: id,
      employeeId: req.user._id,
      status: 'DRAFT'
    });

    if (!travelLog) {
      return res.status(404).json({
        success: false,
        message: 'Active travel log not found'
      });
    }

    if (startMeter !== undefined) travelLog.startMeter = parseFloat(startMeter) || 0;
    if (startMeterPhoto !== undefined) travelLog.startMeterPhoto = startMeterPhoto;
    if (purpose !== undefined) travelLog.purpose = purpose;
    if (purposeNotes !== undefined) travelLog.purposeNotes = purposeNotes;
    if (formId !== undefined) travelLog.formId = formId;
    if (fromLocation !== undefined) travelLog.fromLocation = fromLocation;
    if (toLocation !== undefined) travelLog.toLocation = toLocation;
    if (vehicleNo !== undefined) travelLog.vehicleNo = vehicleNo;

    await travelLog.save();

    res.status(200).json({
      success: true,
      message: 'Travel log updated',
      data: travelLog
    });
  } catch (error) {
    next(error);
  }
};

const endTravel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { endMeter, endMeterPhoto, endTime } = req.body;

    const travelLog = await TravelLog.findOne({
      _id: id,
      employeeId: req.user._id,
      status: 'DRAFT'
    });

    if (!travelLog) {
      return res.status(404).json({
        success: false,
        message: 'Active travel log not found'
      });
    }

    const endMeterVal = parseFloat(endMeter) || 0;
    const distance = Math.max(0, endMeterVal - travelLog.startMeter);
    const allowance = distance * RATE_PER_KM;

    travelLog.endMeter = endMeterVal;
    travelLog.endMeterPhoto = endMeterPhoto || null;
    travelLog.endTime = endTime ? new Date(endTime) : new Date();
    travelLog.distance = distance;
    travelLog.allowance = allowance;
    travelLog.status = 'COMPLETED';

    await travelLog.save();

    res.status(200).json({
      success: true,
      message: 'Travel completed successfully',
      data: travelLog
    });
  } catch (error) {
    next(error);
  }
};

const cancelTravel = async (req, res, next) => {
  try {
    const { id } = req.params;

    const travelLog = await TravelLog.findOne({
      _id: id,
      employeeId: req.user._id,
      status: 'DRAFT'
    });

    if (!travelLog) {
      return res.status(404).json({
        success: false,
        message: 'Active travel log not found'
      });
    }

    await TravelLog.deleteOne({ _id: id });

    res.status(200).json({
      success: true,
      message: 'Travel log cancelled'
    });
  } catch (error) {
    next(error);
  }
};

const getPendingForAdmin = async (req, res, next) => {
  try {
    let query = { status: 'COMPLETED' };

    if (req.user.role === 'super_admin') {
      query.branchAdminStatus = 'APPROVED';
      query.superAdminStatus = 'PENDING';
    } else if (req.user.role === 'branch_admin') {
      const users = await User.find({ branchId: req.user.branchId }).select('_id');
      const userIds = users.map(u => u._id);
      query.employeeId = { $in: userIds };
      query.branchAdminStatus = 'PENDING';
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const logs = await TravelLog.find(query)
      .populate('employeeId', 'name phone branchId')
      .populate('branchId', 'branchName branchCode')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};

const getAllTravelLogs = async (req, res, next) => {
  try {
    let query = { status: 'COMPLETED' };

    if (req.user.role === 'super_admin') {
    } else if (req.user.role === 'branch_admin') {
      const users = await User.find({ branchId: req.user.branchId }).select('_id');
      const userIds = users.map(u => u._id);
      query.employeeId = { $in: userIds };
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const logs = await TravelLog.find(query)
      .populate('employeeId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(100);

    const totalDistance = logs.reduce((sum, log) => sum + (log.distance || 0), 0);
    const totalAllowance = logs.reduce((sum, log) => sum + (log.allowance || 0), 0);

    res.status(200).json({
      success: true,
      data: logs,
      totalDistance,
      totalAllowance
    });
  } catch (error) {
    next(error);
  }
};

const approveByBranchAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const travelLog = await TravelLog.findOne({
      _id: id,
      status: 'COMPLETED',
      branchAdminStatus: 'PENDING'
    }).populate('employeeId');

    if (!travelLog) {
      return res.status(404).json({
        success: false,
        message: 'Travel log not found or branch approval already done'
      });
    }

    if (req.user.role !== 'branch_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only branch admin can approve at branch level'
      });
    }

    // Verify branch admin is approving their own branch
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    const travelBranchId = travelLog.branchId?.toString();
    if (req.user.role === 'branch_admin' && travelBranchId !== userBranchId) {
      return res.status(403).json({
        success: false,
        message: 'You can only approve travel logs of your branch'
      });
    }

    travelLog.branchAdminStatus = status;
    travelLog.branchAdminId = req.user._id;
    travelLog.branchAdminRemark = remark || '';

    await travelLog.save();

    res.status(200).json({
      success: true,
      message: status === 'APPROVED' ? 'Branch approved. Sent to HQ for final approval.' : 'Rejected by branch',
      data: travelLog
    });
  } catch (error) {
    next(error);
  }
};

const approveBySuperAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Super Admin can approve any travel log that has been branch approved
    const travelLog = await TravelLog.findOne({
      _id: id,
      status: 'COMPLETED',
      branchAdminStatus: 'APPROVED',
      superAdminStatus: 'PENDING'
    }).populate('employeeId');

    if (!travelLog) {
      return res.status(404).json({
        success: false,
        message: 'Travel log not found or branch approval pending'
      });
    }

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can give final approval'
      });
    }

    travelLog.superAdminStatus = status;
    travelLog.superAdminId = req.user._id;
    travelLog.superAdminRemark = remark || '';

    await travelLog.save();

    res.status(200).json({
      success: true,
      message: status === 'APPROVED' ? 'HQ approved. Employee can now accept settlement.' : 'Rejected by HQ',
      data: travelLog
    });
  } catch (error) {
    console.error('Super admin approve error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const employeeAccept = async (req, res, next) => {
  try {
    const { id } = req.params;

    const travelLog = await TravelLog.findOne({
      _id: id,
      employeeId: req.user._id,
      status: 'COMPLETED',
      branchAdminStatus: 'APPROVED',
      superAdminStatus: 'APPROVED',
      employeeStatus: 'PENDING'
    });

    if (!travelLog) {
      return res.status(404).json({
        success: false,
        message: 'Travel log not found or not approved by admin'
      });
    }

    travelLog.employeeStatus = 'ACCEPTED';
    travelLog.settledAt = new Date();

    await travelLog.save();

    // Create ledger entries for travel allowance settlement
    const branchId = travelLog.branchId || req.user.branchId;
    
    // Credit to Employee Ledger
    const empBalance = await EmployeeLedger.getUserBalance(req.user._id);
    await EmployeeLedger.create({
      userId: req.user._id,
      branchId: branchId,
      type: 'CREDIT',
      category: 'TRAVEL_ALLOWANCE',
      amount: travelLog.allowance,
      balanceAfter: empBalance.balance + travelLog.allowance,
      relatedId: travelLog._id,
      relatedModel: 'TravelLog',
      description: `Travel allowance settled: ${travelLog.distance}km @ ₹${travelLog.ratePerKm}/km (${travelLog.purpose})`,
      performedBy: req.user._id,
      date: new Date()
    });

    // Debit from Branch Ledger
    const branchBalance = await BranchLedger.getBranchBalance(branchId);
    await BranchLedger.create({
      branchId: branchId,
      type: 'DEBIT',
      category: 'TRAVEL_ALLOWANCE_PAID',
      amount: travelLog.allowance,
      balanceAfter: branchBalance.balance - travelLog.allowance,
      relatedId: travelLog._id,
      relatedModel: 'TravelLog',
      employeeId: req.user._id,
      description: `Travel allowance paid to ${req.user.name}: ${travelLog.distance}km`,
      performedBy: req.user._id,
      date: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Travel allowance accepted and settled',
      data: travelLog
    });
  } catch (error) {
    console.error('Error in employeeAccept:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getLinkedForms = async (req, res, next) => {
  try {
    const forms = await ServiceForm.find({
      employeeId: req.user._id,
      status: { $in: ['SCHEDULED', 'COMPLETED'] }
    })
    .populate('customer', 'name phone address')
    .select('orderNo customer')
    .sort({ createdAt: -1 })
    .limit(20);

    res.status(200).json({
      success: true,
      data: forms
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTravelLogs,
  getMyActiveLog,
  startTravel,
  updateTravel,
  endTravel,
  cancelTravel,
  getPendingForAdmin,
  getAllTravelLogs,
  approveByBranchAdmin,
  approveBySuperAdmin,
  employeeAccept,
  getLinkedForms
};

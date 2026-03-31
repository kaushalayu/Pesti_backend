const mongoose = require('mongoose');
const TaskAssignment = require('../models/TaskAssignment');
const ServiceForm = require('../models/ServiceForm');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

const getUnassignedBookings = catchAsync(async (req, res) => {
  const { branchId, date, startDate, endDate } = req.query;
  
  let query = { status: { $in: ['SUBMITTED', 'SCHEDULED'] } };
  
  if (branchId) query.branchId = branchId;
  
  if (startDate && endDate) {
    query['schedule.date'] = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query['schedule.date'] = { $gte: searchDate, $lt: nextDay };
  }
  
  const bookings = await ServiceForm.find(query)
    .populate('customerId', 'name phone address')
    .populate('employeeId', 'name')
    .populate('branchId', 'branchName city')
    .sort({ 'schedule.date': 1 });
  
  const assignedFormIds = await TaskAssignment.find({ status: { $ne: 'DECLINED' } }).distinct('serviceFormId');
  const unassignedBookings = bookings.filter(b => !assignedFormIds.includes(b._id));
  
  res.status(200).json({
    success: true,
    data: unassignedBookings
  });
});

const getAllBookingsWithAssignments = catchAsync(async (req, res) => {
  const { branchId, date, startDate, endDate, status } = req.query;
  
  let query = {};
  
  if (branchId) query.branchId = new mongoose.Types.ObjectId(branchId);
  
  if (startDate && endDate) {
    query['schedule.date'] = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query['schedule.date'] = { $gte: searchDate, $lt: nextDay };
  }
  
  if (status) {
    if (status === 'UNASSIGNED') {
      const assignedFormIds = await TaskAssignment.find({ status: { $ne: 'DECLINED' } }).distinct('serviceFormId');
      query._id = { $nin: assignedFormIds };
    } else {
      query.status = status;
    }
  }
  
  const bookings = await ServiceForm.find(query)
    .populate('customerId', 'name phone address')
    .populate('employeeId', 'name')
    .populate('branchId', 'branchName city')
    .sort({ 'schedule.date': 1 });
  
  const assignments = await TaskAssignment.find()
    .populate('assignedTo', 'name employeeId phone')
    .populate('assignedBy', 'name');
  
  const bookingMap = {};
  bookings.forEach(b => {
    bookingMap[b._id.toString()] = {
      ...b.toObject(),
      assignments: assignments.filter(a => a.serviceFormId.toString() === b._id.toString())
    };
  });
  
  const result = Object.values(bookingMap);
  
  res.status(200).json({
    success: true,
    count: result.length,
    data: result
  });
});

const getEmployeeWorkload = catchAsync(async (req, res) => {
  const { branchId, date, startDate, endDate } = req.query;
  
  let dateFilter = {};
  if (startDate && endDate) {
    dateFilter = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    dateFilter = { $gte: searchDate, $lt: nextDay };
  }
  
  const employeeQuery = { role: { $in: ['technician', 'sales'] }, isActive: true };
  if (branchId) employeeQuery.branchId = branchId;
  
  const employees = await User.find(employeeQuery).select('name employeeId branchId');
  
  const taskQuery = { 
    status: { $in: ['ASSIGNED', 'ACCEPTED', 'PENDING'] },
    scheduledDate: date ? { $gte: new Date(date), $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)) } : undefined
  };
  
  const tasks = await TaskAssignment.find(taskQuery);
  
  const workloadMap = {};
  employees.forEach(emp => {
    const empTasks = tasks.filter(t => t.assignedTo.toString() === emp._id.toString());
    workloadMap[emp._id.toString()] = {
      employee: emp,
      totalTasks: empTasks.length,
      pending: empTasks.filter(t => t.status === 'PENDING').length,
      assigned: empTasks.filter(t => t.status === 'ASSIGNED').length,
      accepted: empTasks.filter(t => t.status === 'ACCEPTED').length
    };
  });
  
  const result = Object.values(workloadMap);
  
  res.status(200).json({
    success: true,
    data: result
  });
});

const getAvailableEmployees = catchAsync(async (req, res) => {
  const { branchId, date } = req.query;
  
  if (!date) {
    return res.status(400).json({
      success: false,
      message: 'Date is required'
    });
  }
  
  const searchDate = new Date(date);
  const nextDay = new Date(searchDate);
  nextDay.setDate(nextDay.getDate() + 1);
  
  const employeeQuery = { role: { $in: ['technician', 'sales'] }, isActive: true };
  if (branchId) employeeQuery.branchId = branchId;
  
  const employees = await User.find(employeeQuery)
    .select('name employeeId phone branchId')
    .populate('branchId', 'branchName city');
  
  const existingTasks = await TaskAssignment.find({
    scheduledDate: { $gte: searchDate, $lt: nextDay },
    status: { $in: ['ASSIGNED', 'ACCEPTED'] }
  });
  
  const busyEmployeeIds = existingTasks.map(t => t.assignedTo.toString());
  
  const result = employees.map(emp => ({
    ...emp.toObject(),
    isAvailable: !busyEmployeeIds.includes(emp._id.toString()),
    currentTasks: existingTasks.filter(t => t.assignedTo.toString() === emp._id.toString()).length
  }));
  
  res.status(200).json({
    success: true,
    data: result
  });
});

const assignTask = catchAsync(async (req, res) => {
  const { serviceFormId, assignedTo, scheduledDate, notes } = req.body;
  
  const booking = await ServiceForm.findById(serviceFormId);
  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }
  
  const employee = await User.findById(assignedTo);
  if (!employee) {
    return next(new AppError('Employee not found', 404));
  }
  
  const existingAssignment = await TaskAssignment.findOne({
    serviceFormId,
    status: { $in: ['ASSIGNED', 'ACCEPTED', 'PENDING'] }
  });
  
  if (existingAssignment) {
    return next(new AppError('This booking is already assigned to an employee', 400));
  }
  
  const task = await TaskAssignment.create({
    serviceFormId,
    assignedTo,
    assignedBy: req.user.id,
    branchId: booking.branchId,
    scheduledDate: scheduledDate || booking.schedule?.date,
    notes,
    status: 'ASSIGNED'
  });
  
  await task.populate([
    { path: 'assignedTo', select: 'name employeeId phone' },
    { path: 'assignedBy', select: 'name' },
    { path: 'branchId', select: 'branchName city' }
  ]);
  
  res.status(201).json({
    success: true,
    message: 'Task assigned successfully. Employee will be notified.',
    data: task
  });
});

const acceptTask = catchAsync(async (req, res) => {
  const task = await TaskAssignment.findById(req.params.id);
  
  if (!task) {
    return next(new AppError('Task not found', 404));
  }
  
  if (task.assignedTo.toString() !== req.user.id) {
    return next(new AppError('This task is not assigned to you', 403));
  }
  
  if (task.status !== 'ASSIGNED') {
    return next(new AppError('This task cannot be accepted', 400));
  }
  
  task.status = 'ACCEPTED';
  task.acceptedAt = new Date();
  await task.save();
  
  await task.populate([
    { path: 'serviceFormId' },
    { path: 'assignedTo', select: 'name employeeId phone' },
    { path: 'assignedBy', select: 'name' }
  ]);
  
  res.status(200).json({
    success: true,
    message: 'Task accepted successfully',
    data: task
  });
});

const declineTask = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const task = await TaskAssignment.findById(req.params.id);
  
  if (!task) {
    return next(new AppError('Task not found', 404));
  }
  
  if (task.assignedTo.toString() !== req.user.id) {
    return next(new AppError('This task is not assigned to you', 403));
  }
  
  if (!['ASSIGNED', 'PENDING'].includes(task.status)) {
    return next(new AppError('This task cannot be declined', 400));
  }
  
  task.status = 'DECLINED';
  task.declinedAt = new Date();
  task.declineReason = reason;
  await task.save();
  
  res.status(200).json({
    success: true,
    message: 'Task declined. Admin will be notified.',
    data: task
  });
});

const completeTask = catchAsync(async (req, res) => {
  const task = await TaskAssignment.findById(req.params.id);
  
  if (!task) {
    return next(new AppError('Task not found', 404));
  }
  
  if (task.assignedTo.toString() !== req.user.id) {
    return next(new AppError('This task is not assigned to you', 403));
  }
  
  if (task.status !== 'ACCEPTED') {
    return next(new AppError('Task must be accepted before completing', 400));
  }
  
  task.status = 'COMPLETED';
  task.completedAt = new Date();
  await task.save();
  
  res.status(200).json({
    success: true,
    message: 'Task completed successfully',
    data: task
  });
});

const getMyTasks = catchAsync(async (req, res) => {
  const { status, date, startDate, endDate } = req.query;
  
  let query = { assignedTo: req.user.id };
  
  if (status) {
    query.status = status;
  }
  
  if (startDate && endDate) {
    query.scheduledDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query.scheduledDate = { $gte: searchDate, $lt: nextDay };
  }
  
  const tasks = await TaskAssignment.find(query)
    .populate({
      path: 'serviceFormId',
      populate: [
        { path: 'customerId', select: 'name phone address' },
        { path: 'branchId', select: 'branchName city' }
      ]
    })
    .populate('assignedBy', 'name')
    .sort({ scheduledDate: 1 });
  
  res.status(200).json({
    success: true,
    count: tasks.length,
    data: tasks
  });
});

const getTaskHistory = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  let query = { 
    assignedTo: req.user.id,
    status: { $in: ['COMPLETED', 'DECLINED'] }
  };
  
  if (startDate && endDate) {
    query.scheduledDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  
  const tasks = await TaskAssignment.find(query)
    .populate({
      path: 'serviceFormId',
      populate: [
        { path: 'customerId', select: 'name phone address' },
        { path: 'branchId', select: 'branchName city' }
      ]
    })
    .populate('assignedBy', 'name')
    .sort({ completedAt: -1 });
  
  res.status(200).json({
    success: true,
    count: tasks.length,
    data: tasks
  });
});

const getAllAssignments = catchAsync(async (req, res) => {
  const { branchId, date, startDate, endDate, status } = req.query;
  
  let query = {};
  
  if (req.user.role === 'branch_admin') {
    query.branchId = req.user.branchId;
  } else if (branchId) {
    query.branchId = new mongoose.Types.ObjectId(branchId);
  }
  
  if (status) query.status = status;
  
  if (startDate && endDate) {
    query.scheduledDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query.scheduledDate = { $gte: searchDate, $lt: nextDay };
  }
  
  const assignments = await TaskAssignment.find(query)
    .populate({
      path: 'serviceFormId',
      populate: [
        { path: 'customerId', select: 'name phone address city' },
        { path: 'branchId', select: 'branchName city' }
      ]
    })
    .populate('assignedTo', 'name employeeId phone')
    .populate('assignedBy', 'name')
    .sort({ scheduledDate: 1 });
  
  res.status(200).json({
    success: true,
    count: assignments.length,
    data: assignments
  });
});

const reAssignTask = catchAsync(async (req, res) => {
  const { assignedTo, scheduledDate, notes } = req.body;
  
  const task = await TaskAssignment.findById(req.params.id);
  
  if (!task) {
    return next(new AppError('Task not found', 404));
  }
  
  if (task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS') {
    return next(new AppError('Cannot re-assign an active task', 400));
  }
  
  const oldTaskId = task._id;
  
  const newTask = await TaskAssignment.create({
    serviceFormId: task.serviceFormId,
    assignedTo,
    assignedBy: req.user.id,
    branchId: task.branchId,
    scheduledDate: scheduledDate || task.scheduledDate,
    notes,
    status: 'ASSIGNED'
  });
  
  task.status = 'REASSIGNED';
  task.replacedBy = newTask._id;
  await task.save();
  
  await newTask.populate([
    { path: 'assignedTo', select: 'name employeeId phone' },
    { path: 'assignedBy', select: 'name' }
  ]);
  
  res.status(201).json({
    success: true,
    message: 'Task re-assigned successfully',
    data: newTask
  });
});

const cancelAssignment = catchAsync(async (req, res) => {
  const task = await TaskAssignment.findById(req.params.id);
  
  if (!task) {
    return next(new AppError('Task not found', 404));
  }
  
  if (task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS' || task.status === 'COMPLETED') {
    return next(new AppError('Cannot cancel an active or completed task', 400));
  }
  
  task.status = 'CANCELLED';
  await task.save();
  
  res.status(200).json({
    success: true,
    message: 'Assignment cancelled',
    data: task
  });
});

const getTasksByDate = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  let dateFilter = {};
  if (startDate && endDate) {
    dateFilter = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateFilter = { $gte: today, $lt: tomorrow };
  }
  
  let query = { scheduledDate: dateFilter };
  
  if (req.user.role === 'branch_admin') {
    query.branchId = req.user.branchId;
  }
  
  const tasks = await TaskAssignment.find(query)
    .populate({
      path: 'serviceFormId',
      populate: [
        { path: 'customerId', select: 'name phone address city' },
        { path: 'branchId', select: 'branchName city' }
      ]
    })
    .populate('assignedTo', 'name employeeId phone')
    .populate('assignedBy', 'name')
    .sort({ scheduledDate: 1 });
  
  const groupedByDate = {};
  tasks.forEach(task => {
    const dateKey = new Date(task.scheduledDate).toISOString().split('T')[0];
    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = [];
    }
    groupedByDate[dateKey].push(task);
  });
  
  res.status(200).json({
    success: true,
    data: {
      tasks,
      groupedByDate
    }
  });
});

module.exports = {
  getUnassignedBookings,
  getAllBookingsWithAssignments,
  getEmployeeWorkload,
  getAvailableEmployees,
  assignTask,
  acceptTask,
  declineTask,
  completeTask,
  getMyTasks,
  getTaskHistory,
  getAllAssignments,
  reAssignTask,
  cancelAssignment,
  getTasksByDate
};

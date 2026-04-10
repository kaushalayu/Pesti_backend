const mongoose = require("mongoose");
const TaskAssignment = require("../models/TaskAssignment");
const ServiceForm = require("../models/ServiceForm");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { createNotification } = require("./notificationController");
const cache = require("../utils/cache");

const getUnassignedBookings = catchAsync(async (req, res, next) => {
  const { branchId, date, startDate, endDate } = req.query;

  // ONLY show truly unassigned tasks (assignedTo: null means no one is assigned yet)
  let taskQuery = {
    assignedTo: null,
  };

  if (req.user.role === "branch_admin") {
    const userBranchId = req.user.branchId?._id || req.user.branchId;
    if (userBranchId) {
      try {
        taskQuery.branchId = new mongoose.Types.ObjectId(userBranchId);
      } catch (e) {
        taskQuery.branchId = userBranchId;
      }
    }
  } else if (branchId) {
    try {
      taskQuery.branchId = new mongoose.Types.ObjectId(branchId);
    } catch (e) {
      taskQuery.branchId = branchId;
    }
  }

  if (startDate && endDate) {
    taskQuery.scheduledDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    taskQuery.scheduledDate = { $gte: searchDate, $lt: nextDay };
  }

  const tasks = await TaskAssignment.find(taskQuery)
    .populate({
      path: "serviceFormId",
      populate: [
        { path: "customerId", select: "name phone address" },
        { path: "branchId", select: "branchName city" },
      ],
    })
    .populate("assignedBy", "name")
    .sort({ scheduledDate: 1 });

  res.status(200).json({
    success: true,
    data: tasks,
  });
});

const getAllBookingsWithAssignments = catchAsync(async (req, res, next) => {
  const { branchId, date, startDate, endDate, status } = req.query;

  let query = {};

  if (req.user.role === "branch_admin") {
    const userBranchId = req.user.branchId?._id || req.user.branchId;
    if (userBranchId) {
      try {
        query.branchId = new mongoose.Types.ObjectId(userBranchId);
      } catch (e) {
        query.branchId = userBranchId;
      }
    }
  } else if (branchId) {
    try {
      query.branchId = new mongoose.Types.ObjectId(branchId);
    } catch (e) {
      query.branchId = branchId;
    }
  }

  if (startDate && endDate) {
    query["schedule.date"] = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query["schedule.date"] = { $gte: searchDate, $lt: nextDay };
  }

  if (status) {
    if (status === "UNASSIGNED") {
      const assignedFormIds = await TaskAssignment.find({
        status: { $ne: "DECLINED" },
      }).distinct("serviceFormId");
      query._id = {
        $nin: assignedFormIds.map((id) => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch (e) {
            return id;
          }
        }),
      };
    }
  }

  const bookings = await ServiceForm.find(query)
    .populate("customerId", "name phone address")
    .populate("employeeId", "name")
    .populate("branchId", "branchName city")
    .sort({ "schedule.date": 1 });

  const assignments = await TaskAssignment.find()
    .populate("assignedTo", "name employeeId phone")
    .populate("assignedBy", "name");

  const bookingMap = {};
  bookings.forEach((b) => {
    bookingMap[b._id.toString()] = {
      ...b.toObject(),
      assignments: assignments.filter(
        (a) => a.serviceFormId.toString() === b._id.toString(),
      ),
    };
  });

  const result = Object.values(bookingMap);

  res.status(200).json({
    success: true,
    count: result.length,
    data: result,
  });
});

const getEmployeeWorkload = catchAsync(async (req, res, next) => {
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

  const employeeQuery = {
    role: { $in: ["technician", "sales"] },
    isActive: true,
  };
  if (branchId) {
    try {
      employeeQuery.branchId = new mongoose.Types.ObjectId(branchId);
    } catch (e) {
      employeeQuery.branchId = branchId;
    }
  }

  const employees = await User.find(employeeQuery).select(
    "name employeeId branchId",
  );

  const taskQuery = {
    status: { $in: ["ASSIGNED", "ACCEPTED", "PENDING"] },
  };

  if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    taskQuery.scheduledDate = { $gte: searchDate, $lt: nextDay };
  }

  const tasks = await TaskAssignment.find(taskQuery);

  const workloadMap = {};
  employees.forEach((emp) => {
    const empTasks = tasks.filter(
      (t) => t.assignedTo && t.assignedTo.toString() === emp._id.toString(),
    );
    workloadMap[emp._id.toString()] = {
      employee: emp,
      totalTasks: empTasks.length,
      pending: empTasks.filter((t) => t.status === "PENDING").length,
      assigned: empTasks.filter((t) => t.status === "ASSIGNED").length,
      accepted: empTasks.filter((t) => t.status === "ACCEPTED").length,
    };
  });

  const result = Object.values(workloadMap);

  res.status(200).json({
    success: true,
    data: result,
  });
});

const getAvailableEmployees = catchAsync(async (req, res, next) => {
  const { branchId, date } = req.query;

  if (!date) {
    return res.status(400).json({
      success: false,
      message: "Date is required",
    });
  }

  const searchDate = new Date(date);
  const nextDay = new Date(searchDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const employeeQuery = {
    role: { $in: ["technician", "sales"] },
    isActive: true,
  };
  
  // Super admin can see all employees, others see only their branch
  const isSuperAdmin = req.user.role === 'super_admin';
  if (branchId && !isSuperAdmin) {
    try {
      employeeQuery.branchId = new mongoose.Types.ObjectId(branchId);
    } catch (e) {
      employeeQuery.branchId = branchId;
    }
  }

  const employees = await User.find(employeeQuery)
    .select("name employeeId phone branchId")
    .populate("branchId", "branchName city");

  const existingTasks = await TaskAssignment.find({
    scheduledDate: { $gte: searchDate, $lt: nextDay },
    status: { $in: ["ASSIGNED", "ACCEPTED"] },
  });

  const busyEmployeeIds = existingTasks
    .map((t) => (t.assignedTo ? t.assignedTo.toString() : null))
    .filter(Boolean);

  const result = employees.map((emp) => ({
    ...emp.toObject(),
    isAvailable: !busyEmployeeIds.includes(emp._id.toString()),
    currentTasks: existingTasks.filter(
      (t) => t.assignedTo && t.assignedTo.toString() === emp._id.toString(),
    ).length,
  }));

  res.status(200).json({
    success: true,
    data: result,
  });
});

const assignTask = catchAsync(async (req, res, next) => {
  // Only admin roles can assign tasks
  if (req.user.role !== 'super_admin' && req.user.role !== 'branch_admin' && req.user.role !== 'office') {
    return next(new AppError("Only admins can assign tasks", 403));
  }

  const { serviceFormId, assignedTo, scheduledDate, notes } = req.body;

  if (!serviceFormId) {
    return next(new AppError("Service form ID is required", 400));
  }

  if (!assignedTo) {
    return next(new AppError("Employee is required", 400));
  }

  if (!scheduledDate) {
    return next(new AppError("Schedule date is required", 400));
  }

  // Validate serviceFormId format
  if (!mongoose.Types.ObjectId.isValid(serviceFormId)) {
    return next(new AppError("Invalid Service Form ID format", 400));
  }

  // Validate assignedTo format
  if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
    return next(new AppError("Invalid Employee ID format", 400));
  }

  const booking = await ServiceForm.findById(serviceFormId).populate(
    "customerId",
    "name",
  );
  if (!booking) {
    return next(new AppError("Booking not found", 404));
  }

  const employee = await User.findById(assignedTo);
  if (!employee) {
    return next(new AppError("Employee not found", 404));
  }

  // Parse and validate the schedule date
  let finalScheduledDate;
  try {
    const dateStr = scheduledDate || booking.schedule?.date;
    if (!dateStr) {
      return next(new AppError("Schedule date is missing in booking", 400));
    }
    // Convert to proper Date object
    finalScheduledDate = new Date(dateStr);
    if (isNaN(finalScheduledDate.getTime())) {
      return next(new AppError("Invalid schedule date format", 400));
    }
  } catch (error) {
    return next(
      new AppError("Could not parse schedule date: " + error.message, 400),
    );
  }

  // Check if there's an ACTIVE assignment with assignedTo already set
  // This prevents assigning to another person until the current one responds
  const existingAssignmentWithEmployee = await TaskAssignment.findOne({
    serviceFormId,
    assignedTo: { $ne: null },
    status: { $in: ["PENDING", "ASSIGNED", "ACCEPTED"] },
  });

  if (existingAssignmentWithEmployee) {
    const assignedEmployee = await User.findById(existingAssignmentWithEmployee.assignedTo).select('name');
    const employeeName = assignedEmployee?.name || 'Unknown';
    
    return next(
      new AppError(`This booking is already assigned to ${employeeName} and is ${existingAssignmentWithEmployee.status}. Cannot assign to another person until they accept or decline.`, 400),
    );
  }

  // Also check if there's a PENDING task without assignedTo - this means it's awaiting first assignment
  // Allow this to proceed (will update the existing task with assignedTo)
  const existingUnassignedTask = await TaskAssignment.findOne({
    serviceFormId,
    assignedTo: null,
    status: "PENDING"
  });

  // Find existing unassigned TaskAssignment (if any) and update it, or create new one
  let task = await TaskAssignment.findOne({
    serviceFormId,
    assignedTo: null,
  });

  if (task) {
    // Update existing unassigned task
    task.assignedTo = assignedTo;
    task.assignedBy = req.user._id;
    task.scheduledDate = finalScheduledDate;
    task.notes = notes;
    task.status = "PENDING";
    task.assignedAt = new Date();
    try {
      await task.save();
    } catch (saveError) {
      return next(new AppError("Failed to save task assignment", 500));
    }
  } else {
    // Create new task
    try {
      task = await TaskAssignment.create({
        serviceFormId,
        assignedTo,
        assignedBy: req.user._id,
        branchId: booking.branchId,
        scheduledDate: finalScheduledDate,
        notes,
        status: "PENDING",
        assignedAt: new Date(),
      });
    } catch (createError) {
      return next(new AppError("Failed to create task assignment", 500));
    }
  }

  await task.populate([
    { path: "assignedTo", select: "name employeeId phone" },
    { path: "assignedBy", select: "name" },
    { path: "branchId", select: "branchName city" },
  ]);

  await createNotification({
    userId: assignedTo,
    type: "TASK_ASSIGNED",
    title: "New Task Request",
    message: `You have a new task request: ${booking.serviceType} for ${booking.customerId?.name || "Customer"}. Please accept or decline.`,
    relatedId: task._id,
    relatedType: "TASK",
    data: { taskId: task._id, formId: serviceFormId, status: "PENDING" },
  });

  cache.del("dashboard");
  cache.delPattern("cache:task-assignments:*");
  cache.delPattern("cache:my-tasks:*");

  res.status(201).json({
    success: true,
    message: "Task assigned successfully. Employee will be notified.",
    data: task,
  });
});

const acceptTask = catchAsync(async (req, res, next) => {
  const task = await TaskAssignment.findById(req.params.id);

  if (!task) {
    return next(new AppError("Task not found", 404));
  }

  // Allow if task is assigned to the user
  const isAssignedToUser =
    task.assignedTo && task.assignedTo.toString() === req.user._id.toString();

  // Allow if user is branch_admin and task is in their branch
  const isBranchAdminForTask =
    req.user.role === "branch_admin" &&
    task.branchId &&
    task.branchId.toString() ===
      (req.user.branchId?._id || req.user.branchId).toString();

  if (!isAssignedToUser && !isBranchAdminForTask) {
    return next(
      new AppError("You do not have permission to accept this task", 403),
    );
  }

  if (task.status !== "PENDING") {
    return next(new AppError("This task cannot be accepted", 400));
  }

  // If task is not assigned, assign it to the accepting user
  if (!task.assignedTo) {
    task.assignedTo = req.user._id;
  }

  task.status = "ASSIGNED";
  task.acceptedAt = new Date();
  await task.save();

  await task.populate([
    { path: "serviceFormId", populate: { path: "customerId", select: "name" } },
    { path: "assignedTo", select: "name employeeId phone" },
    { path: "assignedBy", select: "name" },
  ]);

  await createNotification({
    userId: task.assignedBy,
    type: "TASK_ACCEPTED",
    title: "Task Accepted",
    message: `${task.assignedTo.name} has accepted the task for ${task.serviceFormId?.customerId?.name || "Customer"}`,
    relatedId: task._id,
    relatedType: "TASK",
    data: {
      taskId: task._id,
      formId: task.serviceFormId._id,
      status: "ASSIGNED",
    },
  });

  cache.del("dashboard");
  cache.delPattern("cache:task-assignments:*");
  cache.delPattern("cache:my-tasks:*");

  res.status(200).json({
    success: true,
    message: "Task accepted successfully",
    data: task,
  });
});

const declineTask = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const task = await TaskAssignment.findById(req.params.id);

  if (!task) {
    return next(new AppError("Task not found", 404));
  }

  if (task.assignedTo.toString() !== req.user._id) {
    return next(new AppError("This task is not assigned to you", 403));
  }

  if (!["ASSIGNED", "PENDING"].includes(task.status)) {
    return next(new AppError("This task cannot be declined", 400));
  }

  task.status = "DECLINED";
  task.declinedAt = new Date();
  task.declineReason = reason;
  await task.save();

  await task.populate([
    { path: "serviceFormId", populate: { path: "customerId", select: "name" } },
    { path: "assignedTo", select: "name" },
    { path: "assignedBy", select: "name" },
  ]);

  await createNotification({
    userId: task.assignedBy,
    type: "TASK_DECLINED",
    title: "Task Declined",
    message: `${task.assignedTo.name} has declined the task for ${task.serviceFormId?.customerId?.name || "Customer"}. Reason: ${reason || "Not provided"}`,
    relatedId: task._id,
    relatedType: "TASK",
    data: { taskId: task._id, status: "DECLINED", reason },
  });

  cache.del("dashboard");
  cache.delPattern("cache:task-assignments:*");
  cache.delPattern("cache:my-tasks:*");

  res.status(200).json({
    success: true,
    message: "Task declined. Admin will be notified.",
    data: task,
  });
});

const completeTask = catchAsync(async (req, res, next) => {
  const task = await TaskAssignment.findById(req.params.id);

  if (!task) {
    return next(new AppError("Task not found", 404));
  }

  // Allow if task is assigned to the user
  const isAssignedToUser =
    task.assignedTo && task.assignedTo.toString() === req.user._id.toString();

  // Allow if user is branch_admin and task is in their branch
  const isBranchAdminForTask =
    req.user.role === "branch_admin" &&
    task.branchId &&
    task.branchId.toString() ===
      (req.user.branchId?._id || req.user.branchId).toString();

  if (!isAssignedToUser && !isBranchAdminForTask) {
    return next(
      new AppError("You do not have permission to complete this task", 403),
    );
  }

  if (task.status !== "ASSIGNED") {
    return next(
      new AppError("Task must be accepted/assigned before completing", 400),
    );
  }

  task.status = "COMPLETED";
  task.completedAt = new Date();
  await task.save();

  // Update ServiceForm status to COMPLETED
  const ServiceForm = require("../models/ServiceForm");
  await ServiceForm.findByIdAndUpdate(task.serviceFormId, {
    status: "COMPLETED",
    $push: {
      statusHistory: {
        status: "COMPLETED",
        changedBy: req.user._id,
        changedAt: new Date(),
        notes: "Task completed by technician",
      },
    },
  });

  await task.populate([
    { path: "serviceFormId", populate: { path: "customerId", select: "name" } },
    { path: "assignedTo", select: "name" },
    { path: "assignedBy", select: "name" },
  ]);

  // Notify the user who assigned the task
  await createNotification({
    userId: task.assignedBy,
    type: "TASK_COMPLETED",
    title: "Task Completed",
    message: `${task.assignedTo.name} has completed the task for ${task.serviceFormId?.customerId?.name || "Customer"}`,
    relatedId: task._id,
    relatedType: "TASK",
    data: {
      taskId: task._id,
      formId: task.serviceFormId._id,
      status: "COMPLETED",
    },
  });

  // Notify branch admin
  const User = require("../models/User");
  const branchAdmins = await User.find({
    branchId: task.branchId,
    role: "branch_admin",
    isActive: true,
  });
  for (const admin of branchAdmins) {
    await createNotification({
      userId: admin._id,
      type: "TASK_COMPLETED",
      title: "Task Completed - Awaiting Review",
      message: `Technician ${task.assignedTo.name} has completed task for ${task.serviceFormId?.customerId?.name || "Customer"}. Please review and mark as done.`,
      relatedId: task._id,
      relatedType: "TASK",
      data: {
        taskId: task._id,
        formId: task.serviceFormId,
        status: "COMPLETED",
      },
    });
  }

  cache.del("dashboard");
  cache.delPattern("cache:task-assignments:*");
  cache.delPattern("cache:my-tasks:*");
  cache.delPattern("cache:forms:*");
  cache.del("unassigned-bookings");

  res.status(200).json({
    success: true,
    message: "Task completed successfully",
    data: task,
  });
});

const getMyTasks = catchAsync(async (req, res, next) => {
  const { status, date, startDate, endDate } = req.query;

  let query = {};

  if (req.user.role === "branch_admin") {
    // Branch admins see all tasks in their branch
    const userBranchId = req.user.branchId?._id || req.user.branchId;
    if (userBranchId) {
      try {
        query.branchId = new mongoose.Types.ObjectId(userBranchId);
      } catch (e) {
        query.branchId = userBranchId;
      }
    }
  } else {
    // Regular users see only tasks assigned to them
    query.assignedTo = req.user._id;
  }

  if (status) {
    if (status.includes(",")) {
      query.status = { $in: status.split(",") };
    } else {
      query.status = status;
    }
  }

  if (startDate && endDate) {
    query.scheduledDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query.scheduledDate = { $gte: searchDate, $lt: nextDay };
  }

  try {
    const tasks = await TaskAssignment.find(query)
      .populate({
        path: "serviceFormId",
        options: { strictPopulate: false },
        populate: [
          { path: "customerId", select: "name phone address" },
          { path: "branchId", select: "branchName city" },
        ],
      })
      .populate("assignedBy", "name")
      .sort({ scheduledDate: 1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    console.error("Error in getMyTasks:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching tasks",
    });
  }
});

const getTaskHistory = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  let query = {
    assignedTo: req.user._id,
    status: { $in: ["COMPLETED", "DECLINED"] },
  };

  if (startDate && endDate) {
    query.scheduledDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const tasks = await TaskAssignment.find(query)
    .populate({
      path: "serviceFormId",
      options: { strictPopulate: false },
      populate: [
        { path: "customerId", select: "name phone address" },
        { path: "branchId", select: "branchName city" },
      ],
    })
    .populate("assignedBy", "name")
    .sort({ completedAt: -1 });

  res.status(200).json({
    success: true,
    count: tasks.length,
    data: tasks,
  });
});

const getAllAssignments = catchAsync(async (req, res, next) => {
  const { branchId, date, startDate, endDate, status } = req.query;

  let query = {};

  if (req.user.role === "branch_admin") {
    const userBranchId = req.user.branchId?._id || req.user.branchId;
    if (userBranchId) {
      try {
        query.branchId = new mongoose.Types.ObjectId(userBranchId);
      } catch (e) {
        query.branchId = userBranchId;
      }
    }
  } else if (branchId) {
    try {
      query.branchId = new mongoose.Types.ObjectId(branchId);
    } catch (e) {
      query.branchId = branchId;
    }
  }

  if (status) {
    if (status.includes(",")) {
      query.status = { $in: status.split(",") };
    } else {
      query.status = status;
    }
  }

  if (startDate && endDate) {
    query.scheduledDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else if (date) {
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    query.scheduledDate = { $gte: searchDate, $lt: nextDay };
  }

  try {
    const assignments = await TaskAssignment.find(query)
      .populate({
        path: "serviceFormId",
        options: { strictPopulate: false },
        populate: [
          { path: "customerId", select: "name phone address city" },
          { path: "branchId", select: "branchName city" },
        ],
      })
      .populate("assignedTo", "name employeeId phone")
      .populate("assignedBy", "name")
      .sort({ scheduledDate: 1 });

    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    console.error("Error in getAllAssignments:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching assignments",
    });
  }
});

const reAssignTask = catchAsync(async (req, res, next) => {
  const { assignedTo, scheduledDate, notes } = req.body;

  const task = await TaskAssignment.findById(req.params.id);

  if (!task) {
    return next(new AppError("Task not found", 404));
  }

  if (task.status === "ACCEPTED" || task.status === "IN_PROGRESS") {
    return next(new AppError("Cannot re-assign an active task", 400));
  }

  const oldTaskId = task._id;

  const newTask = await TaskAssignment.create({
    serviceFormId: task.serviceFormId,
    assignedTo,
    assignedBy: req.user._id,
    branchId: task.branchId,
    scheduledDate: scheduledDate || task.scheduledDate,
    notes,
    status: "ASSIGNED",
    assignedAt: new Date(),
  });

  task.status = "REASSIGNED";
  task.replacedBy = newTask._id;
  await task.save();

  await newTask.populate([
    { path: "assignedTo", select: "name employeeId phone" },
    { path: "assignedBy", select: "name" },
  ]);

  res.status(201).json({
    success: true,
    message: "Task re-assigned successfully",
    data: newTask,
  });
});

const cancelAssignment = catchAsync(async (req, res, next) => {
  const task = await TaskAssignment.findById(req.params.id);

  if (!task) {
    return next(new AppError("Task not found", 404));
  }

  if (
    task.status === "ACCEPTED" ||
    task.status === "IN_PROGRESS" ||
    task.status === "COMPLETED"
  ) {
    return next(new AppError("Cannot cancel an active or completed task", 400));
  }

  const previousAssignee = task.assignedTo;
  task.status = "CANCELLED";
  await task.save();

  if (previousAssignee) {
    await createNotification({
      userId: previousAssignee,
      type: "TASK_CANCELLED",
      title: "Task Cancelled",
      message: "Your assigned task has been cancelled by admin",
      relatedId: task._id,
      relatedType: "TASK",
      data: { taskId: task._id, status: "CANCELLED" },
    });
  }

  cache.del("dashboard");
  cache.delPattern("cache:task-assignments:*");
  cache.delPattern("cache:my-tasks:*");

  res.status(200).json({
    success: true,
    message: "Assignment cancelled",
    data: task,
  });
});

const getTasksByDate = catchAsync(async (req, res, next) => {
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

  if (req.user.role === "branch_admin") {
    query.branchId = req.user.branchId;
  }

  const tasks = await TaskAssignment.find(query)
    .populate({
      path: "serviceFormId",
      options: { strictPopulate: false },
      populate: [
        { path: "customerId", select: "name phone address city" },
        { path: "branchId", select: "branchName city" },
      ],
    })
    .populate("assignedTo", "name employeeId phone")
    .populate("assignedBy", "name")
    .sort({ scheduledDate: 1 });

  const groupedByDate = {};
  tasks.forEach((task) => {
    const dateKey = new Date(task.scheduledDate).toISOString().split("T")[0];
    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = [];
    }
    groupedByDate[dateKey].push(task);
  });

  res.status(200).json({
    success: true,
    data: {
      tasks,
      groupedByDate,
    },
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
  getTasksByDate,
};

const Inventory = require("../models/Inventory");
const InventoryTransaction = require("../models/InventoryTransaction");
const Distribution = require("../models/Distribution");
const Chemical = require("../models/Chemical");
const ServiceForm = require("../models/ServiceForm");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");

// @desc    Get employee's current inventory (stock they have)
// @route   GET /api/employee-inventory/my-inventory
// @access  Employee
exports.getMyInventory = catchAsync(async (req, res, next) => {
  // Get all distributions to this employee that are not fully returned
  const distributions = await Distribution.find({
    employeeId: req.user._id,
    status: { $in: ["DISTRIBUTED", "PARTIALLY_RETURNED"] },
  }).populate("branchId", "branchName");

  // Calculate current stock per chemical
  const inventoryMap = {};

  for (const dist of distributions) {
    for (const item of dist.items) {
      const chemId = item.chemicalId.toString();
      if (!inventoryMap[chemId]) {
        inventoryMap[chemId] = {
          chemicalId: item.chemicalId,
          chemicalName: item.chemicalName,
          category: item.category,
          unit: item.unit,
          totalReceived: 0,
          totalReturned: 0,
          currentStock: 0,
          rate: item.rate,
          branch: dist.branchId?.branchName,
        };
      }
      inventoryMap[chemId].totalReceived += item.quantity;
      inventoryMap[chemId].totalReturned += item.returnedQty || 0;
      inventoryMap[chemId].currentStock +=
        item.quantity - (item.returnedQty || 0);
    }
  }

  const inventory = Object.values(inventoryMap).filter(
    (item) => item.currentStock > 0,
  );

  res.status(200).json({
    success: true,
    data: inventory,
  });
});

// @desc    Employee uses stock for a job
// @route   POST /api/employee-inventory/use
// @access  Employee
exports.useStock = catchAsync(async (req, res, next) => {
  const { chemicalId, quantity, unit, jobId, jobName, notes } = req.body;

  if (!chemicalId || !quantity) {
    return next(new AppError("Chemical and quantity required", 400));
  }

  // Find the distribution with this chemical for this employee
  const distribution = await Distribution.findOne({
    employeeId: req.user._id,
    "items.chemicalId": chemicalId,
    status: { $in: ["DISTRIBUTED", "PARTIALLY_RETURNED"] },
  });

  if (!distribution) {
    return next(new AppError("No stock available for this chemical", 400));
  }

  const itemIndex = distribution.items.findIndex(
    (i) => i.chemicalId.toString() === chemicalId,
  );
  const item = distribution.items[itemIndex];

  const usedQty = parseFloat(quantity);
  const availableQty = item.quantity - (item.returnedQty || 0);

  if (usedQty > availableQty) {
    return next(
      new AppError(`Only ${availableQty} ${item.unit} available`, 400),
    );
  }

  // Update used qty
  item.usedQty = (item.usedQty || 0) + usedQty;
  await distribution.save();

  // Create transaction record
  await InventoryTransaction.create({
    txnType: "USE_BY_EMPLOYEE",
    chemicalId,
    fromId: req.user._id,
    fromType: "Employee",
    toId: jobId || null,
    toType: jobId ? "Job" : null,
    quantity: usedQty,
    unit: unit || item.unit,
    unitPrice: item.rate,
    totalValue: Math.round(usedQty * item.rate * 100) / 100,
    type: "USE",
    notes: notes || `Used for job: ${jobName || "General"}`,
    performedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "Stock usage recorded",
    data: { usedQty, remaining: availableQty - usedQty },
  });
});

// @desc    Employee returns unused stock
// @route   POST /api/employee-inventory/return
// @access  Employee
exports.returnStock = catchAsync(async (req, res, next) => {
  const { chemicalId, quantity, unit, notes, returnTo = "Branch" } = req.body;

  if (!chemicalId || !quantity) {
    return next(new AppError("Chemical and quantity required", 400));
  }

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) {
    return next(new AppError("Chemical not found", 404));
  }

  // Find distribution
  const distribution = await Distribution.findOne({
    employeeId: req.user._id,
    "items.chemicalId": chemicalId,
    status: { $in: ["DISTRIBUTED", "PARTIALLY_RETURNED"] },
  });

  if (!distribution) {
    return next(new AppError("No stock found", 404));
  }

  const itemIndex = distribution.items.findIndex(
    (i) => i.chemicalId.toString() === chemicalId,
  );
  const item = distribution.items[itemIndex];

  const returnQty = parseFloat(quantity);
  const availableQty =
    item.quantity - (item.returnedQty || 0) - (item.usedQty || 0);

  if (returnQty > availableQty) {
    return next(
      new AppError(`Only ${availableQty} ${item.unit} can be returned`, 400),
    );
  }

  // Update returned qty
  item.returnedQty = (item.returnedQty || 0) + returnQty;

  // Check if fully returned
  if ((item.returnedQty || 0) >= item.quantity) {
    distribution.status = "FULLY_RETURNED";
  } else if ((item.returnedQty || 0) > 0) {
    distribution.status = "PARTIALLY_RETURNED";
  }

  await distribution.save();

  let returnDestination = { toType: "Branch", toId: distribution.branchId };
  if (returnTo === "HQ" || returnTo === "super_admin") {
    returnDestination = { toType: "super_admin", toId: null };
    chemical.mainStock += returnQty;
    await chemical.save();
  } else {
    let branchInv = await Inventory.findOne({
      chemicalId,
      ownerId: distribution.branchId,
      ownerType: "Branch",
    });

    if (branchInv) {
      branchInv.quantity += returnQty;
      branchInv.totalValue =
        Math.round(branchInv.quantity * branchInv.transferRate * 100) / 100;
      await branchInv.save();
    }
  }

  // Create return transaction
  await InventoryTransaction.create({
    txnType: "RETURN_FROM_EMPLOYEE",
    chemicalId,
    fromId: req.user._id,
    fromType: "Employee",
    toId: returnDestination.toId,
    toType: returnDestination.toType,
    quantity: returnQty,
    unit: unit || item.unit,
    unitPrice: item.rate,
    totalValue: Math.round(returnQty * item.rate * 100) / 100,
    type: "RETURN",
    notes:
      notes ||
      `Employee returned unused stock to ${returnDestination.toType === "super_admin" ? "HQ" : "Branch"}`,
    performedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "Stock returned successfully",
    data: { returnedQty: returnQty },
  });
});

// @desc    Get employee's usage history
// @route   GET /api/employee-inventory/usage-history
// @access  Employee
exports.getMyUsageHistory = catchAsync(async (req, res, next) => {
  const transactions = await InventoryTransaction.find({
    fromId: req.user._id,
    fromType: "Employee",
    txnType: { $in: ["USE_BY_EMPLOYEE", "RETURN_FROM_EMPLOYEE"] },
  })
    .populate("chemicalId", "name category")
    .sort("-createdAt")
    .limit(50);

  res.status(200).json({
    success: true,
    data: transactions,
  });
});

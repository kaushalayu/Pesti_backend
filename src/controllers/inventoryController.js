const Chemical = require("../models/Chemical");
const Inventory = require("../models/Inventory");
const InventoryTransaction = require("../models/InventoryTransaction");
const Branch = require("../models/Branch");
const User = require("../models/User");
const Payment = require("../models/Payment");
const ServiceForm = require("../models/ServiceForm");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

const convertToBaseUnit = (quantity, unit, chemicalUnit) => {
  const qty = parseFloat(quantity) || 0;
  if ((unit === "ML" || unit === "ml") && chemicalUnit === "L") {
    return qty / 1000;
  }
  if ((unit === "G" || unit === "g") && chemicalUnit === "KG") {
    return qty / 1000;
  }
  return qty;
};

const convertFromBaseUnit = (qty, targetUnit, chemicalUnit) => {
  const quantity = parseFloat(qty) || 0;
  if ((targetUnit === "ML" || targetUnit === "ml") && chemicalUnit === "L") {
    return quantity * 1000;
  }
  if ((targetUnit === "G" || targetUnit === "g") && chemicalUnit === "KG") {
    return quantity * 1000;
  }
  return quantity;
};

const displayUnit = (unit, chemicalUnit) => {
  if ((unit === "ML" || unit === "ml") && chemicalUnit === "L") return "ML";
  if ((unit === "G" || unit === "g") && chemicalUnit === "KG") return "G";
  return unit || chemicalUnit;
};

exports.getChemicals = catchAsync(async (req, res, next) => {
  const chemicals = await Chemical.find().sort("-updatedAt");
  res.status(200).json({ success: true, data: chemicals });
});

exports.addChemical = catchAsync(async (req, res, next) => {
  const {
    name,
    sku,
    category,
    unit,
    unitSystem,
    description,
    mainStock,
    purchasePrice,
    minStockLevel,
    manufacturer,
    supplier,
  } = req.body;

  const chemical = await Chemical.create({
    name,
    sku,
    category,
    unit,
    unitSystem: unitSystem || "L",
    description,
    mainStock: parseFloat(mainStock) || 0,
    purchasePrice: parseFloat(purchasePrice) || 0,
    minStockLevel: parseFloat(minStockLevel) || 10,
    manufacturer,
    supplier,
  });

  res.status(201).json({ success: true, data: chemical });
});

exports.updateChemical = catchAsync(async (req, res, next) => {
  const {
    name,
    sku,
    category,
    unit,
    unitSystem,
    description,
    purchasePrice,
    minStockLevel,
    manufacturer,
    supplier,
  } = req.body;

  const chemical = await Chemical.findById(req.params.id);
  if (!chemical) return next(new AppError("Chemical not found", 404));

  if (name) chemical.name = name;
  if (sku) chemical.sku = sku;
  if (category) chemical.category = category;
  if (unit) chemical.unit = unit;
  if (unitSystem) chemical.unitSystem = unitSystem;
  if (description) chemical.description = description;
  if (purchasePrice !== undefined)
    chemical.purchasePrice = parseFloat(purchasePrice);
  if (minStockLevel !== undefined)
    chemical.minStockLevel = parseFloat(minStockLevel);
  if (manufacturer) chemical.manufacturer = manufacturer;
  if (supplier) chemical.supplier = supplier;

  await chemical.save();

  res.status(200).json({ success: true, data: chemical });
});

exports.deleteChemical = catchAsync(async (req, res, next) => {
  const chemical = await Chemical.findById(req.params.id);
  if (!chemical) return next(new AppError("Chemical not found", 404));

  const inventoryItems = await Inventory.find({ chemicalId: req.params.id });
  if (inventoryItems.length > 0) {
    return next(
      new AppError("Cannot delete chemical that is in active inventory", 400),
    );
  }

  await Chemical.findByIdAndDelete(req.params.id);

  res
    .status(200)
    .json({ success: true, message: "Chemical deleted successfully" });
});

exports.addStock = catchAsync(async (req, res, next) => {
  const { chemicalId, quantity, unit, notes } = req.body;

  const qty = parseFloat(quantity) || 0;
  if (qty <= 0)
    return next(new AppError("Quantity must be greater than 0", 400));

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) return next(new AppError("Chemical not found", 404));

  const baseQuantity = convertToBaseUnit(
    qty,
    unit || chemical.unitSystem,
    chemical.unitSystem,
  );

  chemical.mainStock += baseQuantity;
  await chemical.save();

  await InventoryTransaction.create({
    txnType: "STOCK_ADDED",
    chemicalId,
    fromType: "super_admin",
    fromId: null,
    toType: "super_admin",
    toId: null,
    quantity: baseQuantity,
    unit: chemical.unitSystem,
    purchaseRate: chemical.purchasePrice || 0,
    transferRate: chemical.purchasePrice
      ? Math.round(chemical.purchasePrice * 1.1 * 100) / 100
      : 0,
    unitPrice: chemical.purchasePrice || 0,
    totalValue: 0,
    type: "STOCK_ADDED",
    notes: notes || `Direct stock added: ${qty} ${chemical.unitSystem}`,
    performedBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: `Added ${qty} ${chemical.unitSystem} to ${chemical.name}`,
    data: chemical,
  });
});

exports.purchaseStock = catchAsync(async (req, res, next) => {
  const {
    chemicalId,
    quantity,
    purchaseRate,
    purchaseDate,
    supplierName,
    supplierContact,
    invoiceNo,
    invoicePhotoUrl,
    notes,
  } = req.body;

  const qty = parseFloat(quantity) || 0;
  if (qty <= 0)
    return next(new AppError("Quantity must be greater than 0", 400));

  const rate = parseFloat(purchaseRate) || 0;
  if (rate <= 0)
    return next(new AppError("Purchase rate must be greater than 0", 400));

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) return next(new AppError("Chemical not found", 404));

  const baseQuantity = convertToBaseUnit(
    qty,
    req.body.unit || chemical.unitSystem,
    chemical.unitSystem,
  );
  const totalValue = Math.round(baseQuantity * rate * 100) / 100;

  chemical.mainStock += baseQuantity;
  chemical.lastPurchaseDate = purchaseDate
    ? new Date(purchaseDate)
    : new Date();
  chemical.lastPurchaseRate = rate;
  if (rate !== chemical.purchasePrice) {
    chemical.purchasePrice = rate;
  }
  await chemical.save();

  await InventoryTransaction.create({
    txnType: "PURCHASE",
    chemicalId,
    fromType: "supplier",
    fromId: null,
    toType: "super_admin",
    toId: null,
    quantity: baseQuantity,
    unit: chemical.unitSystem,
    purchaseRate: rate,
    transferRate: Math.round(rate * 1.1 * 100) / 100,
    unitPrice: rate,
    totalValue,
    type: "PURCHASE",
    invoicePhotoUrl,
    invoiceNo,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
    supplierName,
    supplierContact,
    notes:
      notes ||
      `Purchased ${qty} ${chemical.unitSystem} from ${supplierName || "Supplier"}`,
    performedBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: `Purchased ${qty} ${chemical.unitSystem} of ${chemical.name}`,
    data: chemical,
  });
});

exports.transferToBranch = catchAsync(async (req, res, next) => {
  const { chemicalId, branchId, quantity, unit, notes } = req.body;

  if (req.user.role !== "super_admin") {
    return next(new AppError("Only Super Admin can transfer to branches", 403));
  }

  const qty = parseFloat(quantity) || 0;
  if (qty <= 0)
    return next(new AppError("Quantity must be greater than 0", 400));

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) return next(new AppError("Chemical not found", 404));

  const branch = await Branch.findById(branchId);
  if (!branch) return next(new AppError("Branch not found", 404));

  const baseQuantity = convertToBaseUnit(
    qty,
    unit || chemical.unitSystem,
    chemical.unitSystem,
  );

  if (chemical.mainStock < baseQuantity) {
    return next(
      new AppError(
        `Insufficient stock. Available: ${convertFromBaseUnit(chemical.mainStock, unit || chemical.unitSystem, chemical.unitSystem)} ${displayUnit(unit || chemical.unitSystem, chemical.unitSystem)}`,
        400,
      ),
    );
  }

  const transferRate =
    chemical.branchPrice ||
    Math.round(chemical.purchasePrice * 1.1 * 100) / 100;
  const totalValue = Math.round(baseQuantity * transferRate * 100) / 100;

  chemical.mainStock -= baseQuantity;
  await chemical.save();

  let branchInv = await Inventory.findOne({
    chemicalId,
    ownerId: branchId,
    ownerType: "Branch",
  });
  if (branchInv) {
    branchInv.quantity += baseQuantity;
    branchInv.transferRate = transferRate;
    branchInv.totalValue =
      Math.round(branchInv.quantity * transferRate * 100) / 100;
    branchInv.originalQuantity += baseQuantity;
    await branchInv.save();
  } else {
    branchInv = await Inventory.create({
      chemicalId,
      ownerId: branchId,
      ownerType: "Branch",
      quantity: baseQuantity,
      unit: chemical.unitSystem,
      transferRate,
      unitPrice: transferRate,
      totalValue,
      originalQuantity: baseQuantity,
      purchaseRate: chemical.purchasePrice,
    });
  }

  branch.totalReceivedValue += totalValue;
  branch.pendingBalance += totalValue;
  await branch.save();

  await InventoryTransaction.create({
    txnType: "TRANSFER_TO_BRANCH",
    chemicalId,
    fromId: req.user._id,
    fromType: "super_admin",
    toId: branchId,
    toType: "Branch",
    quantity: baseQuantity,
    unit: chemical.unitSystem,
    purchaseRate: chemical.purchasePrice,
    transferRate,
    unitPrice: transferRate,
    totalValue,
    type: "TRANSFER",
    notes: notes || `Transferred to ${branch.branchName}`,
    performedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: `Transferred ${qty} ${chemical.unitSystem} to ${branch.branchName}`,
    data: { branchName: branch.branchName, quantity: qty, rate: transferRate },
  });
});

exports.transferToEmployee = catchAsync(async (req, res, next) => {
  const { chemicalId, employeeId, quantity, unit, notes } = req.body;

  if (
    req.user.role !== "branch_admin" &&
    req.user.role !== "office" &&
    req.user.role !== "super_admin"
  ) {
    return next(
      new AppError("Only Branch Admin can transfer to employees", 403),
    );
  }

  const qty = parseFloat(quantity) || 0;
  if (qty <= 0)
    return next(new AppError("Quantity must be greater than 0", 400));

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) return next(new AppError("Chemical not found", 404));

  const employee = await User.findById(employeeId);
  if (!employee) return next(new AppError("Employee not found", 404));

  let branchId;
  if (req.user.role === "super_admin") {
    branchId = req.body.branchId;
  } else {
    branchId =
      typeof req.user.branchId === "object"
        ? req.user.branchId._id
        : req.user.branchId;
  }

  const baseQuantity = convertToBaseUnit(
    qty,
    unit || chemical.unitSystem,
    chemical.unitSystem,
  );

  let sourceInv;
  if (req.user.role === "super_admin") {
    sourceInv = { quantity: chemical.mainStock };
  } else {
    sourceInv = await Inventory.findOne({
      chemicalId,
      ownerId: branchId,
      ownerType: "Branch",
    });
  }

  if (!sourceInv || sourceInv.quantity < baseQuantity) {
    return next(
      new AppError(
        `Insufficient stock. Available: ${convertFromBaseUnit(sourceInv ? sourceInv.quantity : 0, unit || chemical.unitSystem, chemical.unitSystem)} ${displayUnit(unit || chemical.unitSystem, chemical.unitSystem)}`,
        400,
      ),
    );
  }

  if (req.user.role !== "super_admin") {
    sourceInv.quantity -= baseQuantity;
    await sourceInv.save();
  } else {
    chemical.mainStock -= baseQuantity;
    await chemical.save();
  }

  let empInv = await Inventory.findOne({
    chemicalId,
    ownerId: employeeId,
    ownerType: "Employee",
  });
  if (empInv) {
    empInv.quantity += baseQuantity;
    empInv.totalValue =
      Math.round(empInv.quantity * empInv.transferRate * 100) / 100;
    empInv.originalQuantity += baseQuantity;
    await empInv.save();
  } else {
    const transferRate =
      chemical.branchPrice ||
      Math.round(chemical.purchasePrice * 1.1 * 100) / 100;
    empInv = await Inventory.create({
      chemicalId,
      ownerId: employeeId,
      ownerType: "Employee",
      quantity: baseQuantity,
      unit: chemical.unitSystem,
      transferRate,
      unitPrice: transferRate,
      totalValue: Math.round(baseQuantity * transferRate * 100) / 100,
      originalQuantity: baseQuantity,
      purchaseRate: chemical.purchasePrice,
    });
  }

  await InventoryTransaction.create({
    txnType: "TRANSFER_TO_EMPLOYEE",
    chemicalId,
    fromId: branchId,
    fromType: "Branch",
    toId: employeeId,
    toType: "Employee",
    quantity: baseQuantity,
    unit: chemical.unitSystem,
    purchaseRate: chemical.purchasePrice,
    transferRate: chemical.branchPrice,
    unitPrice: 0,
    totalValue: 0,
    type: "ASSIGNED",
    notes: notes || `Transferred to ${employee.name}`,
    performedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: `Transferred ${qty} ${chemical.unitSystem} to ${employee.name}`,
    data: { employeeName: employee.name, quantity: qty },
  });
});

exports.recordUsage = catchAsync(async (req, res, next) => {
  const {
    chemicalId,
    quantity,
    unit,
    jobId,
    jobName,
    notes,
    isReturned,
    returnTo,
  } = req.body;

  const qty = parseFloat(quantity) || 0;
  if (qty <= 0)
    return next(new AppError("Quantity must be greater than 0", 400));

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) return next(new AppError("Chemical not found", 404));

  const baseQuantity = convertToBaseUnit(
    qty,
    unit || chemical.unitSystem,
    chemical.unitSystem,
  );

  let empInv = await Inventory.findOne({
    chemicalId,
    ownerId: req.user._id,
    ownerType: "Employee",
  });
  if (!empInv || empInv.quantity < baseQuantity) {
    return next(
      new AppError(
        `Insufficient wallet balance. Available: ${convertFromBaseUnit(empInv ? empInv.quantity : 0, unit || chemical.unitSystem, chemical.unitSystem)} ${displayUnit(unit || chemical.unitSystem, chemical.unitSystem)}`,
        400,
      ),
    );
  }

  let linkedForm = null;
  if (jobId) {
    linkedForm = await ServiceForm.findById(jobId).select("_id");
  }

  if (isReturned) {
    empInv.quantity -= baseQuantity;
    empInv.returnedQuantity += baseQuantity;
    await empInv.save();

    let returnDestination;
    if (returnTo === "super_admin" || returnTo === "HQ") {
      returnDestination = { toType: "super_admin", toId: null };
      chemical.mainStock += baseQuantity;
      await chemical.save();
    } else {
      const branchId =
        typeof req.user.branchId === "object"
          ? req.user.branchId._id
          : req.user.branchId;
      returnDestination = { toType: "Branch", toId: branchId };

      let branchInv = await Inventory.findOne({
        chemicalId,
        ownerId: branchId,
        ownerType: "Branch",
      });
      if (branchInv) {
        branchInv.quantity += baseQuantity;
        await branchInv.save();
      } else {
        await Inventory.create({
          chemicalId,
          ownerId: branchId,
          ownerType: "Branch",
          quantity: baseQuantity,
          unit: chemical.unitSystem,
          transferRate: chemical.branchPrice,
          unitPrice: chemical.branchPrice,
          totalValue:
            Math.round(baseQuantity * chemical.branchPrice * 100) / 100,
          returnedQuantity: baseQuantity,
        });
      }
    }

    await InventoryTransaction.create({
      txnType: "RETURN",
      chemicalId,
      fromId: req.user._id,
      fromType: "Employee",
      toId: returnDestination.toId,
      toType: returnDestination.toType,
      quantity: baseQuantity,
      unit: chemical.unitSystem,
      purchaseRate: chemical.purchasePrice,
      transferRate: chemical.branchPrice,
      unitPrice: 0,
      totalValue: 0,
      type: "RETURNED",
      jobId,
      jobName,
      linkedFormId: linkedForm?._id,
      notes:
        notes ||
        `Returned ${qty} ${chemical.unitSystem} to ${returnTo === "super_admin" ? "HQ" : "Branch"}`,
      performedBy: req.user._id,
      returnedQuantity: baseQuantity,
    });

    res
      .status(200)
      .json({
        success: true,
        message: `Returned ${qty} ${chemical.unitSystem}`,
      });
  } else {
    empInv.quantity -= baseQuantity;
    empInv.usedQuantity += baseQuantity;
    await empInv.save();

    await InventoryTransaction.create({
      txnType: "USAGE",
      chemicalId,
      fromId: req.user._id,
      fromType: "Employee",
      toType: "Usage",
      toId: null,
      quantity: baseQuantity,
      unit: chemical.unitSystem,
      purchaseRate: chemical.purchasePrice,
      transferRate: chemical.branchPrice,
      unitPrice: 0,
      totalValue: 0,
      type: "USAGE",
      jobId,
      jobName,
      linkedFormId: linkedForm?._id,
      notes:
        notes || `Used ${qty} ${chemical.unitSystem} for ${jobName || "Job"}`,
      performedBy: req.user._id,
      returnedQuantity: 0,
    });

    res
      .status(200)
      .json({
        success: true,
        message: `Usage recorded: ${qty} ${chemical.unitSystem}`,
      });
  }
});

exports.getInventory = catchAsync(async (req, res, next) => {
  let matchStage = {};
  let usersInBranch = [];
  let userIds = [];

  if (req.user.role === "super_admin") {
    matchStage = {};
  } else if (req.user.role === "branch_admin" || req.user.role === "office") {
    usersInBranch = await User.find({ branchId: req.user.branchId }).select(
      "_id",
    );
    userIds = usersInBranch.map((u) => u._id);
    matchStage = {
      $or: [
        { ownerId: req.user.branchId, ownerType: "Branch" },
        { ownerId: { $in: userIds }, ownerType: "Employee" },
      ],
    };
  } else {
    matchStage = { ownerId: req.user._id, ownerType: "Employee" };
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 0;
  const skip = (page - 1) * limit;

  const aggregatePipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "chemicals",
        localField: "chemicalId",
        foreignField: "_id",
        as: "chemicalData",
      },
    },
    { $unwind: { path: "$chemicalId", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "branches",
        localField: "ownerId",
        foreignField: "_id",
        as: "branchData",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "ownerId",
        foreignField: "_id",
        as: "userData",
      },
    },
    {
      $addFields: {
        chemicalId: { $arrayElemAt: ["$chemicalData", 0] },
        ownerName: {
          $cond: {
            if: { $eq: ["$ownerType", "Branch"] },
            then: { $arrayElemAt: ["$branchData.branchName", 0] },
            else: { $arrayElemAt: ["$userData.name", 0] },
          },
        },
      },
    },
    {
      $project: {
        chemicalData: 0,
        branchData: 0,
        userData: 0,
      },
    },
    { $sort: { updatedAt: -1 } },
  ];

  if (limit > 0) {
    aggregatePipeline.push({ $skip: skip }, { $limit: limit });
  }

  const inventory = await Inventory.aggregate(aggregatePipeline);

  // Calculate distributed quantity for branch inventory
  const branchInventory = inventory.filter((i) => i.ownerType === "Branch");
  const employeeInventories = inventory.filter(
    (i) => i.ownerType === "Employee",
  );

  const distributedMap = {};
  employeeInventories.forEach((empInv) => {
    const key = empInv.chemicalId?._id?.toString();
    if (key) {
      if (!distributedMap[key]) {
        distributedMap[key] = 0;
      }
      distributedMap[key] += empInv.quantity;
    }
  });

  const formatted = inventory.map((item) => {
    const distributed =
      item.ownerType === "Branch"
        ? convertFromBaseUnit(
            distributedMap[item.chemicalId?._id?.toString()] || 0,
            item.unit || item.chemicalId?.unitSystem,
            item.chemicalId?.unitSystem,
          )
        : 0;

    return {
      ...item,
      displayQuantity: convertFromBaseUnit(
        item.quantity,
        item.unit || item.chemicalId?.unitSystem,
        item.chemicalId?.unitSystem,
      ),
      displayUnit: displayUnit(
        item.unit || item.chemicalId?.unitSystem,
        item.chemicalId?.unitSystem,
      ),
      distributed: distributed,
    };
  });

  res.status(200).json({ success: true, data: formatted });
});

exports.getTransactions = catchAsync(async (req, res, next) => {
  let matchStage = {};

  if (req.user.role === "super_admin") {
    matchStage = {};
  } else if (req.user.role === "branch_admin" || req.user.role === "office") {
    const usersInBranch = await User.find({
      branchId: req.user.branchId,
    }).select("_id");
    const userIds = usersInBranch.map((u) => u._id);
    matchStage = {
      $or: [
        { fromId: req.user.branchId },
        { toId: req.user.branchId },
        { performedBy: { $in: userIds } },
        { performedBy: req.user._id },
      ],
    };
  } else {
    matchStage = {
      $or: [
        { fromId: req.user._id },
        { toId: req.user._id },
        { performedBy: req.user._id },
      ],
    };
  }

  if (req.query.chemicalId) {
    matchStage.chemicalId = req.query.chemicalId;
  }
  if (req.query.txnType) {
    matchStage.txnType = req.query.txnType;
  }

  const transactions = await InventoryTransaction.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "chemicals",
        localField: "chemicalId",
        foreignField: "_id",
        as: "chemicalData",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { fromId: "$fromId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$fromId"] } } },
          { $project: { name: 1 } },
        ],
        as: "fromUser",
      },
    },
    {
      $lookup: {
        from: "branches",
        let: { fromId: "$fromId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$fromId"] } } },
          { $project: { branchName: 1 } },
        ],
        as: "fromBranch",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { toId: "$toId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$toId"] } } },
          { $project: { name: 1 } },
        ],
        as: "toUser",
      },
    },
    {
      $lookup: {
        from: "branches",
        let: { toId: "$toId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$toId"] } } },
          { $project: { branchName: 1 } },
        ],
        as: "toBranch",
      },
    },
    {
      $addFields: {
        chemicalId: { $arrayElemAt: ["$chemicalData", 0] },
        fromName: {
          $cond: {
            if: { $eq: ["$fromType", "super_admin"] },
            then: "Super Admin",
            else: {
              $cond: {
                if: { $eq: ["$fromType", "supplier"] },
                then: { $ifNull: ["$supplierName", "Supplier"] },
                else: {
                  $cond: {
                    if: { $gt: [{ $size: "$fromUser" }, 0] },
                    then: { $arrayElemAt: ["$fromUser.name", 0] },
                    else: { $arrayElemAt: ["$fromBranch.branchName", 0] },
                  },
                },
              },
            },
          },
        },
        toName: {
          $cond: {
            if: { $eq: ["$toType", "Usage"] },
            then: "Consumed",
            else: {
              $cond: {
                if: { $eq: ["$toType", "super_admin"] },
                then: "HQ",
                else: {
                  $cond: {
                    if: { $gt: [{ $size: "$toUser" }, 0] },
                    then: { $arrayElemAt: ["$toUser.name", 0] },
                    else: { $arrayElemAt: ["$toBranch.branchName", 0] },
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $project: {
        chemicalData: 0,
        fromUser: 0,
        fromBranch: 0,
        toUser: 0,
        toBranch: 0,
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: 100 },
  ]);

  const formatted = transactions.map((tx) => ({
    ...tx,
    displayQuantity: convertFromBaseUnit(
      tx.quantity,
      tx.unit || tx.chemicalId?.unitSystem,
      tx.chemicalId?.unitSystem,
    ),
    displayUnit: displayUnit(
      tx.unit || tx.chemicalId?.unitSystem,
      tx.chemicalId?.unitSystem,
    ),
  }));

  res.status(200).json({ success: true, data: formatted });
});

exports.getMyWallet = catchAsync(async (req, res, next) => {
  const wallet = await Inventory.find({
    ownerId: req.user._id,
    ownerType: "Employee",
  })
    .populate("chemicalId")
    .sort("-updatedAt");

  const formatted = wallet.map((item) => {
    const displayQty = convertFromBaseUnit(
      item.quantity,
      item.unit || item.chemicalId?.unitSystem,
      item.chemicalId?.unitSystem,
    );
    return {
      _id: item._id,
      chemicalId: item.chemicalId,
      chemicalName: item.chemicalId?.name,
      quantity: item.quantity,
      displayQuantity: displayQty,
      displayUnit: displayUnit(
        item.unit || item.chemicalId?.unitSystem,
        item.chemicalId?.unitSystem,
      ),
      transferRate: item.transferRate,
      usedQuantity: item.usedQuantity || 0,
      originalQuantity: item.originalQuantity || 0,
      value: Math.round(item.quantity * item.transferRate * 100) / 100,
    };
  });

  const totalValue = formatted.reduce((sum, item) => sum + item.value, 0);

  res.status(200).json({
    success: true,
    data: {
      items: formatted,
      totalItems: formatted.length,
      totalValue,
    },
  });
});

exports.getBranchBalances = catchAsync(async (req, res, next) => {
  if (req.user.role !== "super_admin") {
    return next(new AppError("Only Super Admin can view all balances", 403));
  }

  const branches = await Branch.find({ isActive: true }).lean();
  const branchIds = branches.map((b) => b._id);

  const payments = await Payment.find({ branchId: { $in: branchIds } })
    .sort("-createdAt")
    .lean();

  const recentPaymentsByBranch = {};
  payments.forEach((p) => {
    const bid = p.branchId.toString();
    if (!recentPaymentsByBranch[bid]) recentPaymentsByBranch[bid] = [];
    if (recentPaymentsByBranch[bid].length < 5) {
      recentPaymentsByBranch[bid].push(p);
    }
  });

  const balances = branches.map((branch) => ({
    _id: branch._id,
    branchName: branch.branchName,
    branchCode: branch.branchCode,
    totalReceivedValue: branch.totalReceivedValue,
    totalPaid: branch.totalPaid,
    pendingBalance: branch.pendingBalance,
    recentPayments: recentPaymentsByBranch[branch._id.toString()] || [],
  }));

  res.status(200).json({ success: true, data: balances });
});

exports.getMyBalance = catchAsync(async (req, res, next) => {
  if (req.user.role !== "branch_admin" && req.user.role !== "office") {
    return next(new AppError("Only Branch Admin can view their balance", 403));
  }

  const branch = await Branch.findById(req.user.branchId);
  if (!branch) return next(new AppError("Branch not found", 404));

  const payments = await Payment.find({ branchId: branch._id }).sort(
    "-createdAt",
  );

  // Get inventory stats
  const usersInBranch = await User.find({ branchId: branch._id }).select("_id");
  const userIds = usersInBranch.map((u) => u._id);

  const branchInventory = await Inventory.find({
    ownerId: branch._id,
    ownerType: "Branch",
  });
  const employeeInventory = await Inventory.find({
    ownerId: { $in: userIds },
    ownerType: "Employee",
  });

  const totalItems = branchInventory.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const distributedItems = employeeInventory.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  // Get employee distribution
  const employeeDistribution = {};
  employeeInventory.forEach((inv) => {
    const user = usersInBranch.find(
      (u) => u._id.toString() === inv.ownerId.toString(),
    );
    if (user) {
      const userName = user.name || "Unknown";
      if (!employeeDistribution[userName]) {
        employeeDistribution[userName] = {};
      }
      employeeDistribution[userName][inv.chemicalId?.toString()] =
        (employeeDistribution[userName][inv.chemicalId?.toString()] || 0) +
        inv.quantity;
    }
  });

  // Calculate inventory value from transactions
  const inventoryTransactions = await InventoryTransaction.aggregate([
    { $match: { toId: branch._id, txnType: "TRANSFER_TO_BRANCH" } },
    { $group: { _id: null, totalValue: { $sum: "$totalValue" } } },
  ]);
  const totalInventoryValue =
    inventoryTransactions.length > 0 ? inventoryTransactions[0].totalValue : 0;

  res.status(200).json({
    success: true,
    data: {
      branchName: branch.branchName,
      totalReceivedValue: branch.totalReceivedValue,
      totalPaid: branch.totalPaid,
      pendingBalance: branch.pendingBalance,
      totalInventoryValue: totalInventoryValue,
      recentPayments: payments.slice(0, 10),
      // Inventory stats
      totalItems: Math.round(totalItems * 1000) / 1000,
      distributedItems: Math.round(distributedItems * 1000) / 1000,
      availableItems: Math.round((totalItems - distributedItems) * 1000) / 1000,
      employeeDistribution: employeeDistribution,
    },
  });
});

exports.deleteInventory = catchAsync(async (req, res, next) => {
  const inventoryItem = await Inventory.findById(req.params.id);
  if (!inventoryItem)
    return next(new AppError("Inventory allocation not found", 404));

  await Inventory.findByIdAndDelete(req.params.id);

  res
    .status(200)
    .json({ success: true, message: "Inventory allocation deleted" });
});

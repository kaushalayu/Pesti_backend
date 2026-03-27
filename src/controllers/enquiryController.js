const Enquiry = require('../models/Enquiry');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const { generateEnquiryListPdf } = require('../services/pdfService');

// @desc    Create new Enquiry
// @route   POST /api/enquiries
// @access  Private
exports.createEnquiry = catchAsync(async (req, res, next) => {
  const payload = {
    ...req.body,
    addedBy: req.user._id,
    branchId: (req.user.role === 'super_admin' && req.body.branchId) ? req.body.branchId : req.user.branchId,
  };

  if (!payload.branchId) {
    return next(new AppError('Branch assignment is required to register a lead.', 400));
  }


  const enquiry = await Enquiry.create(payload);

  res.status(201).json({
    success: true,
    data: enquiry,
  });
});

// @desc    Get all Enquiries (Paginated map/filter)
// @route   GET /api/enquiries
// @access  Private
exports.getEnquiries = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Role Filtering
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    queryObj.branchId = req.user.branchId;
  } else if (req.user.role === 'technician' || req.user.role === 'sales') {
    // Technicians/sales explicitly see their own leads logically unless assigned.
    queryObj.addedBy = req.user._id;
  }

  // Handle case-insensitive search by name or mobile
  if (queryObj.search) {
    const searchRegex = { $regex: queryObj.search, $options: 'i' };
    queryObj.$or = [{ customerName: searchRegex }, { mobile: searchRegex }];
    delete queryObj.search;
  }

  let query = Enquiry.find(queryObj)
    .populate('addedBy', 'name employeeId')
    .populate('branchId', 'branchName branchCode city');

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt'); // Default sort: newest first
  }

  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({
    success: true,
    count: data.length,
    pagination,
    data,
  });
});

// @desc    Get single Enquiry
// @route   GET /api/enquiries/:id
// @access  Private
exports.getEnquiry = catchAsync(async (req, res, next) => {
  const enquiry = await Enquiry.findById(req.params.id)
    .populate('addedBy', 'name employeeId')
    .populate('branchId', 'branchName branchCode city address');

  if (!enquiry) {
    return next(new AppError('No enquiry found with that ID', 404));
  }

  // Role validation
  if (req.user.role !== 'super_admin') {
    if (enquiry.branchId._id.toString() !== req.user.branchId.toString()) {
      return next(new AppError('Permission Denied', 403));
    }
  }

  res.status(200).json({
    success: true,
    data: enquiry,
  });
});

// @desc    Update Enquiry
// @route   PUT /api/enquiries/:id
// @access  Private
exports.updateEnquiry = catchAsync(async (req, res, next) => {
  // Prevent shifting ownership properties
  delete req.body.branchId;
  delete req.body.addedBy;
  delete req.body.enquiryId;

  const enquiry = await Enquiry.findById(req.params.id);

  if (!enquiry) {
    return next(new AppError('No enquiry found with that ID', 404));
  }

  // Branch isolation constraint
  if (req.user.role !== 'super_admin' && enquiry.branchId.toString() !== req.user.branchId.toString()) {
    return next(new AppError('Permission Denied', 403));
  }

  const updatedEnquiry = await Enquiry.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: updatedEnquiry,
  });
});

// @desc    Update ONLY Status
// @route   PATCH /api/enquiries/:id/status
// @access  Private
exports.updateEnquiryStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'CONVERTED', 'LOST'];
  
  if (!validStatuses.includes(status)) {
    return next(new AppError('Invalid status provided.', 400));
  }

  const enquiry = await Enquiry.findById(req.params.id);

  if (!enquiry) {
    return next(new AppError('No enquiry found with that ID', 404));
  }

  enquiry.status = status;
  await enquiry.save();

  res.status(200).json({
    success: true,
    data: enquiry,
  });
});

// @desc    Get Enquiry Stats (Funnel)
// @route   GET /api/enquiries/stats
// @access  Private
exports.getEnquiryStats = catchAsync(async (req, res, next) => {
  const matchObj = {};
  if (req.user.role !== 'super_admin') {
    matchObj.branchId = req.user.branchId;
  }

  const stats = await Enquiry.aggregate([
    { $match: matchObj },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: stats, // Ideal for Recharts Funnel Chart
  });
});

// @desc    Export Enquiries to PDF
// @route   GET /api/enquiries/export/pdf
// @access  Private (Admins)
exports.exportEnquiriesPdf = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  if (req.user.role !== 'super_admin') {
    queryObj.branchId = req.user.branchId;
  }

  // We fetch ALL matching without pagination for export
  const enquiries = await Enquiry.find(queryObj).sort('-createdAt');

  const pdfBuffer = await generateEnquiryListPdf(enquiries);

  res.setHeader('Content-disposition', `attachment; filename=EnquiriesExport_${Date.now()}.pdf`);
  res.setHeader('Content-type', 'application/pdf');
  res.send(pdfBuffer);
});

// @desc    Export Enquiries to CSV/Sheets
// @route   GET /api/enquiries/export/sheets
// @access  Private (Admins)
exports.exportEnquiriesCSV = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  if (req.user.role !== 'super_admin') {
    queryObj.branchId = req.user.branchId;
  }

  const enquiries = await Enquiry.find(queryObj).populate('branchId', 'branchCode').sort('-createdAt');

  // Basic CSV Generation
  const headers = ['Enquiry ID', 'Date', 'Customer Name', 'Mobile', 'City', 'Service', 'Priority', 'Status', 'Branch Code'];
  const rows = enquiries.map((e) => [
    e.enquiryId,
    new Date(e.createdAt).toLocaleDateString(),
    `"${e.customerName}"`, // Wrap in quotes in case of commas
    e.mobile,
    e.city,
    e.serviceType,
    e.priority,
    e.status,
    e.branchId?.branchCode || 'N/A'
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

  res.setHeader('Content-disposition', `attachment; filename=Enquiries_${Date.now()}.csv`);
  res.setHeader('Content-type', 'text/csv');
  res.send(csvContent);
});

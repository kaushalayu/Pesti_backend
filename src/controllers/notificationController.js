const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createNotification = catchAsync(async (data) => {
  const notification = await Notification.create({
    userId: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
    relatedId: data.relatedId,
    relatedType: data.relatedType,
    data: data.data || {},
  });
  return notification;
});

exports.createBulkNotifications = catchAsync(async (notifications) => {
  const created = await Notification.insertMany(notifications);
  return created;
});

exports.getNotifications = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const filter = { userId: req.user._id };
  
  if (req.query.unread === 'true') {
    filter.isRead = false;
  }
  
  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  const enrichedNotifications = notifications.map(n => ({
    ...n.toObject(),
    link: n.relatedType ? `/${n.relatedType === 'EXPENSE' ? 'expenses' : 'receipts'}/${n.relatedId}` : null
  }));
  
  const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  
  res.status(200).json({
    success: true,
    data: enrichedNotifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    unreadCount,
  });
});

exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  
  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }
  
  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();
  
  res.status(200).json({ success: true, data: notification });
});

exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  
  res.status(200).json({ success: true, message: 'All notifications marked as read' });
});

exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const count = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  
  res.status(200).json({ success: true, data: { count } });
});

exports.deleteNotification = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  
  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }
  
  await Notification.findByIdAndDelete(req.params.id);
  
  res.status(200).json({ success: true, message: 'Notification deleted' });
});

exports.clearAllNotifications = catchAsync(async (req, res, next) => {
  await Notification.deleteMany({ userId: req.user._id });
  
  res.status(200).json({ success: true, message: 'All notifications cleared' });
});

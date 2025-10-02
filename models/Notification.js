const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'order_placed',
      'order_shipped',
      'order_delivered',
      'order_cancelled',
      'payment_received',
      'design_approved',
      'design_rejected',
      'price_drop',
      'new_product',
      'promotion',
      'system'
    ],
    required: true
  },
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    maxlength: [500, 'Message cannot be more than 500 characters']
  },
  icon: {
    type: String,
    default: 'bell'
  },
  link: {
    type: String,
    default: ''
  },
  data: {
    type: Object,
    default: {}
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  expiresAt: Date
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to create notification
notificationSchema.statics.createNotification = async function(userId, type, title, message, options = {}) {
  const notification = new this({
    user: userId,
    type,
    title,
    message,
    icon: options.icon || 'bell',
    link: options.link || '',
    data: options.data || {},
    priority: options.priority || 'normal',
    expiresAt: options.expiresAt || null
  });

  return await notification.save();
};

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = function(userId, unreadOnly = false) {
  const query = { user: userId };
  if (unreadOnly) query.read = false;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(50);
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({ user: userId, read: false });
};

// Static method to delete old notifications
notificationSchema.statics.deleteOld = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    read: true
  });
};

module.exports = mongoose.model('Notification', notificationSchema);

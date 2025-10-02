const mongoose = require('mongoose');

const designSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  },
  name: {
    type: String,
    default: 'Untitled Design'
  },
  designData: {
    type: Object,
    required: true
  },
  thumbnail: {
    type: String,
    required: true
  },
  productType: {
    type: String,
    enum: ['tshirt', 'hoodie', 'tank', 'longsleeve', 'mug', 'poster'],
    default: 'tshirt'
  },
  productColor: {
    type: String,
    default: '#ffffff'
  },
  size: {
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'],
    default: 'M'
  },
  mockups: [{
    angle: String,
    imageUrl: String
  }],
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'rejected', 'archived'],
    default: 'draft'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  orderCount: {
    type: Number,
    default: 0
  },
  approvalNotes: {
    type: String,
    maxlength: 500
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
}, {
  timestamps: true
});

// Indexes
designSchema.index({ user: 1, createdAt: -1 });
designSchema.index({ status: 1 });
designSchema.index({ isPublic: 1, status: 1 });

// Virtual for design complexity (estimate based on objects)
designSchema.virtual('complexity').get(function() {
  if (!this.designData || !this.designData.objects) return 'simple';
  const objectCount = this.designData.objects.length;
  if (objectCount <= 3) return 'simple';
  if (objectCount <= 7) return 'medium';
  return 'complex';
});

// Method to update status
designSchema.methods.updateStatus = function(newStatus, notes = '', approver = null) {
  this.status = newStatus;
  this.approvalNotes = notes;

  if (newStatus === 'approved' && approver) {
    this.approvedBy = approver;
    this.approvedAt = new Date();
  }
};

// Static method to get user designs
designSchema.statics.getUserDesigns = function(userId, status = null) {
  const query = { user: userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get public designs
designSchema.statics.getPublicDesigns = function(limit = 20) {
  return this.find({ isPublic: true, status: 'approved' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'name avatar');
};

module.exports = mongoose.model('Design', designSchema);

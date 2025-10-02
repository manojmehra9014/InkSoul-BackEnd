const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [3, 'Code must be at least 3 characters'],
    maxlength: [20, 'Code cannot be more than 20 characters']
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot be more than 200 characters']
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed', 'free_shipping'],
    required: true
  },
  value: {
    type: Number,
    required: [true, 'Discount value is required'],
    min: [0, 'Value cannot be negative']
  },
  minOrderValue: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order value cannot be negative']
  },
  maxDiscount: {
    type: Number,
    min: [0, 'Maximum discount cannot be negative']
  },
  maxUses: {
    type: Number,
    default: null, // null means unlimited
    min: [1, 'Max uses must be at least 1']
  },
  maxUsesPerUser: {
    type: Number,
    default: 1,
    min: [1, 'Max uses per user must be at least 1']
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  usedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    orderValue: Number
  }],
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  applicableCategories: [{
    type: String
  }],
  excludedProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, expiresAt: 1 });
couponSchema.index({ startDate: 1, expiresAt: 1 });

// Virtual for checking if coupon is expired
couponSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Virtual for checking if uses are exhausted
couponSchema.virtual('isExhausted').get(function() {
  if (!this.maxUses) return false;
  return this.usedCount >= this.maxUses;
});

// Method to validate coupon
couponSchema.methods.validate = function(orderValue, userId, cartItems = []) {
  const now = new Date();

  // Check if active
  if (!this.isActive) {
    return { valid: false, message: 'This coupon is not active' };
  }

  // Check expiration
  if (now > this.expiresAt) {
    return { valid: false, message: 'This coupon has expired' };
  }

  // Check start date
  if (now < this.startDate) {
    return { valid: false, message: 'This coupon is not yet valid' };
  }

  // Check max uses
  if (this.maxUses && this.usedCount >= this.maxUses) {
    return { valid: false, message: 'This coupon has been fully redeemed' };
  }

  // Check user usage limit
  if (userId) {
    const userUses = this.usedBy.filter(u => u.user.toString() === userId).length;
    if (userUses >= this.maxUsesPerUser) {
      return { valid: false, message: 'You have already used this coupon the maximum number of times' };
    }
  }

  // Check minimum order value
  if (orderValue < this.minOrderValue) {
    return {
      valid: false,
      message: `Minimum order value of $${this.minOrderValue} required`
    };
  }

  // Check product/category restrictions
  if (this.applicableProducts.length > 0 || this.applicableCategories.length > 0) {
    const hasApplicableItem = cartItems.some(item => {
      const productMatch = this.applicableProducts.some(p => p.toString() === item.product.toString());
      const categoryMatch = this.applicableCategories.includes(item.category);
      const isExcluded = this.excludedProducts.some(p => p.toString() === item.product.toString());

      return (productMatch || categoryMatch) && !isExcluded;
    });

    if (!hasApplicableItem) {
      return { valid: false, message: 'This coupon is not applicable to your cart items' };
    }
  }

  return { valid: true, message: 'Coupon is valid' };
};

// Method to calculate discount
couponSchema.methods.calculateDiscount = function(orderValue) {
  let discount = 0;

  switch (this.type) {
    case 'percentage':
      discount = (orderValue * this.value) / 100;
      if (this.maxDiscount && discount > this.maxDiscount) {
        discount = this.maxDiscount;
      }
      break;
    case 'fixed':
      discount = Math.min(this.value, orderValue);
      break;
    case 'free_shipping':
      discount = 0; // Shipping discount handled separately
      break;
  }

  return Math.round(discount * 100) / 100;
};

// Method to apply coupon
couponSchema.methods.apply = function(userId, orderValue) {
  this.usedCount += 1;
  if (userId) {
    this.usedBy.push({
      user: userId,
      orderValue: orderValue
    });
  }
};

// Static method to get active coupons
couponSchema.statics.getActiveCoupons = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    isPublic: true,
    startDate: { $lte: now },
    expiresAt: { $gte: now }
  }).select('-usedBy');
};

// Static method to find valid coupon by code
couponSchema.statics.findByCode = function(code) {
  return this.findOne({
    code: code.toUpperCase(),
    isActive: true
  });
};

module.exports = mongoose.model('Coupon', couponSchema);

const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  size: {
    type: String,
    default: 'One Size'
  },
  color: {
    type: String,
    default: 'Default'
  }
});

const shippingAddressSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  zipCode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true,
    default: 'United States'
  }
});

const paymentResultSchema = new mongoose.Schema({
  id: String,
  status: String,
  update_time: String,
  email_address: String
});

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  orderItems: [orderItemSchema],
  shippingAddress: shippingAddressSchema,
  paymentMethod: {
    type: String,
    required: true,
    enum: ['stripe', 'paypal', 'cash_on_delivery'],
    default: 'stripe'
  },
  paymentResult: paymentResultSchema,
  itemsPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  taxPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  shippingPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0.0,
    min: 0
  },
  couponCode: {
    type: String,
    default: ''
  },
  isPaid: {
    type: Boolean,
    required: true,
    default: false
  },
  paidAt: {
    type: Date
  },
  isDelivered: {
    type: Boolean,
    required: true,
    default: false
  },
  deliveredAt: {
    type: Date
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  trackingNumber: {
    type: String,
    default: ''
  },
  shippingCarrier: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      default: ''
    }
  }]
}, {
  timestamps: true
});

// Indexes for better query performance (orderNumber index is automatic due to unique: true)
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ isPaid: 1 });
orderSchema.index({ isDelivered: 1 });

// Generate order number before saving
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    this.orderNumber = `INK${Date.now()}${String(count + 1).padStart(4, '0')}`;
    
    // Add initial status to history
    this.statusHistory.push({
      status: this.status,
      date: new Date(),
      note: 'Order created'
    });
  }
  next();
});

// Method to update order status
orderSchema.methods.updateStatus = function(newStatus, note = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    date: new Date(),
    note
  });
  
  // Update specific fields based on status
  switch (newStatus) {
    case 'delivered':
      this.isDelivered = true;
      this.deliveredAt = new Date();
      break;
    case 'cancelled':
    case 'refunded':
      // Handle cancellation/refund logic
      break;
  }
};

// Virtual for full shipping address
orderSchema.virtual('fullShippingAddress').get(function() {
  const addr = this.shippingAddress;
  return `${addr.address}, ${addr.city}, ${addr.state} ${addr.zipCode}, ${addr.country}`;
});

// Virtual for order total items count
orderSchema.virtual('totalItems').get(function() {
  return this.orderItems.reduce((total, item) => total + item.quantity, 0);
});

// Static method to get orders by user
orderSchema.statics.getByUser = function(userId) {
  return this.find({ user: userId }).sort({ createdAt: -1 });
};

// Static method to get recent orders
orderSchema.statics.getRecent = function(limit = 10) {
  return this.find().sort({ createdAt: -1 }).limit(limit).populate('user', 'name email');
};

module.exports = mongoose.model('Order', orderSchema);
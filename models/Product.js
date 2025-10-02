const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    maxlength: [500, 'Review cannot be more than 500 characters']
  }
}, {
  timestamps: true
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a product name'],
    trim: true,
    maxlength: [100, 'Product name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please provide a product description'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Please provide a price'],
    min: [0, 'Price cannot be negative']
  },
  comparePrice: {
    type: Number,
    min: [0, 'Compare price cannot be negative']
  },
  category: {
    type: String,
    required: [true, 'Please provide a category'],
    enum: {
      values: ['T-Shirts', 'Handkerchiefs', 'Socks', 'Gloves', 'Accessories'],
      message: 'Please select a valid category'
    }
  },
  subcategory: {
    type: String,
    default: ''
  },
  brand: {
    type: String,
    default: 'InkSoul'
  },
  productCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      default: ''
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    colorCode: {
      type: String,
      default: ''
    }
  }],
  colors: [{
    name: {
      type: String,
      required: true
    },
    hex: {
      type: String,
      required: true
    },
    stock: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  sizes: [{
    name: {
      type: String,
      required: true,
      enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size']
    },
    stock: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  stock: {
    type: Number,
    required: [true, 'Please provide stock quantity'],
    min: [0, 'Stock cannot be negative']
  },
  weight: {
    type: Number,
    default: 0
  },
  dimensions: {
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  },
  material: {
    type: String,
    default: ''
  },
  careInstructions: {
    type: String,
    default: ''
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  features: [{
    type: String,
    maxlength: [100, 'Feature cannot be more than 100 characters']
  }],
  reviews: [reviewSchema],
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  numReviews: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  seoTitle: {
    type: String,
    maxlength: [60, 'SEO title cannot be more than 60 characters']
  },
  seoDescription: {
    type: String,
    maxlength: [160, 'SEO description cannot be more than 160 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance (slug index is automatic due to unique: true)
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ createdAt: -1 });

// Generate slug before saving
productSchema.pre('save', function (next) {
  if (this.isModified('name') || this.isNew) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Calculate average rating
productSchema.methods.calculateAverageRating = function () {
  if (this.reviews.length === 0) {
    this.rating = 0;
    this.numReviews = 0;
  } else {
    const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating = Math.round((totalRating / this.reviews.length) * 10) / 10;
    this.numReviews = this.reviews.length;
  }
};

// Virtual for total stock across all variants
productSchema.virtual('totalStock').get(function () {
  let total = this.stock;

  if (this.colors && this.colors.length > 0) {
    total = this.colors.reduce((sum, color) => sum + color.stock, 0);
  }

  if (this.sizes && this.sizes.length > 0) {
    total = this.sizes.reduce((sum, size) => sum + size.stock, 0);
  }

  return total;
});

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function () {
  if (this.comparePrice && this.comparePrice > this.price) {
    return Math.round(((this.comparePrice - this.price) / this.comparePrice) * 100);
  }
  return 0;
});

// Static method to get featured products
productSchema.statics.getFeatured = function () {
  return this.find({ isFeatured: true, isActive: true }).limit(8);
};

// Static method to get products by category
productSchema.statics.getByCategory = function (category) {
  return this.find({ category, isActive: true });
};

module.exports = mongoose.model('Product', productSchema);
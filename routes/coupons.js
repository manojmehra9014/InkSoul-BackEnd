const express = require('express');
const { body, validationResult } = require('express-validator');
const Coupon = require('../models/Coupon');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/coupons
// @desc    Get all active coupons (Public coupons only for non-admin)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const coupons = await Coupon.getActiveCoupons();

    res.json({
      success: true,
      data: coupons
    });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching coupons'
    });
  }
});

// @route   GET /api/coupons/admin
// @desc    Get all coupons (Admin only)
// @access  Private/Admin
router.get('/admin', [auth, adminAuth], async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: coupons
    });
  } catch (error) {
    console.error('Get admin coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching coupons'
    });
  }
});

// @route   POST /api/coupons/validate
// @desc    Validate coupon code
// @access  Public/Private
router.post('/validate', [
  body('code').notEmpty().withMessage('Coupon code is required'),
  body('orderValue').isFloat({ min: 0 }).withMessage('Valid order value required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { code, orderValue, cartItems = [] } = req.body;
    const userId = req.user?.userId || null;

    const coupon = await Coupon.findByCode(code);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    const validation = coupon.validate(orderValue, userId, cartItems);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const discount = coupon.calculateDiscount(orderValue);

    res.json({
      success: true,
      message: 'Coupon is valid',
      data: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount: discount,
        description: coupon.description
      }
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while validating coupon'
    });
  }
});

// @route   POST /api/coupons/apply
// @desc    Apply coupon to order (marks coupon as used)
// @access  Private
router.post('/apply', [
  auth,
  body('code').notEmpty().withMessage('Coupon code is required'),
  body('orderValue').isFloat({ min: 0 }).withMessage('Valid order value required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { code, orderValue } = req.body;

    const coupon = await Coupon.findByCode(code);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    const validation = coupon.validate(orderValue, req.user.userId);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const discount = coupon.calculateDiscount(orderValue);
    coupon.apply(req.user.userId, orderValue);
    await coupon.save();

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        code: coupon.code,
        discount: discount,
        finalPrice: Math.max(0, orderValue - discount)
      }
    });
  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while applying coupon'
    });
  }
});

// @route   POST /api/coupons
// @desc    Create new coupon (Admin only)
// @access  Private/Admin
router.post('/', [
  auth,
  adminAuth,
  body('code').trim().isLength({ min: 3, max: 20 }).withMessage('Code must be 3-20 characters'),
  body('type').isIn(['percentage', 'fixed', 'free_shipping']).withMessage('Invalid coupon type'),
  body('value').isFloat({ min: 0 }).withMessage('Value must be positive'),
  body('expiresAt').isISO8601().withMessage('Valid expiration date required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if code already exists
    const existingCoupon = await Coupon.findOne({ code: req.body.code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    const coupon = new Coupon({
      ...req.body,
      createdBy: req.user.userId
    });

    await coupon.save();

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating coupon'
    });
  }
});

// @route   PUT /api/coupons/:id
// @desc    Update coupon (Admin only)
// @access  Private/Admin
router.put('/:id', [auth, adminAuth], async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['description', 'value', 'minOrderValue', 'maxDiscount', 'maxUses', 'maxUsesPerUser', 'isActive', 'isPublic', 'expiresAt'];
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        coupon[key] = req.body[key];
      }
    });

    await coupon.save();

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating coupon'
    });
  }
});

// @route   DELETE /api/coupons/:id
// @desc    Delete coupon (Admin only)
// @access  Private/Admin
router.delete('/:id', [auth, adminAuth], async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    await coupon.deleteOne();

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting coupon'
    });
  }
});

module.exports = router;

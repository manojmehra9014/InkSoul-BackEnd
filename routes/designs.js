const express = require('express');
const { body, validationResult } = require('express-validator');
const Design = require('../models/Design');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/designs
// @desc    Get user's designs
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const designs = await Design.getUserDesigns(req.user.userId, status);

    res.json({
      success: true,
      data: designs
    });
  } catch (error) {
    console.error('Get designs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching designs'
    });
  }
});

// @route   GET /api/designs/public
// @desc    Get public designs
// @access  Public
router.get('/public', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const designs = await Design.getPublicDesigns(parseInt(limit));

    res.json({
      success: true,
      data: designs
    });
  } catch (error) {
    console.error('Get public designs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching public designs'
    });
  }
});

// @route   GET /api/designs/:id
// @desc    Get single design
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const design = await Design.findById(req.params.id).populate('user', 'name email');

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    // Check if user owns the design or it's public
    if (design.user._id.toString() !== req.user.userId && !design.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: design
    });
  } catch (error) {
    console.error('Get design error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching design'
    });
  }
});

// @route   POST /api/designs
// @desc    Create new design
// @access  Private
router.post('/', [
  auth,
  body('designData').notEmpty().withMessage('Design data is required'),
  body('thumbnail').notEmpty().withMessage('Thumbnail is required'),
  body('productType').optional().isIn(['tshirt', 'hoodie', 'tank', 'longsleeve', 'mug', 'poster']),
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

    const design = new Design({
      ...req.body,
      user: req.user.userId
    });

    await design.save();

    res.status(201).json({
      success: true,
      message: 'Design created successfully',
      data: design
    });
  } catch (error) {
    console.error('Create design error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating design'
    });
  }
});

// @route   PUT /api/designs/:id
// @desc    Update design
// @access  Private
router.put('/:id', [auth], async (req, res) => {
  try {
    const design = await Design.findById(req.params.id);

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    // Check ownership
    if (design.user.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'designData', 'thumbnail', 'productType', 'productColor', 'size', 'tags', 'isPublic'];
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        design[key] = req.body[key];
      }
    });

    await design.save();

    res.json({
      success: true,
      message: 'Design updated successfully',
      data: design
    });
  } catch (error) {
    console.error('Update design error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating design'
    });
  }
});

// @route   DELETE /api/designs/:id
// @desc    Delete design
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const design = await Design.findById(req.params.id);

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    // Check ownership
    if (design.user.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await design.deleteOne();

    res.json({
      success: true,
      message: 'Design deleted successfully'
    });
  } catch (error) {
    console.error('Delete design error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting design'
    });
  }
});

// @route   PUT /api/designs/:id/approve
// @desc    Approve design (Admin only)
// @access  Private/Admin
router.put('/:id/approve', [auth, adminAuth], async (req, res) => {
  try {
    const { notes } = req.body;
    const design = await Design.findById(req.params.id);

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    design.updateStatus('approved', notes, req.user.userId);
    await design.save();

    // Create notification for user
    const Notification = require('../models/Notification');
    await Notification.createNotification(
      design.user,
      'design_approved',
      'Design Approved!',
      `Your design "${design.name}" has been approved and is ready to order.`,
      {
        link: `/designs/${design._id}`,
        priority: 'high'
      }
    );

    res.json({
      success: true,
      message: 'Design approved successfully',
      data: design
    });
  } catch (error) {
    console.error('Approve design error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving design'
    });
  }
});

// @route   PUT /api/designs/:id/reject
// @desc    Reject design (Admin only)
// @access  Private/Admin
router.put('/:id/reject', [auth, adminAuth], async (req, res) => {
  try {
    const { notes } = req.body;
    const design = await Design.findById(req.params.id);

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    design.updateStatus('rejected', notes, req.user.userId);
    await design.save();

    // Create notification for user
    const Notification = require('../models/Notification');
    await Notification.createNotification(
      design.user,
      'design_rejected',
      'Design Needs Revision',
      `Your design "${design.name}" needs some changes. Reason: ${notes}`,
      {
        link: `/designs/${design._id}`,
        priority: 'high'
      }
    );

    res.json({
      success: true,
      message: 'Design rejected',
      data: design
    });
  } catch (error) {
    console.error('Reject design error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting design'
    });
  }
});

module.exports = router;

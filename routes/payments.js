const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/payments/create-payment-intent
// @desc    Create Stripe payment intent
// @access  Private
router.post('/create-payment-intent', [
  auth,
  body('amount')
    .isFloat({ min: 0.5 })
    .withMessage('Amount must be at least $0.50'),
  body('currency')
    .optional()
    .isIn(['usd', 'eur', 'gbp'])
    .withMessage('Currency must be USD, EUR, or GBP'),
  body('orderId')
    .isMongoId()
    .withMessage('Please provide a valid order ID')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { amount, currency = 'usd', orderId } = req.body;

    // Verify order exists and belongs to user
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.user.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (order.isPaid) {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    // Verify amount matches order total
    const orderAmount = Math.round(order.totalPrice * 100); // Convert to cents
    const requestAmount = Math.round(amount * 100);

    if (Math.abs(orderAmount - requestAmount) > 1) { // Allow 1 cent difference for rounding
      return res.status(400).json({
        success: false,
        message: 'Amount mismatch'
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: orderAmount,
      currency: currency.toLowerCase(),
      metadata: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        userId: req.user.userId
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      }
    });

  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating payment intent'
    });
  }
});

// @route   POST /api/payments/confirm-payment
// @desc    Confirm payment and update order
// @access  Private
router.post('/confirm-payment', [
  auth,
  body('paymentIntentId')
    .notEmpty()
    .withMessage('Payment intent ID is required'),
  body('orderId')
    .isMongoId()
    .withMessage('Please provide a valid order ID')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { paymentIntentId, orderId } = req.body;

    // Verify order exists and belongs to user
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.user.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (order.isPaid) {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }

    // Verify payment intent belongs to this order
    if (paymentIntent.metadata.orderId !== orderId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent does not match order'
      });
    }

    // Update order as paid
    order.isPaid = true;
    order.paidAt = new Date();
    order.updateStatus('processing', 'Payment received via Stripe');
    order.paymentResult = {
      id: paymentIntent.id,
      status: paymentIntent.status,
      update_time: new Date().toISOString(),
      email_address: paymentIntent.receipt_email || order.shippingAddress.email
    };

    await order.save();

    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        paymentStatus: 'completed'
      }
    });

  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while confirming payment'
    });
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Stripe webhooks
// @access  Public (but verified by Stripe signature)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('Payment succeeded:', paymentIntent.id);
        
        // Find and update order
        const orderId = paymentIntent.metadata.orderId;
        if (orderId) {
          const order = await Order.findById(orderId);
          if (order && !order.isPaid) {
            order.isPaid = true;
            order.paidAt = new Date();
            order.updateStatus('processing', 'Payment confirmed via webhook');
            order.paymentResult = {
              id: paymentIntent.id,
              status: paymentIntent.status,
              update_time: new Date().toISOString(),
              email_address: paymentIntent.receipt_email
            };
            await order.save();
            console.log('Order updated via webhook:', order.orderNumber);
          }
        }
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('Payment failed:', failedPayment.id);
        
        // Handle failed payment
        const failedOrderId = failedPayment.metadata.orderId;
        if (failedOrderId) {
          const failedOrder = await Order.findById(failedOrderId);
          if (failedOrder) {
            failedOrder.updateStatus('pending', 'Payment failed');
            await failedOrder.save();
            console.log('Order marked as payment failed:', failedOrder.orderNumber);
          }
        }
        break;

      case 'charge.dispute.created':
        const dispute = event.data.object;
        console.log('Dispute created:', dispute.id);
        // Handle dispute logic here
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// @route   POST /api/payments/refund
// @desc    Process refund (Admin only)
// @access  Private/Admin
router.post('/refund', [
  auth,
  body('orderId')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Refund amount must be positive'),
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Reason cannot be more than 500 characters')
], async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId, amount, reason = 'Refund requested by admin' } = req.body;

    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.isPaid) {
      return res.status(400).json({
        success: false,
        message: 'Order is not paid, cannot refund'
      });
    }

    if (!order.paymentResult || !order.paymentResult.id) {
      return res.status(400).json({
        success: false,
        message: 'No payment information found for this order'
      });
    }

    // Calculate refund amount
    const refundAmount = amount ? Math.round(amount * 100) : Math.round(order.totalPrice * 100);

    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: order.paymentResult.id,
      amount: refundAmount,
      reason: 'requested_by_customer',
      metadata: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        adminReason: reason
      }
    });

    // Update order status
    order.updateStatus('refunded', `Refund processed: $${(refundAmount / 100).toFixed(2)} - ${reason}`);
    await order.save();

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refund.id,
        amount: refundAmount / 100,
        status: refund.status,
        orderId: order._id,
        orderNumber: order.orderNumber
      }
    });

  } catch (error) {
    console.error('Process refund error:', error);
    
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while processing refund'
    });
  }
});

// @route   GET /api/payments/config
// @desc    Get Stripe publishable key
// @access  Public
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    }
  });
});

module.exports = router;
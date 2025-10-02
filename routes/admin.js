const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Private/Admin
router.get('/dashboard', [auth, adminAuth], async (req, res) => {
  try {
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      recentOrders,
      topProducts,
      userStats,
      orderStats
    ] = await Promise.all([
      // Total counts
      User.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments(),
      
      // Total revenue
      Order.aggregate([
        { $match: { isPaid: true } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      
      // Recent orders
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email')
        .select('orderNumber totalPrice status createdAt'),
      
      // Top selling products
      Order.aggregate([
        { $match: { isPaid: true } },
        { $unwind: '$orderItems' },
        {
          $group: {
            _id: '$orderItems.product',
            totalSold: { $sum: '$orderItems.quantity' },
            revenue: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } },
            productName: { $first: '$orderItems.name' }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 }
      ]),
      
      // User registration stats (last 30 days)
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Order stats by status
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        }
      ])
    ]);

    // Calculate growth metrics
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [currentMonthOrders, previousMonthOrders] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Order.countDocuments({ 
        createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } 
      })
    ]);

    const orderGrowth = previousMonthOrders > 0 
      ? ((currentMonthOrders - previousMonthOrders) / previousMonthOrders * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          orderGrowth: parseFloat(orderGrowth)
        },
        recentOrders,
        topProducts,
        charts: {
          userRegistrations: userStats,
          ordersByStatus: orderStats
        }
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard data'
    });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get detailed analytics
// @access  Private/Admin
router.get('/analytics', [auth, adminAuth], async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      salesData,
      categoryData,
      customerData,
      productPerformance
    ] = await Promise.all([
      // Daily sales data
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            isPaid: true
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            sales: { $sum: '$totalPrice' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Sales by category
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            isPaid: true
          }
        },
        { $unwind: '$orderItems' },
        {
          $lookup: {
            from: 'products',
            localField: 'orderItems.product',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: '$product.category',
            sales: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } },
            quantity: { $sum: '$orderItems.quantity' }
          }
        }
      ]),
      
      // Customer insights
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            isPaid: true
          }
        },
        {
          $group: {
            _id: '$user',
            totalSpent: { $sum: '$totalPrice' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: null,
            avgOrderValue: { $avg: '$totalSpent' },
            avgOrdersPerCustomer: { $avg: '$orderCount' },
            totalCustomers: { $sum: 1 }
          }
        }
      ]),
      
      // Product performance
      Product.aggregate([
        {
          $lookup: {
            from: 'orders',
            let: { productId: '$_id' },
            pipeline: [
              { $match: { createdAt: { $gte: startDate }, isPaid: true } },
              { $unwind: '$orderItems' },
              { $match: { $expr: { $eq: ['$orderItems.product', '$$productId'] } } },
              {
                $group: {
                  _id: null,
                  totalSold: { $sum: '$orderItems.quantity' },
                  revenue: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } }
                }
              }
            ],
            as: 'sales'
          }
        },
        {
          $addFields: {
            totalSold: { $ifNull: [{ $arrayElemAt: ['$sales.totalSold', 0] }, 0] },
            revenue: { $ifNull: [{ $arrayElemAt: ['$sales.revenue', 0] }, 0] }
          }
        },
        {
          $match: { totalSold: { $gt: 0 } }
        },
        {
          $project: {
            name: 1,
            category: 1,
            price: 1,
            stock: 1,
            totalSold: 1,
            revenue: 1,
            rating: 1
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 20 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        salesData,
        categoryData,
        customerInsights: customerData[0] || {
          avgOrderValue: 0,
          avgOrdersPerCustomer: 0,
          totalCustomers: 0
        },
        productPerformance
      }
    });

  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching analytics data'
    });
  }
});

// @route   GET /api/admin/reports/sales
// @desc    Generate sales report
// @access  Private/Admin
router.get('/reports/sales', [auth, adminAuth], async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Determine grouping format
    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00';
        break;
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-W%U';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      default:
        dateFormat = '%Y-%m-%d';
    }

    const salesReport = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          isPaid: true
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          totalSales: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$totalPrice' },
          totalItems: { $sum: { $sum: '$orderItems.quantity' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate totals
    const totals = salesReport.reduce((acc, curr) => ({
      totalSales: acc.totalSales + curr.totalSales,
      totalOrders: acc.totalOrders + curr.totalOrders,
      totalItems: acc.totalItems + curr.totalItems
    }), { totalSales: 0, totalOrders: 0, totalItems: 0 });

    res.json({
      success: true,
      data: {
        report: salesReport,
        summary: {
          ...totals,
          avgOrderValue: totals.totalOrders > 0 ? totals.totalSales / totals.totalOrders : 0,
          period: { startDate, endDate, groupBy }
        }
      }
    });

  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating sales report'
    });
  }
});

// @route   GET /api/admin/reports/inventory
// @desc    Generate inventory report
// @access  Private/Admin
router.get('/reports/inventory', [auth, adminAuth], async (req, res) => {
  try {
    const { lowStock = 10 } = req.query;

    const [
      lowStockProducts,
      outOfStockProducts,
      categoryStock,
      totalInventoryValue
    ] = await Promise.all([
      // Low stock products
      Product.find({
        isActive: true,
        stock: { $lte: parseInt(lowStock), $gt: 0 }
      }).select('name category stock price sku'),
      
      // Out of stock products
      Product.find({
        isActive: true,
        stock: 0
      }).select('name category stock price sku'),
      
      // Stock by category
      Product.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$category',
            totalStock: { $sum: '$stock' },
            totalProducts: { $sum: 1 },
            totalValue: { $sum: { $multiply: ['$stock', '$price'] } }
          }
        }
      ]),
      
      // Total inventory value
      Product.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalValue: { $sum: { $multiply: ['$stock', '$price'] } },
            totalItems: { $sum: '$stock' },
            totalProducts: { $sum: 1 }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        lowStockProducts,
        outOfStockProducts,
        categoryStock,
        summary: totalInventoryValue[0] || {
          totalValue: 0,
          totalItems: 0,
          totalProducts: 0
        }
      }
    });

  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating inventory report'
    });
  }
});

// @route   POST /api/admin/seed
// @desc    Seed database with sample data (Development only)
// @access  Private/Admin
router.post('/seed', [auth, adminAuth], async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Seeding is not allowed in production'
      });
    }

    // Sample products data
    const sampleProducts = [
      {
        name: 'Artistic Expression T-Shirt',
        description: 'Premium cotton t-shirt with unique artistic design. Perfect for casual wear and expressing your creative side.',
        price: 29.99,
        category: 'T-Shirts',
        sku: 'ART-TSH-001',
        stock: 50,
        images: [{ url: '/api/placeholder/400/400', alt: 'Artistic T-Shirt', isPrimary: true }],
        colors: [
          { name: 'Black', hex: '#000000', stock: 20 },
          { name: 'White', hex: '#FFFFFF', stock: 15 },
          { name: 'Navy', hex: '#000080', stock: 15 }
        ],
        sizes: [
          { name: 'S', stock: 10 },
          { name: 'M', stock: 20 },
          { name: 'L', stock: 15 },
          { name: 'XL', stock: 5 }
        ],
        tags: ['artistic', 'casual', 'cotton'],
        isFeatured: true,
        createdBy: req.user.userId
      },
      // Add more sample products...
    ];

    // Clear existing products (development only)
    await Product.deleteMany({});
    
    // Insert sample products
    const products = await Product.insertMany(sampleProducts);

    res.json({
      success: true,
      message: `Database seeded successfully with ${products.length} products`,
      data: { productsCreated: products.length }
    });

  } catch (error) {
    console.error('Seed database error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while seeding database'
    });
  }
});

module.exports = router;
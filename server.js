const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/designs', require('./routes/designs'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100 + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100 + ' MB'
    },
    database: {
      status: 'unknown',
      connected: false
    },
    services: {
      server: 'OK',
      api: 'OK'
    }
  };

  try {
    // Check database connection
    const dbState = mongoose.connection.readyState;
    switch (dbState) {
      case 0:
        healthCheck.database.status = 'disconnected';
        healthCheck.database.connected = false;
        healthCheck.status = 'DEGRADED';
        break;
      case 1:
        healthCheck.database.status = 'connected';
        healthCheck.database.connected = true;
        // Test a simple database operation
        await mongoose.connection.db.admin().ping();
        break;
      case 2:
        healthCheck.database.status = 'connecting';
        healthCheck.database.connected = false;
        healthCheck.status = 'DEGRADED';
        break;
      case 3:
        healthCheck.database.status = 'disconnecting';
        healthCheck.database.connected = false;
        healthCheck.status = 'DEGRADED';
        break;
      default:
        healthCheck.database.status = 'unknown';
        healthCheck.database.connected = false;
        healthCheck.status = 'DEGRADED';
    }

    // If database is not connected, mark as degraded
    if (!healthCheck.database.connected) {
      healthCheck.status = 'DEGRADED';
    }

    res.status(healthCheck.status === 'OK' ? 200 : 503).json(healthCheck);
  } catch (error) {
    healthCheck.status = 'ERROR';
    healthCheck.database.status = 'error';
    healthCheck.database.connected = false;
    healthCheck.database.error = error.message;

    res.status(503).json(healthCheck);
  }
});

// Detailed health check for monitoring/admin purposes
app.get('/api/health/detailed', async (req, res) => {
  const detailedHealth = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    memory: process.memoryUsage(),
    database: {
      status: 'unknown',
      connected: false,
      host: null,
      name: null
    },
    services: {
      server: 'OK',
      api: 'OK',
      routes: [
        '/api/auth',
        '/api/products',
        '/api/orders',
        '/api/users',
        '/api/admin',
        '/api/payments',
        '/api/designs',
        '/api/coupons',
        '/api/notifications'
      ]
    },
    dependencies: {
      mongoose: require('mongoose/package.json').version,
      express: require('express/package.json').version,
      cors: require('cors/package.json').version
    }
  };

  try {
    const dbState = mongoose.connection.readyState;
    const connection = mongoose.connection;

    detailedHealth.database.host = connection.host || 'unknown';
    detailedHealth.database.name = connection.name || 'unknown';

    switch (dbState) {
      case 0:
        detailedHealth.database.status = 'disconnected';
        detailedHealth.status = 'DEGRADED';
        break;
      case 1:
        detailedHealth.database.status = 'connected';
        detailedHealth.database.connected = true;
        await mongoose.connection.db.admin().ping();
        break;
      case 2:
        detailedHealth.database.status = 'connecting';
        detailedHealth.status = 'DEGRADED';
        break;
      case 3:
        detailedHealth.database.status = 'disconnecting';
        detailedHealth.status = 'DEGRADED';
        break;
      default:
        detailedHealth.database.status = 'unknown';
        detailedHealth.status = 'DEGRADED';
    }

    res.status(detailedHealth.status === 'OK' ? 200 : 503).json(detailedHealth);
  } catch (error) {
    detailedHealth.status = 'ERROR';
    detailedHealth.database.status = 'error';
    detailedHealth.database.error = error.message;

    res.status(503).json(detailedHealth);
  }
});

// Simple readiness probe
app.get('/api/ready', async (req, res) => {
  try {
    // Check if database is ready
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false, reason: 'Database not ready' });
    }
  } catch (error) {
    res.status(503).json({ ready: false, reason: error.message });
  }
});

// Simple liveness probe
app.get('/api/live', (req, res) => {
  res.status(200).json({ live: true });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inksoul');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error);
    console.log('Please make sure MongoDB is running or use MongoDB Atlas');
    // Don't exit in development, just log the error
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Connect to database
connectDB();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', err);
  server.close(() => {
    process.exit(1);
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
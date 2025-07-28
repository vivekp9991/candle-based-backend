const express = require('express');
const connectDB = require('../../config/database');
const { runBacktest } = require('./controllers/backtestController');

// Load environment variables
require('dotenv').config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(express.json());

// Add basic CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [Backtest Service] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', req.body);
  }
  next();
});

// Routes
app.post('/backtest', runBacktest);

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Backtesting Service',
    timestamp: new Date().toISOString(),
    database: 'Connected'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    service: 'Backtesting Service',
    availableRoutes: [
      'POST /backtest',
      'GET /health'
    ]
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('💥 Backtesting Service Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    service: 'Backtesting Service'
  });
});

const PORT = process.env.BACKTESTING_SERVICE_PORT || 3001;
app.listen(PORT, () => {
  console.log('');
  console.log('🔧 ================================');
  console.log(`🚀 Backtesting Service running on port ${PORT}`);
  console.log('🔧 ================================');
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`📊 Backtest: POST http://localhost:${PORT}/backtest`);
  console.log('📊 Strategy: Buy on red candles');
  console.log('🔧 ================================');
  console.log('');
});

module.exports = app;
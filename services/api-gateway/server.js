const express = require('express');
const app = express();

console.log('🚀 Starting API Gateway...');

// Enable JSON parsing
app.use(express.json());

// Add CORS headers manually (more reliable than cors package)
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
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'API Gateway is running',
    timestamp: new Date().toISOString(),
    port: 3000
  });
});

// Test endpoint
app.get('/api/v1/test', (req, res) => {
  res.json({ 
    message: 'API is working',
    endpoints: ['POST /api/v1/backtest'],
    timestamp: new Date().toISOString()
  });
});

// Backtest endpoint with full response data
app.post('/api/v1/backtest', (req, res) => {
  try {
    console.log('📊 Backtest request received:', req.body);
    
    const { ticker, timeframe, quantity, startDate, endDate } = req.body;
    
    // Validate required fields
    if (!ticker || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['ticker', 'startDate', 'endDate'],
        received: req.body
      });
    }

    const shares = parseInt(quantity) || 1;
    const basePrice = 22.58;
    const currentPrice = 23.2;
    
    // Calculate values based on quantity
    const totalInvestment = shares * basePrice;
    const totalValueToday = shares * currentPrice;
    const pnL = totalValueToday - totalInvestment;
    const pnLPercent = ((pnL / totalInvestment) * 100);
    
    // Full response matching your React app's expected format
    const response = {
      "pnL": parseFloat(pnL.toFixed(2)),
      "pnLPercent": parseFloat(pnLPercent.toFixed(2)),
      "pnLWithDividend": parseFloat((pnL + (64.75 * shares)).toFixed(2)),
      "pnLWithDividendPercent": parseFloat((((pnL + (64.75 * shares)) / totalInvestment) * 100).toFixed(2)),
      "totalDividend": parseFloat((64.75 * shares).toFixed(2)),
      "totalDivPercent": parseFloat(((64.75 * shares / totalInvestment) * 100).toFixed(2)),
      "lastDividendYield": 15.26,
      "ttmDividendYield": 14.01,
      "yieldOnCost": 15.68,
      "dividendFrequency": "monthly",
      "totalShares": shares,
      "totalInvestment": parseFloat(totalInvestment.toFixed(2)),
      "totalValueToday": parseFloat(totalValueToday.toFixed(2)),
      "averageCost": basePrice,
      "requestData": {
        ticker,
        timeframe: timeframe || '1D',
        quantity: shares,
        startDate,
        endDate,
        processedAt: new Date().toISOString()
      },
      "yearlyDividends": [
        {
          "year": 2024,
          "totalDividend": parseFloat((33.25 * shares).toFixed(2))
        },
        {
          "year": 2025,
          "totalDividend": parseFloat((31.5 * shares).toFixed(2))
        }
      ],
      "dividendHistory": [
        {
          "year": 2024,
          "frequency": "monthly",
          "totalAmount": parseFloat((3.07 * shares).toFixed(2)),
          "payments": [
            {"period": 1, "amount": parseFloat((0.268 * shares).toFixed(3)), "status": "paid", "label": "Jan"},
            {"period": 2, "amount": parseFloat((0.268 * shares).toFixed(3)), "status": "paid", "label": "Feb"},
            {"period": 3, "amount": parseFloat((0.268 * shares).toFixed(3)), "status": "paid", "label": "Mar"},
            {"period": 4, "amount": parseFloat((0.268 * shares).toFixed(3)), "status": "paid", "label": "Apr"},
            {"period": 5, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "May"},
            {"period": 6, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "Jun"},
            {"period": 7, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "Jul"},
            {"period": 8, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "Aug"},
            {"period": 9, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "Sep"},
            {"period": 10, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "Oct"},
            {"period": 11, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "Nov"},
            {"period": 12, "amount": parseFloat((0.25 * shares).toFixed(3)), "status": "paid", "label": "Dec"}
          ]
        },
        {
          "year": 2025,
          "frequency": "monthly",
          "totalAmount": parseFloat((2.02 * shares).toFixed(2)),
          "payments": [
            {"period": 1, "amount": parseFloat((0.295 * shares).toFixed(3)), "status": "paid", "label": "Jan"},
            {"period": 2, "amount": parseFloat((0.295 * shares).toFixed(3)), "status": "paid", "label": "Feb"},
            {"period": 3, "amount": parseFloat((0.295 * shares).toFixed(3)), "status": "paid", "label": "Mar"},
            {"period": 4, "amount": parseFloat((0.275 * shares).toFixed(3)), "status": "paid", "label": "Apr"},
            {"period": 5, "amount": parseFloat((0.295 * shares).toFixed(3)), "status": "paid", "label": "May"},
            {"period": 6, "amount": parseFloat((0.295 * shares).toFixed(3)), "status": "paid", "label": "Jun"},
            {"period": 7, "amount": parseFloat((0.268 * shares).toFixed(3)), "status": "upcoming", "label": "Jul"},
            {"period": 8, "amount": 0, "status": "pending", "label": "Aug"},
            {"period": 9, "amount": 0, "status": "pending", "label": "Sep"},
            {"period": 10, "amount": 0, "status": "pending", "label": "Oct"},
            {"period": 11, "amount": 0, "status": "pending", "label": "Nov"},
            {"period": 12, "amount": 0, "status": "pending", "label": "Dec"}
          ]
        }
      ]
    };

    console.log('✅ Sending backtest response for', ticker, 'with', shares, 'shares');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Backtest error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health',
      'GET /api/v1/test',
      'POST /api/v1/backtest'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('🎉 ================================');
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log('🎉 ================================');
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`🧪 Test: http://localhost:${PORT}/api/v1/test`);
  console.log(`📊 Backtest: POST http://localhost:${PORT}/api/v1/backtest`);
  console.log('🌐 CORS enabled for all origins');
  console.log('🎉 ================================');
  console.log('');
});

module.exports = app;
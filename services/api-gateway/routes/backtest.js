const express = require('express');
const axios = require('axios');
const router = express.Router();

// Backtesting service URL (adjust port as needed)
const BACKTEST_SERVICE_URL = process.env.BACKTEST_SERVICE_URL || 'http://localhost:3001';

// POST /api/v1/backtest
router.post('/backtest', async (req, res) => {
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

    // Forward request to backtesting service
    const response = await axios.post(`${BACKTEST_SERVICE_URL}/backtest`, {
      ticker,
      timeframe: timeframe || '1D',
      quantity: parseInt(quantity) || 1,
      startDate,
      endDate
    });

    console.log('✅ Backtest response:', response.data);
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Backtest error:', error.message);
    
    if (error.response) {
      // Backtesting service returned an error
      res.status(error.response.status).json({
        error: 'Backtesting service error',
        message: error.response.data?.message || error.message
      });
    } else {
      // Network or other error
      res.status(500).json({
        error: 'Internal server error',
        message: 'Could not connect to backtesting service'
      });
    }
  }
});

module.exports = router;
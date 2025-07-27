const express = require('express');
const router = express.Router();

// Import route modules
const backtestRoutes = require('./backtest');
// const marketDataRoutes = require('./market-data');
// const dividendRoutes = require('./dividends');

// Use routes
router.use('/', backtestRoutes);
// router.use('/', marketDataRoutes);
// router.use('/', dividendRoutes);

module.exports = router;
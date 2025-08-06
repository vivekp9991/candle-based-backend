const express = require('express');
const axios = require('axios');
const moment = require('moment');
const app = express();

console.log('🚀 Starting API Gateway with Dynamic Dividend Detection and NSE/BSE Support...');

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

// Function to transform ticker for Twelve Data API (Enhanced with NSE/BSE support)
function transformTicker(ticker) {
  // Ensure ticker is uppercase and a string
  const tickerUpper = String(ticker).toUpperCase();

  // Initialize API parameters with the original ticker
  let apiParams = { symbol: tickerUpper };

  // Handle TSX tickers (e.g., SHOP.TO)
  if (tickerUpper.endsWith('.TO')) {
    apiParams.symbol = tickerUpper.replace('.TO', '');
    apiParams.exchange = 'TSX';
    console.log(`🇨🇦 TSX ticker detected: ${ticker} -> symbol: ${apiParams.symbol}, exchange: ${apiParams.exchange}`);
  } 
  // Handle Indian tickers (e.g., NIFTY.IN or BSE:RELIANCE.IN)
  else if (tickerUpper.endsWith('.IN')) {
    apiParams.symbol = tickerUpper.replace('.IN', '');
    
    // Check for BSE prefix to differentiate BSE from NSE
    if (tickerUpper.startsWith('BSE:')) {
      apiParams.symbol = apiParams.symbol.replace('BSE:', '');
      apiParams.exchange = 'BSE';
      console.log(`🇮🇳 BSE ticker detected: ${ticker} -> symbol: ${apiParams.symbol}, exchange: ${apiParams.exchange}`);
    } else {
      apiParams.exchange = 'NSE';
      console.log(`🇮🇳 NSE ticker detected: ${ticker} -> symbol: ${apiParams.symbol}, exchange: ${apiParams.exchange}`);
    }
  } else {
    // Default case - assume US market if no specific exchange suffix
    console.log(`🇺🇸 Default/US ticker: ${ticker} -> symbol: ${apiParams.symbol}`);
  }

  return apiParams;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'API Gateway is running with Dynamic Dividend Detection and Multi-Exchange Support',
    timestamp: new Date().toISOString(),
    port: 3000,
    supportedExchanges: ['US', 'TSX (Canada)', 'NSE (India)', 'BSE (India)']
  });
});

// Test endpoint
app.get('/api/v1/test', (req, res) => {
  res.json({ 
    message: 'API is working with Dynamic Dividend Detection and Multi-Exchange Support',
    endpoints: ['POST /api/v1/backtest'],
    supportedTimeframes: ['1D', '1W', '1M', '3M', '6M', '1Y'],
    supportedExchanges: {
      'US': 'AAPL, MSFT, GOOGL',
      'TSX': 'SHOP.TO, RY.TO, CNQ.TO',
      'NSE': 'RELIANCE.IN, TCS.IN, INFY.IN',
      'BSE': 'BSE:RELIANCE.IN, BSE:TCS.IN'
    },
    timestamp: new Date().toISOString()
  });
});

// Get stock price data with proper timeframe interval (Enhanced with Multi-Exchange Support)
async function getStockPriceData(ticker, startDate, endDate, timeframe = '1D') {
  const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY || '91f9cba707bf4f819f72e7bc3f550e75';
  const baseURL = 'https://api.twelvedata.com';
  
  // Use the enhanced transformTicker function
  const apiParams = transformTicker(ticker);

  // Map timeframe to Twelve Data API interval
  const intervalMap = {
    '1D': '1day',
    '1W': '1week', 
    '1M': '1month',
    '3M': '3month',
    '6M': '6month',
    '1Y': '1year'
  };
  
  const apiInterval = intervalMap[timeframe] || '1day';
  
  // Adjust date range for weekly/monthly data to ensure we get enough data points
  let adjustedStartDate = startDate;
  let adjustedEndDate = endDate;
  
  if (timeframe === '1W') {
    // Get a bit more data for weekly candles
    adjustedStartDate = moment(startDate).subtract(2, 'weeks').format('YYYY-MM-DD');
    adjustedEndDate = moment(endDate).add(1, 'week').format('YYYY-MM-DD');
  } else if (timeframe === '1M') {
    // Get more data for monthly candles
    adjustedStartDate = moment(startDate).subtract(2, 'months').format('YYYY-MM-DD');
    adjustedEndDate = moment(endDate).add(1, 'month').format('YYYY-MM-DD');
  }

  const params = {
    ...apiParams,
    interval: apiInterval,
    start_date: adjustedStartDate,
    end_date: adjustedEndDate,
    apikey: TWELVEDATA_API_KEY,
    outputsize: 5000
  };

  try {
    console.log(`📊 Fetching ${timeframe} price data for ${ticker} from ${adjustedStartDate} to ${adjustedEndDate}...`);
    console.log(`🔗 API Params:`, params);
    
    const response = await axios.get(`${baseURL}/time_series`, { params });
    
    if (response.data.status === 'error') {
      console.error('❌ Price data API error:', response.data);
      return [];
    }

    const values = response.data.values || [];
    
    // Convert to our format and sort by date
    const candles = values
      .map(v => ({
        date: v.datetime,
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseInt(v.volume) || 0,
        timeframe: timeframe
      }))
      .filter(candle => candle.open && candle.close) // Valid price data
      .sort((a, b) => new Date(a.date) - new Date(b.date)); // Chronological order
    
    // Filter to exact user period
    const filteredCandles = candles.filter(candle => {
      const candleDate = moment(candle.date);
      return candleDate.isSameOrAfter(moment(startDate)) && candleDate.isSameOrBefore(moment(endDate));
    });
    
    console.log(`✅ Retrieved ${filteredCandles.length} ${timeframe} candles for backtesting (${candles.length} total fetched)`);
    return filteredCandles;
    
  } catch (error) {
    console.error('❌ Error fetching price data:', error.message);
    
    // Generate mock data based on timeframe
    console.log(`🔄 Generating mock ${timeframe} price data for backtesting...`);
    return generateMockPriceDataByTimeframe(startDate, endDate, timeframe, ticker);
  }
}

// Generate mock price data based on timeframe and ticker (Enhanced for Indian markets)
function generateMockPriceDataByTimeframe(startDate, endDate, timeframe, ticker) {
  const candles = [];
  const start = moment(startDate);
  const end = moment(endDate);
  
  // Set base price based on ticker type and exchange
  let currentPrice = 22.58; // Default for stocks
  
  if (ticker.includes('ETH') || ticker.includes('BTC')) {
    currentPrice = ticker.includes('ETH') ? 2250.58 : 45000; // Crypto prices
  } else if (ticker.toUpperCase().endsWith('.IN')) {
    // Indian stock prices (typically in INR)
    if (ticker.toUpperCase().includes('RELIANCE')) {
      currentPrice = 2450.75; // Reliance typical price
    } else if (ticker.toUpperCase().includes('TCS')) {
      currentPrice = 3850.50; // TCS typical price
    } else if (ticker.toUpperCase().includes('INFY')) {
      currentPrice = 1750.25; // Infosys typical price
    } else {
      currentPrice = 1500.00; // Default Indian stock price
    }
  } else if (ticker.toUpperCase().endsWith('.TO')) {
    // Canadian stock prices (typically in CAD)
    currentPrice = 85.50; // Default Canadian stock price
  }
  
  let current = start.clone();
  
  while (current.isSameOrBefore(end)) {
    // Generate realistic price movement based on timeframe and market
    let volatility, increment;
    
    // Adjust volatility for different markets
    let marketMultiplier = 1;
    if (ticker.toUpperCase().endsWith('.IN')) {
      marketMultiplier = 2; // Indian markets tend to be more volatile
    }
    
    switch (timeframe) {
      case '1D':
        volatility = ticker.includes('ETH') || ticker.includes('BTC') ? 50 : (0.5 * marketMultiplier);
        increment = { amount: 1, unit: 'day' };
        break;
      case '1W':
        volatility = ticker.includes('ETH') || ticker.includes('BTC') ? 150 : (1.5 * marketMultiplier);
        increment = { amount: 1, unit: 'week' };
        break;
      case '1M':
        volatility = ticker.includes('ETH') || ticker.includes('BTC') ? 300 : (3.0 * marketMultiplier);
        increment = { amount: 1, unit: 'month' };
        break;
      default:
        volatility = ticker.includes('ETH') || ticker.includes('BTC') ? 50 : (0.5 * marketMultiplier);
        increment = { amount: 1, unit: 'day' };
    }
    
    // Skip weekends for daily data (not applicable to crypto)
    if (timeframe === '1D' && (current.day() === 0 || current.day() === 6) && 
        !ticker.includes('ETH') && !ticker.includes('BTC')) {
      current.add(1, 'day');
      continue;
    }
    
    const change = (Math.random() - 0.5) * volatility;
    const open = currentPrice;
    const high = open + Math.random() * (volatility * 0.6);
    const low = open - Math.random() * (volatility * 0.6);
    const close = open + change;
    
    candles.push({
      date: current.format('YYYY-MM-DD'),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 100000) + 50000,
      timeframe: timeframe
    });
    
    currentPrice = close;
    current.add(increment.amount, increment.unit);
  }
  
  console.log(`🎲 Generated ${candles.length} mock ${timeframe} candles for ${ticker}`);
  return candles;
}

// Check for dividends dynamically by calling the dividend API (Enhanced with Multi-Exchange Support)
async function checkDividendData(ticker, startDate, endDate) {
  const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY || '91f9cba707bf4f819f72e7bc3f550e75';
  const baseURL = 'https://api.twelvedata.com';
  
  console.log(`🔍 Checking dividend data for ${ticker}...`);
  
  // Use the enhanced transformTicker function
  const apiParams = transformTicker(ticker);

  // Check a longer period to ensure we catch any dividends
  const extendedStartDate = moment(startDate).subtract(2, 'years').format('YYYY-MM-DD');
  const extendedEndDate = moment(endDate).format('YYYY-MM-DD');

  const params = {
    ...apiParams,
    start_date: extendedStartDate,
    end_date: extendedEndDate,
    apikey: TWELVEDATA_API_KEY
  };

  try {
    console.log(`🔗 Dividend API Params:`, params);
    const response = await axios.get(`${baseURL}/dividends`, { params });
    
    if (response.data.status === 'error') {
      console.log(`❌ Dividend API error for ${ticker}:`, response.data.message || 'Unknown error');
      return {
        hasDividends: false,
        dividends: [],
        reason: 'API error or asset does not pay dividends',
        frequency: 'none'
      };
    }

    const dividends = response.data.dividends || [];
    
    // Filter valid dividends
    const validDividends = dividends
      .filter(d => d.ex_date && d.amount && parseFloat(d.amount) > 0)
      .map(d => ({
        exDate: d.ex_date,
        payDate: d.payment_date,
        recordDate: d.record_date,
        amount: parseFloat(d.amount)
      }));

    console.log(`📊 Found ${validDividends.length} dividend payments for ${ticker}`);
    
    if (validDividends.length > 0) {
      console.log(`✅ ${ticker} pays dividends - showing dividend sections`);
      
      // Analyze frequency
      const frequencyAnalysis = analyzeDividendFrequency(validDividends);
      
      return {
        hasDividends: true,
        dividends: validDividends,
        reason: `Found ${validDividends.length} dividend payments`,
        frequency: frequencyAnalysis.frequency,
        confidence: frequencyAnalysis.confidence,
        frequencyReason: frequencyAnalysis.reason
      };
    } else {
      console.log(`❌ ${ticker} does not pay dividends - hiding dividend sections`);
      return {
        hasDividends: false,
        dividends: [],
        reason: 'No dividend payments found',
        frequency: 'none'
      };
    }
    
  } catch (error) {
    console.error(`❌ Error checking dividends for ${ticker}:`, error.message);
    return {
      hasDividends: false,
      dividends: [],
      reason: 'Failed to fetch dividend data',
      frequency: 'none'
    };
  }
}

// Analyze dividend frequency
function analyzeDividendFrequency(dividends) {
  if (!dividends || dividends.length < 2) {
    return {
      frequency: 'irregular',
      confidence: 'low',
      reason: 'Insufficient data to determine frequency'
    };
  }

  const sortedDividends = dividends.sort((a, b) => new Date(b.exDate) - new Date(a.exDate));
  const lastExDate = moment(sortedDividends[0].exDate);
  
  console.log(`📅 Analyzing frequency from ${dividends.length} payments, last ex-date: ${lastExDate.format('YYYY-MM-DD')}`);
  
  // Check for monthly frequency (at least 2 payments in last 35 days)
  const monthlyCheck = checkFrequency(sortedDividends, lastExDate, 35, 2, 'monthly');
  if (monthlyCheck.isMatch) {
    console.log('🎯 Detected MONTHLY frequency');
    return monthlyCheck;
  }
  
  // Check for quarterly frequency (at least 2 payments in last 100 days)
  const quarterlyCheck = checkFrequency(sortedDividends, lastExDate, 100, 2, 'quarterly');
  if (quarterlyCheck.isMatch) {
    console.log('🎯 Detected QUARTERLY frequency');
    return quarterlyCheck;
  }
  
  // Check for semi-annual frequency (at least 2 payments in last 200 days)
  const semiAnnualCheck = checkFrequency(sortedDividends, lastExDate, 200, 2, 'semi-annual');
  if (semiAnnualCheck.isMatch) {
    console.log('🎯 Detected SEMI-ANNUAL frequency');
    return semiAnnualCheck;
  }
  
  // Check for annual frequency (at least 1 payment in last 365 days)
  const annualCheck = checkFrequency(sortedDividends, lastExDate, 365, 1, 'annual');
  if (annualCheck.isMatch) {
    console.log('🎯 Detected ANNUAL frequency');
    return annualCheck;
  }
  
  // Default to quarterly if we can't determine
  console.log('⚠️ Could not determine frequency, defaulting to quarterly');
  return {
    frequency: 'quarterly',
    confidence: 'low',
    reason: 'Could not determine clear pattern, defaulting to quarterly',
    dataPoints: sortedDividends.length
  };
}

function checkFrequency(dividends, lastExDate, daysBack, minCount, frequencyType) {
  const cutoffDate = moment(lastExDate).subtract(daysBack, 'days');
  
  const dividendsInPeriod = dividends.filter(d => 
    moment(d.exDate).isAfter(cutoffDate) || moment(d.exDate).isSame(cutoffDate, 'day')
  );
  
  console.log(`📊 ${frequencyType.toUpperCase()} check: Found ${dividendsInPeriod.length} dividends in last ${daysBack} days (need ${minCount})`);
  
  const isMatch = dividendsInPeriod.length >= minCount;
  
  if (isMatch) {
    return {
      isMatch: true,
      frequency: frequencyType,
      confidence: 'high',
      reason: `Found ${dividendsInPeriod.length} payments in last ${daysBack} days`,
      dataPoints: dividendsInPeriod.length,
      daysAnalyzed: daysBack,
      payments: dividendsInPeriod.map(d => ({
        exDate: moment(d.exDate).format('YYYY-MM-DD'),
        amount: d.amount
      }))
    };
  }
  
  return { isMatch: false };
}

// Helper function to get payments per year based on frequency
function getPaymentsPerYear(frequency) {
  switch (frequency) {
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semi-annual': return 2;
    case 'annual': return 1;
    case 'irregular': return 4; // Default to quarterly for calculations
    default: return 4;
  }
}

// Calculate comprehensive stock metrics (for both dividend and non-dividend stocks)
function calculateStockMetrics(backtestResults, dividendCheck, currentPrice, totalShares, totalInvestment) {
  console.log(`📊 Calculating comprehensive stock metrics...`);
  
  const averageCost = backtestResults.averageCost;
  
  // Basic metrics (always available)
  const basicMetrics = {
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    averageBuyPrice: parseFloat(averageCost.toFixed(2)),
    totalShares: totalShares,
    totalInvestment: parseFloat(totalInvestment.toFixed(2)),
    currentValue: parseFloat((totalShares * currentPrice).toFixed(2))
  };
  
  // Dividend-specific metrics (only if stock pays dividends)
  let dividendMetrics = {
    dividendPerShare: 0,
    lastDividendYield: 0,
    ttmDividendYield: 0,
    yieldOnCost: 0,
    annualDividendPerShare: 0
  };
  
  if (dividendCheck.hasDividends && dividendCheck.dividends && dividendCheck.dividends.length > 0) {
    const dividends = dividendCheck.dividends;
    
    // Calculate dividend per share (most recent dividend amount)
    const mostRecentDividend = dividends[dividends.length - 1];
    const dividendPerShare = mostRecentDividend ? mostRecentDividend.amount : 0;
    
    // Calculate annual dividend per share based on frequency
    const paymentsPerYear = getPaymentsPerYear(dividendCheck.frequency);
    const annualDividendPerShare = dividendPerShare * paymentsPerYear;
    
    // Calculate Last Dividend Yield (annualized based on most recent dividend and frequency)
    const lastDividendYield = currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : 0;
    
    // Calculate TTM (Trailing Twelve Months) Dividend Yield
    const oneYearAgo = moment().subtract(12, 'months');
    const ttmDividends = dividends.filter(d => moment(d.exDate).isAfter(oneYearAgo));
    const ttmTotal = ttmDividends.reduce((sum, d) => sum + d.amount, 0);
    const ttmDividendYield = currentPrice > 0 ? (ttmTotal / currentPrice) * 100 : 0;
    
    // Calculate Yield on Cost using your formula: (dividend * 12 months) / Average cost
    // This uses the most recent dividend amount annualized
    const yieldOnCost = averageCost > 0 ? (annualDividendPerShare / averageCost) * 100 : 0;
    
    dividendMetrics = {
      dividendPerShare: parseFloat(dividendPerShare.toFixed(4)),
      lastDividendYield: parseFloat(lastDividendYield.toFixed(2)),
      ttmDividendYield: parseFloat(ttmDividendYield.toFixed(2)),
      yieldOnCost: parseFloat(yieldOnCost.toFixed(2)),
      annualDividendPerShare: parseFloat(annualDividendPerShare.toFixed(4))
    };
    
    console.log(`💎 Dividend Metrics Calculated:`);
    console.log(`   Most Recent Dividend per Share: $${dividendPerShare.toFixed(4)}`);
    console.log(`   Annual Dividend per Share: $${annualDividendPerShare.toFixed(4)} (${paymentsPerYear}x per year)`);
    console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
    console.log(`   Average Cost: $${averageCost.toFixed(2)}`);
    console.log(`   Last Dividend Yield: ${lastDividendYield.toFixed(2)}%`);
    console.log(`   TTM Dividend Yield: ${ttmDividendYield.toFixed(2)}% (${ttmDividends.length} payments)`);
    console.log(`   Yield on Cost: ${yieldOnCost.toFixed(2)}%`);
  } else {
    console.log(`📊 No dividends available - dividend metrics set to 0`);
  }
  
  return {
    ...basicMetrics,
    ...dividendMetrics
  };
}

// Updated backtest function with timeframe-aware logic
function backtestRedCandleStrategy(candles, quantityPerTrade, timeframe) {
  const transactions = [];
  let totalShares = 0;
  let totalInvestment = 0;
  
  console.log(`🎯 Backtesting red candle strategy with ${candles.length} ${timeframe} candles...`);
  console.log(`📈 Strategy: Buy ${quantityPerTrade} shares on each red ${timeframe} candle`);
  
  candles.forEach((candle, index) => {
    const isRedCandle = candle.open > candle.close;
    
    if (isRedCandle) {
      const cost = quantityPerTrade * candle.close;
      
      // Determine the trade date based on timeframe
      let tradeDate = candle.date;
      if (timeframe === '1W') {
        // For weekly candles, trade on the Friday of that week (or last trading day)
        tradeDate = moment(candle.date).endOf('isoWeek').subtract(2, 'days').format('YYYY-MM-DD');
      } else if (timeframe === '1M') {
        // For monthly candles, trade on the last trading day of the month
        tradeDate = moment(candle.date).endOf('month').format('YYYY-MM-DD');
      }
      
      transactions.push({
        date: tradeDate,
        candleDate: candle.date,
        action: 'BUY',
        quantity: quantityPerTrade,
        price: candle.close,
        cost: cost,
        candleType: 'red',
        timeframe: timeframe,
        candleIndex: index + 1
      });
      
      totalShares += quantityPerTrade;
      totalInvestment += cost;
      
      const candleTypeLabel = timeframe === '1D' ? 'daily' : timeframe === '1W' ? 'weekly' : 'monthly';
      console.log(`🔴 Red ${candleTypeLabel} candle on ${candle.date}: Buy ${quantityPerTrade} shares at $${candle.close}`);
    }
  });
  
  console.log(`📊 Backtest complete:`);
  console.log(`   - Red ${timeframe} candle periods: ${transactions.length}`);
  console.log(`   - Total shares purchased: ${totalShares}`);
  console.log(`   - Total investment: $${totalInvestment.toFixed(2)}`);
  console.log(`   - Average cost per share: $${(totalInvestment / totalShares || 0).toFixed(2)}`);
  
  return {
    transactions,
    totalShares,
    totalInvestment,
    redCandlePeriods: transactions.length,
    averageCost: totalInvestment / totalShares || 0,
    lastPrice: candles[candles.length - 1]?.close || 0,
    timeframe: timeframe
  };
}

// Generate dividend schedule for assets that pay dividends
function generateDividendSchedule(startDate, endDate, frequency, dividends) {
  if (!dividends || dividends.length === 0) {
    return [];
  }

  const schedule = [];
  const start = moment(startDate);
  const end = moment(endDate);
  
  console.log(`📅 Generating dividend schedule from ${startDate} to ${endDate} for ${frequency} frequency`);
  
  // Use actual dividend data to create schedule
  const filteredDividends = dividends.filter(d => {
    const exDate = moment(d.exDate);
    return exDate.isSameOrAfter(start) && exDate.isSameOrBefore(end);
  });
  
  filteredDividends.forEach(dividend => {
    schedule.push({
      exDate: dividend.exDate,
      payDate: dividend.payDate,
      amountPerShare: dividend.amount,
      year: moment(dividend.exDate).year(),
      period: frequency === 'monthly' ? moment(dividend.exDate).month() + 1 : moment(dividend.exDate).quarter()
    });
  });
  
  console.log(`📊 Generated ${schedule.length} dividend periods for ${frequency} frequency`);
  return schedule.sort((a, b) => new Date(a.exDate) - new Date(b.exDate));
}

function calculateSharesOwnedOnDate(transactions, targetDate) {
  let sharesOwned = 0;
  const target = new Date(targetDate);
  
  for (const transaction of transactions) {
    const transactionDate = new Date(transaction.date);
    
    // Only count transactions that occurred before or on the ex-date
    if (transactionDate <= target) {
      if (transaction.action === 'BUY') {
        sharesOwned += transaction.quantity;
      } else if (transaction.action === 'SELL') {
        sharesOwned -= transaction.quantity;
      }
    }
  }
  
  return sharesOwned;
}

// Calculate dividend income for assets that pay dividends
function calculateDividendIncome(transactions, dividends, startDate, endDate) {
  if (!dividends || dividends.length === 0) {
    console.log('📊 No dividends to calculate');
    return {
      totalDividendIncome: 0,
      dividendDetails: [],
      totalDividendPeriods: 0,
      periodsWithIncome: 0
    };
  }

  console.log(`💰 Calculating dividend income from ${dividends.length} dividend payments...`);
  
  // Sort transactions by date
  const sortedTransactions = transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Generate dividend schedule for the period
  const dividendSchedule = generateDividendSchedule(startDate, endDate, 'quarterly', dividends);
  
  let totalDividendIncome = 0;
  const dividendDetails = [];
  
  for (const dividend of dividendSchedule) {
    // Calculate how many shares were owned on this ex-date
    const sharesOwnedOnExDate = calculateSharesOwnedOnDate(sortedTransactions, dividend.exDate);
    const dividendIncome = sharesOwnedOnExDate * dividend.amountPerShare;
    
    totalDividendIncome += dividendIncome;
    
    const status = sharesOwnedOnExDate > 0 ? 
      (moment().isAfter(moment(dividend.exDate)) ? 'paid' : 'upcoming') : 
      'not_eligible';
    
    dividendDetails.push({
      exDate: dividend.exDate,
      payDate: dividend.payDate,
      amountPerShare: dividend.amountPerShare,
      sharesOwned: sharesOwnedOnExDate,
      totalIncome: dividendIncome,
      year: dividend.year,
      period: dividend.period,
      status: status
    });
    
    const statusEmoji = status === 'paid' ? '✅' : status === 'upcoming' ? '🔄' : '❌';
    console.log(`   ${statusEmoji} ${dividend.exDate}: ${sharesOwnedOnExDate} shares × ${dividend.amountPerShare} = ${dividendIncome.toFixed(2)} (${status})`);
  }
  
  console.log(`   💎 Total dividend income received: ${totalDividendIncome.toFixed(2)}`);
  
  return {
    totalDividendIncome,
    dividendDetails,
    totalDividendPeriods: dividendSchedule.length,
    periodsWithIncome: dividendDetails.filter(d => d.totalIncome > 0).length
  };
}

// Generate dividend history for assets that pay dividends
function generateDividendHistory(frequency, transactions, startDate, endDate, dividends) {
  if (!dividends || dividends.length === 0) {
    return {
      dividendHistory: [],
      totalDividendIncome: 0,
      dividendCalculation: {
        totalDividendIncome: 0,
        dividendDetails: [],
        totalDividendPeriods: 0,
        periodsWithIncome: 0
      }
    };
  }

  const history = [];
  const startMoment = moment(startDate);
  const endMoment = moment(endDate);
  const startYear = startMoment.year();
  const endYear = endMoment.year();
  
  console.log(`📅 Generating dividend history: ${startDate} to ${endDate}`);
  
  // Calculate dividend income
  const dividendCalculation = calculateDividendIncome(transactions, dividends, startDate, endDate);
  
  for (let year = startYear; year <= endYear; year++) {
    const yearStart = moment().year(year).startOf('year');
    const yearEnd = moment().year(year).endOf('year');
    const periodStart = moment.max(startMoment, yearStart);
    const periodEnd = moment.min(endMoment, yearEnd);
    
    if (periodStart.isAfter(periodEnd)) {
      continue;
    }
    
    // Get dividends for this year
    const yearDividends = dividendCalculation.dividendDetails.filter(d => 
      moment(d.exDate).year() === year
    );
    
    if (yearDividends.length > 0) {
      let payments = [];
      let totalAmount = 0;
      
      if (frequency === 'monthly') {
        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        for (let m = 0; m < 12; m++) {
          const monthDividends = yearDividends.filter(d => moment(d.exDate).month() === m);
          const monthlyAmount = monthDividends.reduce((sum, d) => sum + d.totalIncome, 0);
          const status = monthDividends.length > 0 ? monthDividends[0].status : 'pending';
          
          totalAmount += monthlyAmount;
          
          payments.push({
            period: m + 1,
            amount: parseFloat(monthlyAmount.toFixed(2)),
            status: status,
            label: labels[m]
          });
        }
      } else if (frequency === 'quarterly') {
        const labels = ['Q1', 'Q2', 'Q3', 'Q4'];
        
        for (let q = 1; q <= 4; q++) {
          const quarterDividends = yearDividends.filter(d => moment(d.exDate).quarter() === q);
          const quarterlyAmount = quarterDividends.reduce((sum, d) => sum + d.totalIncome, 0);
          const status = quarterDividends.length > 0 ? quarterDividends[0].status : 'pending';
          
          totalAmount += quarterlyAmount;
          
          payments.push({
            period: q,
            amount: parseFloat(quarterlyAmount.toFixed(2)),
            status: status,
            label: labels[q - 1]
          });
        }
      }
      
      history.push({
        year: year,
        frequency: frequency,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        payments: payments,
        periodStart: periodStart.format('YYYY-MM-DD'),
        periodEnd: periodEnd.format('YYYY-MM-DD'),
        periodsInYear: payments.length,
        periodsWithIncome: payments.filter(p => p.amount > 0).length
      });
    }
  }
  
  return {
    dividendHistory: history,
    totalDividendIncome: dividendCalculation.totalDividendIncome,
    dividendCalculation: dividendCalculation
  };
}

// Calculate dynamic dividend yields (DEPRECATED - replaced by calculateStockMetrics)
function calculateDividendYields(dividendCheck, currentPrice, backtestResults) {
  if (!dividendCheck.hasDividends || !dividendCheck.dividends || dividendCheck.dividends.length === 0) {
    return {
      lastDividendYield: 0,
      ttmDividendYield: 0,
      yieldOnCost: 0
    };
  }

  const dividends = dividendCheck.dividends;
  const averageCost = backtestResults.averageCost;
  
  // Calculate Last Dividend Yield (annualized based on most recent dividend and frequency)
  let lastDividendYield = 0;
  if (dividends.length > 0) {
    const mostRecentDividend = dividends[dividends.length - 1];
    const paymentsPerYear = getPaymentsPerYear(dividendCheck.frequency);
    const annualizedDividend = mostRecentDividend.amount * paymentsPerYear;
    lastDividendYield = currentPrice > 0 ? (annualizedDividend / currentPrice) * 100 : 0;
  }

  // Calculate TTM (Trailing Twelve Months) Dividend Yield
  let ttmDividendYield = 0;
  const oneYearAgo = moment().subtract(12, 'months');
  const ttmDividends = dividends.filter(d => moment(d.exDate).isAfter(oneYearAgo));
  const ttmTotal = ttmDividends.reduce((sum, d) => sum + d.amount, 0);
  ttmDividendYield = currentPrice > 0 ? (ttmTotal / currentPrice) * 100 : 0;

  // Calculate Yield on Cost (based on average purchase price)
  let yieldOnCost = 0;
  if (averageCost > 0) {
    if (ttmTotal > 0) {
      // Use TTM dividends if available
      yieldOnCost = (ttmTotal / averageCost) * 100;
    } else if (dividends.length > 0) {
      // Fallback to annualized most recent dividend
      const mostRecentDividend = dividends[dividends.length - 1];
      const paymentsPerYear = getPaymentsPerYear(dividendCheck.frequency);
      const annualizedDividend = mostRecentDividend.amount * paymentsPerYear;
      yieldOnCost = (annualizedDividend / averageCost) * 100;
    }
  }

  console.log(`💎 Dividend Yield Calculations:`);
  console.log(`   Current Price: ${currentPrice.toFixed(2)}`);
  console.log(`   Average Cost: ${averageCost.toFixed(2)}`);
  console.log(`   Most Recent Dividend: ${dividends.length > 0 ? dividends[dividends.length - 1].amount.toFixed(4) : 0}`);
  console.log(`   Frequency: ${dividendCheck.frequency} (${getPaymentsPerYear(dividendCheck.frequency)} payments/year)`);
  console.log(`   TTM Dividends: ${ttmTotal.toFixed(4)} (${ttmDividends.length} payments)`);
  console.log(`   Last Dividend Yield: ${lastDividendYield.toFixed(2)}%`);
  console.log(`   TTM Dividend Yield: ${ttmDividendYield.toFixed(2)}%`);
  console.log(`   Yield on Cost: ${yieldOnCost.toFixed(2)}%`);

  return {
    lastDividendYield: parseFloat(lastDividendYield.toFixed(2)),
    ttmDividendYield: parseFloat(ttmDividendYield.toFixed(2)),
    yieldOnCost: parseFloat(yieldOnCost.toFixed(2))
  };
}

// Updated main backtest endpoint with enhanced metrics and multi-exchange support
app.post('/api/v1/backtest', async (req, res) => {
  try {
    console.log('📊 Backtest request received:', req.body);
    
    const { ticker, timeframe = '1D', quantity, startDate, endDate } = req.body;
    
    if (!ticker || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['ticker', 'startDate', 'endDate'],
        received: req.body
      });
    }

    const quantityPerTrade = parseInt(quantity) || 10;
    
    // Detect exchange from ticker format
    let exchangeInfo = 'US Market (Default)';
    if (ticker.toUpperCase().endsWith('.TO')) {
      exchangeInfo = '🇨🇦 TSX (Toronto Stock Exchange)';
    } else if (ticker.toUpperCase().endsWith('.IN')) {
      if (ticker.toUpperCase().startsWith('BSE:')) {
        exchangeInfo = '🇮🇳 BSE (Bombay Stock Exchange)';
      } else {
        exchangeInfo = '🇮🇳 NSE (National Stock Exchange of India)';
      }
    }
    
    console.log(`🎯 Backtesting Strategy:`);
    console.log(`   - Ticker: ${ticker} (${exchangeInfo})`);
    console.log(`   - Timeframe: ${timeframe} candles`);
    console.log(`   - Period: ${startDate} to ${endDate}`);
    console.log(`   - Quantity per red ${timeframe} candle: ${quantityPerTrade} shares`);
    
    // Validate timeframe
    const validTimeframes = ['1D', '1W', '1M', '3M', '6M', '1Y'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        error: 'Invalid timeframe',
        validTimeframes: validTimeframes,
        received: timeframe
      });
    }
    
    // Step 1: Get historical price data
    console.log(`📈 Step 1: Fetching price data...`);
    const candles = await getStockPriceData(ticker, startDate, endDate, timeframe);
    
    if (candles.length === 0) {
      return res.status(400).json({
        error: 'No price data available',
        message: `Could not fetch ${timeframe} price data for ${ticker} in the period ${startDate} to ${endDate}. Please check ticker format and exchange support.`,
        supportedFormats: {
          'US': 'AAPL, MSFT, GOOGL',
          'Canada': 'SHOP.TO, RY.TO, CNQ.TO',
          'India NSE': 'RELIANCE.IN, TCS.IN, INFY.IN',
          'India BSE': 'BSE:RELIANCE.IN, BSE:TCS.IN'
        }
      });
    }
    
    // Step 2: Run backtest strategy
    console.log(`📊 Step 2: Running backtest strategy...`);
    const backtestResults = backtestRedCandleStrategy(candles, quantityPerTrade, timeframe);
    
    // Step 3: Check for dividends dynamically
    console.log(`💰 Step 3: Checking dividend data...`);
    const dividendCheck = await checkDividendData(ticker, startDate, endDate);
    
    // Calculate basic performance metrics
    const totalShares = backtestResults.totalShares;
    const totalInvestment = backtestResults.totalInvestment;
    const currentPrice = backtestResults.lastPrice;
    const totalValueToday = totalShares * currentPrice;
    const pnL = totalValueToday - totalInvestment;
    const pnLPercent = totalInvestment > 0 ? (pnL / totalInvestment) * 100 : 0;
    
    // Step 4: Calculate comprehensive stock metrics (for both dividend and non-dividend stocks)
    console.log(`📊 Step 4: Calculating comprehensive stock metrics...`);
    const stockMetrics = calculateStockMetrics(backtestResults, dividendCheck, currentPrice, totalShares, totalInvestment);
    
    // Calculate dividend income only if dividends exist
    let actualDividendIncome = 0;
    let dividendResults = { dividendHistory: [], totalDividendIncome: 0, dividendCalculation: null };
    let dividendFrequency = dividendCheck.frequency || 'none';
    let dividendFrequencyConfidence = dividendCheck.confidence || 'high';
    let dividendFrequencyReason = dividendCheck.reason || 'No dividends found';
    
    if (dividendCheck.hasDividends) {
      console.log(`✅ ${ticker} pays dividends - calculating dividend income...`);
      
      dividendResults = generateDividendHistory(
        dividendFrequency, 
        backtestResults.transactions, 
        startDate, 
        endDate,
        dividendCheck.dividends
      );
      
      actualDividendIncome = dividendResults.totalDividendIncome;
      dividendFrequencyConfidence = dividendCheck.confidence || 'medium';
      dividendFrequencyReason = dividendCheck.frequencyReason || `Estimated from dividend data`;
    } else {
      console.log(`❌ ${ticker} does not pay dividends - no dividend calculations`);
    }
    
    const pnLWithDividend = pnL + actualDividendIncome;
    const pnLWithDividendPercent = totalInvestment > 0 ? (pnLWithDividend / totalInvestment) * 100 : 0;
    const totalDivPercent = totalInvestment > 0 ? (actualDividendIncome / totalInvestment) * 100 : 0;
    
    // Generate yearly dividends based on actual ownership
    const yearlyDividends = [];
    if (dividendCheck.hasDividends) {
      for (const yearData of dividendResults.dividendHistory) {
        yearlyDividends.push({
          year: yearData.year,
          totalDividend: yearData.totalAmount,
          periodStart: yearData.periodStart,
          periodEnd: yearData.periodEnd,
          periodsInYear: yearData.periodsInYear,
          periodsWithIncome: yearData.periodsWithIncome,
          actualDividends: true
        });
      }
    }
    
    // Calculate period-specific metrics
    const periodDuration = moment(endDate).diff(moment(startDate), 'days') + 1;
    const monthsInPeriod = moment(endDate).diff(moment(startDate), 'months', true);
    
    const response = {
      // Basic P&L metrics
      "pnL": parseFloat(pnL.toFixed(2)),
      "pnLPercent": parseFloat(pnLPercent.toFixed(2)),
      "pnLWithDividend": parseFloat(pnLWithDividend.toFixed(2)),
      "pnLWithDividendPercent": parseFloat(pnLWithDividendPercent.toFixed(2)),
      
      // Enhanced stock metrics (available for all stocks)
      "currentPrice": stockMetrics.currentPrice,
      "averageBuyPrice": stockMetrics.averageBuyPrice,
      "totalShares": stockMetrics.totalShares,
      "totalInvestment": stockMetrics.totalInvestment,
      "totalValueToday": stockMetrics.currentValue,
      "averageCost": stockMetrics.averageBuyPrice, // Legacy compatibility
      
      // Exchange information
      "exchangeInfo": exchangeInfo,
      
      // Dividend metrics (only meaningful for dividend-paying stocks)
      "totalDividend": parseFloat(actualDividendIncome.toFixed(2)),
      "totalDivPercent": parseFloat(totalDivPercent.toFixed(2)),
      "dividendPerShare": stockMetrics.dividendPerShare,
      "annualDividendPerShare": stockMetrics.annualDividendPerShare,
      "lastDividendYield": stockMetrics.lastDividendYield,
      "ttmDividendYield": stockMetrics.ttmDividendYield,
      "yieldOnCost": stockMetrics.yieldOnCost,
      
      // Dividend detection results
      "hasDividends": dividendCheck.hasDividends,
      "dividendReason": dividendCheck.reason,
      "dividendFrequency": dividendFrequency,
      "dividendFrequencyConfidence": dividendFrequencyConfidence,
      "dividendFrequencyReason": dividendFrequencyReason,
      
      // Backtesting performance
      "redCandlePeriods": backtestResults.redCandlePeriods,
      "totalCandlePeriods": candles.length,
      "redCandleSuccessRate": parseFloat(((backtestResults.redCandlePeriods / candles.length) * 100).toFixed(2)),
      
      // Analysis period details
      "analysisPeriod": {
        "startDate": startDate,
        "endDate": endDate,
        "durationDays": periodDuration,
        "durationMonths": parseFloat(monthsInPeriod.toFixed(1)),
        "timeframe": timeframe,
        "actualDividendPeriods": dividendCheck.hasDividends ? dividendResults.dividendCalculation?.totalDividendPeriods || 0 : 0,
        "dividendPeriodsWithIncome": dividendCheck.hasDividends ? dividendResults.dividendCalculation?.periodsWithIncome || 0 : 0
      },
      
      // Request metadata
      "requestData": {
        ticker,
        timeframe: timeframe,
        quantity: quantityPerTrade,
        startDate,
        endDate,
        processedAt: new Date().toISOString(),
        backtestStrategy: `red_candle_buying_${timeframe}`,
        exchangeDetected: exchangeInfo,
        transactions: backtestResults.transactions.slice(0, 10),
        dividendCheckResult: dividendCheck
      },
      
      // Dividend history (only for dividend-paying stocks)
      "yearlyDividends": yearlyDividends,
      "dividendHistory": dividendCheck.hasDividends ? dividendResults.dividendHistory : [],
      "dividendCalculationDetails": dividendCheck.hasDividends ? dividendResults.dividendCalculation : null
    };

    const timeframeLabel = timeframe === '1D' ? 'daily' : timeframe === '1W' ? 'weekly' : timeframe === '1M' ? 'monthly' : timeframe;
    
    console.log('✅ Backtest Results Summary:');
    console.log(`   🌍 Exchange: ${exchangeInfo}`);
    console.log(`   📅 Analysis Period: ${startDate} to ${endDate} (${monthsInPeriod.toFixed(1)} months)`);
    console.log(`   📊 Timeframe: ${timeframe} (${timeframeLabel} candles)`);
    console.log(`   📈 Red ${timeframeLabel} candle periods: ${backtestResults.redCandlePeriods} out of ${candles.length} total periods`);
    console.log(`   🎯 Red candle success rate: ${response.redCandleSuccessRate}%`);
    console.log(`   💰 Total shares purchased: ${totalShares} shares`);
    console.log(`   💵 Total investment: $${totalInvestment.toFixed(2)}`);
    console.log(`   📊 Current price: $${stockMetrics.currentPrice}`);
    console.log(`   📊 Average buy price: $${stockMetrics.averageBuyPrice}`);
    console.log(`   📊 Current value: $${stockMetrics.currentValue}`);
    console.log(`   💹 P&L: $${pnL.toFixed(2)} (${pnLPercent.toFixed(2)}%)`);
    console.log(`   💎 Has dividends: ${dividendCheck.hasDividends}`);
    console.log(`   💎 Dividend reason: ${dividendCheck.reason}`);
    
    if (dividendCheck.hasDividends) {
      console.log(`   💎 Dividend per share: $${stockMetrics.dividendPerShare}`);
      console.log(`   💎 Annual dividend per share: $${stockMetrics.annualDividendPerShare}`);
      console.log(`   💎 Dividend income: $${actualDividendIncome.toFixed(2)}`);
      console.log(`   🎯 With dividends: $${pnLWithDividend.toFixed(2)} (${pnLWithDividendPercent.toFixed(2)}%)`);
      console.log(`   📊 Last Dividend Yield: ${stockMetrics.lastDividendYield}%`);
      console.log(`   📊 TTM Dividend Yield: ${stockMetrics.ttmDividendYield}%`);
      console.log(`   📊 Yield on Cost: ${stockMetrics.yieldOnCost}%`);
    }
    
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
  console.log('🎯 Dynamic Dividend Detection enabled');
  console.log('🌍 Multi-Exchange Support:');
  console.log('   🇺🇸 US Markets: AAPL, MSFT, GOOGL');
  console.log('   🇨🇦 TSX: SHOP.TO, RY.TO, CNQ.TO');
  console.log('   🇮🇳 NSE: RELIANCE.IN, TCS.IN, INFY.IN');
  console.log('   🇮🇳 BSE: BSE:RELIANCE.IN, BSE:TCS.IN');
  console.log('📋 Supported timeframes: 1D, 1W, 1M, 3M, 6M, 1Y');
  console.log('📈 Strategy: Buy X shares on each red candle period');
  console.log('💎 Dividend sections shown only if dividends found');
  console.log('💰 Enhanced stock metrics for all stocks');
  console.log('📊 Yield on Cost using (dividend * 12) / Average cost');
  console.log('🎉 ================================');
  console.log('');
});

module.exports = app;
const axios = require('axios');
const moment = require('moment-timezone');
const _ = require('lodash');
const { v4: uuid } = require('uuid');
const config = require('../../../config/config');
const Candle = require('../../../shared/models/Candle');
const Dividend = require('../../../shared/models/Dividend');
const SmartDividendFrequencyService = require('../../dividend-service/utils/smartFrequencyService');
const { resampleCandles } = require('../utils/resampleUtils');

const marketUrl = config.services.marketData.url;
const dividendUrl = config.services.dividend.url;
const transactionUrl = config.services.transaction.url;

async function getDailyCandles(ticker, startDate, endDate) {
  let candles = await Candle.find({
    ticker: ticker.toUpperCase(),
    timeframe: '1D',
    date: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ date: 1 });

  if (candles.length === 0) {
    const response = await axios.get(`${marketUrl}/candles`, {
      params: { ticker, startDate, endDate }
    });
    candles = response.data;
  }
  return candles;
}

async function getDividends(ticker, startDate, endDate) {
  let dividends = await Dividend.find({
    ticker: ticker.toUpperCase(),
    exDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ exDate: 1 });

  if (dividends.length === 0) {
    const response = await axios.get(`${dividendUrl}/dividends`, {
      params: { ticker, startDate, endDate }
    });
    dividends = response.data;
  }
  return dividends;
}

// Helper function to convert frequency to payments per year
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

async function runBacktest(req, res) {
  const { ticker, timeframe, quantity, startDate, endDate } = req.body;
  const start = startDate ? moment(startDate).toDate() : moment().subtract(5, 'years').toDate();
  const end = endDate ? moment(endDate).toDate() : moment().toDate();
  const sessionId = uuid();

  console.log(`🚀 Starting backtest for ${ticker} from ${startDate} to ${endDate}`);

  const dailyCandles = await getDailyCandles(ticker, start, end);

  if (dailyCandles.length === 0) {
    return res.status(404).json({ message: 'No data available for the symbol in the given period' });
  }

  let candles = timeframe === '1D' ? dailyCandles : resampleCandles(dailyCandles, timeframe);

  // Simulate buys
  let transactions = [];
  for (const candle of candles) {
    if (candle.open > candle.close) { // red candle
      const tx = {
        sessionId,
        ticker: ticker.toUpperCase(),
        transactionDate: candle.date,
        type: 'BUY',
        quantity,
        price: candle.close,
        totalCost: quantity * candle.close
      };
      await axios.post(`${transactionUrl}/transactions`, tx);
      transactions.push(tx);
    }
  }

  const dividends = await getDividends(ticker, start, end);

  // Get dividend frequency using smart analysis (analyzes 2+ years of data)
  console.log(`🔍 Analyzing dividend frequency for ${ticker}...`);
  const frequencyAnalysis = await SmartDividendFrequencyService.analyzeDividendFrequency(ticker, startDate, endDate);
  const dividendFrequency = frequencyAnalysis.frequency;
  const paymentsPerYear = getPaymentsPerYear(dividendFrequency);

  console.log(`🎯 Dividend frequency: ${dividendFrequency} (confidence: ${frequencyAnalysis.confidence})`);
  console.log(`📊 Payments per year: ${paymentsPerYear}`);

  // Calculations
  const totalShares = transactions.length * quantity;
  const totalInvestment = _.sumBy(transactions, 'totalCost');
  const lastClose = candles[candles.length - 1]?.close || 0;
  const totalValueToday = totalShares * lastClose;
  const pnL = totalValueToday - totalInvestment;

  // Dividend income with year-based grouping
  let totalDividend = 0;
  const yearlyDividendMap = {};
  const sortedTx = _.sortBy(transactions, 'transactionDate');
  let cumShares = 0;
  let txIndex = 0;
  for (const div of dividends) {
    while (txIndex < sortedTx.length && sortedTx[txIndex].transactionDate < div.exDate) {
      cumShares += sortedTx[txIndex].quantity;
      txIndex++;
    }
    const dividendIncome = cumShares * div.amount;
    totalDividend += dividendIncome;

    const year = moment(div.exDate).year();
    if (!yearlyDividendMap[year]) {
      yearlyDividendMap[year] = 0;
    }
    yearlyDividendMap[year] += dividendIncome;
  }
  const pnLWithDividend = pnL + totalDividend;

  // Generate years from start to end
  const years = [];
  for (let y = moment(start).year(); y <= moment(end).year(); y++) {
    years.push(y);
  }
  const yearlyDividends = years.map(year => ({
    year,
    totalDividend: yearlyDividendMap[year] || 0
  }));

  // Dividend yields using smart-detected frequency
  let lastDividendYield = 0;
  let ttmDividendYield = 0;
  let yieldOnCost = 0;
  if (dividends.length > 0) {
    const lastDiv = dividends[dividends.length - 1];
    const annualDiv = lastDiv.amount * paymentsPerYear;
    lastDividendYield = (annualDiv / lastClose) * 100;

    const oneYearAgo = moment(end).subtract(12, 'months').toDate();
    const ttmDivs = dividends.filter(d => d.exDate > oneYearAgo);
    const ttmSum = _.sumBy(ttmDivs, 'amount');
    ttmDividendYield = (ttmSum / lastClose) * 100;

    const avgCost = totalInvestment / totalShares || 0;
    yieldOnCost = (annualDiv / avgCost) * 100;
  }

  const totalDivPercent = (totalDividend / totalInvestment) * 100 || 0;
  const pnLPercent = (pnL / totalInvestment) * 100 || 0;
  const pnLWithDividendPercent = (pnLWithDividend / totalInvestment) * 100 || 0;
  const averageCost = totalInvestment / totalShares || 0;

  // Generate dividend history using smart-detected frequency
  const dividendHistory = generateDividendHistory(dividendFrequency, dividends, start, end);

  res.json({
    pnL,
    pnLPercent,
    pnLWithDividend,
    pnLWithDividendPercent,
    totalDividend,
    totalDivPercent,
    lastDividendYield,
    ttmDividendYield,
    yieldOnCost,
    dividendFrequency, // Smart-detected frequency
    dividendFrequencyConfidence: frequencyAnalysis.confidence,
    dividendFrequencyReason: frequencyAnalysis.reason,
    totalShares,
    totalInvestment,
    totalValueToday,
    averageCost,
    yearlyDividends,
    dividendHistory
  });
}

function generateDividendHistory(frequency, dividends, startDate, endDate) {
  const dividendHistory = [];
  const dividendGroups = _.groupBy(dividends, div => moment(div.exDate).year());
  const currentDate = moment();
  const startYear = moment(startDate).year();
  const endYear = moment(endDate).year();

  for (let y = startYear; y <= endYear; y++) {
    const yearDivs = dividendGroups[y] || [];
    
    let labels, totalAmount = 0, payments = [];
    
    if (frequency === 'monthly') {
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthGroups = _.groupBy(yearDivs, div => moment(div.exDate).month() + 1);
      const lastKnownAmount = dividends.length > 0 ? _.meanBy(dividends, 'amount') : 0;

      for (let m = 1; m <= 12; m++) {
        const monthDivs = monthGroups[m] || [];
        let amount = _.sumBy(monthDivs, 'amount');
        let status = 'paid';
        
        if (y > currentDate.year() || (y === currentDate.year() && m > currentDate.month() + 1)) {
          status = 'pending';
          amount = 0;
        } else if (y === currentDate.year() && m === currentDate.month() + 1) {
          status = 'upcoming';
          if (amount === 0) amount = lastKnownAmount; // Estimate for upcoming
        } else if (amount === 0 && y < currentDate.year()) {
          // Don't fill historical missing payments with estimates
          amount = 0;
        }
        
        totalAmount += amount;
        payments.push({ period: m, amount, status, label: labels[m - 1] });
      }
    } else if (frequency === 'quarterly') {
      labels = ['Q1', 'Q2', 'Q3', 'Q4'];
      const quarterGroups = _.groupBy(yearDivs, div => Math.floor(moment(div.exDate).month() / 3) + 1);
      
      for (let q = 1; q <= 4; q++) {
        const quarterDivs = quarterGroups[q] || [];
        let amount = _.sumBy(quarterDivs, 'amount');
        let status = 'paid';
        
        const currentQuarter = Math.floor(currentDate.month() / 3) + 1;
        if (y > currentDate.year() || (y === currentDate.year() && q > currentQuarter)) {
          status = 'pending';
          amount = 0;
        } else if (y === currentDate.year() && q === currentQuarter && amount === 0) {
          status = 'upcoming';
          amount = 0; // Don't estimate
        }
        
        totalAmount += amount;
        payments.push({ period: q, amount, status, label: labels[q - 1] });
      }
    } else if (frequency === 'semi-annual') {
      labels = ['H1', 'H2'];
      const halfGroups = _.groupBy(yearDivs, div => moment(div.exDate).month() < 6 ? 1 : 2);
      
      for (let h = 1; h <= 2; h++) {
        const halfDivs = halfGroups[h] || [];
        let amount = _.sumBy(halfDivs, 'amount');
        let status = 'paid';
        
        const currentHalf = currentDate.month() < 6 ? 1 : 2;
        if (y > currentDate.year() || (y === currentDate.year() && h > currentHalf)) {
          status = 'pending';
          amount = 0;
        } else if (y === currentDate.year() && h === currentHalf && amount === 0) {
          status = 'upcoming';
        }
        
        totalAmount += amount;
        payments.push({ period: h, amount, status, label: labels[h - 1] });
      }
    } else if (frequency === 'annual') {
      const amount = _.sumBy(yearDivs, 'amount');
      let status = 'paid';
      
      if (y > currentDate.year()) {
        status = 'pending';
      } else if (y === currentDate.year() && amount === 0) {
        status = 'upcoming';
      }
      
      totalAmount = amount;
      payments.push({ period: 1, amount, status, label: 'Annual' });
    } else if (frequency === 'irregular') {
      // For irregular dividends, just show actual payments
      yearDivs.forEach((div, index) => {
        const amount = div.amount;
        const status = moment(div.exDate).isBefore(currentDate) ? 'paid' : 'upcoming';
        totalAmount += amount;
        payments.push({ 
          period: index + 1, 
          amount, 
          status, 
          label: moment(div.exDate).format('MMM'),
          exDate: moment(div.exDate).format('YYYY-MM-DD')
        });
      });
    }

    dividendHistory.push({ 
      year: y, 
      frequency: frequency, 
      totalAmount: parseFloat(totalAmount.toFixed(2)), 
      payments 
    });
  }

  return dividendHistory;
}

module.exports = { runBacktest };
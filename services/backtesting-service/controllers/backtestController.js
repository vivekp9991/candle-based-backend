const axios = require('axios');
const moment = require('moment-timezone');
const _ = require('lodash');
const { v4: uuid } = require('uuid');
const config = require('../../../config/config');
const Candle = require('../../../shared/models/Candle');
const Dividend = require('../../../shared/models/Dividend');
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

async function runBacktest(req, res) {
  const { ticker, timeframe, quantity, startDate, endDate } = req.body;
  const start = startDate ? moment(startDate).toDate() : moment().subtract(5, 'years').toDate();
  const end = endDate ? moment(endDate).toDate() : moment().toDate();
  const sessionId = uuid();

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

    // Group by year
    const year = moment(div.exDate).year();
    if (!yearlyDividendMap[year]) {
      yearlyDividendMap[year] = 0;
    }
    yearlyDividendMap[year] += dividendIncome;
  }
  const pnLWithDividend = pnL + totalDividend;

  // Generate years from start to end, even if 0
  const years = [];
  for (let y = moment(start).year(); y <= moment(end).year(); y++) {
    years.push(y);
  }
  const yearlyDividends = years.map(year => ({
    year,
    totalDividend: yearlyDividendMap[year] || 0
  }));

  // Infer dividend frequency
  let dividendFrequency = 'quarterly';
  let paymentsPerYear = 4;
  if (dividends.length >= 2) {
    const sortedDivs = _.sortBy(dividends, 'exDate');
    let totalDays = 0;
    for (let i = 1; i < sortedDivs.length; i++) {
      totalDays += (sortedDivs[i].exDate - sortedDivs[i - 1].exDate) / (1000 * 60 * 60 * 24);
    }
    const avgDays = totalDays / (sortedDivs.length - 1);
    if (avgDays < 45) {
      dividendFrequency = 'monthly';
      paymentsPerYear = 12;
    } else if (avgDays < 135) {
      dividendFrequency = 'quarterly';
      paymentsPerYear = 4;
    } else if (avgDays < 225) {
      dividendFrequency = 'semi-annual';
      paymentsPerYear = 2;
    } else {
      dividendFrequency = 'annual';
      paymentsPerYear = 1;
    }
  }

  // Dividend yields
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

  // Updated dividendHistory for monthly-only data
  const dividendHistory = [];
  const dividendGroups = _.groupBy(dividends, div => moment(div.exDate).year());
  const currentDate = moment(); // Use current date
  const startYear = moment(start).year();
  const endYear = moment(end).year();

  for (let y = startYear; y <= endYear; y++) {
    const yearDivs = dividendGroups[y] || [];
    
    // Force monthly for current data
    const yearFrequency = 'monthly';
    const periodsPerYear = 12;
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let totalAmount = 0;
    const payments = [];
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
        amount = lastKnownAmount; // Estimate
      } else if (amount === 0 && y <= currentDate.year()) {
        amount = lastKnownAmount; // Fill past missing with average
      }
      
      totalAmount += amount;
      payments.push({ period: m, amount, status, label: labels[m - 1] });
    }

    dividendHistory.push({ year: y, frequency: yearFrequency, totalAmount, payments });
  }

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
    dividendFrequency,
    totalShares,
    totalInvestment,
    totalValueToday,
    averageCost,
    yearlyDividends,
    dividendHistory
  });
}

module.exports = { runBacktest };
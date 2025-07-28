const axios = require('axios');
const moment = require('moment');
const Dividend = require('../../../shared/models/Dividend');
const SmartDividendFrequencyService = require('../utils/smartFrequencyService');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

async function getDividends(req, res) {
  const { ticker, startDate, endDate } = req.query;
  let tickerUpper = ticker.toUpperCase();

  console.log(`📊 Getting dividends for ${tickerUpper} from ${startDate} to ${endDate}`);

  // Transform symbol for Twelve Data (e.g., AMAX.TO -> symbol=AMAX&exchange=TSX)
  let apiParams = { symbol: tickerUpper };
  if (tickerUpper.endsWith('.TO')) {
    apiParams.symbol = tickerUpper.replace('.TO', '');
    apiParams.exchange = 'TSX';
  }

  // Check database first for user-requested period
  let dividends = await Dividend.find({
    ticker: tickerUpper,
    exDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ exDate: 1 });

  if (dividends.length > 0) {
    console.log(`✅ Found ${dividends.length} dividends in database`);
    return res.json(dividends);
  }

  // Get dividend frequency using smart analysis (this will fetch 2+ years of data)
  const frequencyAnalysis = await SmartDividendFrequencyService.analyzeDividendFrequency(ticker, startDate, endDate);
  const dividendFrequency = frequencyAnalysis.frequency;
  
  console.log(`🎯 Determined dividend frequency: ${dividendFrequency} (confidence: ${frequencyAnalysis.confidence})`);

  // Now fetch dividends for the user-requested period
  const params = {
    ...apiParams,
    start_date: moment(startDate).format('YYYY-MM-DD'),
    end_date: moment(endDate).format('YYYY-MM-DD'),
    apikey: key
  };

  try {
    const response = await axios.get(`${baseURL}/dividends`, { params });
    console.log(`📈 Dividends API Response for user period:`, response.data);

    if (response.data.status === 'error') {
      console.error('❌ Dividends API error:', response.data);
      return res.json([]);
    }

    const divs = response.data.dividends || [];

    dividends = divs.map(d => ({
      ticker: tickerUpper,
      exDate: d.ex_date ? new Date(d.ex_date) : null,
      payDate: d.payment_date ? new Date(d.payment_date) : null,
      recordDate: d.record_date ? new Date(d.record_date) : null,
      amount: parseFloat(d.amount),
      frequency: dividendFrequency, // Use smart-detected frequency
      frequencyConfidence: frequencyAnalysis.confidence,
      frequencyReason: frequencyAnalysis.reason
    }));

    const validDividends = dividends.filter(d => d.exDate && !isNaN(d.exDate.getTime()) && d.amount > 0);

    if (validDividends.length > 0) {
      // Use upsert to avoid duplicates
      const bulkOps = validDividends.map(dividend => ({
        updateOne: {
          filter: { 
            ticker: dividend.ticker, 
            exDate: dividend.exDate 
          },
          update: { $set: dividend },
          upsert: true
        }
      }));

      await Dividend.bulkWrite(bulkOps);
      console.log(`💾 Saved ${validDividends.length} dividends to database`);
    }

    res.json(validDividends);
  } catch (error) {
    console.error('❌ Error fetching dividends from Twelve Data:', error.message);
    if (error.response) {
      console.error('API Error Response:', error.response.data);
    }
    res.json([]);  // Return empty on error
  }
}

// Export frequency analysis for use in backtesting
async function getDividendFrequencyOnly(ticker) {
  const frequencyAnalysis = await SmartDividendFrequencyService.analyzeDividendFrequency(ticker);
  return {
    frequency: frequencyAnalysis.frequency,
    confidence: frequencyAnalysis.confidence,
    reason: frequencyAnalysis.reason,
    dataPoints: frequencyAnalysis.dataPoints
  };
}

module.exports = { 
  getDividends,
  getDividendFrequencyOnly
};
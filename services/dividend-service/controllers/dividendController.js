const axios = require('axios');
const moment = require('moment');
const Dividend = require('../../../shared/models/Dividend');
const SmartDividendFrequencyService = require('../utils/smartFrequencyService');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

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

async function getDividends(req, res) {
  const { ticker, startDate, endDate } = req.query;
  let tickerUpper = ticker.toUpperCase();

  console.log(`📊 Getting dividends for ${tickerUpper} from ${startDate} to ${endDate}`);

  // Detect exchange from ticker format
  let exchangeInfo = 'US Market (Default)';
  if (tickerUpper.endsWith('.TO')) {
    exchangeInfo = '🇨🇦 TSX (Toronto Stock Exchange)';
  } else if (tickerUpper.endsWith('.IN')) {
    if (tickerUpper.startsWith('BSE:')) {
      exchangeInfo = '🇮🇳 BSE (Bombay Stock Exchange)';
    } else {
      exchangeInfo = '🇮🇳 NSE (National Stock Exchange of India)';
    }
  }

  console.log(`🌍 Exchange detected: ${exchangeInfo}`);

  // Use the enhanced transformTicker function
  const apiParams = transformTicker(ticker);

  // Check database first for user-requested period
  let dividends = await Dividend.find({
    ticker: tickerUpper,
    exDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ exDate: 1 });

  if (dividends.length > 0) {
    console.log(`✅ Found ${dividends.length} dividends in database for ${exchangeInfo}`);
    return res.json(dividends);
  }

  // Get dividend frequency using smart analysis (this will fetch 2+ years of data)
  console.log(`🔍 Analyzing dividend frequency for ${tickerUpper} on ${exchangeInfo}...`);
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

  console.log(`📡 Dividend API Request params for ${exchangeInfo}:`, params);

  try {
    const response = await axios.get(`${baseURL}/dividends`, { params });
    console.log(`📈 Dividends API Response for ${exchangeInfo} (user period):`, response.data);

    if (response.data.status === 'error') {
      console.error(`❌ Dividends API error for ${exchangeInfo}:`, response.data);
      
      // Provide exchange-specific guidance for dividend API errors
      if (tickerUpper.endsWith('.IN')) {
        console.log(`💡 Indian dividend data note:`);
        console.log(`   - Some Indian stocks may have limited dividend history in API`);
        console.log(`   - Try NSE format: RELIANCE.IN instead of BSE:RELIANCE.IN or vice versa`);
        console.log(`   - Dividend data availability varies by exchange`);
      } else if (tickerUpper.endsWith('.TO')) {
        console.log(`💡 TSX dividend data note:`);
        console.log(`   - Some Canadian stocks may have limited dividend history`);
        console.log(`   - Verify ticker format: SHOP.TO (correct) vs SHOP.TSX (incorrect)`);
      }
      
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
      frequencyReason: frequencyAnalysis.reason,
      exchange: exchangeInfo // Add exchange information to dividend record
    }));

    const validDividends = dividends.filter(d => d.exDate && !isNaN(d.exDate.getTime()) && d.amount > 0);

    console.log(`📊 Processed ${validDividends.length} valid dividends from ${divs.length} total records for ${exchangeInfo}`);

    if (validDividends.length > 0) {
      // Log dividend details for different exchanges
      console.log(`💰 Dividend summary for ${exchangeInfo}:`);
      validDividends.slice(0, 3).forEach((div, index) => {
        console.log(`   ${index + 1}. ${moment(div.exDate).format('YYYY-MM-DD')}: $${div.amount.toFixed(4)}`);
      });
      if (validDividends.length > 3) {
        console.log(`   ... and ${validDividends.length - 3} more dividends`);
      }

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
      console.log(`💾 Saved ${validDividends.length} dividends to database for ${exchangeInfo}`);
    } else {
      console.log(`📊 No valid dividends found for ${tickerUpper} on ${exchangeInfo}`);
      
      // Provide helpful information based on exchange
      if (tickerUpper.endsWith('.IN')) {
        console.log(`💡 Indian market dividend note:`);
        console.log(`   - Many Indian companies pay annual dividends`);
        console.log(`   - Some companies may not pay regular dividends`);
        console.log(`   - Check if company has dividend history on NSE/BSE websites`);
      } else if (tickerUpper.endsWith('.TO')) {
        console.log(`💡 Canadian market dividend note:`);
        console.log(`   - Many TSX companies pay quarterly or monthly dividends`);
        console.log(`   - REITs and dividend aristocrats are common dividend payers`);
      } else {
        console.log(`💡 US market dividend note:`);
        console.log(`   - Many US companies pay quarterly dividends`);
        console.log(`   - Growth stocks may not pay dividends`);
      }
    }

    res.json(validDividends);
  } catch (error) {
    console.error(`❌ Error fetching dividends from Twelve Data for ${exchangeInfo}:`, error.message);
    if (error.response) {
      console.error(`API Error Response for ${exchangeInfo}:`, error.response.data);
      
      // Provide exchange-specific error guidance
      if (error.response.status === 400) {
        if (tickerUpper.endsWith('.IN')) {
          console.log(`💡 Indian ticker API error guidance:`);
          console.log(`   - Verify ticker format: RELIANCE.IN (NSE) or BSE:RELIANCE.IN (BSE)`);
          console.log(`   - Some stocks may not be available on both exchanges`);
          console.log(`   - Try alternative exchange format if current one fails`);
        } else if (tickerUpper.endsWith('.TO')) {
          console.log(`💡 TSX ticker API error guidance:`);
          console.log(`   - Verify ticker format: RY.TO (correct) vs RY.TSX (incorrect)`);
          console.log(`   - Ensure the stock is listed on Toronto Stock Exchange`);
        }
      } else if (error.response.status === 429) {
        console.log(`⚠️ API rate limit reached for ${exchangeInfo}`);
        console.log(`   - Consider implementing request throttling`);
        console.log(`   - Wait before making additional requests`);
      }
    }
    res.json([]);  // Return empty on error
  }
}

// Export frequency analysis for use in backtesting (Enhanced with multi-exchange support)
async function getDividendFrequencyOnly(ticker) {
  console.log(`🔍 Getting dividend frequency analysis for ${ticker}...`);
  
  // Detect exchange for logging
  const tickerUpper = ticker.toUpperCase();
  let exchangeInfo = 'US Market';
  if (tickerUpper.endsWith('.TO')) {
    exchangeInfo = 'TSX';
  } else if (tickerUpper.endsWith('.IN')) {
    exchangeInfo = tickerUpper.startsWith('BSE:') ? 'BSE' : 'NSE';
  }
  
  console.log(`📊 Analyzing ${exchangeInfo} dividend frequency for ${ticker}...`);
  
  const frequencyAnalysis = await SmartDividendFrequencyService.analyzeDividendFrequency(ticker);
  
  console.log(`✅ Frequency analysis complete for ${exchangeInfo}:`, {
    frequency: frequencyAnalysis.frequency,
    confidence: frequencyAnalysis.confidence,
    dataPoints: frequencyAnalysis.dataPoints
  });
  
  return {
    frequency: frequencyAnalysis.frequency,
    confidence: frequencyAnalysis.confidence,
    reason: frequencyAnalysis.reason,
    dataPoints: frequencyAnalysis.dataPoints,
    exchange: exchangeInfo
  };
}

module.exports = { 
  getDividends,
  getDividendFrequencyOnly
};
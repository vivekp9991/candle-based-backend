const axios = require('axios');
const moment = require('moment');
const Candle = require('../../../shared/models/Candle');
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

async function getCandles(req, res) {
  let { ticker, startDate, endDate, timeframe } = req.query;
  ticker = ticker.toUpperCase();
  timeframe = timeframe || '1D';

  console.log(`🔍 Market Data Request: ${ticker} from ${startDate} to ${endDate} (${timeframe})`);

  // Detect exchange from ticker format
  let exchangeInfo = 'US Market (Default)';
  if (ticker.endsWith('.TO')) {
    exchangeInfo = '🇨🇦 TSX (Toronto Stock Exchange)';
  } else if (ticker.endsWith('.IN')) {
    if (ticker.startsWith('BSE:')) {
      exchangeInfo = '🇮🇳 BSE (Bombay Stock Exchange)';
    } else {
      exchangeInfo = '🇮🇳 NSE (National Stock Exchange of India)';
    }
  }

  console.log(`🌍 Exchange detected: ${exchangeInfo}`);

  // Always fetch daily data from TwelveData, then resample if needed
  const apiInterval = '1day';

  // Use the enhanced transformTicker function
  const apiParams = transformTicker(ticker);

  // Check database first
  let candles = await Candle.find({
    ticker,
    timeframe: '1D', // Always store as daily in DB
    date: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ date: 1 });

  console.log(`💾 Found ${candles.length} daily candles in database`);

  if (candles.length > 0) {
    // Check if we have sufficient data (at least 80% of expected trading days)
    const daysDiff = moment(endDate).diff(moment(startDate), 'days');
    
    // Adjust expected trading days based on exchange
    let tradingDayRatio = 0.7; // Default for US/Canadian markets
    if (ticker.endsWith('.IN')) {
      // Indian markets typically have different trading patterns
      tradingDayRatio = 0.65; // Account for different holidays
    }
    
    const expectedTradingDays = Math.floor(daysDiff * tradingDayRatio);
    const dataCompleteness = candles.length / expectedTradingDays;
    
    console.log(`📊 Data completeness: ${candles.length}/${expectedTradingDays} = ${(dataCompleteness * 100).toFixed(1)}%`);
    console.log(`📈 Trading day ratio used: ${(tradingDayRatio * 100).toFixed(1)}% for ${exchangeInfo}`);
    
    if (dataCompleteness >= 0.8) {
      console.log(`✅ Using cached data (sufficient coverage)`);
      return res.json(candles);
    } else {
      console.log(`⚠️  Insufficient data coverage, fetching from API`);
    }
  }

  // Fetch from TwelveData API
  console.log(`🌐 Fetching from TwelveData API for ${exchangeInfo}...`);
  
  const params = {
    ...apiParams,
    interval: apiInterval,
    start_date: moment(startDate).format('YYYY-MM-DD'),
    end_date: moment(endDate).format('YYYY-MM-DD'),
    apikey: key,
    outputsize: 5000, // Maximum allowed
    order: 'ASC' // Oldest first
  };

  console.log(`📡 API Request params:`, params);

  try {
    const response = await axios.get(`${baseURL}/time_series`, { 
      params,
      timeout: 30000 // 30 second timeout for large requests
    });
    
    console.log(`📥 TwelveData API Response Status:`, response.data.status);
    console.log(`📊 Raw API Response Sample:`, {
      meta: response.data.meta,
      valueCount: response.data.values?.length || 0
    });

    if (response.data.status !== 'ok') {
      console.error(`❌ API returned non-ok status for ${exchangeInfo}:`, response.data);
      
      // If API fails but we have some cached data, use it
      if (candles.length > 0) {
        console.log(`🔄 Falling back to cached data (${candles.length} candles)`);
        return res.json(candles);
      }
      
      return res.json([]);
    }

    if (!response.data.values || response.data.values.length === 0) {
      console.error(`❌ No values returned from API for ${exchangeInfo}`);
      
      // Check if it's an unsupported ticker format and provide helpful message
      if (ticker.endsWith('.IN')) {
        console.log(`💡 Tip: For Indian stocks, try formats like:`);
        console.log(`   - NSE: RELIANCE.IN, TCS.IN, INFY.IN`);
        console.log(`   - BSE: BSE:RELIANCE.IN, BSE:TCS.IN`);
      }
      
      return res.json(candles); // Return cached data if available
    }

    // Process API response
    const values = response.data.values;
    console.log(`📈 Processing ${values.length} candles from ${exchangeInfo}...`);

    // TwelveData returns newest first, we need oldest first
    const sortedValues = values.reverse();
    
    const newCandles = sortedValues.map((v, index) => {
      const candle = {
        ticker,
        date: new Date(v.datetime),
        timeframe: '1D',
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: v.volume && !isNaN(parseInt(v.volume)) ? parseInt(v.volume) : 0
      };
      
      // Log first few candles for debugging
      if (index < 3) {
        console.log(`📊 Sample candle ${index + 1} (${exchangeInfo}):`, {
          date: moment(candle.date).format('YYYY-MM-DD'),
          open: candle.open,
          close: candle.close,
          volume: candle.volume
        });
      }
      
      return candle;
    });

    console.log(`💾 Saving ${newCandles.length} candles to database...`);

    // Use bulkWrite with upsert to avoid duplicates
    const bulkOps = newCandles.map(candle => ({
      updateOne: {
        filter: { 
          ticker: candle.ticker, 
          date: candle.date, 
          timeframe: candle.timeframe 
        },
        update: { $set: candle },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) {
      const bulkResult = await Candle.bulkWrite(bulkOps);
      console.log(`✅ Bulk write result for ${exchangeInfo}:`, {
        inserted: bulkResult.upsertedCount,
        modified: bulkResult.modifiedCount,
        matched: bulkResult.matchedCount
      });
    }

    // Re-query database to get the final dataset
    candles = await Candle.find({
      ticker,
      timeframe: '1D',
      date: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).sort({ date: 1 });

    console.log(`📊 Final result: ${candles.length} daily candles from ${exchangeInfo}`);
    console.log(`📅 Date range: ${moment(candles[0]?.date).format('YYYY-MM-DD')} to ${moment(candles[candles.length - 1]?.date).format('YYYY-MM-DD')}`);

    res.json(candles);

  } catch (error) {
    console.error(`❌ TwelveData API Error for ${exchangeInfo}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    // Provide exchange-specific error guidance
    if (error.response?.status === 400 && ticker.endsWith('.IN')) {
      console.log(`💡 Indian stock API error. Please verify ticker format:`);
      console.log(`   - Correct NSE format: RELIANCE.IN (not RELIANCE.NS)`);
      console.log(`   - Correct BSE format: BSE:RELIANCE.IN`);
    } else if (error.response?.status === 400 && ticker.endsWith('.TO')) {
      console.log(`💡 TSX stock API error. Please verify ticker format:`);
      console.log(`   - Correct TSX format: SHOP.TO (Toronto Stock Exchange)`);
    }

    // If API fails but we have cached data, use it
    if (candles.length > 0) {
      console.log(`🔄 API failed, using ${candles.length} cached candles from ${exchangeInfo}`);
      return res.json(candles);
    }

    // Return empty array rather than throwing
    console.log(`💥 No data available for ${exchangeInfo}, returning empty array`);
    res.json([]);
  }
}

module.exports = { getCandles };
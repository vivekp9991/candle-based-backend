const axios = require('axios');
const moment = require('moment');
const Candle = require('../../../shared/models/Candle');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

async function getCandles(req, res) {
  let { ticker, startDate, endDate, timeframe } = req.query;
  ticker = ticker.toUpperCase();
  timeframe = timeframe || '1D';

  console.log(`🔍 Market Data Request: ${ticker} from ${startDate} to ${endDate} (${timeframe})`);

  // Always fetch daily data from TwelveData, then resample if needed
  const apiInterval = '1day';

  // Transform symbol for Twelve Data API
  let apiParams = { symbol: ticker };
  if (ticker.endsWith('.TO')) {
    apiParams.symbol = ticker.replace('.TO', '');
    apiParams.exchange = 'TSX';
  }

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
    const expectedTradingDays = Math.floor(daysDiff * 0.7); // ~70% of days are trading days
    const dataCompleteness = candles.length / expectedTradingDays;
    
    console.log(`📊 Data completeness: ${candles.length}/${expectedTradingDays} = ${(dataCompleteness * 100).toFixed(1)}%`);
    
    if (dataCompleteness >= 0.8) {
      console.log(`✅ Using cached data (sufficient coverage)`);
      return res.json(candles);
    } else {
      console.log(`⚠️  Insufficient data coverage, fetching from API`);
    }
  }

  // Fetch from TwelveData API
  console.log(`🌐 Fetching from TwelveData API...`);
  
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
      console.error('❌ API returned non-ok status:', response.data);
      
      // If API fails but we have some cached data, use it
      if (candles.length > 0) {
        console.log(`🔄 Falling back to cached data (${candles.length} candles)`);
        return res.json(candles);
      }
      
      return res.json([]);
    }

    if (!response.data.values || response.data.values.length === 0) {
      console.error('❌ No values returned from API');
      return res.json(candles); // Return cached data if available
    }

    // Process API response
    const values = response.data.values;
    console.log(`📈 Processing ${values.length} candles from API...`);

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
        console.log(`📊 Sample candle ${index + 1}:`, {
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
      console.log(`✅ Bulk write result:`, {
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

    console.log(`📊 Final result: ${candles.length} daily candles`);
    console.log(`📅 Date range: ${moment(candles[0]?.date).format('YYYY-MM-DD')} to ${moment(candles[candles.length - 1]?.date).format('YYYY-MM-DD')}`);

    res.json(candles);

  } catch (error) {
    console.error('❌ TwelveData API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    // If API fails but we have cached data, use it
    if (candles.length > 0) {
      console.log(`🔄 API failed, using ${candles.length} cached candles`);
      return res.json(candles);
    }

    // Return empty array rather than throwing
    console.log(`💥 No data available, returning empty array`);
    res.json([]);
  }
}

module.exports = { getCandles };
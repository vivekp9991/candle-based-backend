const axios = require('axios');
const moment = require('moment');
const Candle = require('../../../shared/models/Candle');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

async function getCandles(req, res) {
  let { ticker, startDate, endDate, timeframe } = req.query;
  ticker = ticker.toUpperCase();
  timeframe = timeframe || '1D'; // Default to 1D if not provided

  // Map timeframe to API interval
  const intervalMap = {
    '1D': '1day',
    '1W': '1week',
    '1M': '1month'
  };
  const apiInterval = intervalMap[timeframe] || '1day';

  // Transform symbol for Twelve Data (e.g., AMAX.TO -> symbol=AMAX&exchange=TSX)
  let apiParams = { symbol: ticker };
  if (ticker.endsWith('.TO')) {
    apiParams.symbol = ticker.replace('.TO', '');
    apiParams.exchange = 'TSX';
  }

  let candles = await Candle.find({
    ticker,
    timeframe,
    date: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ date: 1 });

  if (candles.length > 0) {
    return res.json(candles);
  }

  const params = {
    ...apiParams,
    interval: apiInterval,
    start_date: moment(startDate).format('YYYY-MM-DD'),
    end_date: moment(endDate).format('YYYY-MM-DD'),
    apikey: key,
    outputsize: 5000
  };

  try {
    const response = await axios.get(`${baseURL}/time_series`, { params });
    console.log('Twelve Data API time_series Response:', response.data);  // For debugging

    if (response.data.status !== 'ok') {
      console.error('API returned non-ok status:', response.data);
      return res.json([]);  // Return empty array instead of throwing
    }

    const values = response.data.values.reverse(); // Ascending order
    const newCandles = values.map(v => ({
      ticker,
      date: new Date(v.datetime),
      timeframe,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: Number.isNaN(parseInt(v.volume)) ? 0 : parseInt(v.volume) // Handle NaN by setting to 0
    }));

    // Use bulkWrite with upsert to avoid duplicate key errors
    const bulkOps = newCandles.map(candle => ({
      updateOne: {
        filter: { ticker: candle.ticker, date: candle.date, timeframe: candle.timeframe },
        update: { $set: candle },
        upsert: true
      }
    }));

    await Candle.bulkWrite(bulkOps);

    // Re-query the DB for the range after upsert
    candles = await Candle.find({
      ticker,
      timeframe,
      date: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).sort({ date: 1 });

    res.json(candles);
  } catch (error) {
    console.error('Error fetching from Twelve Data:', error.message);
    res.json([]);  // Return empty on any error
  }
}

module.exports = { getCandles };
const moment = require('moment-timezone');
const _ = require('lodash');

function resampleCandles(dailyCandles, timeframe) {
  if (!dailyCandles || dailyCandles.length === 0) {
    return [];
  }

  const sorted = _.sortBy(dailyCandles, 'date');
  console.log(`🔄 Resampling ${sorted.length} daily candles to ${timeframe}`);

  let groups = {};

  sorted.forEach(candle => {
    let key;
    const candleDate = moment(candle.date);
    
    if (timeframe === '1W') {
      // Group by ISO week (Monday to Sunday)
      key = candleDate.clone().startOf('isoWeek').format('YYYY-MM-DD');
    } else if (timeframe === '1M') {
      // Group by month
      key = candleDate.clone().startOf('month').format('YYYY-MM-DD');
    } else if (timeframe === '3M') {
      // Group by quarter
      const quarter = Math.floor(candleDate.month() / 3);
      key = candleDate.clone().month(quarter * 3).startOf('month').format('YYYY-MM-DD');
    } else if (timeframe === '6M') {
      // Group by half-year
      const half = Math.floor(candleDate.month() / 6);
      key = candleDate.clone().month(half * 6).startOf('month').format('YYYY-MM-DD');
    } else if (timeframe === '1Y') {
      // Group by year
      key = candleDate.clone().startOf('year').format('YYYY-MM-DD');
    } else {
      // Default to daily
      key = candleDate.format('YYYY-MM-DD');
    }
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(candle);
  });

  const resampled = [];
  const sortedKeys = Object.keys(groups).sort();

  sortedKeys.forEach(key => {
    const group = groups[key];
    if (group.length > 0) {
      // Sort candles within the group by date
      const sortedGroup = _.sortBy(group, 'date');
      
      // Create resampled candle using OHLC logic
      const resampledCandle = {
        ticker: group[0].ticker,
        date: sortedGroup[sortedGroup.length - 1].date, // Use last date in period for transaction date
        timeframe: timeframe,
        open: sortedGroup[0].open, // First candle's open
        high: _.maxBy(sortedGroup, 'high').high, // Highest high in period
        low: _.minBy(sortedGroup, 'low').low, // Lowest low in period
        close: sortedGroup[sortedGroup.length - 1].close, // Last candle's close
        volume: _.sumBy(sortedGroup, 'volume') // Sum of all volumes
      };
      
      resampled.push(resampledCandle);
    }
  });

  console.log(`✅ Resampled to ${resampled.length} ${timeframe} candles`);
  
  // Log some sample data for verification
  if (resampled.length > 0) {
    console.log(`📊 Sample ${timeframe} candle:`, {
      date: moment(resampled[0].date).format('YYYY-MM-DD'),
      open: resampled[0].open,
      high: resampled[0].high,
      low: resampled[0].low,
      close: resampled[0].close,
      isRed: resampled[0].open > resampled[0].close
    });
  }

  return resampled;
}

module.exports = { resampleCandles };
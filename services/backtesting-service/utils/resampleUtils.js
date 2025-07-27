const moment = require('moment-timezone');
const _ = require('lodash');

function resampleCandles(dailyCandles, timeframe) {
  const sorted = _.sortBy(dailyCandles, 'date');
  const groups = {};

  sorted.forEach(candle => {
    let key;
    if (timeframe === '1W') {
      key = moment(candle.date).startOf('isoWeek').format('YYYY-MM-DD');
    } else if (timeframe === '1M') {
      key = moment(candle.date).startOf('month').format('YYYY-MM-DD');
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(candle);
  });

  const resampled = [];
  Object.keys(groups).forEach(key => {
    const group = groups[key];
    if (group.length > 0) {
      resampled.push({
        open: group[0].open,
        high: _.maxBy(group, 'high').high,
        low: _.minBy(group, 'low').low,
        close: group[group.length - 1].close,
        volume: _.sumBy(group, 'volume'),
        date: group[group.length - 1].date, // End of period for transaction date
        timeframe
      });
    }
  });
  return resampled;
}

module.exports = { resampleCandles };
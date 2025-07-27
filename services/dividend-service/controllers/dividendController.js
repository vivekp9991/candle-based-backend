const axios = require('axios');
const moment = require('moment');
const Dividend = require('../../../shared/models/Dividend');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

async function getDividends(req, res) {
  const { ticker, startDate, endDate } = req.query;
  let tickerUpper = ticker.toUpperCase();

  // Transform symbol for Twelve Data (e.g., AMAX.TO -> symbol=AMAX&exchange=TSX)
  let apiParams = { symbol: tickerUpper };
  if (tickerUpper.endsWith('.TO')) {
    apiParams.symbol = tickerUpper.replace('.TO', '');
    apiParams.exchange = 'TSX';
  }

  let dividends = await Dividend.find({
    ticker: tickerUpper,
    exDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
  }).sort({ exDate: 1 });

  if (dividends.length > 0) {
    return res.json(dividends);
  }

  const params = {
    ...apiParams,
    start_date: moment(startDate).format('YYYY-MM-DD'),
    end_date: moment(endDate).format('YYYY-MM-DD'),
    apikey: key
  };

  try {
    const response = await axios.get(`${baseURL}/dividends`, { params });
    console.log('Twelve Data API Response:', response.data);  // For debugging

    const divs = response.data.dividends || [];

    dividends = divs.map(d => ({
      ticker: tickerUpper,
      exDate: d.ex_date ? new Date(d.ex_date) : null,
      payDate: d.payment_date ? new Date(d.payment_date) : null,
      recordDate: d.record_date ? new Date(d.record_date) : null,
      amount: parseFloat(d.amount),
      frequency: 'quarterly' // Default
    }));

    const validDividends = dividends.filter(d => d.exDate && !isNaN(d.exDate.getTime()) && d.amount > 0);

    if (validDividends.length > 0) {
      await Dividend.insertMany(validDividends);
    }

    res.json(validDividends);
  } catch (error) {
    console.error('Error fetching dividends from Twelve Data:', error.message);
    res.json([]);  // Return empty on error
  }
}

module.exports = { getDividends };
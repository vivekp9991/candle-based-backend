const express = require('express');
const axios = require('axios');
const config = require('../../../config/config');

const router = express.Router();

router.post('/backtest', async (req, res) => {
  try {
    const response = await axios.post(`${config.services.backtesting.url}/backtest`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({ error: error.message });
  }
});

module.exports = router;
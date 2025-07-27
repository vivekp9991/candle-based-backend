const express = require('express');
const connectDB = require('../../config/database');
require('dotenv').config();
connectDB();

const app = express();
app.use(express.json());

app.get('/candles', require('./controllers/marketController').getCandles);

app.get('/health', (req, res) => res.send('OK'));

const port = process.env.MARKET_DATA_SERVICE_PORT || 3002;
app.listen(port, () => console.log(`Market Data service listening on port ${port}`));
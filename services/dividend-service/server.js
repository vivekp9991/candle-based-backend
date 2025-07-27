const express = require('express');
const connectDB = require('../../config/database');
require('dotenv').config();
connectDB();

const app = express();
app.use(express.json());

app.get('/dividends', require('./controllers/dividendController').getDividends);

app.get('/health', (req, res) => res.send('OK'));

const port = process.env.DIVIDEND_SERVICE_PORT || 3003;
app.listen(port, () => console.log(`Dividend service listening on port ${port}`));
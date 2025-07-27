const express = require('express');
const connectDB = require('../../config/database');
require('dotenv').config();
connectDB();

const app = express();
app.use(express.json());

app.post('/transactions', require('./controllers/transactionController').createTransaction);

app.get('/health', (req, res) => res.send('OK'));

const port = process.env.TRANSACTION_SERVICE_PORT || 3004;
app.listen(port, () => console.log(`Transaction service listening on port ${port}`));
const express = require('express');
const cors = require('cors');

console.log('Starting test server...');

const app = express();

// Enable CORS
app.use(cors({
  origin: '*',
  credentials: true
}));

// Parse JSON
app.use(express.json());

// Simple test route
app.get('/', (req, res) => {
  res.json({ message: 'Test server is working!' });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Backend is running',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/v1/backtest', (req, res) => {
  console.log('Backtest request:', req.body);
  res.json({
    message: 'Backtest endpoint working',
    data: req.body
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`);
});
const express = require('express');
const app = express();

console.log('Starting simple server...');

// Enable JSON parsing
app.use(express.json());

// Add CORS headers manually
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Basic route
app.get('/', (req, res) => {
  console.log('GET / called');
  res.json({ 
    message: 'Simple server is working!',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  console.log('GET /health called');
  res.json({ 
    status: 'OK',
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Backtest endpoint
app.post('/api/v1/backtest', (req, res) => {
  console.log('POST /api/v1/backtest called');
  console.log('Request body:', req.body);
  
  res.json({
    message: 'Backtest endpoint working',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Simple server running on http://localhost:${PORT}`);
  console.log(`Test it: curl http://localhost:${PORT}/health`);
});
// test-services.js
const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function testBackend() {
  console.log('🧪 Testing Backend Services...\n');

  // Test 1: Health check
  try {
    console.log('1️⃣ Testing health endpoint...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health check passed:', health.data.status);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return;
  }

  // Test 2: Simple backtest
  try {
    console.log('\n2️⃣ Testing backtest with your data...');
    const backtestData = {
      ticker: "HYLD.TO",
      timeframe: "1D", 
      quantity: 1,
      startDate: "2022-06-01",
      endDate: "2025-07-26"
    };

    console.log('Request:', backtestData);
    
    const response = await axios.post(`${API_BASE}/api/v1/backtest`, backtestData, {
      timeout: 60000 // 60 second timeout
    });

    console.log('✅ Backtest completed successfully!');
    console.log('\n📊 Results Summary:');
    console.log(`   Ticker: ${response.data.requestData?.ticker}`);
    console.log(`   Total Investment: $${response.data.totalInvestment}`);
    console.log(`   Current Value: $${response.data.totalValueToday}`);
    console.log(`   P&L: $${response.data.pnL} (${response.data.pnLPercent}%)`);
    console.log(`   Total Dividends: $${response.data.totalDividend}`);
    console.log(`   P&L with Dividends: $${response.data.pnLWithDividend} (${response.data.pnLWithDividendPercent}%)`);
    console.log(`   Total Shares: ${response.data.totalShares}`);
    console.log(`   Average Cost: $${response.data.averageCost}`);
    console.log(`   Dividend Frequency: ${response.data.dividendFrequency}`);
    
    if (response.data.summary) {
      console.log('\n🔍 Execution Summary:');
      console.log(`   Transactions: ${response.data.summary.transactions}`);
      console.log(`   Candles Processed: ${response.data.summary.candlesProcessed}`);
      console.log(`   Dividends Found: ${response.data.summary.dividendsFound}`);
      console.log(`   Strategy: ${response.data.summary.strategy}`);
    }

    if (response.data.yearlyDividends && response.data.yearlyDividends.length > 0) {
      console.log('\n💰 Yearly Dividends:');
      response.data.yearlyDividends.forEach(yearDiv => {
        console.log(`   ${yearDiv.year}: $${yearDiv.totalDividend}`);
      });
    }

  } catch (error) {
    console.error('❌ Backtest failed:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error:', error.response.data);
    } else {
      console.error('   Message:', error.message);
    }
  }

  // Test 3: Different date range
  try {
    console.log('\n3️⃣ Testing with different date range (shorter period)...');
    const shortTestData = {
      ticker: "HYLD.TO",
      timeframe: "1D",
      quantity: 2,
      startDate: "2024-01-01",
      endDate: "2024-12-31"
    };

    console.log('Request:', shortTestData);
    
    const response2 = await axios.post(`${API_BASE}/api/v1/backtest`, shortTestData, {
      timeout: 60000
    });

    console.log('✅ Short period backtest completed!');
    console.log(`   P&L: ${response2.data.pnL} (${response2.data.pnLPercent}%)`);
    console.log(`   Dividends: ${response2.data.totalDividend}`);
    console.log(`   Transactions: ${response2.data.summary?.transactions || 'N/A'}`);

  } catch (error) {
    console.error('❌ Short period test failed:', error.response?.data || error.message);
  }

  // Test 4: Direct service endpoints
  try {
    console.log('\n4️⃣ Testing direct market data endpoint...');
    const candlesResponse = await axios.get(`${API_BASE}/api/v1/candles`, {
      params: {
        ticker: 'HYLD.TO',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        timeframe: '1D'
      }
    });

    console.log(`✅ Market data: ${candlesResponse.data.length} candles retrieved`);

  } catch (error) {
    console.error('❌ Market data test failed:', error.response?.data || error.message);
  }

  try {
    console.log('\n5️⃣ Testing direct dividend endpoint...');
    const dividendResponse = await axios.get(`${API_BASE}/api/v1/dividends`, {
      params: {
        ticker: 'HYLD.TO',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      }
    });

    console.log(`✅ Dividend data: ${dividendResponse.data.length} dividends retrieved`);

  } catch (error) {
    console.error('❌ Dividend data test failed:', error.response?.data || error.message);
  }

  // Test 6: Error handling
  try {
    console.log('\n6️⃣ Testing error handling (invalid ticker)...');
    const errorTest = {
      ticker: "INVALID123",
      timeframe: "1D",
      quantity: 1,
      startDate: "2024-01-01",
      endDate: "2024-01-31"
    };

    await axios.post(`${API_BASE}/api/v1/backtest`, errorTest);
    console.log('⚠️  Expected error but got success');

  } catch (error) {
    if (error.response && error.response.status >= 400) {
      console.log('✅ Error handling works correctly');
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${error.response.data.message || error.response.data.error}`);
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }

  console.log('\n🎉 Testing completed!');
  console.log('\n📋 Next Steps:');
  console.log('   1. Make sure all services are running: npm run dev');
  console.log('   2. Check MongoDB is connected');
  console.log('   3. Verify TwelveData API key is working');
  console.log('   4. Test with your React frontend');
}

// Run the tests
testBackend().catch(error => {
  console.error('💥 Test execution failed:', error.message);
  process.exit(1);
});

// Additional helper function to test individual services
async function testServiceHealth() {
  const services = [
    { name: 'API Gateway', url: 'http://localhost:3000/health' },
    { name: 'Backtesting', url: 'http://localhost:3001/health' },
    { name: 'Market Data', url: 'http://localhost:3002/health' },
    { name: 'Dividend', url: 'http://localhost:3003/health' },
    { name: 'Transaction', url: 'http://localhost:3004/health' }
  ];

  console.log('\n🏥 Service Health Check:');
  
  for (const service of services) {
    try {
      const response = await axios.get(service.url, { timeout: 5000 });
      console.log(`✅ ${service.name}: ${response.data.status || 'OK'}`);
    } catch (error) {
      console.log(`❌ ${service.name}: ${error.code === 'ECONNREFUSED' ? 'Not running' : error.message}`);
    }
  }
}

// Export functions for use in other files
module.exports = {
  testBackend,
  testServiceHealth
};
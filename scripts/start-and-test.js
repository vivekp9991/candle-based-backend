// scripts/start-and-test.js
const { spawn } = require('child_process');
const axios = require('axios');

async function waitForService(url, name, maxWait = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    try {
      await axios.get(url, { timeout: 2000 });
      console.log(`✅ ${name} is ready`);
      return true;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`❌ ${name} failed to start within ${maxWait}ms`);
  return false;
}

async function startServices() {
  console.log('🚀 Starting all services...\n');
  
  // Start services in background
  const services = [
    { name: 'API Gateway', script: 'services/api-gateway/server.js', port: 3000 },
    { name: 'Backtesting', script: 'services/backtesting-service/server.js', port: 3001 },
    { name: 'Market Data', script: 'services/market-data-service/server.js', port: 3002 },
    { name: 'Dividend', script: 'services/dividend-service/server.js', port: 3003 },
    { name: 'Transaction', script: 'services/transaction-service/server.js', port: 3004 }
  ];

  const processes = [];

  for (const service of services) {
    console.log(`Starting ${service.name}...`);
    const process = spawn('node', [service.script], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development' }
    });
    
    process.stdout.on('data', (data) => {
      console.log(`[${service.name}] ${data.toString().trim()}`);
    });
    
    process.stderr.on('data', (data) => {
      console.error(`[${service.name} ERROR] ${data.toString().trim()}`);
    });
    
    processes.push({ process, service });
  }

  // Wait for all services to be ready
  console.log('\n⏳ Waiting for services to start...\n');
  
  const readyPromises = services.map(service => 
    waitForService(`http://localhost:${service.port}/health`, service.name)
  );
  
  const results = await Promise.all(readyPromises);
  const allReady = results.every(result => result);
  
  if (allReady) {
    console.log('\n🎉 All services are ready! Running tests...\n');
    
    // Run tests
    try {
      const { testBackend } = require('../test-services');
      await testBackend();
    } catch (error) {
      console.error('Test execution failed:', error.message);
    }
  } else {
    console.log('\n❌ Some services failed to start');
  }

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down services...');
    processes.forEach(({ process }) => {
      process.kill('SIGTERM');
    });
    process.exit(0);
  });
}

if (require.main === module) {
  startServices();
}

module.exports = { startServices, waitForService };
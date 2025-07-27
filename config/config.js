module.exports = {
  services: {
    apiGateway: {
      port: process.env.API_GATEWAY_PORT || 3000
    },
    backtesting: {
      port: process.env.BACKTESTING_SERVICE_PORT || 3001,
      url: `http://localhost:${process.env.BACKTESTING_SERVICE_PORT || 3001}`
    },
    marketData: {
      port: process.env.MARKET_DATA_SERVICE_PORT || 3002,
      url: `http://localhost:${process.env.MARKET_DATA_SERVICE_PORT || 3002}`
    },
    dividend: {
      port: process.env.DIVIDEND_SERVICE_PORT || 3003,
      url: `http://localhost:${process.env.DIVIDEND_SERVICE_PORT || 3003}`
    },
    transaction: {
      port: process.env.TRANSACTION_SERVICE_PORT || 3004,
      url: `http://localhost:${process.env.TRANSACTION_SERVICE_PORT || 3004}`
    }
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/stock_backtesting'
  },
  externalAPIs: {
    twelveData: {
      baseURL: 'https://api.twelvedata.com',
      key: process.env.TWELVEDATA_API_KEY
    }
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL_SECONDS) || 86400
  }
};
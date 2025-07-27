const mongoose = require('mongoose');
require('dotenv').config();

async function setupDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    await db.collection('candles').createIndex({ 
      ticker: 1, 
      date: 1, 
      timeframe: 1 
    }, { unique: true });

    await db.collection('candles').createIndex({ 
      ticker: 1, 
      timeframe: 1, 
      date: -1 
    });

    await db.collection('dividends').createIndex({ 
      ticker: 1, 
      exDate: 1 
    }, { unique: true });

    await db.collection('dividends').createIndex({ 
      ticker: 1, 
      exDate: -1 
    });

    await db.collection('transactions').createIndex({ 
      sessionId: 1, 
      transactionDate: -1 
    });

    await db.collection('transactions').createIndex({ 
      ticker: 1, 
      transactionDate: -1 
    });

    console.log('Database indexes created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();
const mongoose = require('mongoose');
require('dotenv').config();

async function seedData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    // Add seed data here if needed (e.g., sample candles, dividends)
    console.log('Data seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seedData();
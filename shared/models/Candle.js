const mongoose = require('mongoose');

const candleSchema = new mongoose.Schema({
  ticker: {
    type: String,
    required: true,
    uppercase: true
  },
  date: {
    type: Date,
    required: true
  },
  timeframe: {
    type: String,
    required: true,
    enum: ['1D', '1W', '1M']
  },
  open: {
    type: Number,
    required: true
  },
  high: {
    type: Number,
    required: true
  },
  low: {
    type: Number,
    required: true
  },
  close: {
    type: Number,
    required: true
  },
  volume: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

candleSchema.index({ ticker: 1, date: 1, timeframe: 1 }, { unique: true });
candleSchema.index({ ticker: 1, timeframe: 1, date: -1 });

module.exports = mongoose.model('Candle', candleSchema);
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true
  },
  ticker: {
    type: String,
    required: true,
    uppercase: true
  },
  transactionDate: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL'],
    default: 'BUY'
  },
  quantity: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  totalCost: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

transactionSchema.index({ sessionId: 1, transactionDate: -1 });
transactionSchema.index({ ticker: 1, transactionDate: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
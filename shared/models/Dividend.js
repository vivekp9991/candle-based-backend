const mongoose = require('mongoose');

const dividendSchema = new mongoose.Schema({
  ticker: {
    type: String,
    required: true,
    uppercase: true
  },
  exDate: {
    type: Date,
    required: true
  },
  payDate: {
    type: Date,
    required: false  // Changed to false
  },
  recordDate: {
    type: Date,
    required: false  // Changed to false
  },
  amount: {
    type: Number,
    required: true
  },
  frequency: {
    type: String,
    enum: ['monthly', 'quarterly', 'semi-annual', 'annual'],
    default: 'quarterly'
  }
}, {
  timestamps: true
});

dividendSchema.index({ ticker: 1, exDate: 1 }, { unique: true });
dividendSchema.index({ ticker: 1, exDate: -1 });

module.exports = mongoose.model('Dividend', dividendSchema);
// services/dividend-service/utils/frequencyService.js
const axios = require('axios');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

class DividendFrequencyService {
  
  static async getFrequencyFromStatistics(ticker) {
    let tickerUpper = ticker.toUpperCase();
    
    // Transform symbol for Twelve Data
    let apiParams = { symbol: tickerUpper };
    if (tickerUpper.endsWith('.TO')) {
      apiParams.symbol = tickerUpper.replace('.TO', '');
      apiParams.exchange = 'TSX';
    }

    const params = {
      ...apiParams,
      apikey: key
    };

    try {
      console.log(`Fetching dividend frequency for ${tickerUpper} from Statistics API...`);
      const response = await axios.get(`${baseURL}/statistics`, { params });
      
      console.log('Statistics API Response:', JSON.stringify(response.data, null, 2));

      if (!response.data || response.data.status === 'error') {
        console.error('Statistics API returned error:', response.data);
        return { frequency: 'quarterly', source: 'default', confidence: 'low' };
      }

      const stats = response.data.statistics || response.data;
      
      // Look for dividend frequency in various possible fields
      const frequencyFields = [
        'dividend_frequency',
        'dividendFrequency', 
        'dividend_yield_frequency',
        'paymentFrequency',
        'frequency',
        'div_frequency',
        'payout_frequency'
      ];

      let foundFrequency = null;
      let foundField = null;

      for (const field of frequencyFields) {
        if (stats[field]) {
          foundFrequency = stats[field];
          foundField = field;
          console.log(`Found frequency in field '${field}': ${foundFrequency}`);
          break;
        }
      }

      if (!foundFrequency) {
        console.log('No frequency field found in statistics data. Available fields:', Object.keys(stats));
        return { 
          frequency: 'quarterly', 
          source: 'default', 
          confidence: 'low',
          availableFields: Object.keys(stats)
        };
      }

      const mappedFrequency = this.mapFrequency(foundFrequency);
      
      return {
        frequency: mappedFrequency,
        source: 'statistics_api',
        confidence: 'high',
        originalValue: foundFrequency,
        field: foundField
      };

    } catch (error) {
      console.error('Error fetching statistics from Twelve Data:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      return { 
        frequency: 'quarterly', 
        source: 'error_fallback', 
        confidence: 'low',
        error: error.message 
      };
    }
  }

  static mapFrequency(apiFrequency) {
    if (!apiFrequency) return 'quarterly';
    
    const freq = apiFrequency.toString().toLowerCase().trim();
    
    // Monthly patterns
    if (freq.includes('month') || freq === '12' || freq.includes('monthly')) {
      return 'monthly';
    }
    
    // Quarterly patterns  
    if (freq.includes('quarter') || freq === '4' || freq.includes('quarterly')) {
      return 'quarterly';
    }
    
    // Semi-annual patterns
    if (freq.includes('semi') || freq.includes('half') || freq === '2' || 
        freq.includes('biannual') || freq.includes('bi-annual')) {
      return 'semi-annual';
    }
    
    // Annual patterns
    if (freq.includes('annual') || freq.includes('yearly') || freq === '1') {
      return 'annual';
    }

    // Try numeric parsing
    const numFreq = parseInt(freq);
    if (!isNaN(numFreq)) {
      if (numFreq >= 12) return 'monthly';
      if (numFreq >= 4) return 'quarterly'; 
      if (numFreq >= 2) return 'semi-annual';
      if (numFreq >= 1) return 'annual';
    }

    console.log(`Unknown frequency format: '${apiFrequency}', defaulting to quarterly`);
    return 'quarterly';
  }

  static getPaymentsPerYear(frequency) {
    switch (frequency) {
      case 'monthly': return 12;
      case 'quarterly': return 4;
      case 'semi-annual': return 2;
      case 'annual': return 1;
      default: return 4;
    }
  }

  // Fallback method using dividend payment intervals
  static calculateFrequencyFromDividends(dividends) {
    if (!dividends || dividends.length < 2) {
      return { 
        frequency: 'quarterly', 
        source: 'calculation_insufficient_data', 
        confidence: 'low' 
      };
    }

    const sortedDivs = dividends
      .filter(d => d.exDate && d.amount > 0)
      .sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

    if (sortedDivs.length < 2) {
      return { 
        frequency: 'quarterly', 
        source: 'calculation_insufficient_data', 
        confidence: 'low' 
      };
    }

    // Calculate intervals between payments
    const intervals = [];
    for (let i = 1; i < sortedDivs.length; i++) {
      const days = (new Date(sortedDivs[i].exDate) - new Date(sortedDivs[i - 1].exDate)) / (1000 * 60 * 60 * 24);
      intervals.push(days);
    }

    // Remove outliers (special dividends)
    const cleanIntervals = this.removeOutliers(intervals);
    const avgDays = cleanIntervals.reduce((sum, days) => sum + days, 0) / cleanIntervals.length;

    let frequency, confidence;
    
    if (avgDays < 45) {
      frequency = 'monthly';
      confidence = cleanIntervals.length >= 6 ? 'high' : 'medium';
    } else if (avgDays < 135) {
      frequency = 'quarterly';
      confidence = cleanIntervals.length >= 4 ? 'high' : 'medium';
    } else if (avgDays < 225) {
      frequency = 'semi-annual';
      confidence = cleanIntervals.length >= 2 ? 'high' : 'medium';
    } else {
      frequency = 'annual';
      confidence = 'medium';
    }

    return {
      frequency,
      source: 'calculation_from_payments',
      confidence,
      avgDaysBetweenPayments: Math.round(avgDays),
      sampleSize: cleanIntervals.length
    };
  }

  static removeOutliers(intervals) {
    if (intervals.length <= 2) return intervals;
    
    const sorted = [...intervals].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return intervals.filter(interval => interval >= lowerBound && interval <= upperBound);
  }

  // Main method that tries Statistics API first, then falls back to calculation
  static async getDividendFrequency(ticker, dividends = null) {
    console.log(`Getting dividend frequency for ${ticker}...`);
    
    // Try Statistics API first
    const statsResult = await this.getFrequencyFromStatistics(ticker);
    
    if (statsResult.confidence === 'high') {
      console.log(`Using Statistics API frequency: ${statsResult.frequency}`);
      return statsResult;
    }
    
    // If API failed or returned low confidence, try calculation from dividends
    if (dividends && dividends.length >= 2) {
      console.log('Statistics API failed or low confidence, calculating from dividend payments...');
      const calcResult = this.calculateFrequencyFromDividends(dividends);
      
      if (calcResult.confidence === 'high' || calcResult.confidence === 'medium') {
        console.log(`Using calculated frequency: ${calcResult.frequency}`);
        return calcResult;
      }
    }
    
    // Final fallback
    console.log('Using default quarterly frequency');
    return {
      frequency: 'quarterly',
      source: 'default_fallback',
      confidence: 'low',
      reason: 'API failed and insufficient dividend data for calculation'
    };
  }
}

module.exports = DividendFrequencyService;
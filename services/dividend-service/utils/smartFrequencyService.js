// services/dividend-service/utils/smartFrequencyService.js
const axios = require('axios');
const moment = require('moment');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

class SmartDividendFrequencyService {
  
  static async getDividendFrequency(ticker, userStartDate, userEndDate) {
    console.log(`🔍 Analyzing dividend frequency for ${ticker}...`);
    
    // Always fetch 2+ years of data to determine frequency accurately
    const endDate = moment().format('YYYY-MM-DD');
    const startDate = moment().subtract(2, 'years').format('YYYY-MM-DD');
    
    console.log(`📅 Fetching dividends from ${startDate} to ${endDate} for frequency analysis`);
    
    const dividends = await this.fetchDividends(ticker, startDate, endDate);
    
    if (!dividends || dividends.length === 0) {
      console.log('⚠️ No dividend data found, defaulting to quarterly');
      return {
        frequency: 'quarterly',
        confidence: 'low',
        reason: 'No dividend data available',
        dataPoints: 0
      };
    }
    
    console.log(`📊 Found ${dividends.length} dividend payments for analysis`);
    
    return this.analyzeFrequency(dividends);
  }
  
  static async fetchDividends(ticker, startDate, endDate) {
    let tickerUpper = ticker.toUpperCase();
    
    // Transform symbol for Twelve Data
    let apiParams = { symbol: tickerUpper };
    if (tickerUpper.endsWith('.TO')) {
      apiParams.symbol = tickerUpper.replace('.TO', '');
      apiParams.exchange = 'TSX';
    }

    const params = {
      ...apiParams,
      start_date: startDate,
      end_date: endDate,
      apikey: key
    };

    try {
      const response = await axios.get(`${baseURL}/dividends`, { params });
      console.log(`📈 Dividends API Response for ${ticker}:`, response.data);

      if (response.data.status === 'error') {
        console.error('❌ Dividends API error:', response.data);
        return [];
      }

      const divs = response.data.dividends || [];
      
      // Convert to our format and sort by date
      const dividends = divs
        .map(d => ({
          exDate: d.ex_date ? new Date(d.ex_date) : null,
          amount: parseFloat(d.amount) || 0
        }))
        .filter(d => d.exDate && d.amount > 0)
        .sort((a, b) => new Date(b.exDate) - new Date(a.exDate)); // Sort newest first
      
      console.log(`✅ Processed ${dividends.length} valid dividend records`);
      return dividends;
      
    } catch (error) {
      console.error('❌ Error fetching dividends:', error.message);
      return [];
    }
  }
  
  static analyzeFrequency(dividends) {
    if (!dividends || dividends.length === 0) {
      return {
        frequency: 'quarterly',
        confidence: 'low',
        reason: 'No dividend data'
      };
    }
    
    // Sort by date (newest first)
    const sortedDividends = dividends.sort((a, b) => new Date(b.exDate) - new Date(a.exDate));
    const lastExDate = moment(sortedDividends[0].exDate);
    
    console.log(`📅 Last ex-date: ${lastExDate.format('YYYY-MM-DD')}`);
    
    // Apply the frequency detection rules
    const monthlyCheck = this.checkFrequency(sortedDividends, lastExDate, 35, 2, 'monthly');
    if (monthlyCheck.isMatch) {
      console.log('🎯 Detected MONTHLY frequency');
      return monthlyCheck;
    }
    
    const quarterlyCheck = this.checkFrequency(sortedDividends, lastExDate, 100, 2, 'quarterly');
    if (quarterlyCheck.isMatch) {
      console.log('🎯 Detected QUARTERLY frequency');
      return quarterlyCheck;
    }
    
    const semiAnnualCheck = this.checkFrequency(sortedDividends, lastExDate, 200, 2, 'semi-annual');
    if (semiAnnualCheck.isMatch) {
      console.log('🎯 Detected SEMI-ANNUAL frequency');
      return semiAnnualCheck;
    }
    
    const annualCheck = this.checkFrequency(sortedDividends, lastExDate, 365, 1, 'annual');
    if (annualCheck.isMatch) {
      console.log('🎯 Detected ANNUAL frequency');
      return annualCheck;
    }
    
    // Check for irregular/special dividends
    const irregularCheck = this.checkIrregularPattern(sortedDividends);
    if (irregularCheck.isIrregular) {
      console.log('🎯 Detected IRREGULAR/SPECIAL dividends');
      return {
        frequency: 'irregular',
        confidence: 'medium',
        reason: 'Irregular payment pattern detected',
        details: irregularCheck,
        dataPoints: sortedDividends.length
      };
    }
    
    // Default fallback
    console.log('⚠️ Could not determine frequency, defaulting to quarterly');
    return {
      frequency: 'quarterly',
      confidence: 'low',
      reason: 'Could not determine clear pattern',
      dataPoints: sortedDividends.length
    };
  }
  
  static checkFrequency(dividends, lastExDate, daysBack, minCount, frequencyType) {
    const cutoffDate = moment(lastExDate).subtract(daysBack, 'days');
    
    const dividendsInPeriod = dividends.filter(d => 
      moment(d.exDate).isAfter(cutoffDate) || moment(d.exDate).isSame(cutoffDate, 'day')
    );
    
    console.log(`📊 ${frequencyType.toUpperCase()} check: Found ${dividendsInPeriod.length} dividends in last ${daysBack} days (need ${minCount})`);
    
    const isMatch = dividendsInPeriod.length >= minCount;
    
    if (isMatch) {
      // Additional validation for consistency
      const confidence = this.calculateConfidence(dividendsInPeriod, frequencyType);
      
      return {
        isMatch: true,
        frequency: frequencyType,
        confidence: confidence,
        reason: `Found ${dividendsInPeriod.length} payments in last ${daysBack} days`,
        dataPoints: dividendsInPeriod.length,
        daysAnalyzed: daysBack,
        payments: dividendsInPeriod.map(d => ({
          exDate: moment(d.exDate).format('YYYY-MM-DD'),
          amount: d.amount
        }))
      };
    }
    
    return { isMatch: false };
  }
  
  static calculateConfidence(dividends, frequencyType) {
    if (dividends.length < 2) return 'low';
    
    // Calculate intervals between payments
    const intervals = [];
    for (let i = 0; i < dividends.length - 1; i++) {
      const days = moment(dividends[i].exDate).diff(moment(dividends[i + 1].exDate), 'days');
      intervals.push(days);
    }
    
    // Expected intervals for each frequency
    const expectedIntervals = {
      'monthly': { min: 25, max: 35, ideal: 30 },
      'quarterly': { min: 80, max: 100, ideal: 90 },
      'semi-annual': { min: 170, max: 200, ideal: 180 },
      'annual': { min: 350, max: 380, ideal: 365 }
    };
    
    const expected = expectedIntervals[frequencyType];
    if (!expected) return 'medium';
    
    // Check how many intervals fall within expected range
    const validIntervals = intervals.filter(interval => 
      interval >= expected.min && interval <= expected.max
    );
    
    const consistencyRatio = validIntervals.length / intervals.length;
    
    if (consistencyRatio >= 0.8) return 'high';
    if (consistencyRatio >= 0.6) return 'medium';
    return 'low';
  }
  
  static checkIrregularPattern(dividends) {
    if (dividends.length < 3) return { isIrregular: false };
    
    // Calculate all intervals
    const intervals = [];
    for (let i = 0; i < dividends.length - 1; i++) {
      const days = moment(dividends[i].exDate).diff(moment(dividends[i + 1].exDate), 'days');
      intervals.push(days);
    }
    
    // Check for high variance in intervals (irregular pattern)
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // If standard deviation is more than 50% of average, consider irregular
    const coefficientOfVariation = stdDev / avgInterval;
    
    return {
      isIrregular: coefficientOfVariation > 0.5,
      avgInterval: Math.round(avgInterval),
      stdDev: Math.round(stdDev),
      coefficientOfVariation: Math.round(coefficientOfVariation * 100) / 100,
      intervals: intervals
    };
  }
  
  static getPaymentsPerYear(frequency) {
    switch (frequency) {
      case 'monthly': return 12;
      case 'quarterly': return 4;
      case 'semi-annual': return 2;
      case 'annual': return 1;
      case 'irregular': return 4; // Default to quarterly for calculations
      default: return 4;
    }
  }
  
  // Main method for external use
  static async analyzeDividendFrequency(ticker, userStartDate = null, userEndDate = null) {
    console.log(`🚀 Starting dividend frequency analysis for ${ticker}`);
    console.log(`📋 User requested period: ${userStartDate} to ${userEndDate}`);
    console.log(`🔍 Will analyze 2+ years of data to determine frequency accurately`);
    
    const result = await this.getDividendFrequency(ticker, userStartDate, userEndDate);
    
    console.log(`✅ Frequency analysis complete:`, {
      ticker,
      frequency: result.frequency,
      confidence: result.confidence,
      dataPoints: result.dataPoints
    });
    
    return result;
  }
}

module.exports = SmartDividendFrequencyService;
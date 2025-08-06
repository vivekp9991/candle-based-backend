// services/dividend-service/utils/smartFrequencyService.js
const axios = require('axios');
const moment = require('moment');
const config = require('../../../config/config');

const { baseURL, key } = config.externalAPIs.twelveData;

class SmartDividendFrequencyService {
  
  // Function to transform ticker for Twelve Data API (Enhanced with NSE/BSE support)
  static transformTicker(ticker) {
    // Ensure ticker is uppercase and a string
    const tickerUpper = String(ticker).toUpperCase();

    // Initialize API parameters with the original ticker
    let apiParams = { symbol: tickerUpper };

    // Handle TSX tickers (e.g., SHOP.TO)
    if (tickerUpper.endsWith('.TO')) {
      apiParams.symbol = tickerUpper.replace('.TO', '');
      apiParams.exchange = 'TSX';
      console.log(`🇨🇦 TSX ticker detected: ${ticker} -> symbol: ${apiParams.symbol}, exchange: ${apiParams.exchange}`);
    } 
    // Handle Indian tickers (e.g., NIFTY.IN or BSE:RELIANCE.IN)
    else if (tickerUpper.endsWith('.IN')) {
      apiParams.symbol = tickerUpper.replace('.IN', '');
      
      // Check for BSE prefix to differentiate BSE from NSE
      if (tickerUpper.startsWith('BSE:')) {
        apiParams.symbol = apiParams.symbol.replace('BSE:', '');
        apiParams.exchange = 'BSE';
        console.log(`🇮🇳 BSE ticker detected: ${ticker} -> symbol: ${apiParams.symbol}, exchange: ${apiParams.exchange}`);
      } else {
        apiParams.exchange = 'NSE';
        console.log(`🇮🇳 NSE ticker detected: ${ticker} -> symbol: ${apiParams.symbol}, exchange: ${apiParams.exchange}`);
      }
    } else {
      // Default case - assume US market if no specific exchange suffix
      console.log(`🇺🇸 Default/US ticker: ${ticker} -> symbol: ${apiParams.symbol}`);
    }

    return apiParams;
  }

  static getExchangeInfo(ticker) {
    const tickerUpper = ticker.toUpperCase();
    if (tickerUpper.endsWith('.TO')) {
      return '🇨🇦 TSX (Toronto Stock Exchange)';
    } else if (tickerUpper.endsWith('.IN')) {
      if (tickerUpper.startsWith('BSE:')) {
        return '🇮🇳 BSE (Bombay Stock Exchange)';
      } else {
        return '🇮🇳 NSE (National Stock Exchange of India)';
      }
    }
    return '🇺🇸 US Market (Default)';
  }
  
  static async getDividendFrequency(ticker, userStartDate, userEndDate) {
    const exchangeInfo = this.getExchangeInfo(ticker);
    console.log(`🔍 Analyzing dividend frequency for ${ticker} on ${exchangeInfo}...`);
    
    // Always fetch 2+ years of data to determine frequency accurately
    const endDate = moment().format('YYYY-MM-DD');
    const startDate = moment().subtract(2, 'years').format('YYYY-MM-DD');
    
    console.log(`📅 Fetching dividends from ${startDate} to ${endDate} for frequency analysis`);
    
    const dividends = await this.fetchDividends(ticker, startDate, endDate);
    
    if (!dividends || dividends.length === 0) {
      console.log(`⚠️ No dividend data found for ${exchangeInfo}, defaulting to quarterly`);
      
      // Provide exchange-specific default frequency guidance
      let defaultFrequency = 'quarterly';
      let defaultReason = 'No dividend data available';
      
      if (ticker.toUpperCase().endsWith('.IN')) {
        defaultFrequency = 'annual'; // Many Indian companies pay annual dividends
        defaultReason = 'No dividend data available - Indian companies often pay annual dividends';
      } else if (ticker.toUpperCase().endsWith('.TO')) {
        defaultFrequency = 'quarterly'; // Canadian companies typically pay quarterly
        defaultReason = 'No dividend data available - Canadian companies typically pay quarterly dividends';
      }
      
      return {
        frequency: defaultFrequency,
        confidence: 'low',
        reason: defaultReason,
        dataPoints: 0,
        exchange: exchangeInfo
      };
    }
    
    console.log(`📊 Found ${dividends.length} dividend payments for ${exchangeInfo} analysis`);
    
    const analysis = this.analyzeFrequency(dividends);
    analysis.exchange = exchangeInfo;
    return analysis;
  }
  
  static async fetchDividends(ticker, startDate, endDate) {
    const exchangeInfo = this.getExchangeInfo(ticker);
    
    // Use the enhanced transformTicker function
    const apiParams = this.transformTicker(ticker);

    const params = {
      ...apiParams,
      start_date: startDate,
      end_date: endDate,
      apikey: key
    };

    console.log(`📡 Frequency Analysis API params for ${exchangeInfo}:`, params);

    try {
      const response = await axios.get(`${baseURL}/dividends`, { params });
      console.log(`📈 Dividends API Response for ${ticker} (${exchangeInfo}):`, response.data);

      if (response.data.status === 'error') {
        console.error(`❌ Dividends API error for ${exchangeInfo}:`, response.data);
        
        // Provide exchange-specific error guidance
        if (ticker.toUpperCase().endsWith('.IN')) {
          console.log(`💡 Indian dividend data note for frequency analysis:`);
          console.log(`   - Indian companies may have limited dividend history in API`);
          console.log(`   - Annual dividend patterns are common in India`);
          console.log(`   - Try both NSE and BSE formats for better data coverage`);
        } else if (ticker.toUpperCase().endsWith('.TO')) {
          console.log(`💡 Canadian dividend data note for frequency analysis:`);
          console.log(`   - TSX companies typically have good dividend history`);
          console.log(`   - Monthly distributions common for REITs and income trusts`);
        }
        
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
      
      console.log(`✅ Processed ${dividends.length} valid dividend records for ${exchangeInfo}`);
      
      // Log sample dividends for debugging
      if (dividends.length > 0) {
        console.log(`💰 Sample dividends from ${exchangeInfo}:`);
        dividends.slice(0, 3).forEach((div, index) => {
          console.log(`   ${index + 1}. ${moment(div.exDate).format('YYYY-MM-DD')}: $${div.amount.toFixed(4)}`);
        });
      }
      
      return dividends;
      
    } catch (error) {
      console.error(`❌ Error fetching dividends for ${exchangeInfo}:`, error.message);
      
      // Provide exchange-specific error recovery guidance
      if (error.response?.status === 400 && ticker.toUpperCase().endsWith('.IN')) {
        console.log(`💡 Indian ticker frequency analysis error guidance:`);
        console.log(`   - Verify ticker format: RELIANCE.IN (NSE) or BSE:RELIANCE.IN (BSE)`);
        console.log(`   - Some Indian stocks may have limited API coverage`);
        console.log(`   - Consider manual verification on exchange websites`);
      } else if (error.response?.status === 400 && ticker.toUpperCase().endsWith('.TO')) {
        console.log(`💡 TSX ticker frequency analysis error guidance:`);
        console.log(`   - Verify ticker format: RY.TO (correct) vs RY.TSX (incorrect)`);
        console.log(`   - Most major TSX stocks should have dividend data`);
      }
      
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
    console.log(`📊 Analyzing ${sortedDividends.length} dividend payments for frequency patterns...`);
    
    // Apply the frequency detection rules with enhanced logic
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
    
    // Enhanced fallback logic based on data patterns
    console.log('⚠️ Could not determine clear frequency pattern, applying enhanced fallback logic...');
    
    // If we have limited data, make educated guesses based on patterns
    if (sortedDividends.length >= 2) {
      const intervals = [];
      for (let i = 0; i < Math.min(sortedDividends.length - 1, 4); i++) {
        const days = moment(sortedDividends[i].exDate).diff(moment(sortedDividends[i + 1].exDate), 'days');
        intervals.push(days);
      }
      
      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      console.log(`📊 Average interval between payments: ${Math.round(avgInterval)} days`);
      
      let estimatedFrequency = 'quarterly';
      let confidence = 'low';
      let reason = `Estimated from ${intervals.length} payment intervals (avg: ${Math.round(avgInterval)} days)`;
      
      if (avgInterval < 45) {
        estimatedFrequency = 'monthly';
        reason = `Short intervals suggest monthly payments (avg: ${Math.round(avgInterval)} days)`;
      } else if (avgInterval < 135) {
        estimatedFrequency = 'quarterly';
        reason = `Medium intervals suggest quarterly payments (avg: ${Math.round(avgInterval)} days)`;
      } else if (avgInterval < 225) {
        estimatedFrequency = 'semi-annual';
        reason = `Long intervals suggest semi-annual payments (avg: ${Math.round(avgInterval)} days)`;
      } else {
        estimatedFrequency = 'annual';
        reason = `Very long intervals suggest annual payments (avg: ${Math.round(avgInterval)} days)`;
      }
      
      console.log(`🎯 Estimated frequency: ${estimatedFrequency} based on interval analysis`);
      
      return {
        frequency: estimatedFrequency,
        confidence: confidence,
        reason: reason,
        dataPoints: sortedDividends.length,
        avgInterval: Math.round(avgInterval),
        intervals: intervals
      };
    }
    
    // Final fallback
    console.log('⚠️ Insufficient data for pattern analysis, using default quarterly');
    return {
      frequency: 'quarterly',
      confidence: 'low',
      reason: 'Insufficient data for pattern analysis, defaulting to quarterly',
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
    
    // Expected intervals for each frequency (with tolerance for market variations)
    const expectedIntervals = {
      'monthly': { min: 25, max: 40, ideal: 30 },
      'quarterly': { min: 75, max: 105, ideal: 90 },
      'semi-annual': { min: 165, max: 205, ideal: 182 },
      'annual': { min: 340, max: 385, ideal: 365 }
    };
    
    const expected = expectedIntervals[frequencyType];
    if (!expected) return 'medium';
    
    // Check how many intervals fall within expected range
    const validIntervals = intervals.filter(interval => 
      interval >= expected.min && interval <= expected.max
    );
    
    const consistencyRatio = validIntervals.length / intervals.length;
    
    console.log(`📊 Confidence calculation for ${frequencyType}:`);
    console.log(`   Valid intervals: ${validIntervals.length}/${intervals.length} (${(consistencyRatio * 100).toFixed(1)}%)`);
    console.log(`   Expected range: ${expected.min}-${expected.max} days (ideal: ${expected.ideal})`);
    
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
    
    console.log(`📊 Irregularity analysis:`);
    console.log(`   Average interval: ${Math.round(avgInterval)} days`);
    console.log(`   Standard deviation: ${Math.round(stdDev)} days`);
    console.log(`   Coefficient of variation: ${(coefficientOfVariation * 100).toFixed(1)}%`);
    
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
  
  // Main method for external use (Enhanced with multi-exchange support)
  static async analyzeDividendFrequency(ticker, userStartDate = null, userEndDate = null) {
    const exchangeInfo = this.getExchangeInfo(ticker);
    console.log(`🚀 Starting dividend frequency analysis for ${ticker} on ${exchangeInfo}`);
    console.log(`📋 User requested period: ${userStartDate} to ${userEndDate}`);
    console.log(`🔍 Will analyze 2+ years of data to determine frequency accurately`);
    
    const result = await this.getDividendFrequency(ticker, userStartDate, userEndDate);
    
    console.log(`✅ Frequency analysis complete for ${exchangeInfo}:`, {
      ticker,
      exchange: exchangeInfo,
      frequency: result.frequency,
      confidence: result.confidence,
      dataPoints: result.dataPoints
    });
    
    // Add market-specific insights to the result
    if (result.dataPoints > 0) {
      console.log(`💡 Market insight for ${exchangeInfo}:`);
      if (ticker.toUpperCase().endsWith('.IN')) {
        if (result.frequency === 'annual') {
          console.log(`   ✅ Annual dividends are common for Indian companies`);
        } else if (result.frequency === 'quarterly') {
          console.log(`   📊 Quarterly dividends suggest a well-established Indian company`);
        }
      } else if (ticker.toUpperCase().endsWith('.TO')) {
        if (result.frequency === 'monthly') {
          console.log(`   🏠 Monthly distributions common for Canadian REITs and income trusts`);
        } else if (result.frequency === 'quarterly') {
          console.log(`   🍁 Quarterly dividends typical for major Canadian corporations`);
        }
      } else {
        if (result.frequency === 'quarterly') {
          console.log(`   🇺🇸 Quarterly dividends typical for established US companies`);
        } else if (result.frequency === 'monthly') {
          console.log(`   🏦 Monthly distributions common for US REITs and utilities`);
        }
      }
    }
    
    return result;
  }
}

module.exports = SmartDividendFrequencyService;
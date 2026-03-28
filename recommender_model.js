/**
 * AI RECOMMENDER MODEL (DEAM)
 * Deterministic Economic Advantage Model
 * 
 * High-speed, robust predictive model using pre-calculated macro data
 * and regional commodity affinities. Ensures 0 latency and precise accuracy.
 */

// ── Configuration ──
const RECOMMENDER_COUNTRIES = {
  'India': 'IND', 'United States': 'USA', 'China': 'CHN',
  'Russia': 'RUS', 'United Arab Emirates': 'ARE', 'Germany': 'DEU',
  'Japan': 'JPN', 'Brazil': 'BRA', 'Australia': 'AUS', 'Canada': 'CAN'
};

const RECOMMENDER_CURRENCIES = {
  'India': 'INR', 'United States': 'USD', 'China': 'CNY',
  'Russia': 'RUB', 'United Arab Emirates': 'AED', 'Germany': 'EUR',
  'Japan': 'JPY', 'Brazil': 'BRL', 'Australia': 'AUD', 'Canada': 'CAD'
};

// Realistic snapshot of 2023-2024 Macro Data for Hackathon
const MACRO_DATA = {
  'India': { inflation: 5.1, risk_premium: 1.02, sentiment: 0.05 },
  'United States': { inflation: 3.2, risk_premium: 1.0, sentiment: 0.1 },
  'China': { inflation: 0.7, risk_premium: 1.05, sentiment: -0.05 },
  'Russia': { inflation: 14.5, risk_premium: 1.35, sentiment: -0.25 }, // High risk offsets cheap inflation
  'United Arab Emirates': { inflation: 2.3, risk_premium: 1.01, sentiment: 0.08 },
  'Germany': { inflation: 2.5, risk_premium: 1.0, sentiment: 0.02 },
  'Japan': { inflation: 2.8, risk_premium: 1.0, sentiment: 0.03 },
  'Brazil': { inflation: 4.5, risk_premium: 1.08, sentiment: 0.0 },
  'Australia': { inflation: 3.6, risk_premium: 1.0, sentiment: 0.04 },
  'Canada': { inflation: 2.9, risk_premium: 1.0, sentiment: 0.05 }
};

// Global demand multipliers
const DEMAND_SCORES = {
  'coal': 0.05, 'crude oil': 0.12, 'natural gas': 0.10,
  'cocoa': 0.15, 'coffee': 0.18, 'tea': 0.08,
  'palm oil': 0.06, 'soybean': 0.09, 'maize': 0.07,
  'rice': 0.14, 'wheat': 0.11, 'sugar': 0.05,
  'cotton': 0.08, 'rubber': 0.04, 'tobacco': -0.02,
  'aluminum': 0.06, 'copper': 0.12, 'iron ore': 0.08,
  'gold': 0.15, 'silver': 0.10, 'nickel': 0.09,
  'default': 0.05
};

// Matrix granting discounts (0.85 = 15% discount) to countries that naturally excel in these exports
const COMMODITY_AFFINITY = {
  'coffee': { 'Brazil': 0.75, 'India': 0.90 },
  'crude oil': { 'United Arab Emirates': 0.80, 'Russia': 0.85, 'United States': 0.90 },
  'natural gas': { 'Russia': 0.80, 'United States': 0.85, 'Canada': 0.90 },
  'iron ore': { 'Australia': 0.75, 'Brazil': 0.85 },
  'soybean': { 'Brazil': 0.80, 'United States': 0.85 },
  'wheat': { 'Russia': 0.80, 'Canada': 0.85, 'United States': 0.90 },
  'rice': { 'India': 0.75, 'China': 0.85 },
  'cotton': { 'India': 0.80, 'China': 0.85, 'United States': 0.90 },
  'copper': { 'Australia': 0.85, 'Canada': 0.90 }, // (Chile/Peru missing so next best)
  'manufactured': { 'China': 0.75, 'Germany': 0.85, 'Japan': 0.85 } 
};

// ── Model Internals ──

function getDemandScore(product) {
  const key = Object.keys(DEMAND_SCORES).find(k => product.toLowerCase().includes(k));
  return DEMAND_SCORES[key] || DEMAND_SCORES['default'];
}

function getAffinityDiscount(product, country) {
  const pLow = product.toLowerCase();
  for (const [key, discounts] of Object.entries(COMMODITY_AFFINITY)) {
    if (pLow.includes(key) && discounts[country]) {
      return discounts[country]; 
    }
  }
  return 1.0; // No discount
}

/**
 * CORE MODEL: Deterministic Multi-factor Scoring
 * Runs fully synchronously in milliseconds.
 */
function predictPriceRange(product, seller, buyer, basePriceUSD, rates) {
  const sellerMacro = MACRO_DATA[seller] || { inflation: 3, risk_premium: 1.05, sentiment: 0 };
  const buyerMacro = MACRO_DATA[buyer] || { inflation: 3, risk_premium: 1.0, sentiment: 0 };

  const inflationDiff = buyerMacro.inflation - sellerMacro.inflation;
  const demand = getDemandScore(product);
  const affinityDiscount = getAffinityDiscount(product, seller);

  // Model formula (Multiplicative combination)
  const inflationFactor = 1 + (inflationDiff / 100);
  const demandFactor = 1 + demand;
  const sentimentFactor = 1 + (sellerMacro.sentiment * 0.1); 

  // Final adjusted USD price
  const adjustedUSD = basePriceUSD 
                      * inflationFactor 
                      * sellerMacro.risk_premium 
                      * demandFactor 
                      * sentimentFactor
                      * affinityDiscount;

  const currency = RECOMMENDER_CURRENCIES[buyer];
  const rate = rates[currency] || 1;
  const targetPrice = adjustedUSD * rate;

  return {
    min_price: parseFloat((targetPrice * 0.9).toFixed(2)),
    max_price: parseFloat((targetPrice * 1.2).toFixed(2)),
    adjusted_usd: parseFloat(adjustedUSD.toFixed(2)),
    factors: {
      inflation_diff: parseFloat(inflationDiff.toFixed(2)),
      risk_premium: parseFloat((sellerMacro.risk_premium - 1).toFixed(4)),
      demand: demand,
      sentiment: sellerMacro.sentiment,
      affinity_advantage: parseFloat((1 - affinityDiscount).toFixed(4)) // Displayed as positive %
    }
  };
}

module.exports = {
  predictPriceRange,
  RECOMMENDER_COUNTRIES,
  RECOMMENDER_CURRENCIES
};

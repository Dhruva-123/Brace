const model = require('./recommender_model');

// Mock data
const mockRates = {
  USD: 1, INR: 83.5, CNY: 7.24, RUB: 92.5, AED: 3.67, EUR: 0.92, JPY: 149.5, BRL: 4.97, AUD: 1.53, CAD: 1.36
};

// Override the getInflation in the model to test math
const originalGetInflation = model.getInflation;
const mockInflation = {
  'India': 5.5,
  'United States': 3.2,
  'China': 1.1,
  'Russia': 25.0, // HIGH HYPERINFLATION
  'United Arab Emirates': 2.8,
  'Germany': 2.4,
  'Japan': 2.1,
  'Brazil': 12.0, // MID HIGH
  'Australia': 3.9,
  'Canada': 3.1
};

// Monkey patch for testing
const predictPriceRange = async (product, seller, buyer, basePriceUSD, rates) => {
  const infSeller = mockInflation[seller] || 2.0;
  const infBuyer = mockInflation[buyer] || 2.0;
  const sentiment = 0; // Neutral news

  const inflationDiff = (infBuyer - infSeller);
  const demand = 0.05; // Default

  // Model formula (simple multiplicative)
  const inflationFactor = 1 + (inflationDiff / 100);
  const demandFactor = 1 + demand;
  const sentimentFactor = 1 + (sentiment * 0.1);

  const adjustedUSD = basePriceUSD * inflationFactor * demandFactor * sentimentFactor;
  const currency = model.RECOMMENDER_CURRENCIES[buyer];
  const rate = rates[currency] || 1;
  const targetPrice = adjustedUSD * rate;

  return { seller, inflationDiff, adjustedUSD, targetPrice };
};

async function runTest() {
  console.log("=== Testing Pricing Model Factor Analysis ===");
  const basePriceUSD = 100;
  const buyer = "India";
  const sellers = Object.keys(model.RECOMMENDER_COUNTRIES).filter(c => c !== buyer);
  
  const results = [];
  for (const seller of sellers) {
     const res = await predictPriceRange("Wheat", seller, buyer, basePriceUSD, mockRates);
     results.push(res);
  }

  results.sort((a, b) => a.targetPrice - b.targetPrice);
  
  console.table(results.map(r => ({
    "Seller": r.seller,
    "Inf (Mock)": mockInflation[r.seller] || 2.0,
    "Inf Diff": r.inflationDiff.toFixed(2),
    "Adj Price ($)": r.adjustedUSD.toFixed(2),
    "Final Price (INR)": r.targetPrice.toFixed(2)
  })));

  console.log("\nCONCLUSION: Top Recommendation is", results[0].seller);
}

runTest();

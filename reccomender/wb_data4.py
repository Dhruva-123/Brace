import requests
import pandas as pd
from pytrends.request import TrendReq
from transformers import pipeline

# -------------------------------
# INIT
# -------------------------------
pytrends = TrendReq(hl='en-US', tz=330, timeout=(10, 25))
sentiment_model = pipeline(
    "sentiment-analysis",
    model="distilbert-base-uncased-finetuned-sst-2-english",
    revision="714eb0f"
)

# -------------------------------
# COUNTRY + CURRENCY MAP
# -------------------------------
COUNTRY_CODES = {
    "India": "IND",
    "United States": "USA",
    "China": "CHN",
    "Russia": "RUS",
    "United Arab Emirates": "ARE",
    "Germany": "DEU",
    "Japan": "JPN",
    "Brazil": "BRA",
    "Australia": "AUS",
    "Canada": "CAN"
}

CURRENCY_CODES = {
    "India": "INR",
    "United States": "USD",
    "China": "CNY",
    "Russia": "RUB",
    "United Arab Emirates": "AED",
    "Germany": "EUR",
    "Japan": "JPY",
    "Brazil": "BRL",
    "Australia": "AUD",
    "Canada": "CAD"
}

# -------------------------------
# WORLD BANK FUNCTIONS
# -------------------------------
def fetch_indicator(country_code, indicator):
    url = f"https://api.worldbank.org/v2/country/{country_code}/indicator/{indicator}?format=json"
    try:
        return requests.get(url).json()
    except:
        return []

def get_weighted_average(data):
    values, weights = [], []
    weight = 5
    for entry in data[1][:5]:
        if entry["value"] is not None:
            values.append(entry["value"])
            weights.append(weight)
            weight -= 1
    if not values:
        return 0
    return sum(v*w for v, w in zip(values, weights)) / sum(weights)

inflation_cache = {}

def get_inflation(country):
    if country in inflation_cache:
        return inflation_cache[country]
    code = COUNTRY_CODES.get(country)
    if not code:
        return 0
    data = fetch_indicator(code, "FP.CPI.TOTL.ZG")
    value = get_weighted_average(data) if data else 0
    inflation_cache[country] = value
    return value

# -------------------------------
# EXCHANGE RATE
# -------------------------------
API_KEY = "edd006ac4e2704a4c4c93dab"

def get_all_rates():
    url = f"https://v6.exchangerate-api.com/v6/{API_KEY}/latest/USD"
    try:
        data = requests.get(url).json()
        return data.get("conversion_rates", {})
    except:
        return {}

def convert_currency(amount, target_currency, rates):
    return amount * rates.get(target_currency, 1)

# -------------------------------
# COMMODITY PRICES
# -------------------------------
com_csv = pd.read_csv("pink_Sheet.csv")

def get_price(product):
    row = com_csv[com_csv["commodity"].str.contains(product, case=False)]
    if row.empty:
        return None
    return float(row.iloc[0]["price_2023"])

# -------------------------------
# GOOGLE TRENDS
# -------------------------------
def get_trend_data(product, country):
    try:
        keyword = f"{product} {country}"
        pytrends.build_payload([keyword], timeframe='today 3-m')
        data = pytrends.interest_over_time()
        if data.empty:
            return None
        return data[keyword]
    except:
        return None

def get_demand_score(product, country):
    trend = get_trend_data(product, country)
    if trend is None or len(trend) < 2:
        return 0
    growth = trend.iloc[-1] - trend.iloc[0]
    return round(growth / 100, 3)

# -------------------------------
# NEWS API
# -------------------------------
NEWS_API_KEY = "ac802032fb1947c49da8cabdcc0a4a19"

def get_news(product, country):
    query = f"{product} {country} export import"
    url = f"https://newsapi.org/v2/everything?q={query}&language=en&pageSize=5&apiKey={NEWS_API_KEY}"
    try:
        data = requests.get(url).json()
        articles = data.get("articles", [])
        return [a["title"] for a in articles if a["title"]]
    except:
        return []

def get_news_sentiment(product, seller, buyer):
    seller_news = get_news(product, seller)
    buyer_news = get_news(product, buyer)
    score, weight = 0, 0
    for h in seller_news:
        result = sentiment_model(h)[0]
        score += 2 if result["label"] == "POSITIVE" else -2
        weight += 2
    for h in buyer_news:
        result = sentiment_model(h)[0]
        score += 1 if result["label"] == "POSITIVE" else -1
        weight += 1
    if weight == 0:
        return 0
    return score / weight

# -------------------------------
# PRICE CALCULATION
# -------------------------------
def calculate_price_range(product, seller, buyer, rates):
    base_price = get_price(product)
    if base_price is None:
        return None
    inflation_s = get_inflation(seller)
    inflation_b = get_inflation(buyer)
    inflation_diff = inflation_b - inflation_s
    demand = get_demand_score(product, buyer)
    news = get_news_sentiment(product, seller, buyer)
    inflation_factor = 1 + (inflation_diff / 100)
    demand_factor = 1 + demand
    news_factor = 1 + (news * 0.1)
    adjusted_price_usd = base_price * inflation_factor * demand_factor * news_factor
    buyer_currency = CURRENCY_CODES[buyer]
    final_price = convert_currency(adjusted_price_usd, buyer_currency, rates)
    min_price = float(final_price * 0.9)
    max_price = float(final_price * 1.2)
    return min_price, max_price, buyer_currency

# -------------------------------
# RECOMMENDATION SYSTEM
# -------------------------------
def recommend_best_seller(product, buyer):
    rates = get_all_rates()
    if not rates:
        print("Fix API key or check rate API")
        return None

    seller_prices = []
    for seller in COUNTRY_CODES.keys():
        if seller == buyer:
            continue
        result = calculate_price_range(product, seller, buyer, rates)
        if result:
            min_price, max_price, currency = result
            seller_prices.append({
                "seller": seller,
                "min_price": min_price,
                "max_price": max_price,
                "currency": currency
            })

    if not seller_prices:
        return None

    # Best seller = lowest min_price
    best_seller = min(seller_prices, key=lambda x: x["min_price"])

    # Overall combined range
    overall_min = min(x["min_price"] for x in seller_prices)
    overall_max = max(x["max_price"] for x in seller_prices)
    overall_currency = seller_prices[0]["currency"]

    return {
        "best_seller": best_seller["seller"],
        "best_range": [round(best_seller["min_price"], 2), round(best_seller["max_price"], 2)],
        "overall_range": [round(overall_min, 2), round(overall_max, 2)],
        "currency": overall_currency
    }

# -------------------------------
# MAIN
# -------------------------------
if __name__ == "__main__":
    product = input("Enter product name: ").strip()
    buyer = input("Enter your country: ").strip()

    recommendation = recommend_best_seller(product, buyer)

    if not recommendation:
        print("No recommendations available.")
    else:
        print(f"\nBest seller for '{product}' in {buyer}: {recommendation['best_seller']}")
        print(f"Price range from best seller: {recommendation['best_range'][0]} - {recommendation['best_range'][1]} {recommendation['currency']}")
        print(f"Overall price range across all sellers: {recommendation['overall_range'][0]} - {recommendation['overall_range'][1]} {recommendation['currency']}")
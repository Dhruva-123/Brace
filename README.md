# Brace — Global Trade OS

> A full-stack, production-grade trust and trade infrastructure platform for physical goods.  
> Dual-role dashboards. AI-powered matchmaking. Blockchain payments. Real-time notifications. Immutable audit.

---

## What Brace Does

Brace is a complete trade operating system where buyers and sellers of physical commodities transact with full infrastructure: trust scoring, risk-adjusted pricing, conditional grade verification, AI-driven seller recommendations, Web3 escrow payments on Polygon, real-time order notifications via Socket.IO, smart contract management through embedded Remix IDE, automated trade documentation, and an immutable audit trail.

Every deal flows through a mathematically grounded trust and pricing engine. Every payment is secured by on-chain escrow. Every event is logged immutably.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Browser — Single Page App                      │
│                                                                        │
│   index.html  ·  app.js  ·  style.css                                 │
│                                                                        │
│   SELLER ROLE                         BUYER ROLE                      │
│   Dashboard · New Deal · My Deals     Dashboard · Marketplace         │
│   Incoming Orders · Trust Score       My Orders · Web3 Wallet         │
│   Tax Calc · FX Rates · AI Markets   Tax Calc · FX Rates             │
│   Smart Contract · Disputes · Audit   Smart Contract · Disputes       │
└────────────┬──────────────────────────────────┬───────────────────────┘
             │  HTTP / REST                      │  WebSocket (Socket.IO)
┌────────────▼──────────────────────────────────▼───────────────────────┐
│                         Express Server  (server.js)                    │
│                                                                        │
│  Auth          JWT + session, bcrypt password hashing                 │
│  Trade API     Create / read / update deals, pricing preview          │
│  Order API     Buyer order placement, seller order fulfillment        │
│  Trust API     Compute and serve 5-metric seller credit scores        │
│  Pricing API   Real-time risk-adjusted price calculation              │
│  Match API     AI priority-queue matchmaking for buyer dashboard      │
│  Document API  Commercial Invoice · POA · Packing List generation     │
│  Tax API       Customs duty + VAT + landed cost estimation            │
│  Dispute API   Raise, track, and resolve trade disputes               │
│  Audit API     Write-once immutable activity log                      │
│  FX API        Live exchange rate proxy (Open ER-API)                 │
│  Market API    AI sentiment + World Bank data + news analysis         │
│  Web3 API      Wallet connection, contract calls, Polygon network     │
│  Socket.IO     Real-time push — order events, deal status changes     │
│                                                                        │
│  Security: helmet · express-rate-limit · cors · dotenv               │
└──────┬─────────────────────────────────┬──────────────────────────────┘
       │                                 │
┌──────▼──────────┐      ┌──────────────▼──────────────────────────────┐
│   brace.db      │      │               External Services              │
│   SQLite        │      │                                              │
│                 │      │  Supabase            Cloud DB / auth layer   │
│  merchants      │      │  Open ER-API         Live FX rates           │
│  trade_deals    │      │  REST Countries      Country metadata        │
│  seller_credit  │      │  World Bank API      Inflation, GDP data     │
│  grade_verify   │      │  NewsAPI             Commodity news feed     │
│  disputes       │      │  Hugging Face        DistilBERT · FinBERT   │
│  audit_logs     │      │  Polygon Network     Web3 payments           │
│  orders         │      │  Remix IDE           Smart contract deploy   │
└─────────────────┘      └──────────────────────────────────────────────┘
                                      │
                         ┌────────────▼───────────────┐
                         │   reccomender/  (Python)    │
                         │   Priority Queue Matching   │
                         │   Commodity Demand Scoring  │
                         │   ML Recommendation Engine  │
                         └────────────────────────────┘
```

---

## Core Modules

### Trust Engine

Every seller carries a composite credit score built from five weighted metrics, updated with each transaction.

```
Seller Credit Score =
    0.35 × Transaction Success Rate
  + 0.20 × Grade Accuracy Score
  + 0.15 × Dispute Ratio Inverse
  + 0.15 × Delivery Timeliness
  + 0.15 × Buyer Feedback Score

Grade Accuracy Score = 1 − ( |Declared Grade − Verified Grade| / 100 )
```

Score range 0–100. Displayed as an animated SVG gauge with tier classification.

| Score | Tier | Verification Action |
|---|---|---|
| Above 80 | High | No verification required |
| 55 to 80 | Medium | Random sampling triggered |
| Below 55 | Low | Mandatory grade test required |

### Pricing Engine

Every deal price is computed at creation time from three live multipliers.

```
Final Trade Price = Base Price × Grade Factor × Trust Factor × Risk Discount
```

A preview is available before deal submission — sellers see the full breakdown before committing.

### AI Market Intelligence

Two modes run under the AI Markets module.

**Find Best Seller** — powered by the Python recommender engine using a priority queue match scoring algorithm. Inputs: commodity selection, buyer country. Output: ranked seller recommendations with price range estimates derived from World Bank Pink Sheet commodity prices adjusted for real-time inflation (World Bank CPI API), exchange rates, and news sentiment.

**Market Analysis** — product description sent to Hugging Face Inference API for sentiment scoring. DistilBERT classifies trade sentiment; FinBERT scores financial risk; Mistral-7B generates a market narrative. Falls back to rule-based engine if no API key is configured.

```
AI Price Range = Base Commodity Price
              × Inflation Factor  (World Bank CPI)
              × Demand Factor     (Rule-based commodity scoring)
              × Sentiment Factor  (DistilBERT / NewsAPI)

Range: 90% – 120% of adjusted price
```

### Buyer Matchmaking

The buyer dashboard surfaces auto-matches powered by the priority queue recommender in `reccomender/`. When a buyer loads their dashboard, the system scores all available deals against their profile and surfaces the highest-ranked matches automatically, refreshable on demand.

### Web3 Payment Layer

Buyers connect MetaMask via Web3.js. Payments route through Polygon network. Smart contracts are deployed and managed via embedded Remix IDE iframes — one slot for sellers (trade contracts), one for buyers (escrow contracts). Contract address and ABI are stored per session and used for direct method calls from the wallet panel.

```
Wallet connect  →  MetaMask prompt  →  Polygon network check
                →  Switch to Polygon if needed
                →  Balance + address displayed
                →  Execute contract calls (makePayment, releaseFunds, etc.)
```

### Real-Time Notifications

Socket.IO maintains a persistent connection between the server and each authenticated session. Events pushed in real time: new orders on seller's deals, order status changes, dispute updates. Displayed in a dismissable notification bar at the top of the main content area.

---

## Data Flow

### Deal Lifecycle

```
Seller creates deal (product, grade, qty, price, trade route)
        │
        ▼
Pricing engine: Base × Grade Factor × Trust Factor × Risk Discount
        │
        ▼
Deal written to trade_deals · Audit log entry written (immutable)
        │
        ▼
Deal appears in Marketplace for buyers to browse and search
        │
        ▼
Buyer places order → Socket.IO pushes notification to seller
        │
        ├── Web3 path: buyer pays via MetaMask → escrow contract on Polygon
        │
        ▼
Seller fulfils → order marked complete
        │
        ▼
Trust score metrics updated (timeliness, grade accuracy, feedback)
        │
        ▼
Verification tier re-evaluated for seller's next deal
```

### Authentication Flow

```
Register: name · company · email · country · role · password
        │
        ▼
bcrypt hash stored · JWT issued · session established · Supabase synced
        │
        ▼
Role toggle (Buyer / Seller) unlocks respective dashboard and nav
```

---

## Database Schema

| Table | Key Columns |
|---|---|
| `merchants` | id, name, company, email, country, role, password_hash |
| `trade_deals` | id, seller_id, product, hs_code, origin, destination, qty, unit, base_price, final_price, grade_declared, grade_factor, trust_factor, risk_discount, status |
| `orders` | id, deal_id, buyer_id, quantity, price, payment_status, contract_address, created_at |
| `seller_credit_scores` | merchant_id, tsr, gas, dri, dt, bfs, composite_score, tier |
| `grade_verifications` | deal_id, declared_grade, verified_grade, accuracy_score, required |
| `disputes` | id, deal_id, raised_by, reason, status, resolution |
| `audit_logs` | id, merchant_id, action, entity_type, entity_id, timestamp |

---

## AI & Data Models

| Model / Source | Role |
|---|---|
| `distilbert-base-uncased-finetuned-sst-2-english` | Commodity trade sentiment classification |
| `ProsusAI/finbert` | Financial risk scoring |
| `mistralai/Mistral-7B-Instruct-v0.2` | Market narrative generation |
| World Bank API `FP.CPI.TOTL.ZG` | Country-level inflation adjustment |
| World Bank Pink Sheet 2023 | Base commodity price reference |
| NewsAPI + DistilBERT pipeline | News sentiment per commodity |
| Priority Queue Match Scoring | Buyer-seller matchmaking (reccomender/) |
| Rule-based Demand Scoring | Commodity demand signal — no API required |

All AI features degrade gracefully to rule-based fallbacks if API keys are absent.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Backend | Express.js |
| Database | SQLite (better-sqlite3) + Supabase |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Real-time | Socket.IO 4.x |
| Payments | Web3.js 1.10 · MetaMask · Polygon |
| Smart Contracts | Solidity via Remix IDE (embedded iframe) |
| Frontend | Vanilla JS · HTML5 · CSS3 |
| AI Inference | Hugging Face Inference API |
| External Data | Open ER-API · REST Countries · World Bank · NewsAPI |
| ML Recommender | Python (reccomender/ module) |
| Security | helmet · express-rate-limit · cors · uuid |

---

## Getting Started

```bash
# 1. Clone
git clone https://github.com/Dhruva-123/Brace.git
cd Brace

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Set SESSION_SECRET, JWT_SECRET, Supabase keys, and optional API keys

# 4. Run
npm start          # production
npm run dev        # development with nodemon

# 5. Open
# http://localhost:3000
```

The SQLite database is created automatically on first run. Supabase configuration is optional for local development but required for production cloud sync.

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Express session signing key |
| `JWT_SECRET` | Yes | JWT token signing |
| `SUPABASE_URL` | Production | Supabase project URL |
| `SUPABASE_ANON_KEY` | Production | Supabase public key |
| `HUGGING_FACE_API_KEY` | Recommended | Activates DistilBERT, FinBERT, Mistral inference |
| `EXCHANGE_RATE_API_KEY` | Optional | Higher FX rate limits |
| `NEWS_API_KEY` | Optional | News sentiment pipeline |

---

## Project Structure

```
brace/
├── server.js          Express backend — all routes, auth, DB, Socket.IO, Web3
├── app.js             Frontend SPA — routing, state, API calls, Web3 integration
├── index.html         App shell — all views, buyer + seller pages
├── style.css          Design system — variables, components, layout
├── policy.html        Terms of Service and Legal Disclaimer
├── brace.db           SQLite database (auto-created on first run)
├── server_test.js     Test suite
├── .env.example       Environment variable template
├── package.json
├── reccomender/       Python ML module — priority queue matchmaking
└── node_modules/
```

---

## Design System

| Token | Value |
|---|---|
| Primary teal | `#96BBBB` |
| Mid green | `#618985` |
| Dark earth | `#414535` |
| Warm parchment | `#F2E3BC` |
| Tan accent | `#C19875` |
| Display font | Cormorant Garamond |
| UI font | Syne |
| Data / mono | DM Mono |

---

## Legal

All use is subject to the Brace Terms of Service and Legal Disclaimer at `/policy`.

Brace is a digital infrastructure layer. It is not a financial institution, licensed commodity inspector, or legal advisor. Trust scores, pricing outputs, and AI recommendations are algorithmic estimates. On-chain transactions are irreversible — users are solely responsible for wallet interactions and contract execution.

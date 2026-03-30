// ═══════════════════════════════════════════════════════════
//  BRACE — Global Trade OS
//  server.js — The Heart of Brace
//  Now with Buyer Dashboard + Web3 Payment + Socket.IO
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const http = require('http');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')('sk_test_51TG1qB0xxLLAbwREI0njJUTARlygJ6aavfllVKAkPyPHk1gW1CAjMZQCeH3NrgNJkyRNeffatklbAEspo2zZmvTN00PBjoRpo8');

// Initialize Backend Supabase validation
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
//  SOCKET.IO — Real-time Web3 Socketing
// ─────────────────────────────────────────────
let io;
try {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    console.log(`⚡ Socket connected: ${socket.id}`);

    // Join room by merchant ID for targeted events
    socket.on('join', (merchantId) => {
      socket.join(merchantId);
      console.log(`  → ${socket.id} joined room: ${merchantId}`);
    });

    // REMIX_IDE_INTEGRATION_POINT: Listen for contract deployment events from Remix
    socket.on('contract:deployed', (data) => {
      console.log('  → Contract deployed event:', data);
      // data = { contractAddress, abi, deployerMerchantId }
      // You can store this and broadcast to relevant parties
      io.emit('contract:updated', data);
    });

    // REMIX_IDE_INTEGRATION_POINT: Listen for contract interaction results
    socket.on('contract:interaction', (data) => {
      console.log('  → Contract interaction:', data);
      io.emit('contract:result', data);
    });

    socket.on('disconnect', () => {
      console.log(`⚡ Socket disconnected: ${socket.id}`);
    });
  });
} catch (e) {
  console.warn('⚠ Socket.IO not installed. Real-time features disabled. Run: npm install socket.io');
  io = { emit: () => { }, to: () => ({ emit: () => { } }) };
}

function emitEvent(event, data, targetRoom = null) {
  if (targetRoom) {
    io.to(targetRoom).emit(event, data);
  } else {
    io.emit(event, data);
  }
}

// ─────────────────────────────────────────────
//  DATABASE BOOTSTRAP
// ─────────────────────────────────────────────
const db = new Database(process.env.DB_PATH || './brace.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    company       TEXT,
    country       TEXT,
    role          TEXT DEFAULT 'both',
    wallet_address TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trade_deals (
    id               TEXT PRIMARY KEY,
    merchant_id      TEXT NOT NULL,
    product_name     TEXT NOT NULL,
    hs_code          TEXT,
    origin_country   TEXT NOT NULL,
    dest_country     TEXT NOT NULL,
    quantity         REAL NOT NULL,
    unit             TEXT,
    declared_grade   REAL DEFAULT 75,
    base_price       REAL NOT NULL,
    currency         TEXT DEFAULT 'USD',
    status           TEXT DEFAULT 'draft',
    trust_factor     REAL DEFAULT 1.0,
    grade_factor     REAL DEFAULT 1.0,
    risk_discount    REAL DEFAULT 1.0,
    final_price      REAL,
    documents        TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS seller_credit_scores (
    merchant_id              TEXT PRIMARY KEY,
    transaction_success_rate REAL DEFAULT 0.8,
    grade_accuracy_score     REAL DEFAULT 0.75,
    dispute_ratio_inverse    REAL DEFAULT 0.9,
    delivery_timeliness      REAL DEFAULT 0.8,
    buyer_feedback_score     REAL DEFAULT 0.75,
    composite_score          REAL DEFAULT 77.5,
    verification_tier        TEXT DEFAULT 'medium',
    total_transactions       INTEGER DEFAULT 0,
    updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS grade_verifications (
    id               TEXT PRIMARY KEY,
    deal_id          TEXT NOT NULL,
    declared_grade   REAL NOT NULL,
    verified_grade   REAL,
    accuracy_delta   REAL,
    status           TEXT DEFAULT 'pending',
    verifier_note    TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(deal_id) REFERENCES trade_deals(id)
  );

  CREATE TABLE IF NOT EXISTS disputes (
    id          TEXT PRIMARY KEY,
    deal_id     TEXT NOT NULL,
    raised_by   TEXT NOT NULL,
    reason      TEXT,
    status      TEXT DEFAULT 'open',
    resolution  TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    merchant_id TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    metadata    TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ BUYER TABLES ═══

  CREATE TABLE IF NOT EXISTS orders (
    id                      TEXT PRIMARY KEY,
    deal_id                 TEXT NOT NULL,
    buyer_id                TEXT NOT NULL,
    seller_id               TEXT NOT NULL,
    quantity                REAL NOT NULL,
    agreed_price            REAL NOT NULL,
    currency                TEXT DEFAULT 'USD',
    status                  TEXT DEFAULT 'pending',
    tx_hash                 TEXT,
    wallet_address_buyer    TEXT,
    wallet_address_seller   TEXT,
    escrow_contract_address TEXT,
    payment_method          TEXT DEFAULT 'web3',
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(deal_id) REFERENCES trade_deals(id),
    FOREIGN KEY(buyer_id) REFERENCES merchants(id),
    FOREIGN KEY(seller_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS buyer_profiles (
    merchant_id          TEXT PRIMARY KEY,
    wallet_address       TEXT,
    total_purchases      INTEGER DEFAULT 0,
    total_spent          REAL DEFAULT 0,
    buyer_rating         REAL DEFAULT 4.0,
    preferred_categories TEXT,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(merchant_id) REFERENCES merchants(id)
  );
`);

// ─────────────────────────────────────────────
//  DATABASE MIGRATIONS
// ─────────────────────────────────────────────
(function migrateSchema() {
  try {
    db.prepare('ALTER TABLE merchants ADD COLUMN wallet_address TEXT').run();
  } catch (e) {
    // Ignore if column already exists
  }
})();

(function migrateCountries() {
  const mapping = {
    'IN': 'India',
    'DE': 'Germany',
    'GB': 'United Kingdom',
    'US': 'United States',
    'CN': 'China',
    'AE': 'UAE'
  };

  try {
    for (const [oldCode, newName] of Object.entries(mapping)) {
      db.prepare('UPDATE trade_deals SET origin_country = ? WHERE origin_country = ?').run(newName, oldCode);
      db.prepare('UPDATE trade_deals SET dest_country = ? WHERE dest_country = ?').run(newName, oldCode);
      db.prepare('UPDATE merchants SET country = ? WHERE country = ?').run(newName, oldCode);
    }
  } catch (e) {
    console.warn('Migration warning:', e.message);
  }
})();


// ─────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // Allow inline scripts for single-page app
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Rate limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please wait 15 minutes.' }
});

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired Supabase token.' });
    }

    // Sync to local SQLite to ensure the user exists for foreign keys
    let dbMerchant = db.prepare('SELECT id FROM merchants WHERE email = ?').get(user.email);

    if (dbMerchant) {
      req.session = {
        merchantId: dbMerchant.id,
        merchantEmail: user.email
      };

      // Ensure name is up to date
      db.prepare('UPDATE merchants SET name = ? WHERE id = ?').run(
        user.user_metadata?.name || 'Supabase User', dbMerchant.id
      );
    } else {
      db.prepare(`INSERT INTO merchants (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)`).run(
        user.id, user.email, user.user_metadata?.name || 'Supabase User', 'supabase_managed', 'both'
      );

      // Initialize buyer profile
      db.prepare(`INSERT OR IGNORE INTO buyer_profiles (merchant_id) VALUES (?)`).run(user.id);

      req.session = {
        merchantId: user.id,
        merchantEmail: user.email
      };
    }

    // Safety check: always ensure buyer profile exists if it somehow didn't
    db.prepare(`INSERT OR IGNORE INTO buyer_profiles (merchant_id) VALUES (?)`).run(req.session.merchantId);

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error during auth validation.' });
  }
}

function auditLog(merchantId, action, entityType, entityId, metadata = {}) {
  try {
    db.prepare(`INSERT INTO audit_logs (id, merchant_id, action, entity_type, entity_id, metadata)
                VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuid(), merchantId, action, entityType, entityId, JSON.stringify(metadata));
  } catch (_) { }
}

// Seller Credit Score formula (as defined in system design)
function calculateCreditScore(metrics) {
  return (
    0.35 * (metrics.transaction_success_rate || 0.8) +
    0.20 * (metrics.grade_accuracy_score || 0.75) +
    0.15 * (metrics.dispute_ratio_inverse || 0.9) +
    0.15 * (metrics.delivery_timeliness || 0.8) +
    0.15 * (metrics.buyer_feedback_score || 0.75)
  ) * 100;
}

function getVerificationTier(score) {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

// Grade Accuracy Score formula
function gradeAccuracyScore(declared, verified, maxRange = 100) {
  return 1 - (Math.abs(declared - verified) / maxRange);
}

// Risk-Adjusted Final Price
function computeFinalPrice(basePrice, gradeFactor, trustFactor, riskDiscount) {
  return basePrice * gradeFactor * trustFactor * riskDiscount;
}

// ─────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password, company, country, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const userRole = ['buyer', 'seller', 'both'].includes(role) ? role : 'both';
  const merchantId = uuid();

  try {
    const existing = db.prepare('SELECT id FROM merchants WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    db.prepare(`INSERT INTO merchants (id, name, email, password_hash, company, country, role)
                VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(merchantId, name, email.toLowerCase(), password, company || null, country || null, userRole);

    if (userRole === 'seller' || userRole === 'both') {
      db.prepare(`INSERT INTO seller_credit_scores (merchant_id, composite_score, verification_tier)
                  VALUES (?, ?, ?)`
      ).run(merchantId, 77.5, 'medium');
    }

    if (userRole === 'buyer' || userRole === 'both') {
      db.prepare(`INSERT INTO buyer_profiles (merchant_id) VALUES (?)`).run(merchantId);
    }

    auditLog(merchantId, 'REGISTER', 'merchant', merchantId, { name, email, role: userRole });

    const token = jwt.sign({ id: merchantId, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      token,
      merchant: { id: merchantId, name, email, company, country, role: userRole }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const merchant = db.prepare('SELECT * FROM merchants WHERE email = ?').get(email.toLowerCase());
    if (!merchant) return res.status(401).json({ error: 'Invalid credentials.' });

    if (merchant.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    auditLog(merchant.id, 'LOGIN', 'merchant', merchant.id);

    const token = jwt.sign({ id: merchant.id, email: merchant.email }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      token,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        company: merchant.company,
        country: merchant.country,
        role: merchant.role || 'both',
        wallet_address: merchant.wallet_address
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const mid = req.session.merchantId;
  auditLog(mid, 'LOGOUT', 'merchant', mid);
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const merchant = db.prepare('SELECT id, name, email, company, country, role, created_at FROM merchants WHERE id = ?')
    .get(req.session.merchantId);
  if (!merchant) return res.status(404).json({ error: 'Merchant not found.' });
  res.json({ merchant });
});

// Update wallet address
app.post('/api/auth/wallet', requireAuth, (req, res) => {
  const { wallet_address } = req.body;
  db.prepare('UPDATE merchants SET wallet_address = ? WHERE id = ?')
    .run(wallet_address, req.session.merchantId);

  // Also update buyer profile if exists
  const bp = db.prepare('SELECT merchant_id FROM buyer_profiles WHERE merchant_id = ?').get(req.session.merchantId);
  if (bp) {
    db.prepare('UPDATE buyer_profiles SET wallet_address = ? WHERE merchant_id = ?')
      .run(wallet_address, req.session.merchantId);
  }

  auditLog(req.session.merchantId, 'UPDATE_WALLET', 'merchant', req.session.merchantId, { wallet_address });
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  TRUST & CREDIT SCORE ROUTES
// ─────────────────────────────────────────────

app.get('/api/trust/score/:merchantId', requireAuth, (req, res) => {
  const score = db.prepare('SELECT * FROM seller_credit_scores WHERE merchant_id = ?')
    .get(req.params.merchantId);
  if (!score) return res.status(404).json({ error: 'No credit score found.' });
  res.json({ score });
});

app.get('/api/trust/my-score', requireAuth, (req, res) => {
  const score = db.prepare('SELECT * FROM seller_credit_scores WHERE merchant_id = ?')
    .get(req.session.merchantId);
  if (!score) return res.status(404).json({ error: 'No credit score found.' });
  res.json({ score });
});

app.post('/api/trust/update-score', requireAuth, (req, res) => {
  const {
    transaction_success_rate,
    grade_accuracy_score,
    dispute_ratio_inverse,
    delivery_timeliness,
    buyer_feedback_score
  } = req.body;

  const metrics = {
    transaction_success_rate: transaction_success_rate || 0.8,
    grade_accuracy_score: grade_accuracy_score || 0.75,
    dispute_ratio_inverse: dispute_ratio_inverse || 0.9,
    delivery_timeliness: delivery_timeliness || 0.8,
    buyer_feedback_score: buyer_feedback_score || 0.75
  };

  const composite = calculateCreditScore(metrics);
  const tier = getVerificationTier(composite);

  db.prepare(`UPDATE seller_credit_scores SET
    transaction_success_rate = ?,
    grade_accuracy_score     = ?,
    dispute_ratio_inverse    = ?,
    delivery_timeliness      = ?,
    buyer_feedback_score     = ?,
    composite_score          = ?,
    verification_tier        = ?,
    updated_at               = CURRENT_TIMESTAMP
    WHERE merchant_id = ?`
  ).run(
    metrics.transaction_success_rate,
    metrics.grade_accuracy_score,
    metrics.dispute_ratio_inverse,
    metrics.delivery_timeliness,
    metrics.buyer_feedback_score,
    composite,
    tier,
    req.session.merchantId
  );

  auditLog(req.session.merchantId, 'UPDATE_CREDIT_SCORE', 'credit_score', req.session.merchantId, { composite, tier });
  res.json({ success: true, composite_score: composite, verification_tier: tier });
});

// ─────────────────────────────────────────────
//  TRADE DEAL ROUTES (SELLER)
// ─────────────────────────────────────────────

app.post('/api/deals/create', requireAuth, (req, res) => {
  const {
    product_name, hs_code, origin_country, dest_country,
    quantity, unit, declared_grade, base_price, currency
  } = req.body;

  if (!product_name || !origin_country || !dest_country || !quantity || !base_price) {
    return res.status(400).json({ error: 'Missing required trade deal fields.' });
  }

  const creditScore = db.prepare('SELECT * FROM seller_credit_scores WHERE merchant_id = ?')
    .get(req.session.merchantId);

  const score = creditScore ? creditScore.composite_score : 77.5;

  // Grade factor: (declared_grade / 100)^0.5 — sublinear reward
  const gradeF = Math.pow((declared_grade || 75) / 100, 0.5);
  // Trust factor: score-based
  const trustF = 0.7 + (score / 100) * 0.3;
  // Risk discount: simplified — destination-based
  const riskD = 0.95;

  const finalP = computeFinalPrice(Number(base_price), gradeF, trustF, riskD);

  try {
    const dealId = uuid();
    db.prepare(`INSERT INTO trade_deals
      (id, merchant_id, product_name, hs_code, origin_country, dest_country, quantity, unit,
       declared_grade, base_price, currency, status, trust_factor, grade_factor, risk_discount, final_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
    ).run(
      dealId, req.session.merchantId, product_name, hs_code || null,
      origin_country, dest_country, quantity, unit || 'MT',
      declared_grade || 75, base_price, currency || 'USD',
      trustF, gradeF, riskD, finalP
    );

    // Trigger verification if low credit score
    let verificationRequired = false;
    if (creditScore && creditScore.verification_tier === 'low') {
      verificationRequired = true;
      const verifyId = uuid();
      db.prepare(`INSERT INTO grade_verifications (id, deal_id, declared_grade, status)
                  VALUES (?, ?, ?, 'required')`
      ).run(verifyId, dealId, declared_grade || 75);
    }

    auditLog(req.session.merchantId, 'CREATE_DEAL', 'deal', dealId, { product_name, origin_country, dest_country });

    // Socket.IO: Notify buyers of new listing
    emitEvent('deal:new_listing', {
      id: dealId,
      product_name,
      origin_country,
      dest_country,
      quantity,
      unit: unit || 'MT',
      final_price: finalP,
      seller_id: req.session.merchantId
    });

    res.json({
      success: true,
      deal: { id: dealId, product_name, final_price: finalP, trust_factor: trustF, grade_factor: gradeF },
      verification_required: verificationRequired,
      pricing_breakdown: {
        base_price: Number(base_price),
        grade_factor: gradeF,
        trust_factor: trustF,
        risk_discount: riskD,
        final_price: finalP
      }
    });
  } catch (err) {
    console.error('Create Deal Error:', err);
    res.status(500).json({ error: 'Database error creating deal: ' + err.message });
  }
});

app.get('/api/deals/my-deals', requireAuth, (req, res) => {
  const deals = db.prepare('SELECT * FROM trade_deals WHERE merchant_id = ? ORDER BY created_at DESC')
    .all(req.session.merchantId);
  res.json({ deals });
});

app.get('/api/deals/:dealId', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM trade_deals WHERE id = ?').get(req.params.dealId);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  res.json({ deal });
});

app.patch('/api/deals/:dealId/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const allowed = ['draft', 'active', 'in_transit', 'completed', 'disputed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  db.prepare('UPDATE trade_deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?')
    .run(status, req.params.dealId, req.session.merchantId);

  // Update credit score if completed
  if (status === 'completed') {
    const existing = db.prepare('SELECT * FROM seller_credit_scores WHERE merchant_id = ?').get(req.session.merchantId);
    if (existing) {
      const newTotal = (existing.total_transactions || 0) + 1;
      db.prepare('UPDATE seller_credit_scores SET total_transactions = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?')
        .run(newTotal, req.session.merchantId);
    }
  }

  auditLog(req.session.merchantId, 'UPDATE_DEAL_STATUS', 'deal', req.params.dealId, { status });
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  MARKETPLACE ROUTES (BUYER)
// ─────────────────────────────────────────────

// Simple MaxHeap implementation for match-making
class MaxHeap {
  constructor() {
    this.heap = [];
  }
  push(val) {
    this.heap.push(val);
    this.bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop();
    const top = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.sinkDown(0);
    return top;
  }
  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].score >= this.heap[index].score) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }
  sinkDown(index) {
    const length = this.heap.length;
    while (true) {
      let left = 2 * index + 1;
      let right = 2 * index + 2;
      let largest = index;
      if (left < length && this.heap[left].score > this.heap[largest].score) largest = left;
      if (right < length && this.heap[right].score > this.heap[largest].score) largest = right;
      if (largest === index) break;
      [this.heap[index], this.heap[largest]] = [this.heap[largest], this.heap[index]];
      index = largest;
    }
  }
}

// Auto-Matchmaking Endpoint
app.get('/api/marketplace/matches', requireAuth, (req, res) => {
  const { category, region, ideal_price } = req.query;

  // 1. Get buyer profile to fallback on preferences
  const profile = db.prepare('SELECT preferred_categories FROM buyer_profiles WHERE merchant_id = ?').get(req.session.merchantId);

  const searchCategory = (category || (profile && profile.preferred_categories) || '').toLowerCase();
  const targetRegion = (region || '').toLowerCase();
  const targetPrice = Number(ideal_price) || Infinity;

  // 2. Fetch all active deals with seller scores
  const deals = db.prepare(`
    SELECT d.*, m.name as seller_name, m.company as seller_company,
           s.composite_score as seller_trust_score, s.verification_tier as seller_tier
    FROM trade_deals d
    JOIN merchants m ON d.merchant_id = m.id
    LEFT JOIN seller_credit_scores s ON d.merchant_id = s.merchant_id
    WHERE d.status = 'active' AND d.merchant_id != ?
  `).all(req.session.merchantId);

  const heap = new MaxHeap();

  // 3. Compute Match Score and push to heap
  for (const deal of deals) {
    let score = 0;

    // Category match (highest weight)
    if (searchCategory && deal.product_name.toLowerCase().includes(searchCategory)) {
      score += 50;
    }

    // Region match
    if (targetRegion && deal.origin_country.toLowerCase() === targetRegion) {
      score += 30;
    }

    // Pricing competitiveness
    if (deal.final_price <= targetPrice) {
      score += 20;
    } else {
      // Penalty for being over price (soft boundary)
      const overage = (deal.final_price - targetPrice) / targetPrice;
      score -= (overage * 10);
    }

    // Trust & Quality factors
    score += (deal.seller_trust_score || 70) * 0.1; // up to 10 points
    score += (deal.grade_factor || 1.0) * 10;       // up to ~12 points

    heap.push({ score, deal });
  }

  // 4. Pop the top 5 matches
  const topMatches = [];
  for (let i = 0; i < 5; i++) {
    const match = heap.pop();
    if (match) topMatches.push(match);
  }

  res.json({ matches: topMatches });
});

// Browse all active deals (public marketplace for buyers)
app.get('/api/marketplace/deals', requireAuth, (req, res) => {
  const { search, origin, dest, min_price, max_price } = req.query;

  let query = `SELECT d.*, m.name as seller_name, m.company as seller_company, m.country as seller_country,
               s.composite_score as seller_trust_score, s.verification_tier as seller_tier
               FROM trade_deals d
               JOIN merchants m ON d.merchant_id = m.id
               LEFT JOIN seller_credit_scores s ON d.merchant_id = s.merchant_id
               WHERE d.status = 'active' AND d.merchant_id != ?`;
  const params = [req.session.merchantId];

  if (search) {
    query += ` AND d.product_name LIKE ?`;
    params.push(`%${search}%`);
  }
  if (origin) {
    query += ` AND LOWER(d.origin_country) = LOWER(?)`;
    params.push(origin);
  }
  if (dest) {
    query += ` AND d.dest_country = ?`;
    params.push(dest);
  }
  if (min_price) {
    query += ` AND d.final_price >= ?`;
    params.push(Number(min_price));
  }
  if (max_price) {
    query += ` AND d.final_price <= ?`;
    params.push(Number(max_price));
  }

  query += ` ORDER BY d.created_at DESC`;

  const deals = db.prepare(query).all(...params);
  res.json({ deals });
});

// Get single deal with seller info (for buyer view)
app.get('/api/marketplace/deals/:dealId', requireAuth, (req, res) => {
  const deal = db.prepare(`
    SELECT d.*, m.name as seller_name, m.company as seller_company, m.country as seller_country,
           m.wallet_address as seller_wallet,
           s.composite_score as seller_trust_score, s.verification_tier as seller_tier
    FROM trade_deals d
    JOIN merchants m ON d.merchant_id = m.id
    LEFT JOIN seller_credit_scores s ON d.merchant_id = s.merchant_id
    WHERE d.id = ?
  `).get(req.params.dealId);

  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  res.json({ deal });
});

// ─────────────────────────────────────────────
//  ORDER ROUTES (BUYER)
// ─────────────────────────────────────────────

// Create order (buyer places order on a deal)
app.post('/api/orders/create', requireAuth, (req, res) => {
  const { deal_id, quantity, wallet_address } = req.body;

  if (!deal_id || !quantity) {
    return res.status(400).json({ error: 'Deal ID and quantity are required.' });
  }

  const deal = db.prepare('SELECT * FROM trade_deals WHERE id = ? AND status = ?').get(deal_id, 'active');
  if (!deal) return res.status(404).json({ error: 'Deal not found or not active.' });

  if (deal.merchant_id === req.session.merchantId) {
    return res.status(400).json({ error: 'Cannot order your own deal.' });
  }

  const orderQty = Math.min(Number(quantity), deal.quantity);
  const pricePerUnit = deal.final_price / deal.quantity;
  const agreedPrice = pricePerUnit * orderQty;

  const seller = db.prepare('SELECT wallet_address FROM merchants WHERE id = ?').get(deal.merchant_id);

  const orderId = uuid();
  db.prepare(`INSERT INTO orders (id, deal_id, buyer_id, seller_id, quantity, agreed_price, currency,
              status, wallet_address_buyer, wallet_address_seller, payment_method)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'web3')`)
    .run(orderId, deal_id, req.session.merchantId, deal.merchant_id,
      orderQty, agreedPrice, deal.currency || 'USD',
      wallet_address || null, seller?.wallet_address || null);

  auditLog(req.session.merchantId, 'CREATE_ORDER', 'order', orderId, { deal_id, quantity: orderQty, agreed_price: agreedPrice });

  // Socket.IO: Notify seller of new order
  emitEvent('order:created', {
    id: orderId,
    deal_id,
    buyer_id: req.session.merchantId,
    product_name: deal.product_name,
    quantity: orderQty,
    agreed_price: agreedPrice
  }, deal.merchant_id);

  res.json({
    success: true,
    order: {
      id: orderId,
      deal_id,
      quantity: orderQty,
      agreed_price: agreedPrice,
      seller_wallet: seller?.wallet_address || null,
      status: 'pending'
    }
  });
});

// Get buyer's orders
app.get('/api/orders/my-orders', requireAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, d.product_name, d.origin_country, d.dest_country, d.unit,
           m.name as seller_name, m.company as seller_company
    FROM orders o
    JOIN trade_deals d ON o.deal_id = d.id
    JOIN merchants m ON o.seller_id = m.id
    WHERE o.buyer_id = ?
    ORDER BY o.created_at DESC
  `).all(req.session.merchantId);
  res.json({ orders });
});

// Get seller's received orders
app.get('/api/orders/seller-orders', requireAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, d.product_name, d.origin_country, d.dest_country, d.unit,
           m.name as buyer_name, m.company as buyer_company
    FROM orders o
    JOIN trade_deals d ON o.deal_id = d.id
    JOIN merchants m ON o.buyer_id = m.id
    WHERE o.seller_id = ?
    ORDER BY o.created_at DESC
  `).all(req.session.merchantId);
  res.json({ orders });
});

app.get('/api/orders/:orderId', requireAuth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, d.product_name, d.origin_country, d.dest_country, d.unit, d.declared_grade,
           ms.name as seller_name, ms.company as seller_company, ms.wallet_address as seller_wallet,
           mb.name as buyer_name, mb.company as buyer_company, mb.wallet_address as buyer_wallet
    FROM orders o
    JOIN trade_deals d ON o.deal_id = d.id
    JOIN merchants ms ON o.seller_id = ms.id
    JOIN merchants mb ON o.buyer_id = mb.id
    WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
  `).get(req.params.orderId, req.session.merchantId, req.session.merchantId);

  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order });
});

// Update order status
app.patch('/api/orders/:orderId/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'paid', 'escrow', 'shipped', 'delivered', 'completed', 'disputed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?)')
    .get(req.params.orderId, req.session.merchantId, req.session.merchantId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, req.params.orderId);

  // Update buyer profile on completion
  if (status === 'completed') {
    db.prepare(`UPDATE buyer_profiles SET
      total_purchases = total_purchases + 1,
      total_spent = total_spent + ?,
      updated_at = CURRENT_TIMESTAMP
      WHERE merchant_id = ?`
    ).run(order.agreed_price, order.buyer_id);
  }

  auditLog(req.session.merchantId, 'UPDATE_ORDER_STATUS', 'order', req.params.orderId, { status });

  // Socket.IO: Notify counterparty of status change
  const target = req.session.merchantId === order.buyer_id ? order.seller_id : order.buyer_id;
  emitEvent('order:status_changed', {
    id: req.params.orderId,
    status,
    updated_by: req.session.merchantId
  }, target);

  res.json({ success: true });
});

// Record blockchain payment
app.post('/api/orders/:orderId/payment', requireAuth, (req, res) => {
  const { tx_hash, wallet_address, escrow_contract_address } = req.body;

  if (!tx_hash) return res.status(400).json({ error: 'Transaction hash required.' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?')
    .get(req.params.orderId, req.session.merchantId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  db.prepare(`UPDATE orders SET
    tx_hash = ?, wallet_address_buyer = ?, escrow_contract_address = ?,
    status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(tx_hash, wallet_address || null, escrow_contract_address || null, req.params.orderId);

  auditLog(req.session.merchantId, 'RECORD_PAYMENT', 'order', req.params.orderId, { tx_hash });

  // Socket.IO: Notify seller of payment
  emitEvent('order:paid', {
    id: req.params.orderId,
    tx_hash,
    buyer_id: req.session.merchantId,
    amount: order.agreed_price
  }, order.seller_id);

  // Socket.IO: Broadcast tx confirmation
  emitEvent('web3:tx_confirmed', {
    order_id: req.params.orderId,
    tx_hash,
    amount: order.agreed_price
  });

  res.json({ success: true, status: 'paid' });
});

// ─────────────────────────────────────────────
//  STRIPE PAYMENT INTEGRATION
// ─────────────────────────────────────────────

app.post('/api/stripe/create-checkout-session', requireAuth, async (req, res) => {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'Order ID required.' });

  const order = db.prepare(`
    SELECT o.*, d.product_name 
    FROM orders o 
    JOIN trade_deals d ON o.deal_id = d.id 
    WHERE o.id = ? AND o.buyer_id = ?
  `).get(order_id, req.session.merchantId);

  if (!order) return res.status(404).json({ error: 'Order not found or access denied.' });
  if (order.status !== 'pending') return res.status(400).json({ error: 'Order is no longer pending.' });

  try {
    const sessionUrl = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: order.product_name,
            },
            unit_amount: Math.round(order.agreed_price * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
      cancel_url: `${req.protocol}://${req.get('host')}/#buyer-dashboard`, // fallback to dashboard if they cancel
    });

    res.json({ success: true, url: sessionUrl.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stripe/success', async (req, res) => {
  const { session_id, order_id } = req.query;

  if (!session_id || !order_id) {
    return res.status(400).send('Missing parameters.');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
      if (order && order.status === 'pending') {
        db.prepare(`UPDATE orders SET
          status = 'paid', payment_method = 'stripe', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(order_id);

        auditLog(order.buyer_id, 'RECORD_PAYMENT', 'order', order_id, { method: 'stripe', session_id });

        emitEvent('order:paid', {
          id: order_id,
          method: 'stripe',
          buyer_id: order.buyer_id,
          amount: order.agreed_price
        }, order.seller_id);
      }
      res.redirect('/#buyer-dashboard');
    } else {
      res.redirect('/#buyer-dashboard');
    }
  } catch (error) {
    console.error('Stripe validation error:', error);
    res.status(500).send('Internal Server Error validating Stripe payload.');
  }
});

// ─────────────────────────────────────────────
//  BUYER PROFILE & DASHBOARD
// ─────────────────────────────────────────────

app.get('/api/buyer/profile', requireAuth, (req, res) => {
  let profile = db.prepare('SELECT * FROM buyer_profiles WHERE merchant_id = ?')
    .get(req.session.merchantId);

  if (!profile) {
    // Create if doesn't exist
    db.prepare('INSERT OR IGNORE INTO buyer_profiles (merchant_id) VALUES (?)').run(req.session.merchantId);
    profile = db.prepare('SELECT * FROM buyer_profiles WHERE merchant_id = ?').get(req.session.merchantId);
  }

  res.json({ profile });
});

app.post('/api/buyer/profile', requireAuth, (req, res) => {
  const { wallet_address, preferred_categories } = req.body;

  db.prepare(`INSERT INTO buyer_profiles (merchant_id, wallet_address, preferred_categories)
              VALUES (?, ?, ?)
              ON CONFLICT(merchant_id) DO UPDATE SET
              wallet_address = COALESCE(?, wallet_address),
              preferred_categories = COALESCE(?, preferred_categories),
              updated_at = CURRENT_TIMESTAMP`)
    .run(req.session.merchantId, wallet_address || null, preferred_categories || null,
      wallet_address, preferred_categories);

  res.json({ success: true });
});

app.get('/api/buyer/dashboard/stats', requireAuth, (req, res) => {
  const mid = req.session.merchantId;

  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders WHERE buyer_id = ?').get(mid).c;
  const activeOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE buyer_id = ? AND status IN ('pending', 'paid', 'escrow', 'shipped')").get(mid).c;
  const completedOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE buyer_id = ? AND status = 'completed'").get(mid).c;
  const totalSpent = db.prepare("SELECT SUM(agreed_price) as s FROM orders WHERE buyer_id = ? AND status IN ('paid', 'escrow', 'shipped', 'delivered', 'completed')").get(mid).s || 0;
  const profile = db.prepare('SELECT buyer_rating FROM buyer_profiles WHERE merchant_id = ?').get(mid);
  const recentOrders = db.prepare(`
    SELECT o.*, d.product_name, d.origin_country, d.dest_country, d.unit,
           m.name as seller_name
    FROM orders o
    JOIN trade_deals d ON o.deal_id = d.id
    JOIN merchants m ON o.seller_id = m.id
    WHERE o.buyer_id = ?
    ORDER BY o.created_at DESC LIMIT 5
  `).all(mid);

  res.json({
    stats: {
      total_orders: totalOrders,
      active_orders: activeOrders,
      completed_orders: completedOrders,
      total_spent_usd: totalSpent,
      buyer_rating: profile?.buyer_rating || 4.0
    },
    recent_orders: recentOrders
  });
});

// ─────────────────────────────────────────────
//  WEB3 CONTRACT CONFIG
//  REMIX_IDE_INTEGRATION_POINT
// ─────────────────────────────────────────────

app.get('/api/web3/contract-config', requireAuth, (req, res) => {
  // REMIX_IDE_INTEGRATION_POINT: These values should be set from your Remix IDE deployment
  // Update .env with CONTRACT_ADDRESS and CONTRACT_ABI after deploying from Remix IDE
  res.json({
    success: true,
    config: {
      network_id: Number(process.env.WEB3_NETWORK_ID) || 80002,
      rpc_url: process.env.WEB3_RPC_URL || 'https://rpc-amoy.polygon.technology',
      chain_name: process.env.WEB3_CHAIN_NAME || 'Polygon Amoy Testnet',
      currency_name: process.env.WEB3_CURRENCY_NAME || 'MATIC',
      currency_symbol: process.env.WEB3_CURRENCY_SYMBOL || 'MATIC',
      currency_decimals: 18,
      block_explorer: process.env.WEB3_BLOCK_EXPLORER || 'https://amoy.polygonscan.com',
      // REMIX_IDE_INTEGRATION_POINT: Set these after deploying contract from Remix IDE
      contract_address: process.env.WEB3_CONTRACT_ADDRESS || null,
      contract_abi: process.env.WEB3_CONTRACT_ABI ? JSON.parse(process.env.WEB3_CONTRACT_ABI) : null,
      escrow_contract_address: process.env.WEB3_ESCROW_ADDRESS || null,
      escrow_contract_abi: process.env.WEB3_ESCROW_ABI ? JSON.parse(process.env.WEB3_ESCROW_ABI) : null
    },
    integration_notes: {
      remix_ide_url: 'https://remix.ethereum.org',
      instructions: [
        '1. Open Remix IDE and write/compile your Solidity contract',
        '2. Deploy to Polygon Amoy testnet (or mainnet)',
        '3. Copy the contract address and ABI',
        '4. Set WEB3_CONTRACT_ADDRESS and WEB3_CONTRACT_ABI in .env',
        '5. Restart the server — the frontend will auto-detect the contract'
      ]
    }
  });
});

// ─────────────────────────────────────────────
//  DOCUMENT GENERATION ROUTES
// ─────────────────────────────────────────────

function generateInvoice(deal, merchant) {
  return {
    type: 'Commercial Invoice',
    doc_id: `INV-${Date.now()}`,
    issued_by: merchant.company || merchant.name,
    issued_to: `Buyer in ${deal.dest_country}`,
    product: deal.product_name,
    hs_code: deal.hs_code || 'To be declared',
    quantity: `${deal.quantity} ${deal.unit || 'MT'}`,
    unit_price: deal.base_price,
    currency: deal.currency,
    total: deal.final_price,
    grade: deal.declared_grade,
    origin: deal.origin_country,
    destination: deal.dest_country,
    created_at: new Date().toISOString(),
    note: 'This invoice is generated by Brace Trade OS. Subject to Brace Terms of Service.'
  };
}

function generatePOA(deal, merchant) {
  return {
    type: 'Proof of Agreement (POA)',
    doc_id: `POA-${Date.now()}`,
    trade_deal_id: deal.id,
    seller: merchant.company || merchant.name,
    product: deal.product_name,
    grade_declared: deal.declared_grade,
    grade_tolerance: '±3 points on Normalized Global Grade Scale',
    inspection_clause: deal.trust_factor < 0.75 ? 'Mandatory third-party grade inspection required.' : 'Inspection waived based on seller trust score.',
    liability_clause: 'Brace Trade OS acts solely as a digital infrastructure and coordination layer. All commercial liability rests with buyer and seller as counterparties.',
    dispute_clause: 'Any dispute shall be resolved through independent arbitration. Platform acts as mediator only.',
    escrow_clause: 'Payment held in escrow pending buyer confirmation of delivery and grade acceptance.',
    created_at: new Date().toISOString()
  };
}

function generatePackingList(deal) {
  return {
    type: 'Packing List',
    doc_id: `PKL-${Date.now()}`,
    product: deal.product_name,
    hs_code: deal.hs_code || 'To be declared',
    quantity: deal.quantity,
    unit: deal.unit || 'MT',
    grade: deal.declared_grade,
    origin: deal.origin_country,
    destination: deal.dest_country,
    created_at: new Date().toISOString()
  };
}

app.post('/api/documents/generate', requireAuth, (req, res) => {
  const { deal_id } = req.body;

  const deal = db.prepare('SELECT * FROM trade_deals WHERE id = ? AND merchant_id = ?').get(deal_id, req.session.merchantId);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });

  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(req.session.merchantId);

  const docs = {
    invoice: generateInvoice(deal, merchant),
    poa: generatePOA(deal, merchant),
    packing_list: generatePackingList(deal)
  };

  // Save document reference to deal
  db.prepare('UPDATE trade_deals SET documents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(Object.keys(docs)), deal_id);

  auditLog(req.session.merchantId, 'GENERATE_DOCUMENTS', 'deal', deal_id);

  res.json({ success: true, documents: docs });
});

// ─────────────────────────────────────────────
//  TAX & TARIFF CALCULATION
// ─────────────────────────────────────────────

const TARIFF_MATRIX = {
  'India-Germany': { base_tariff: 7.5, vat: 19, other_duties: 1.5 },
  'India-United States': { base_tariff: 3.5, vat: 0, other_duties: 0.5 },
  'India-United Kingdom': { base_tariff: 5.0, vat: 20, other_duties: 1.0 },
  'India-UAE': { base_tariff: 5.0, vat: 5, other_duties: 0.0 },
  'India-China': { base_tariff: 10.0, vat: 13, other_duties: 2.0 },
  'Germany-India': { base_tariff: 8.5, vat: 18, other_duties: 1.0 },
  'United States-India': { base_tariff: 4.0, vat: 18, other_duties: 1.5 },
  'DEFAULT': { base_tariff: 8.0, vat: 10, other_duties: 2.0 }
};

app.post('/api/tax/calculate', requireAuth, (req, res) => {
  const { origin_country, dest_country, trade_value, hs_code } = req.body;

  const key = `${origin_country}-${dest_country}`;
  const tariff = TARIFF_MATRIX[key] || TARIFF_MATRIX['DEFAULT'];

  const dutiableValue = Number(trade_value);
  const customsDuty = (dutiableValue * tariff.base_tariff) / 100;
  const otherDuties = (dutiableValue * tariff.other_duties) / 100;
  const vatBase = dutiableValue + customsDuty + otherDuties;
  const vatAmount = (vatBase * tariff.vat) / 100;
  const totalTaxBurden = customsDuty + otherDuties + vatAmount;
  const landedCost = dutiableValue + totalTaxBurden;

  res.json({
    success: true,
    tax_breakdown: {
      trade_value: dutiableValue,
      base_tariff_rate: tariff.base_tariff,
      customs_duty: customsDuty,
      other_duties: otherDuties,
      vat_rate: tariff.vat,
      vat_amount: vatAmount,
      total_tax_burden: totalTaxBurden,
      landed_cost: landedCost,
      effective_tax_pct: ((totalTaxBurden / dutiableValue) * 100).toFixed(2)
    },
    disclaimer: 'Tax figures are indicative estimates based on standard trade routes. Consult a licensed customs broker for binding tariff classification.'
  });
});

// ─────────────────────────────────────────────
//  EXCHANGE RATES (free, no key needed)
// ─────────────────────────────────────────────

app.get('/api/fx/rates', requireAuth, async (req, res) => {
  const base = req.query.base || 'USD';
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await response.json();
    if (data.result === 'success') {
      res.json({ success: true, base: data.base_code, rates: data.rates, updated: data.time_last_update_utc });
    } else {
      res.json({ success: true, base: 'USD', rates: { INR: 83.5, EUR: 0.92, GBP: 0.79, AED: 3.67, CNY: 7.24, JPY: 149.5, SGD: 1.34 }, source: 'fallback' });
    }
  } catch (err) {
    res.json({ success: true, base: 'USD', rates: { INR: 83.5, EUR: 0.92, GBP: 0.79, AED: 3.67, CNY: 7.24, JPY: 149.5, SGD: 1.34 }, source: 'fallback' });
  }
});

// ─────────────────────────────────────────────
//  COUNTRY DATA
// ─────────────────────────────────────────────

app.get('/api/countries', requireAuth, async (req, res) => {
  try {
    const response = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,region,currencies,languages,flags');
    const data = await response.json();
    const minimal = data.map(c => ({
      code: c.cca2,
      name: c.name.common,
      region: c.region,
      currency: c.currencies ? Object.keys(c.currencies)[0] : 'USD',
      flag: c.flags?.svg || c.flags?.png || ''
    })).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, countries: minimal });
  } catch (err) {
    res.json({
      success: true,
      countries: [
        { code: 'IN', name: 'India', region: 'Asia', currency: 'INR' },
        { code: 'DE', name: 'Germany', region: 'Europe', currency: 'EUR' },
        { code: 'US', name: 'United States', region: 'Americas', currency: 'USD' },
        { code: 'GB', name: 'United Kingdom', region: 'Europe', currency: 'GBP' },
        { code: 'AE', name: 'UAE', region: 'Asia', currency: 'AED' },
        { code: 'CN', name: 'China', region: 'Asia', currency: 'CNY' },
        { code: 'JP', name: 'Japan', region: 'Asia', currency: 'JPY' },
        { code: 'SG', name: 'Singapore', region: 'Asia', currency: 'SGD' },
        { code: 'AU', name: 'Australia', region: 'Oceania', currency: 'AUD' },
        { code: 'CA', name: 'Canada', region: 'Americas', currency: 'CAD' },
      ]
    });
  }
});

// ─────────────────────────────────────────────
//  AI RECOMMENDER ENGINE (MSMFM - Macro-Sentiment Multi-Factor Model)
// ─────────────────────────────────────────────
const recommenderModel = require('./recommender_model');

// ── Load Commodity Prices from pink_Sheet.csv ──
let COMMODITY_PRICES = [];
try {
  const csvRaw = fs.readFileSync(path.join(__dirname, 'reccomender', 'pink_Sheet.csv'), 'utf-8');
  COMMODITY_PRICES = csvRaw.split('\n').filter(l => l.trim()).slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    return { commodity: cols[0] || '', unit: cols[1] || '', price_2023: parseFloat(cols[3]) || 0 };
  });
  console.log(`  📦 Loaded ${COMMODITY_PRICES.length} commodities from pink_Sheet.csv`);
} catch (e) {
  console.warn('⚠ Could not load pink_Sheet.csv:', e.message);
}

function getCommodityPrice(product) {
  const match = COMMODITY_PRICES.find(c =>
    c.commodity.toLowerCase().includes(product.toLowerCase()) || 
    product.toLowerCase().includes(c.commodity.toLowerCase().split('(')[0].trim())
  );
  return match;
}

// ── ENDPOINT: Recommend Best Seller ──
app.post('/api/ai/recommend-seller', async (req, res) => {
  const { product, buyer_country } = req.body;
  const HF_KEY = process.env.HUGGING_FACE_API_KEY;

  if (!product || !buyer_country) return res.status(400).json({ error: 'Product and buyer country required.' });

  const commodity = getCommodityPrice(product || '');
  if (!commodity) {
    return res.json({ success: false, error: 'No data for this commodity.', available: COMMODITY_PRICES.map(c => c.commodity) });
  }

  try {
    const exchangeRatesResponse = await fetch(`https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_API_KEY || 'edd006ac4e2704a4c4c93dab'}/latest/USD`);
    const ratesData = await exchangeRatesResponse.json();
    const rates = ratesData.conversion_rates || { INR: 83.5, USD: 1, CNY: 7.24, EUR: 0.92, JPY: 149.5, AED: 3.67 };

    const countries = Object.keys(recommenderModel.RECOMMENDER_COUNTRIES).filter(c => c !== buyer_country);
    const sellerResults = [];

    // Instant Synchronous Model Inference
    for (const seller of countries) {
      try {
        const result = recommenderModel.predictPriceRange(product, seller, buyer_country, commodity.price_2023, rates);
        sellerResults.push({ seller, ...result });
      } catch (_) {}
    }

    if (!sellerResults.length) throw new Error('Model failed to generate predictions.');

    const bestSeller = sellerResults.reduce((a, b) => a.min_price < b.min_price ? a : b);

    res.json({
      success: true,
      recommendation: {
        best_seller: bestSeller.seller,
        best_range: [bestSeller.min_price, bestSeller.max_price],
        best_factors: bestSeller.factors,
        currency: bestSeller.currency || recommenderModel.RECOMMENDER_CURRENCIES[buyer_country] || 'USD',
        commodity: commodity.commodity,
        commodity_unit: commodity.unit,
        base_price_usd: commodity.price_2023,
        overall_range: [
          Math.min(...sellerResults.map(s => s.min_price)),
          Math.max(...sellerResults.map(s => s.max_price))
        ],
        all_sellers: sellerResults.sort((a, b) => a.min_price - b.min_price)
      },
      ml_models: {
        algorithm: 'Deterministic Economic Advantage Model (DEAM)',
        features: ['Inflation Disparity', 'Volatility Premium', 'Commodity Affinity', 'Global Demand'],
        latency: 'Instanteous (In-Memory Heuristics)'
      },
      disclaimer: 'AI recommendations are indicative estimates based on deterministic macroeconomic heuristics.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Model failed: ' + err.message });
  }
});

app.get('/api/ai/commodities', (req, res) => {
  res.json({ success: true, commodities: COMMODITY_PRICES });
});

app.post('/api/ai/recommend-markets', async (req, res) => {
  const { product_name, origin_country } = req.body;
  const commodityInfo = getCommodityPrice(product_name || '');
  
  const marketIntel = {
    'wheat': { top_markets: ['Egypt', 'Indonesia', 'Turkey'], demand: 'high' },
    'rice': { top_markets: ['Nigeria', 'Saudi Arabia', 'Japan'], demand: 'high' },
    'coffee': { top_markets: ['USA', 'Germany', 'Japan'], demand: 'high' },
    'default': { top_markets: ['USA', 'Germany', 'UAE'], demand: 'medium' }
  };

  const key = Object.keys(marketIntel).find(k => product_name?.toLowerCase().includes(k)) || 'default';
  
  res.json({
    success: true,
    product: product_name,
    intel: marketIntel[key],
    commodity_data: commodityInfo,
    disclaimer: 'Market recommendations are indicative estimates.'
  });
});

// ─────────────────────────────────────────────
//  DISPUTES
// ─────────────────────────────────────────────

app.post('/api/disputes/raise', requireAuth, (req, res) => {
  const { deal_id, reason } = req.body;
  const disputeId = uuid();

  db.prepare('INSERT INTO disputes (id, deal_id, raised_by, reason) VALUES (?, ?, ?, ?)')
    .run(disputeId, deal_id, req.session.merchantId, reason);

  db.prepare('UPDATE trade_deals SET status = ? WHERE id = ?').run('disputed', deal_id);
  auditLog(req.session.merchantId, 'RAISE_DISPUTE', 'dispute', disputeId, { deal_id, reason });

  res.json({ success: true, dispute_id: disputeId });
});

app.get('/api/disputes/my-disputes', requireAuth, (req, res) => {
  const disputes = db.prepare(`
    SELECT d.*, t.product_name FROM disputes d
    JOIN trade_deals t ON d.deal_id = t.id
    WHERE d.raised_by = ? ORDER BY d.created_at DESC
  `).all(req.session.merchantId);
  res.json({ disputes });
});

// ─────────────────────────────────────────────
//  DASHBOARD STATS (SELLER)
// ─────────────────────────────────────────────

// Buyer Statistics
app.get('/api/dashboard/buyer-stats', requireAuth, (req, res) => {
  const profile = db.prepare('SELECT * FROM buyer_profiles WHERE merchant_id = ?').get(req.session.merchantId);
  const recentOrders = db.prepare(`
    SELECT o.*, d.product_name 
    FROM orders o 
    JOIN trade_deals d ON o.deal_id = d.id 
    WHERE o.buyer_id = ? 
    ORDER BY o.created_at DESC LIMIT 5
  `).all(req.session.merchantId);

  const activeOrdersCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE buyer_id = ? AND status IN ('pending', 'paid', 'shipping')").get(req.session.merchantId).count;
  const completedOrdersCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE buyer_id = ? AND status = 'completed'").get(req.session.merchantId).count;

  res.json({
    stats: {
      total_spent: profile ? profile.total_spent : 0,
      buyer_rating: profile ? profile.buyer_rating : 5.0,
      active_orders: activeOrdersCount,
      completed_orders: completedOrdersCount
    },
    recent_orders: recentOrders
  });
});

app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  const mid = req.session.merchantId;

  const totalDeals = db.prepare('SELECT COUNT(*) as c FROM trade_deals WHERE merchant_id = ?').get(mid).c;
  const activeDeals = db.prepare("SELECT COUNT(*) as c FROM trade_deals WHERE merchant_id = ? AND status = 'active'").get(mid).c;
  const completedDeals = db.prepare("SELECT COUNT(*) as c FROM trade_deals WHERE merchant_id = ? AND status = 'completed'").get(mid).c;
  const tradeVolume = db.prepare('SELECT SUM(final_price) as s FROM trade_deals WHERE merchant_id = ?').get(mid).s || 0;
  const creditScore = db.prepare('SELECT composite_score, verification_tier FROM seller_credit_scores WHERE merchant_id = ?').get(mid);
  const openDisputes = db.prepare("SELECT COUNT(*) as c FROM disputes WHERE raised_by = ? AND status = 'open'").get(mid).c;
  const recentDeals = db.prepare('SELECT * FROM trade_deals WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 5').all(mid);
  const incomingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE seller_id = ? AND status IN ('pending', 'paid')").get(mid).c;

  res.json({
    stats: {
      total_deals: totalDeals,
      active_deals: activeDeals,
      completed_deals: completedDeals,
      trade_volume_usd: tradeVolume,
      credit_score: creditScore?.composite_score || 77.5,
      verification_tier: creditScore?.verification_tier || 'medium',
      open_disputes: openDisputes,
      incoming_orders: incomingOrders,
    },
    recent_deals: recentDeals
  });
});

// ─────────────────────────────────────────────
//  AUDIT LOGS
// ─────────────────────────────────────────────

app.get('/api/audit/my-logs', requireAuth, (req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.session.merchantId);
  res.json({ logs });
});

// ─────────────────────────────────────────────
//  STATIC PAGES
// ─────────────────────────────────────────────

app.get('/policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'policy.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────
//  START — use http server for Socket.IO
// ─────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║        BRACE — Global Trade OS           ║
  ║  Running at http://localhost:${PORT}        ║
  ║  Trust. Verify. Trade.                   ║
  ║                                          ║
  ║  ⚡ Socket.IO:  enabled                  ║
  ║  🔗 Web3 Slot:  ready for Remix IDE      ║
  ║  🛒 Buyer Mode: active                   ║
  ╚══════════════════════════════════════════╝
  `);
});

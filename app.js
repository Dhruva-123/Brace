// ═══════════════════════════════════════════════════════════
//  BRACE — Global Trade OS
//  app.js — Frontend Brain
// ═══════════════════════════════════════════════════════════

'use strict';

// ─────────────────────────────────────────────
//  STATE & SUPABASE INIT
// ─────────────────────────────────────────────
const SUPABASE_URL = 'https://cwfwudgpbkmfiszvezcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3Znd1ZGdwYmttZmlzenZlemNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzU3MDcsImV4cCI6MjA5MDI1MTcwN30.zxEEaeNK95Gut7BuRJmfQy6cY9mL-Qp2i0f_WYkd0Is';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const State = {
  merchant: null,
  currentPage: 'dashboard',
  dashboardStats: null
};

// ─────────────────────────────────────────────
//  API HELPER
// ─────────────────────────────────────────────
async function api(method, url, body) {
  const headers = {
    'Content-Type': 'application/json'
  };

  // Securely grab the active Supabase token and attach it
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    if (data && data.error) {
      errorMsg = data.error;
    } else if (text) {
      errorMsg = text;
    }
    throw new Error(errorMsg);
  }

  return data;
}

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
function switchAuth(mode) {
  document.getElementById('login-form').classList.toggle('active', mode === 'login');
  document.getElementById('register-form').classList.toggle('active', mode === 'register');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  errEl.classList.add('hidden');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    State.merchant = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || 'Merchant'
    };

    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');

  errEl.classList.add('hidden');

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });

    if (error) throw error;

    showToast("Account created. Please login.");
    switchAuth('login');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  State.merchant = null;
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('auth-gate').classList.remove('hidden');
}

function enterApp() {
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');

  const name = State.merchant?.name || 'Merchant';
  document.getElementById('sidebar-merchant').textContent = name;
  document.getElementById('topbar-merchant').textContent = name;

  navigate('dashboard');
}

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
const PAGE_TITLES = {
  'dashboard': 'Dashboard',
  'new-deal': 'New Deal',
  'my-deals': 'My Deals',
  'trust-score': 'Trust Score',
  'tax-calc': 'Tax Calculator',
  'fx-rates': 'FX Rates',
  'markets': 'AI Market Intelligence',
  'disputes': 'Disputes',
  'audit': 'Audit Log'
};

function navigate(page) {
  State.currentPage = page;

  // Toggle pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Toggle nav items
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;

  // Load data per page
  if (page === 'dashboard') loadDashboard();
  if (page === 'my-deals') loadMyDeals();
  if (page === 'trust-score') loadTrustScore();
  if (page === 'fx-rates') loadFX();
  if (page === 'disputes') loadDisputes();
  if (page === 'audit') loadAuditLog();
  if (page === 'marketplace') loadMarketplace();
  if (page === 'markets') loadCommodityList();
  if (page === 'my-orders') loadMyOrders();
  if (page === 'buyer-dashboard') loadBuyerDashboard();
}

// ─────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────
async function loadDashboard() {
  try {
    const { stats, recent_deals } = await api('GET', '/api/dashboard/stats');
    State.dashboardStats = stats;

    // Stat cards
    setStatCard('stat-volume', `$${formatNumber(stats.trade_volume_usd)}`, 'USD equivalent');
    setStatCard('stat-credit', `${stats.credit_score.toFixed(1)}`, stats.verification_tier + ' tier');
    setStatCard('stat-deals', stats.active_deals, 'In progress');
    setStatCard('stat-completed', stats.completed_deals, 'All time');

    // Recent deals
    const container = document.getElementById('recent-deals-list');
    if (!recent_deals.length) {
      container.innerHTML = emptyState('◎', 'No deals yet. Create your first trade deal.');
      return;
    }
    container.innerHTML = recent_deals.map(dealCard).join('');
  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

function setStatCard(id, value, sub) {
  const card = document.getElementById(id);
  if (!card) return;
  card.querySelector('.stat-value').textContent = value;
  card.querySelector('.stat-sub').textContent = sub;
}

// ─────────────────────────────────────────────
//  MY DEALS
// ─────────────────────────────────────────────
async function loadMyDeals() {
  const container = document.getElementById('my-deals-list');
  try {
    const { deals } = await api('GET', '/api/deals/my-deals');
    if (!deals.length) {
      container.innerHTML = emptyState('◎', 'No deals yet. Start by creating a new deal.');
      return;
    }
    container.innerHTML = deals.map(d => dealCard(d, true)).join('');
  } catch (err) {
    container.innerHTML = emptyState('!', err.message);
  }
}

function dealCard(deal, showActions = false) {
  return `
    <div class="deal-card status-${deal.status}" onclick="openDealModal('${deal.id}')">
      <div style="flex:1">
        <div class="deal-product">${escHtml(deal.product_name)}</div>
        <div class="deal-route">${deal.origin_country} → ${deal.dest_country} · ${deal.quantity} ${deal.unit || 'MT'}</div>
      </div>
      <div style="text-align:right">
        <div class="deal-price">$${formatNumber(deal.final_price || deal.base_price)}</div>
        <div class="deal-status status-${deal.status}">${deal.status.replace('_', ' ')}</div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
//  BUYER DASHBOARD & MATCHMAKING
// ─────────────────────────────────────────────
async function loadBuyerDashboard() {
  try {
    // Re-using common stats endpoint or you could have a specific buyer one
    const { stats, recent_orders } = await api('GET', '/api/dashboard/buyer-stats');
    
    setStatCard('stat-spent', `$${formatNumber(stats.total_spent)}`, 'USD equivalent');
    setStatCard('stat-buyer-rating', `${stats.buyer_rating.toFixed(1)}`, 'Out of 5.0');
    setStatCard('stat-active-orders', stats.active_orders, 'In progress');
    setStatCard('stat-completed-orders', stats.completed_orders, 'All time');

    const container = document.getElementById('recent-orders-list');
    if (!recent_orders || !recent_orders.length) {
      container.innerHTML = emptyState('◎', 'No orders yet. Start shopping in the marketplace.');
    } else {
      container.innerHTML = recent_orders.map(order => orderCard(order)).join('');
    }

    // Auto load matches
    loadAutoMatches();
  } catch (err) {
    console.error("Buyer Dashboard Error:", err);
  }
}

async function loadAutoMatches() {
  const container = document.getElementById('auto-matches-list');
  container.innerHTML = '<div class="loading-spinner">Analyzing deals...</div>';
  
  try {
    const { matches } = await api('GET', '/api/marketplace/matches');
    
    if (!matches || !matches.length) {
      container.innerHTML = emptyState('🤖', 'No ideal matches found. Try updating your preferences.');
      return;
    }

    container.innerHTML = matches.map(m => matchCard(m)).join('');
  } catch (err) {
    container.innerHTML = emptyState('!', 'Failed to load matches: ' + err.message);
  }
}

function matchCard(match) {
  const { deal, score } = match;
  const matchPercent = Math.min(100, Math.max(0, Math.round(score)));
  
  return `
    <div class="deal-card" onclick="openMarketplaceDeal('${deal.id}')" style="border-left: 4px solid var(--teal)">
      <div style="flex:1">
        <div class="deal-product">
          ${escHtml(deal.product_name)} 
          <span class="badge" style="background: rgba(150,187,187,0.2); color: var(--teal); margin-left:8px">${matchPercent}% Match</span>
        </div>
        <div class="deal-route">${deal.origin_country} → ${deal.dest_country} · Verfied Grade: ${deal.declared_grade}</div>
        <div style="font-size: 0.8em; color: var(--text-dim); margin-top:4px">Seller: ${escHtml(deal.seller_company)} (Trust: ${deal.seller_trust_score.toFixed(1)})</div>
      </div>
      <div style="text-align:right">
        <div class="deal-price">$${formatNumber(deal.final_price)}</div>
        <button class="btn-primary" style="font-size: 0.75rem; padding: 4px 12px; margin-top:8px">View Deal</button>
      </div>
    </div>
  `;
}

function orderCard(order) {
  return `
    <div class="deal-card status-${order.status}">
      <div style="flex:1">
        <div class="deal-product">${escHtml(order.product_name)}</div>
        <div class="deal-route">${order.quantity} units · Agreed Price: $${formatNumber(order.agreed_price)}</div>
      </div>
      <div style="text-align:right">
        <div class="deal-status status-${order.status}">${order.status}</div>
      </div>
    </div>
  `;
}

function openMarketplaceDeal(dealId) {
  navigate('marketplace');
  // Logic to scroll to or highlight the deal could go here
}


async function openDealModal(dealId) {
  try {
    const { deal } = await api('GET', `/api/deals/${dealId}`);
    const content = `
      <div class="modal-doc-title">${escHtml(deal.product_name)}</div>
      ${docField('Deal ID', deal.id)}
      ${docField('Route', `${deal.origin_country} → ${deal.dest_country}`)}
      ${docField('Quantity', `${deal.quantity} ${deal.unit || 'MT'}`)}
      ${docField('Declared Grade', `${deal.declared_grade}/100`)}
      ${docField('Base Price', `$${formatNumber(deal.base_price)}`)}
      ${docField('Grade Factor', deal.grade_factor?.toFixed(3))}
      ${docField('Trust Factor', deal.trust_factor?.toFixed(3))}
      ${docField('Risk Discount', deal.risk_discount?.toFixed(3))}
      ${docField('Final Price', `$${formatNumber(deal.final_price)}`)}
      ${docField('Status', deal.status)}
      ${docField('Created', formatDate(deal.created_at))}
      <div style="margin-top:1.25rem;display:flex;gap:0.6rem;flex-wrap:wrap">
        <button class="btn-primary" style="width:auto;margin-top:0" onclick="generateDocs('${deal.id}')">Generate Documents</button>
        <button class="btn-secondary" onclick="updateDealStatus('${deal.id}', 'completed')">Mark Completed</button>
        <button class="btn-secondary" onclick="navigate('disputes');document.getElementById('dispute-deal-id').value='${deal.id}';closeModal()">Raise Dispute</button>
      </div>
    `;
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('deal-modal').classList.remove('hidden');
  } catch (err) {
    showToast('Failed to load deal: ' + err.message, 'error');
  }
}

async function generateDocs(dealId) {
  try {
    const { documents } = await api('POST', '/api/documents/generate', { deal_id: dealId });
    showDocumentsModal(documents);
  } catch (err) {
    showToast('Document generation failed: ' + err.message, 'error');
  }
}

function showDocumentsModal(docs) {
  const inv = docs.invoice;
  const poa = docs.poa;

  const content = `
    <div class="modal-doc-title">Generated Documents</div>
    <div class="form-section-label">Commercial Invoice</div>
    ${docField('Doc ID', inv.doc_id)}
    ${docField('Issued By', inv.issued_by)}
    ${docField('Product', inv.product)}
    ${docField('HS Code', inv.hs_code)}
    ${docField('Quantity', inv.quantity)}
    ${docField('Base Price', `${inv.currency} ${formatNumber(inv.unit_price)}`)}
    ${docField('Total', `${inv.currency} ${formatNumber(inv.total)}`)}
    ${docField('Grade', `${inv.grade}/100`)}

    <div class="form-section-label" style="margin-top:1rem">Proof of Agreement (POA)</div>
    ${docField('Doc ID', poa.doc_id)}
    ${docField('Inspection Clause', poa.inspection_clause)}
    ${docField('Liability Clause', poa.liability_clause.slice(0, 80) + '...')}
    ${docField('Escrow Clause', poa.escrow_clause.slice(0, 80) + '...')}

    <div class="form-section-label" style="margin-top:1rem">Packing List</div>
    ${docField('Doc ID', docs.packing_list.doc_id)}
    ${docField('Quantity', `${docs.packing_list.quantity} ${docs.packing_list.unit}`)}
    ${docField('Grade', `${docs.packing_list.grade}/100`)}

    <p style="font-size:0.72rem;color:var(--text-dim);margin-top:1rem">
      ⚠ Documents are generated by Brace Trade OS for reference purposes. They do not constitute legally binding instruments unless reviewed and approved by qualified legal counsel. Brace is not liable for reliance on these documents.
    </p>
  `;

  document.getElementById('modal-content').innerHTML = content;
}

async function updateDealStatus(dealId, status) {
  try {
    await api('PATCH', `/api/deals/${dealId}/status`, { status });
    showToast(`Deal marked as ${status}`);
    closeModal();
    loadDashboard();
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  }
}

function closeModal() {
  document.getElementById('deal-modal').classList.add('hidden');
}

// ─────────────────────────────────────────────
//  NEW DEAL
// ─────────────────────────────────────────────
async function previewDealPricing() {
  const basePrice = Number(document.getElementById('deal-price').value) || 0;
  const declaredGrade = Number(document.getElementById('deal-grade').value) || 75;

  if (!basePrice) { showToast('Enter a base price first', 'error'); return; }

  let creditScore = 77.5;
  try {
    const { score } = await api('GET', '/api/trust/my-score');
    creditScore = score.composite_score;
  } catch (_) { }

  const gradeF = Math.pow(declaredGrade / 100, 0.5);
  const trustF = 0.7 + (creditScore / 100) * 0.3;
  const riskD = 0.95;
  const finalP = basePrice * gradeF * trustF * riskD;

  document.getElementById('prev-base').textContent = `$${formatNumber(basePrice)}`;
  document.getElementById('prev-grade').textContent = `×${gradeF.toFixed(3)}`;
  document.getElementById('prev-trust').textContent = `×${trustF.toFixed(3)}`;
  document.getElementById('prev-risk').textContent = `×${riskD.toFixed(3)}`;
  document.getElementById('prev-final').textContent = `$${formatNumber(finalP)}`;
  document.getElementById('deal-pricing-preview').classList.remove('hidden');
}

async function createDeal() {
  const body = {
    product_name: document.getElementById('deal-product').value.trim(),
    hs_code: document.getElementById('deal-hs').value.trim(),
    origin_country: document.getElementById('deal-origin').value,
    dest_country: document.getElementById('deal-dest').value,
    quantity: Number(document.getElementById('deal-qty').value),
    unit: document.getElementById('deal-unit').value,
    declared_grade: Number(document.getElementById('deal-grade').value),
    base_price: Number(document.getElementById('deal-price').value),
    currency: 'USD'
  };

  const errEl = document.getElementById('deal-error');
  errEl.classList.add('hidden');

  if (!body.product_name || !body.origin_country || !body.dest_country || !body.quantity || !body.base_price) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const data = await api('POST', '/api/deals/create', body);
    showToast(`Deal created! Final price: $${formatNumber(data.deal.final_price)}`);
    if (data.verification_required) {
      showToast('⚠ Grade verification required due to trust score level.', 'error');
    }
    navigate('my-deals');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

// ─────────────────────────────────────────────
//  TRUST SCORE
// ─────────────────────────────────────────────
async function loadTrustScore() {
  try {
    const { score } = await api('GET', '/api/trust/my-score');
    const s = score.composite_score;

    // Animate gauge
    document.getElementById('gauge-number').textContent = s.toFixed(1);
    document.getElementById('gauge-tier').textContent = score.verification_tier.toUpperCase() + ' TIER';

    // Arc: 251.2 = full circumference of our gauge arc
    const offset = 251.2 - (s / 100) * 251.2;
    document.getElementById('gauge-arc').style.strokeDashoffset = offset;

    // Color by tier
    const arcEl = document.getElementById('gauge-arc');
    if (score.verification_tier === 'high') arcEl.style.stroke = 'var(--teal)';
    if (score.verification_tier === 'medium') arcEl.style.stroke = 'var(--amber)';
    if (score.verification_tier === 'low') arcEl.style.stroke = '#e09080';

    // Metric bars
    updateMetricBar('bar-tsr', score.transaction_success_rate);
    updateMetricBar('bar-gas', score.grade_accuracy_score);
    updateMetricBar('bar-dri', score.dispute_ratio_inverse);
    updateMetricBar('bar-dt', score.delivery_timeliness);
    updateMetricBar('bar-bfs', score.buyer_feedback_score);
  } catch (err) {
    showToast('Failed to load trust score: ' + err.message, 'error');
  }
}

function updateMetricBar(barId, value) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  bar.querySelector('.bar-fill').style.width = `${(value * 100).toFixed(0)}%`;
  bar.querySelector('.metric-score').textContent = value.toFixed(2);
}

// ─────────────────────────────────────────────
//  TAX CALCULATOR
// ─────────────────────────────────────────────
async function calculateTax() {
  const body = {
    origin_country: document.getElementById('tax-origin').value,
    dest_country: document.getElementById('tax-dest').value,
    trade_value: Number(document.getElementById('tax-value').value),
    hs_code: document.getElementById('tax-hs').value.trim()
  };

  if (!body.trade_value) { showToast('Enter a trade value', 'error'); return; }

  try {
    const { tax_breakdown: t, disclaimer } = await api('POST', '/api/tax/calculate', body);
    const result = document.getElementById('tax-result');
    result.classList.remove('hidden');
    result.innerHTML = `
      <div class="result-title">Tax Breakdown — ${body.origin_country} → ${body.dest_country}</div>
      <div class="tax-row"><span>Trade Value</span><span>$${formatNumber(t.trade_value)}</span></div>
      <div class="tax-row"><span>Tariff Rate</span><span>${t.base_tariff_rate}%</span></div>
      <div class="tax-row"><span>Customs Duty</span><span>$${formatNumber(t.customs_duty)}</span></div>
      <div class="tax-row"><span>Other Duties</span><span>$${formatNumber(t.other_duties)}</span></div>
      <div class="tax-row"><span>VAT Rate</span><span>${t.vat_rate}%</span></div>
      <div class="tax-row"><span>VAT Amount</span><span>$${formatNumber(t.vat_amount)}</span></div>
      <div class="tax-row total-row"><span>Total Tax Burden</span><span>$${formatNumber(t.total_tax_burden)}</span></div>
      <div class="tax-row total-row"><span>Landed Cost</span><span>$${formatNumber(t.landed_cost)}</span></div>
      <div class="tax-row"><span>Effective Tax %</span><span>${t.effective_tax_pct}%</span></div>
    `;
  } catch (err) {
    showToast('Calculation failed: ' + err.message, 'error');
  }
}

// ─────────────────────────────────────────────
//  FX RATES
// ─────────────────────────────────────────────
async function loadFX() {
  const base = document.getElementById('fx-base')?.value || 'USD';
  const container = document.getElementById('fx-grid');
  container.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem">Loading rates...</div>';

  try {
    const { rates, updated, source } = await api('GET', `/api/fx/rates?base=${base}`);
    const SHOW = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AED', 'CNY', 'SGD', 'AUD', 'CAD', 'CHF', 'BRL'];

    container.innerHTML = SHOW
      .filter(c => c !== base && rates[c])
      .map(c => `
        <div class="fx-card">
          <div class="fx-currency">${c}</div>
          <div class="fx-rate">${rates[c].toFixed(4)}</div>
        </div>
      `).join('');

    if (updated) {
      container.innerHTML += `<div style="grid-column:1/-1;font-size:0.68rem;color:var(--text-dim);margin-top:0.5rem">Updated: ${updated}${source === 'fallback' ? ' (fallback data)' : ''}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="color:var(--amber);font-size:0.8rem">Failed to load rates: ${err.message}</div>`;
  }
}

// ─────────────────────────────────────────────
//  AI MARKET INTELLIGENCE (Recommender Engine)
// ─────────────────────────────────────────────

// Tab switching
function switchAITab(tab) {
  document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.ai-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`ai-tab-${tab}`).classList.add('active');
  document.getElementById(`ai-panel-${tab}`).classList.add('active');
}

// Load commodity list from server
let _commodityCache = null;
async function loadCommodityList() {
  if (_commodityCache) return _commodityCache;
  try {
    const data = await api('GET', '/api/ai/commodities');
    _commodityCache = data;
    const select = document.getElementById('rec-product');
    if (select && data.commodities) {
      select.innerHTML = '<option value="">Select a commodity...</option>';
      data.commodities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.commodity;
        opt.textContent = `${c.commodity} (${c.unit} — $${c.price_2023})`;
        select.appendChild(opt);
      });
    }
    return data;
  } catch (_) { return null; }
}

function updateCommodityInfo() {
  const select = document.getElementById('rec-product');
  const box = document.getElementById('commodity-info-box');
  if (!select.value || !_commodityCache) {
    box.style.display = 'none';
    return;
  }
  const com = _commodityCache.commodities.find(c => c.name === select.value);
  if (com) {
    document.getElementById('commodity-ref-name').textContent = com.name;
    document.getElementById('commodity-ref-price').textContent = `$${com.price_2023} ${com.unit}`;
    box.style.display = '';
  }
}

// Main recommender function
async function getSellerRecommendation() {
  const productSelect = document.getElementById('rec-product').value;
  const productCustom = document.getElementById('rec-product-custom').value.trim();
  const product = productCustom || productSelect;
  const buyer = document.getElementById('rec-buyer').value;

  if (!product) { showToast('Select or type a commodity', 'error'); return; }
  if (!buyer) { showToast('Select your buyer country', 'error'); return; }

  const result = document.getElementById('rec-result');
  result.classList.remove('hidden');
  result.innerHTML = `
    <div class="rec-loading">
      <div class="rec-loading-spinner"></div>
      <div class="rec-loading-text">Analyzing ${escHtml(product)} markets...</div>
      <div class="rec-loading-steps">
        <div class="rec-step active">📦 Loading commodity prices</div>
        <div class="rec-step">🏦 Fetching World Bank inflation data</div>
        <div class="rec-step">💱 Getting live exchange rates</div>
        <div class="rec-step">📰 Analyzing news sentiment</div>
        <div class="rec-step">🧠 Computing optimal pricing</div>
      </div>
    </div>
  `;

  // Animate steps
  const steps = result.querySelectorAll('.rec-step');
  for (let i = 1; i < steps.length; i++) {
    await new Promise(r => setTimeout(r, 400));
    steps[i].classList.add('active');
  }

  try {
    const data = await api('POST', '/api/ai/recommend-seller', { product, buyer_country: buyer });

    if (!data.success) {
      result.innerHTML = `
        <div class="rec-error">
          <div class="rec-error-icon">⚠</div>
          <div class="rec-error-text">${escHtml(data.error || 'No data found')}</div>
          ${data.available_commodities ? `
            <div class="rec-commodities-list">
              <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:0.5rem">Available commodities:</div>
              <div class="rec-tags">${data.available_commodities.map(c => `<span class="mkt-market-tag">${escHtml(c)}</span>`).join('')}</div>
            </div>
          ` : ''}
        </div>
      `;
      return;
    }

    const rec = data.recommendation;
    const maxPrice = Math.max(...rec.all_sellers.map(s => s.max_price));

    result.innerHTML = `
      <!-- Best Seller Hero Card -->
      <div class="best-seller-card">
        <div class="best-seller-badge">🏆 BEST SELLER</div>
        <div class="best-seller-country">${escHtml(rec.best_seller)}</div>
        <div class="best-seller-commodity">
          <span class="commodity-badge">${escHtml(rec.commodity)}</span>
          <span class="commodity-unit">Base: $${formatNumber(rec.base_price_usd)} ${escHtml(rec.commodity_unit)}</span>
        </div>
        <div class="best-seller-price">
          <div class="price-range-visual">
            <span class="price-min">${formatNumber(rec.best_range[0])}</span>
            <span class="price-separator">—</span>
            <span class="price-max">${formatNumber(rec.best_range[1])}</span>
            <span class="price-currency">${rec.currency}</span>
          </div>
        </div>
        <div class="best-seller-factors">
          <div class="factor-chip">
            <span class="factor-label">Inflation Δ</span>
            <span class="factor-value ${rec.best_factors.inflation_diff > 0 ? 'negative' : 'positive'}">${rec.best_factors.inflation_diff > 0 ? '+' : ''}${rec.best_factors.inflation_diff.toFixed(2)}%</span>
          </div>
          <div class="factor-chip">
            <span class="factor-label">Risk Premium</span>
            <span class="factor-value ${rec.best_factors.risk_premium > 0 ? 'negative' : 'positive'}">+${(rec.best_factors.risk_premium * 100).toFixed(1)}%</span>
          </div>
          <div class="factor-chip">
            <span class="factor-label">Affinity Discount</span>
            <span class="factor-value ${rec.best_factors.affinity_advantage > 0 ? 'positive' : ''}">-${(rec.best_factors.affinity_advantage * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <!-- Overall Market Range -->
      <div class="overall-range-card">
        <div class="overall-range-label">Overall Market Range (All Sellers)</div>
        <div class="overall-range-values">
          <span>${formatNumber(rec.overall_range[0])}</span>
          <div class="overall-range-bar">
            <div class="overall-range-fill"></div>
          </div>
          <span>${formatNumber(rec.overall_range[1])}</span>
          <span class="price-currency">${rec.currency}</span>
        </div>
      </div>

      <!-- All Sellers Comparison -->
      <div class="sellers-comparison">
        <div class="sellers-title">All Seller Countries Ranked</div>
        <div class="sellers-grid">
          ${rec.all_sellers.map((s, i) => {
            const barWidth = maxPrice > 0 ? (s.max_price / maxPrice * 100) : 0;
            const isBest = s.seller === rec.best_seller;
            return `
              <div class="seller-row ${isBest ? 'is-best' : ''}">
                <div class="seller-rank">${i + 1}</div>
                <div class="seller-info">
                  <div class="seller-name">${isBest ? '🏆 ' : ''}${escHtml(s.seller)}</div>
                  <div class="seller-price-range">${formatNumber(s.min_price)} — ${formatNumber(s.max_price)} ${rec.currency}</div>
                </div>
                <div class="seller-bar-wrap">
                  <div class="seller-bar" style="width:${barWidth}%">
                    <div class="seller-bar-inner ${isBest ? 'best' : ''}"></div>
                  </div>
                </div>
                <div class="seller-adj-price">$${formatNumber(s.adjusted_price_usd)}<span>/unit</span></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Disclaimer -->
      <div style="font-size:0.72rem;color:var(--amber);margin-top:1rem;opacity:0.8">
        ⚠ ${escHtml(data.disclaimer)}
      </div>
    `;

  } catch (err) {
    result.innerHTML = `<div class="rec-error"><div class="rec-error-icon">✕</div><div class="rec-error-text">${escHtml(err.message)}</div></div>`;
  }
}

// Existing market intel function (Tab 2)
async function getMarketIntel() {
  const product = document.getElementById('mkt-product').value.trim();
  const origin = document.getElementById('mkt-origin').value;
  const description = document.getElementById('mkt-desc').value.trim();

  if (!product) { showToast('Enter a product name', 'error'); return; }

  const result = document.getElementById('mkt-result');
  result.classList.remove('hidden');
  result.innerHTML = '<div style="color:var(--text-dim);font-size:0.82rem">Analysing markets...</div>';

  try {
    const data = await api('POST', '/api/ai/recommend-markets', {
      product_name: product,
      origin_country: origin,
      product_description: description
    });

    const { intel, ai_insight, commodity_data } = data;

    const marketsHtml = (intel.top_markets || []).map(m =>
      `<span class="mkt-market-tag">${m}</span>`
    ).join('');

    const aiHtml = ai_insight ? `
      <div style="margin-top:0.75rem;padding:0.6rem;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border)">
        <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:0.2rem">AI Sentiment Analysis</div>
        <div style="font-size:0.8rem;color:var(--teal)">
          ${ai_insight.label} (confidence: ${(ai_insight.score * 100).toFixed(1)}%)
        </div>
        <div style="font-size:0.68rem;color:var(--text-dim)">Model: ${ai_insight.model}</div>
      </div>
    ` : '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.5rem">Add your Hugging Face API key in .env to enable live AI sentiment analysis.</div>';

    const commodityHtml = commodity_data ? `
      <div style="margin-top:0.75rem;padding:0.5rem 0.75rem;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border);display:flex;align-items:center;gap:0.75rem">
        <span class="commodity-badge">${escHtml(commodity_data.commodity)}</span>
        <span style="font-family:var(--font-mono);font-size:0.82rem;color:var(--teal)">$${commodity_data.price} ${escHtml(commodity_data.unit)}</span>
        <span style="font-size:0.68rem;color:var(--text-dim)">World Bank Pink Sheet 2023</span>
      </div>
    ` : '';

    result.innerHTML = `
      <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.75rem">
        Recommended markets for <strong style="color:var(--sand)">${escHtml(product)}</strong> from <strong>${origin}</strong>:
      </div>
      <div class="mkt-markets">${marketsHtml}</div>
      <div style="margin-top:0.75rem;font-size:0.82rem;color:var(--text-secondary)">
        Market Demand: <span style="color:var(--teal);font-weight:600">${intel.demand?.toUpperCase() || 'MEDIUM'}</span>
        ${intel.avg_price_usd_mt ? `&nbsp;&nbsp;Avg Price: <span style="color:var(--teal)">$${formatNumber(intel.avg_price_usd_mt)} / MT</span>` : ''}
      </div>
      ${commodityHtml}
      ${aiHtml}
      <div style="font-size:0.68rem;color:var(--amber);margin-top:0.75rem">⚠ ${data.disclaimer}</div>
    `;
  } catch (err) {
    result.innerHTML = `<div style="color:var(--amber)">Failed: ${err.message}</div>`;
  }
}

// ─────────────────────────────────────────────
//  DISPUTES
// ─────────────────────────────────────────────
async function raiseDispute() {
  const dealId = document.getElementById('dispute-deal-id').value.trim();
  const reason = document.getElementById('dispute-reason').value.trim();

  if (!dealId || !reason) { showToast('Fill in Deal ID and reason', 'error'); return; }

  try {
    await api('POST', '/api/disputes/raise', { deal_id: dealId, reason });
    showToast('Dispute submitted. Platform will mediate.');
    document.getElementById('dispute-deal-id').value = '';
    document.getElementById('dispute-reason').value = '';
    loadDisputes();
  } catch (err) {
    showToast('Failed to raise dispute: ' + err.message, 'error');
  }
}

async function loadDisputes() {
  const container = document.getElementById('disputes-list');
  try {
    const { disputes } = await api('GET', '/api/disputes/my-disputes');
    if (!disputes.length) {
      container.innerHTML = emptyState('◐', 'No disputes raised.');
      return;
    }
    container.innerHTML = disputes.map(d => `
      <div class="deal-card status-${d.status}">
        <div style="flex:1">
          <div class="deal-product">${escHtml(d.product_name || 'Unknown Deal')}</div>
          <div class="deal-route">${escHtml(d.reason?.slice(0, 80) || '—')}</div>
        </div>
        <div class="deal-status status-${d.status}">${d.status}</div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = emptyState('!', err.message);
  }
}

// ─────────────────────────────────────────────
//  AUDIT LOG
// ─────────────────────────────────────────────
async function loadAuditLog() {
  const container = document.getElementById('audit-list');
  try {
    const { logs } = await api('GET', '/api/audit/my-logs');
    if (!logs.length) {
      container.innerHTML = emptyState('▣', 'No audit entries yet.');
      return;
    }
    container.innerHTML = logs.map(l => `
      <div class="audit-row">
        <span class="audit-action">${l.action}</span>
        <span style="color:var(--text-dim)">${l.entity_type || '—'}</span>
        <span style="font-size:0.7rem;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${l.entity_id || ''}</span>
        <span class="audit-time">${formatDate(l.created_at)}</span>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = emptyState('!', err.message);
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><p>${escHtml(text)}</p></div>`;
}

function docField(label, value) {
  return `<div class="doc-field"><span>${escHtml(label)}</span><span>${escHtml(String(value || '—'))}</span></div>`;
}

// ─────────────────────────────────────────────
//  ENTER KEY SUPPORT
// ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter') {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    if (loginForm?.classList.contains('active')) handleLogin();
    if (regForm?.classList.contains('active')) handleRegister();
  }
});

// Click outside modal to close
document.getElementById('deal-modal')?.addEventListener('click', e => {
  if (e.target.id === 'deal-modal') closeModal();
});

// ─────────────────────────────────────────────
//  BOOT — Check session on load
// ─────────────────────────────────────────────
(async function boot() {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();

    if (error || !user) {
      document.getElementById('auth-gate').classList.remove('hidden');
      return;
    }

    State.merchant = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || 'Merchant'
    };

    enterApp();

  } catch (e) {
    console.error('Boot error:', e);
    document.getElementById('auth-gate').classList.remove('hidden');
  }
})();

// ================= BUYER SIDE FIXES =================

// Role switching
function switchRole(role) {
  console.log("Switching role:", role);

  const sellerNav = document.getElementById('nav-seller');
  const buyerNav = document.getElementById('nav-buyer');

  const sellerBtn = document.getElementById('role-btn-seller');
  const buyerBtn = document.getElementById('role-btn-buyer');

  if (role === 'buyer') {
    sellerNav.classList.add('hidden');
    buyerNav.classList.remove('hidden');

    sellerBtn.classList.remove('active');
    buyerBtn.classList.add('active');

    navigate('buyer-dashboard');

  } else {
    buyerNav.classList.add('hidden');
    sellerNav.classList.remove('hidden');

    buyerBtn.classList.remove('active');
    sellerBtn.classList.add('active');

    navigate('dashboard');
  }
}


// Marketplace = browse all active deals
async function loadMarketplace() {
  const container = document.getElementById('marketplace-grid');
  if (!container) return;

  const searchInput = document.getElementById('mkt-search');
  const originInput = document.getElementById('mkt-filter-origin');
  
  const query = searchInput ? searchInput.value.trim() : '';
  const origin = originInput ? originInput.value : '';

  container.innerHTML = '<div class="loading-spinner">Searching deals...</div>';

  try {
    let url = '/api/marketplace/deals?';
    if (query) url += `search=${encodeURIComponent(query)}&`;
    if (origin) url += `origin=${encodeURIComponent(origin)}&`;

    const { deals } = await api('GET', url);

    if (!deals || !deals.length) {
      let msg = 'No deals found matching your criteria from other sellers.';
      if (origin || query) msg += '<br>Try broader search terms.';
      msg += '<p style="font-size:0.75rem; color:var(--text-dim); margin-top:1rem; opacity:0.8">Note: To prevent self-trading, your own deals are hidden from this view.</p>';
      
      container.innerHTML = emptyState('🔍', msg);
      return;
    }

    container.innerHTML = deals.map(d => `
      <div class="deal-card" style="flex-direction: column; align-items: stretch; gap: 0.5rem; padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div class="deal-product" style="font-size: 1.1rem;">${escHtml(d.product_name)}</div>
          <div class="deal-price" style="font-size: 1.1rem; color: var(--teal);">$${formatNumber(d.final_price)}</div>
        </div>
        
        <div class="deal-route" style="margin: 0.25rem 0 0.75rem;">
          <span style="color: var(--text-secondary)">${d.origin_country}</span> 
          <span style="color: var(--teal); margin: 0 0.4rem;">→</span> 
          <span style="color: var(--text-secondary)">${d.dest_country}</span>
          <span style="margin-left: 0.75rem; color: var(--text-dim); opacity: 0.8;">· ${d.quantity} ${d.unit || 'MT'}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem;">
          <div class="tier-badge ${d.seller_tier || 'medium'}" style="font-size: 0.6rem;">${(d.seller_tier || 'medium').toUpperCase()} TIER</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Seller: ${escHtml(d.seller_company)} (${(d.seller_trust_score || 70).toFixed(1)} Trust)</div>
        </div>

        <div style="display: flex; gap: 0.5rem; border-top: 1px solid var(--border); pt: 1rem; margin-top: 0.5rem; padding-top: 0.75rem;">
          <button class="btn-primary" style="flex: 1; margin: 0;" onclick="buyDeal('${d.id}', ${d.quantity})">Instant Purchase</button>
          <button class="btn-secondary" style="padding: 0.6rem;" onclick="openMarketplaceDealDetail('${d.id}')">Details</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error("Marketplace error:", err);
    container.innerHTML = emptyState('!', 'Failed to load marketplace: ' + err.message);
  }
}

function openMarketplaceDealDetail(dealId) {
  // Can reuse existing deal modal logic but maybe with buyer-specific actions
  openDealModal(dealId);
}



// Orders = my deals
async function loadMyOrders() {
  try {
    const { orders } = await api('GET', '/api/orders/my-orders');

    const container = document.getElementById('my-orders-list');
    if (!container) return;

    container.innerHTML = '';

    orders.forEach(o => {
      let payButton = '';
      if (o.status === 'pending') {
        payButton = `<button class="btn-primary" style="margin-top: 0.5rem;" onclick="payStripe('${o.id}')">Pay with Stripe</button>`;
      }
      container.innerHTML += `
        <div class="order-card" style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.5rem;">
          <p><strong>${escHtml(o.product_name)}</strong></p>
          <p>Total: $${formatNumber(o.agreed_price)}</p>
          <p>Status: <span class="status-${o.status}">${o.status}</span></p>
          ${payButton}
        </div>
      `;
    });

  } catch (err) {
    console.error("Orders error:", err);
  }
}

async function payStripe(orderId) {
  try {
    const sessionRes = await api('POST', '/api/stripe/create-checkout-session', { order_id: orderId });
    if (sessionRes.url) {
       window.location.href = sessionRes.url;
    }
  } catch(err) {
    showToast("Stripe error: " + err.message, "error");
  }
}


// Buy action
async function buyDeal(dealId, qty) {
  try {
    const body = {
      deal_id: dealId,
      quantity: qty,
      wallet_address: null // Could fetch Current Merchant wallet if connected
    };

    const res = await api('POST', '/api/orders/create', body);
    
    // Auto-redirect to Stripe
    if(res.order) {
       const sessionRes = await api('POST', '/api/stripe/create-checkout-session', { order_id: res.order.id });
       if (sessionRes.url) {
          window.location.href = sessionRes.url;
          return;
       }
    }

    showToast("Order placed successfully! Check 'My Orders'.", "success");
    loadMyOrders();
    loadMarketplace();

  } catch (err) {
    console.error("Buy failed:", err);
    showToast("Buy failed: " + err.message, "error");
  }
}


// Temporary wallet
function connectWallet() {
  showToast("Wallet feature coming soon", "error");
}

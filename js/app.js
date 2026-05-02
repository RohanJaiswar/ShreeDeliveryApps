/* ============================================================
   SHREE DELIVERY APPS — app.js  (schema-corrected)
   ============================================================ */

const SUPABASE_URL = 'https://tqtvxtipqbnvyquljgtg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_na3VEkRe9gb7Nysy5crL1g_oR-M2W9x';
const UPI_ID       = 'shreemilk@upi'; // ← your UPI ID

/* ── STATE ── */
let sb, currentPartner = null, currentOrder = null;
let selectedPayMode = 'cash', newtxnPayMode = 'cash';
let allOrders = [], allTxns = [], txnFilter = 'all', vendorsList = [];

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', () => {
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch(e) {
    console.error('Supabase init failed:', e);
  }

  // Splash → Login after 2.5s
  setTimeout(() => {
    document.getElementById('splash-screen').classList.add('hidden');
    checkSession();
  }, 2500);

  bindEvents();
  refreshIcons();
});

/* ── SESSION ── */
function checkSession() {
  const saved = localStorage.getItem('dp_session');
  if (saved) {
    try { currentPartner = JSON.parse(saved); showApp(); }
    catch { localStorage.removeItem('dp_session'); showScreen('login-screen'); }
  } else {
    showScreen('login-screen');
  }
}

function showApp() {
  const name = currentPartner.full_name || currentPartner.username || 'Partner';
  document.getElementById('partner-name').textContent = name;
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-phone').textContent = currentPartner.phone_number || '—';
  document.getElementById('profile-zone').textContent = currentPartner.assigned_zone || 'All Zones';
  document.getElementById('profile-vehicle').textContent = currentPartner.vehicle_number || '—';
  showScreen('app');
  loadOrders();
  loadVendors();
}

/* ── SCREENS ── */
function showScreen(id) {
  ['splash-screen','login-screen','app'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

/* ── LOGIN ── */
function bindLogin() {
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-password').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!username || !password) return showLoginError('Enter username and password');

  const btn = document.getElementById('login-btn');
  btn.textContent = 'Logging in…'; btn.disabled = true;

  const { data, error } = await sb
    .from('delivery_partners')
    .select('*')
    .or(`username.eq.${username},phone_number.eq.${username}`)
    .eq('password', password)
    .limit(1);

  btn.textContent = 'Login'; btn.disabled = false;

  if (error || !data || !data.length) {
    return showLoginError('Invalid credentials. Try again.');
  }
  currentPartner = data[0];
  localStorage.setItem('dp_session', JSON.stringify(currentPartner));
  showScreen('app');
  showApp();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ── NAVIGATION ── */
function bindNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const page = btn.dataset.page;
      document.getElementById(`page-${page}`).classList.add('active');
      if (page === 'transactions') loadTransactions();
      if (page === 'profile') loadProfileStats();
    });
  });
}

/* ── ORDERS ── */
async function loadOrders(searchTerm = '') {
  document.getElementById('orders-list').innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading orders…</div>';

  // Fetch orders assigned to this delivery partner
  let query = sb
    .from('orders')
    .select(`*, vendors(id, store_name, outstanding_balance)`)
    .eq('delivery_partner_id', currentPartner.id)
    .order('created_at', { ascending: false });

  if (searchTerm) {
    query = query.or(`vendor_name.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%`);
  }

  let { data, error } = await query;

  // Fallback: show all orders if none assigned yet (dev/testing)
  if (error || !data || data.length === 0) {
    const fb = await sb.from('orders')
      .select(`*, vendors(id, store_name, outstanding_balance)`)
      .order('created_at', { ascending: false })
      .limit(50);
    data = fb.data || [];
  }

  allOrders = data;
  renderOrders(allOrders);
  updateStats();
}

function renderOrders(orders) {
  const el = document.getElementById('orders-list');
  if (!orders.length) {
    el.innerHTML = '<div class="empty-state"><i data-lucide="package-open" class="empty-icon"></i> No orders assigned yet</div>';
    refreshIcons();
    return;
  }
  const statusColor = { pending:'#ffa940', out_for_delivery:'#6c63ff', delivered:'#00d4aa', failed:'#ff4d6d' };
  el.innerHTML = orders.map(o => {
    const ds = o.delivery_status || 'pending';
    const vendorName = o.vendor_name || o.vendors?.store_name || 'Unknown';
    const amount = Number(o.total_amount || 0);
    const due = Number(o.vendors?.outstanding_balance || 0);
    const orderId = o.id.slice(0,8).toUpperCase();
    return `
    <div class="order-card" onclick="openOrderModal('${o.id}')" style="border-left-color:${statusColor[ds]||'#6c63ff'}">
      <div class="order-top">
        <div>
          <div class="order-vendor">${vendorName}</div>
          <div class="order-ref">#${orderId} • ${o.vendor_zone || '—'}</div>
        </div>
        <span class="status-pill ${ds}">${formatStatus(ds)}</span>
      </div>
      <div class="order-bottom">
        <div class="order-meta">
          <span><i data-lucide="calendar"></i> ${formatDate(o.order_date || o.created_at)}</span>
          ${due > 0 ? `<span class="due-badge">Due ₹${due.toFixed(0)}</span>` : ''}
        </div>
        <span class="order-amount">₹${amount.toFixed(2)}</span>
      </div>
    </div>`;
  }).join('');
  refreshIcons();
}

function updateStats() {
  document.getElementById('stat-total').textContent = allOrders.length;
  document.getElementById('stat-delivered').textContent = allOrders.filter(o => o.delivery_status === 'delivered').length;
  document.getElementById('stat-pending').textContent = allOrders.filter(o => !o.delivery_status || o.delivery_status === 'pending').length;
}

/* ── SEARCH & SCAN ── */
function bindSearch() {
  document.getElementById('search-btn').addEventListener('click', () => {
    loadOrders(document.getElementById('order-search').value.trim());
  });
  document.getElementById('order-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadOrders(e.target.value.trim());
  });
  document.getElementById('scan-btn').addEventListener('click', () => {
    const ref = prompt('Enter Order ID from Invoice:');
    if (ref) loadOrders(ref.trim());
  });
}

/* ── ORDER MODAL ── */
function openOrderModal(orderId) {
  currentOrder = allOrders.find(o => o.id === orderId);
  if (!currentOrder) return;

  const v = currentOrder.vendors || {};
  const due = Number(v.outstanding_balance || 0);
  const amount = Number(currentOrder.total_amount || 0);
  const items = parseItems(currentOrder.items);
  const ds = currentOrder.delivery_status || 'pending';

  document.getElementById('modal-order-title').textContent = currentOrder.vendor_name || v.store_name || 'Order';

  document.getElementById('modal-order-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-row"><span class="dl">Order ID</span><span class="dv">#${currentOrder.id.slice(0,8).toUpperCase()}</span></div>
      <div class="detail-row"><span class="dl">Vendor</span><span class="dv">${currentOrder.vendor_name || v.store_name || '—'}</span></div>
      <div class="detail-row"><span class="dl">Zone</span><span class="dv">${currentOrder.vendor_zone || '—'}</span></div>
      <div class="detail-row"><span class="dl">Phone</span><span class="dv">${currentOrder.phone_number || '—'}</span></div>
      <div class="detail-row"><span class="dl">Status</span><span class="dv"><span class="status-pill ${ds}">${formatStatus(ds)}</span></span></div>
      <div class="detail-row"><span class="dl">Amount</span><span class="dv accent">₹${amount.toFixed(2)}</span></div>
      ${due > 0 ? `<div class="detail-row"><span class="dl">Outstanding</span><span class="dv warning">₹${due.toFixed(2)}</span></div>` : ''}
      <div class="detail-row"><span class="dl">Date</span><span class="dv">${formatDate(currentOrder.order_date || currentOrder.created_at)}</span></div>
      ${currentOrder.items_summary ? `<div class="detail-row full"><span class="dl">Items</span><span class="dv">${currentOrder.items_summary}</span></div>` : ''}
    </div>
    ${items.length ? `<div class="items-box"><div class="items-title">Order Items</div>${items.map(it=>`
      <div class="item-row">
        <span>${it.name||it.product_name||'Item'}</span>
        <span>${it.quantity||1} × ₹${it.price||it.unit_price||0} = <b>₹${((it.quantity||1)*(it.price||it.unit_price||0)).toFixed(2)}</b></span>
      </div>`).join('')}</div>` : ''}
  `;

  const delivBtn = document.getElementById('mark-delivered-btn');
  const isDelivered = ds === 'delivered';
  delivBtn.disabled = isDelivered;
  delivBtn.style.opacity = isDelivered ? '0.5' : '1';
  delivBtn.innerHTML = isDelivered ? '<i data-lucide="check-circle"></i> Already Delivered' : '<i data-lucide="check-circle"></i> Mark Delivered';

  show('order-modal');
  refreshIcons();
}

function bindOrderModal() {
  document.getElementById('close-order-modal').addEventListener('click', () => hide('order-modal'));
  document.getElementById('order-modal').addEventListener('click', e => { if(e.target.id==='order-modal') hide('order-modal'); });

  document.getElementById('mark-delivered-btn').addEventListener('click', async () => {
    if (!currentOrder) return;
    const btn = document.getElementById('mark-delivered-btn');
    btn.innerHTML = '<div class="spinner spinner-btn"></div> Updating…'; btn.disabled = true;

    const { error } = await sb.from('orders').update({
      delivery_status: 'delivered',
      delivered_at: new Date().toISOString(),
      invoice_scanned: true,
      delivery_partner_id: currentPartner.id
    }).eq('id', currentOrder.id);

    if (error) {
      showToast('Update failed: ' + error.message, 'error');
      btn.innerHTML = '<i data-lucide="check-circle"></i> Mark Delivered'; btn.disabled = false;
      refreshIcons();
    } else {
      showToast('Marked as delivered!', 'success');
      allOrders = allOrders.map(o => o.id === currentOrder.id ? {...o, delivery_status:'delivered'} : o);
      currentOrder.delivery_status = 'delivered';
      renderOrders(allOrders); updateStats();
      hide('order-modal');
    }
  });

  document.getElementById('collect-payment-btn').addEventListener('click', openPaymentModal);
}

/* ── PAYMENT MODAL ── */
function openPaymentModal() {
  if (!currentOrder) return;
  const v = currentOrder.vendors || {};
  const due = Number(v.outstanding_balance || 0);
  const amount = Number(currentOrder.total_amount || 0);

  const banner = document.getElementById('vendor-due-banner');
  if (due > 0) {
    banner.innerHTML = `<i data-lucide="alert-triangle"></i> Outstanding Due: <b>₹${due.toFixed(2)}</b> &nbsp;|&nbsp; Order Total: <b>₹${amount.toFixed(2)}</b>`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }

  document.getElementById('cash-amount').value = amount;
  document.getElementById('upi-amount').value = amount;
  document.getElementById('qr-container').classList.add('hidden');
  document.getElementById('upi-ref').value = '';
  setPayMode('cash');
  hide('order-modal');
  show('payment-modal');
  refreshIcons();
}

function setPayMode(mode) {
  selectedPayMode = mode;
  document.getElementById('mode-cash').classList.toggle('active', mode==='cash');
  document.getElementById('mode-upi').classList.toggle('active', mode==='upi');
  document.getElementById('cash-form').classList.toggle('hidden', mode!=='cash');
  document.getElementById('upi-form').classList.toggle('hidden', mode!=='upi');
}

function bindPaymentModal() {
  document.getElementById('close-payment-modal').addEventListener('click', () => hide('payment-modal'));
  document.getElementById('payment-modal').addEventListener('click', e => { if(e.target.id==='payment-modal') hide('payment-modal'); });
  document.getElementById('mode-cash').addEventListener('click', () => setPayMode('cash'));
  document.getElementById('mode-upi').addEventListener('click', () => setPayMode('upi'));

  document.getElementById('generate-qr-btn').addEventListener('click', async () => {
    const amt = document.getElementById('upi-amount').value;
    if (!amt) return showToast('Enter amount first', 'error');
    const link = `upi://pay?pa=${UPI_ID}&pn=ShreeMilkCenter&am=${amt}&cu=INR&tn=Delivery+Payment`;
    try {
      const url = await QRCode.toDataURL(link, { width:220, margin:1, color:{dark:'#1a1a2e',light:'#ffffff'} });
      document.getElementById('qr-image').src = url;
      document.getElementById('qr-container').classList.remove('hidden');
    } catch(err) { showToast('QR generation failed', 'error'); }
  });

  document.getElementById('confirm-cash-btn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('cash-amount').value);
    const notes  = document.getElementById('cash-notes').value.trim();
    if (!amount || amount <= 0) return showToast('Enter valid amount', 'error');
    await saveTransaction({ amount, payment_mode:'cash', notes, type:'payment_received' });
  });

  document.getElementById('confirm-upi-btn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('upi-amount').value);
    const upiRef = document.getElementById('upi-ref').value.trim();
    if (!amount || amount <= 0) return showToast('Enter valid amount', 'error');
    await saveTransaction({ amount, payment_mode:'upi', upi_ref:upiRef, type:'payment_received' });
  });
}

/* ── SAVE TRANSACTION ── */
async function saveTransaction({ amount, payment_mode, notes, upi_ref, type }) {
  const v = currentOrder?.vendors || {};
  const vendorId = currentOrder?.vendor_id || v.id;
  const partnerName = currentPartner.full_name || currentPartner.username;

  const { error } = await sb.from('transactions').insert({
    vendor_id: vendorId || null,
    vendor_name: currentOrder?.vendor_name || v.store_name || 'Unknown',
    delivery_partner_id: currentPartner.id,
    delivery_partner_name: partnerName,
    order_id: currentOrder?.id || null,
    order_ref: currentOrder?.id?.slice(0,8).toUpperCase() || null,
    type, amount, payment_mode,
    upi_ref: upi_ref || null,
    notes: notes || null,
    marked_by: 'delivery_partner'
  });

  if (error) { showToast('Save failed: ' + error.message, 'error'); return; }

  // Update vendor outstanding
  if (vendorId) {
    const curDue = Number(v.outstanding_balance || 0);
    await sb.from('vendors').update({ outstanding_balance: Math.max(0, curDue - amount) }).eq('id', vendorId);
  }

  showToast(`₹${amount} saved successfully!`, 'success');
  hide('payment-modal');
  loadOrders();
}

/* ── TRANSACTIONS TAB ── */
async function loadTransactions() {
  document.getElementById('txn-list').innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading…</div>';
  let query = sb.from('transactions').select('*').eq('delivery_partner_id', currentPartner.id).order('created_at',{ascending:false}).limit(100);
  if (txnFilter !== 'all') query = query.eq('payment_mode', txnFilter);
  const { data } = await query;
  allTxns = data || [];
  renderTxns(allTxns);
}

function renderTxns(txns) {
  const el = document.getElementById('txn-list');
  if (!txns.length) { 
    el.innerHTML = '<div class="empty-state"><i data-lucide="wallet" class="empty-icon"></i> No transactions yet</div>'; 
    refreshIcons();
    return; 
  }
  el.innerHTML = txns.map(t => `
    <div class="txn-card">
      <div class="txn-top">
        <div>
          <div class="txn-vendor">${t.vendor_name||'Unknown'}</div>
          <div class="txn-meta"><i data-lucide="${t.payment_mode==='cash'?'banknote':'smartphone'}"></i> ${t.payment_mode==='cash'?'Cash':'UPI'} • ${formatTxnType(t.type)} • ${formatDate(t.created_at)}</div>
          ${t.order_ref?`<div class="txn-meta">Order #${t.order_ref}</div>`:''}
          ${t.upi_ref?`<div class="txn-meta">Ref: ${t.upi_ref}</div>`:''}
          ${t.notes?`<div class="txn-meta">${t.notes}</div>`:''}
        </div>
        <div class="txn-amount ${t.payment_mode}">₹${Number(t.amount).toFixed(2)}</div>
      </div>
    </div>`).join('');
  refreshIcons();
}

function bindFilterChips() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      txnFilter = chip.dataset.filter;
      loadTransactions();
    });
  });
}

/* ── NEW TXN MODAL ── */
async function loadVendors() {
  const { data } = await sb.from('vendors').select('id, store_name, outstanding_balance').order('store_name');
  vendorsList = data || [];
}

function bindNewTxnModal() {
  document.getElementById('new-txn-btn').addEventListener('click', () => {
    const sel = document.getElementById('txn-vendor-select');
    sel.innerHTML = '<option value="">— Select Vendor —</option>' +
      vendorsList.map(v => `<option value="${v.id}" data-due="${v.outstanding_balance||0}">${v.store_name}${v.outstanding_balance>0?` (Due ₹${Number(v.outstanding_balance).toFixed(0)})`:''}</option>`).join('');
    document.getElementById('txn-amount').value = '';
    document.getElementById('txn-notes').value = '';
    document.getElementById('selected-vendor-due').style.display = 'none';
    setNewtxnMode('cash');
    show('newtxn-modal');
    refreshIcons();
  });

  document.getElementById('close-newtxn-modal').addEventListener('click', () => hide('newtxn-modal'));
  document.getElementById('newtxn-modal').addEventListener('click', e => { if(e.target.id==='newtxn-modal') hide('newtxn-modal'); });

  document.getElementById('txn-vendor-select').addEventListener('change', function() {
    const due = parseFloat(this.options[this.selectedIndex]?.dataset?.due || 0);
    const banner = document.getElementById('selected-vendor-due');
    if (due > 0) { banner.innerHTML = `<i data-lucide="alert-triangle"></i> Outstanding due: <b>₹${due.toFixed(2)}</b>`; banner.style.display='block'; }
    else banner.style.display = 'none';
    refreshIcons();
  });

  document.getElementById('newtxn-mode-cash').addEventListener('click', () => setNewtxnMode('cash'));
  document.getElementById('newtxn-mode-upi').addEventListener('click', () => setNewtxnMode('upi'));

  document.getElementById('save-txn-btn').addEventListener('click', async () => {
    const vendorId = document.getElementById('txn-vendor-select').value;
    const amount   = parseFloat(document.getElementById('txn-amount').value);
    const type     = document.getElementById('txn-type-select').value;
    const notes    = document.getElementById('txn-notes').value.trim();
    const upiRef   = document.getElementById('newtxn-upi-ref').value.trim();

    if (!vendorId) return showToast('Select a vendor', 'error');
    if (!amount || amount <= 0) return showToast('Enter valid amount', 'error');

    const vendor = vendorsList.find(v => v.id === vendorId);
    const partnerName = currentPartner.full_name || currentPartner.username;

    const { error } = await sb.from('transactions').insert({
      vendor_id: vendorId,
      vendor_name: vendor?.store_name || 'Unknown',
      delivery_partner_id: currentPartner.id,
      delivery_partner_name: partnerName,
      type, amount, payment_mode: newtxnPayMode,
      upi_ref: upiRef || null,
      notes: notes || null,
      marked_by: 'delivery_partner'
    });

    if (error) return showToast('Error: ' + error.message, 'error');

    if (vendor) {
      const newDue = Math.max(0, Number(vendor.outstanding_balance||0) - amount);
      await sb.from('vendors').update({ outstanding_balance: newDue }).eq('id', vendorId);
      vendor.outstanding_balance = newDue;
    }

    showToast(`₹${amount} transaction saved!`, 'success');
    hide('newtxn-modal');
    loadTransactions();
    loadVendors();
  });
}

function setNewtxnMode(mode) {
  newtxnPayMode = mode;
  document.getElementById('newtxn-mode-cash').classList.toggle('active', mode==='cash');
  document.getElementById('newtxn-mode-upi').classList.toggle('active', mode==='upi');
  const refGroup = document.getElementById('newtxn-upi-ref-group');
  refGroup.style.display = mode==='upi' ? 'block' : 'none';
}

/* ── PROFILE STATS ── */
async function loadProfileStats() {
  const { data: txns } = await sb.from('transactions').select('amount,payment_mode').eq('delivery_partner_id', currentPartner.id);
  const totalTxn  = txns?.length || 0;
  const cashTotal = txns?.filter(t=>t.payment_mode==='cash').reduce((s,t)=>s+Number(t.amount),0) || 0;
  const delivered = allOrders.filter(o=>o.delivery_status==='delivered').length;
  document.getElementById('p-total-txn').textContent = totalTxn;
  document.getElementById('p-total-cash').textContent = `₹${cashTotal.toFixed(0)}`;
  document.getElementById('p-total-delivered').textContent = delivered;
}

/* ── LOGOUT ── */
function bindLogout() {
  const logout = () => { localStorage.removeItem('dp_session'); location.reload(); };
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('profile-logout').addEventListener('click', logout);
}

/* ── BIND ALL EVENTS ── */
function bindEvents() {
  bindLogin();
  bindNav();
  bindSearch();
  bindOrderModal();
  bindPaymentModal();
  bindNewTxnModal();
  bindFilterChips();
  bindLogout();
}

/* ── HELPERS ── */
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

function formatStatus(s) {
  return {pending:'Pending',out_for_delivery:'Out for Delivery',delivered:'Delivered',failed:'Failed'}[s] || 'Pending';
}
function formatTxnType(t) {
  return {payment_received:'Payment Received',due_settlement:'Due Settled',invoice_delivery:'Invoice'}[t] || t;
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
function parseItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try { return JSON.parse(items); } catch { return []; }
}
function refreshIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

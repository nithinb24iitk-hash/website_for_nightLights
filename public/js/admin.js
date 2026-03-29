// ==========================================
// FRY-DAY NIGHT LIGHTS — Admin Page JS
// ==========================================

let dynamicMenu = [];
let allOrders = [];
let currentFilter = 'all';
let adminCart = {};
let adminToken = sessionStorage.getItem('adminToken') || '';
let dashboardInitialized = false;
let ordersPollerId = null;
const APP_TIME_ZONE = 'Asia/Kolkata';

const STATUS_FLOW = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered'
};

function formatOrderId(orderId) {
  const value = String(orderId || '');
  if (/^FDNL-\d{8}-\d+$/.test(value)) {
    return value;
  }
  return `LEGACY-${value.slice(-6)}`;
}

function getDateParts(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  return {
    year: parts.find(part => part.type === 'year')?.value || '0000',
    month: parts.find(part => part.type === 'month')?.value || '00',
    day: parts.find(part => part.type === 'day')?.value || '00'
  };
}

function getDateKey(dateLike = new Date()) {
  const { year, month, day } = getDateParts(dateLike);
  return `${year}-${month}-${day}`;
}

function formatCurrency(value = 0) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatDayLabel(dateKey) {
  if (!dateKey) return 'Selected day';
  const [year, month, day] = dateKey.split('-');
  const date = new Date(`${year}-${month}-${day}T00:00:00+05:30`);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date);
}

function getOrderTotal(order) {
  return Number(order?.total) || 0;
}

// Helper: get auth headers
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-token': adminToken
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
  });

  // Setup login
  setupLogin();

  if (adminToken) {
    showDashboard();
  } else {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginOverlay').style.display = 'flex';
  }
});

// Fetch menu from DB
async function fetchMenu() {
  try {
    const res = await fetch('/api/menu');
    dynamicMenu = await res.json();
  } catch (err) {
    console.error('Error fetching menu');
  }
}

// Login
function setupLogin() {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const password = document.getElementById('adminPassword').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (res.ok && data.token) {
        adminToken = data.token;
        sessionStorage.setItem('adminToken', adminToken);
        showDashboard();
      } else {
        errorEl.textContent = 'Incorrect password. Please try again.';
        errorEl.style.display = 'block';
      }
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }
  });
}

async function showDashboard() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';

  await Promise.all([fetchOrders(), fetchMenu()]);

  if (!dashboardInitialized) {
    setupStatusFilters();
    setupEarningsTracker();
    setupAdminOrderModal();

    document.getElementById('refreshBtn').addEventListener('click', fetchOrders);
    ordersPollerId = setInterval(fetchOrders, 15000);
    dashboardInitialized = true;
    return;
  }

  if (!ordersPollerId) {
    ordersPollerId = setInterval(fetchOrders, 15000);
  }
}

// Fetch orders from API
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders', {
      headers: { 'x-admin-token': adminToken }
    });
    if (res.status === 401) {
      // Token invalid, force re-login
      sessionStorage.removeItem('adminToken');
      location.reload();
      return;
    }
    allOrders = await res.json();
    updateStats();
    renderEarningsTracker();
    renderOrders();
  } catch (err) {
    console.error('Failed to fetch orders:', err);
  }
}

// Update stats
function updateStats() {
  const total = allOrders.length;
  const pending = allOrders.filter(o => o.status === 'pending').length;
  const preparing = allOrders.filter(o => o.status === 'preparing').length;
  const awaitingPayment = allOrders.filter(o => o.status === 'delivered' && !o.isPaid).length;
  const paidRevenue = allOrders
    .filter(o => o.isPaid && o.status !== 'cancelled')
    .reduce((sum, o) => sum + getOrderTotal(o), 0);
  const todayKey = getDateKey(new Date());
  const todayEarnings = allOrders
    .filter(o => o.isPaid && o.paidAt && getDateKey(o.paidAt) === todayKey)
    .reduce((sum, o) => sum + getOrderTotal(o), 0);

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statPreparing').textContent = preparing;
  document.getElementById('statAwaitingPayment').textContent = awaitingPayment;
  document.getElementById('statPaidRevenue').textContent = formatCurrency(paidRevenue);
  document.getElementById('statTodayEarnings').textContent = formatCurrency(todayEarnings);
}

function setupEarningsTracker() {
  const dateInput = document.getElementById('earningsDate');
  const earningsList = document.getElementById('earningsList');
  if (!dateInput || !earningsList) return;

  if (!dateInput.value) {
    dateInput.value = getDateKey(new Date());
  }

  dateInput.addEventListener('change', renderEarningsTracker);
  earningsList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-earnings-day]');
    if (!row) return;
    dateInput.value = row.dataset.earningsDay;
    renderEarningsTracker();
  });
}

function renderEarningsTracker() {
  const dateInput = document.getElementById('earningsDate');
  const selectedValueEl = document.getElementById('selectedDayEarnings');
  const selectedMetaEl = document.getElementById('selectedDayMeta');
  const pendingValueEl = document.getElementById('pendingCollectionValue');
  const pendingMetaEl = document.getElementById('pendingCollectionMeta');
  const detailTitleEl = document.getElementById('earningsDetailTitle');
  const detailCountEl = document.getElementById('earningsDetailCount');
  const detailListEl = document.getElementById('earningsDetailList');
  const earningsList = document.getElementById('earningsList');

  if (!dateInput || !selectedValueEl || !selectedMetaEl || !pendingValueEl || !pendingMetaEl || !detailTitleEl || !detailCountEl || !detailListEl || !earningsList) {
    return;
  }

  if (!dateInput.value) {
    dateInput.value = getDateKey(new Date());
  }

  const selectedDay = dateInput.value;
  const paidByDay = new Map();

  allOrders
    .filter(order => order.isPaid && order.paidAt)
    .forEach(order => {
      const key = getDateKey(order.paidAt);
      const bucket = paidByDay.get(key) || { total: 0, count: 0 };
      bucket.total += getOrderTotal(order);
      bucket.count += 1;
      paidByDay.set(key, bucket);
    });

  const selectedBucket = paidByDay.get(selectedDay) || { total: 0, count: 0 };
  const pendingCollectionOrders = allOrders.filter(order => order.status === 'delivered' && !order.isPaid);
  const pendingCollectionTotal = pendingCollectionOrders.reduce((sum, order) => sum + getOrderTotal(order), 0);
  const selectedOrders = allOrders
    .filter(order => order.isPaid && order.paidAt && getDateKey(order.paidAt) === selectedDay)
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

  selectedValueEl.textContent = formatCurrency(selectedBucket.total);
  selectedMetaEl.textContent = `${selectedBucket.count} paid order${selectedBucket.count === 1 ? '' : 's'} on ${formatDayLabel(selectedDay)}`;
  pendingValueEl.textContent = formatCurrency(pendingCollectionTotal);
  pendingMetaEl.textContent = `${pendingCollectionOrders.length} delivered unpaid order${pendingCollectionOrders.length === 1 ? '' : 's'}`;
  detailTitleEl.textContent = `Paid orders for ${formatDayLabel(selectedDay)}`;
  detailCountEl.textContent = `${selectedOrders.length} order${selectedOrders.length === 1 ? '' : 's'}`;
  detailListEl.innerHTML = selectedOrders.length
    ? selectedOrders.map(order => `
      <div class="earnings-order-row">
        <div class="earnings-order-copy">
          <strong>${formatOrderId(order.id)} · ${order.customerName || 'Unknown'}</strong>
          <span>${new Date(order.paidAt).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })} · ${order.orderType === 'takeaway' ? 'Takeaway' : 'Dine In'}</span>
        </div>
        <span class="earnings-order-total">${formatCurrency(order.total)}</span>
      </div>
    `).join('')
    : `<div class="earnings-empty"><i class="fas fa-calendar-day"></i><p>No paid orders for ${formatDayLabel(selectedDay)} yet.</p></div>`;

  const rows = [...paidByDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, data]) => `
      <button type="button" class="earnings-day-row ${dateKey === selectedDay ? 'active' : ''}" data-earnings-day="${dateKey}">
        <span class="earnings-day-copy">
          <strong>${formatDayLabel(dateKey)}</strong>
          <span>${data.count} paid order${data.count === 1 ? '' : 's'}</span>
        </span>
        <span class="earnings-day-total">${formatCurrency(data.total)}</span>
      </button>
    `);

  earningsList.innerHTML = rows.length
    ? rows.join('')
    : `<div class="earnings-empty"><i class="fas fa-wallet"></i><p>No paid orders yet. Mark delivered orders as paid to add them to earnings.</p></div>`;
}

// Status filters
function setupStatusFilters() {
  const buttons = document.querySelectorAll('.status-filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.status;
      renderOrders();
    });
  });
}

// Render orders
function renderOrders() {
  const container = document.getElementById('ordersList');
  const filtered = currentFilter === 'all' ? allOrders : allOrders.filter(o => o.status === currentFilter);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="no-orders"><i class="fas fa-inbox"></i><p>No ${currentFilter === 'all' ? '' : currentFilter} orders</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(order => {
    const time = new Date(order.createdAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    const itemTags = (order.items || []).map(i =>
      `<span class="order-item-tag">${i.name} × ${i.qty}</span>`
    ).join('');

    const nextStatus = STATUS_FLOW[order.status];
    const canAdvance = !!nextStatus;
    const canMarkPaid = order.status === 'delivered' && !order.isPaid;
    const paymentStatus = order.isPaid
      ? `<span class="order-payment paid"><i class="fas fa-wallet"></i> Paid</span>`
      : order.status === 'delivered'
        ? `<span class="order-payment unpaid"><i class="fas fa-hourglass-half"></i> Awaiting Payment</span>`
        : '';
    const paidAtMarkup = order.isPaid && order.paidAt
      ? `<p class="order-payment-note"><i class="fas fa-badge-check"></i> Paid on ${new Date(order.paidAt).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })}</p>`
      : '';

    return `
      <div class="order-card">
        <div class="order-card-top">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span class="order-id">${formatOrderId(order.id)}</span>
            <span class="order-status ${order.status}">${order.status}</span>
            ${paymentStatus}
            ${order.placedBy === 'admin' ? '<span style="font-size:0.7rem;color:var(--neon-cyan);border:1px solid var(--neon-cyan);padding:2px 8px;border-radius:12px;">Admin</span>' : ''}
          </div>
          <span class="order-time"><i class="far fa-clock"></i> ${time}</span>
        </div>
        <div class="order-customer">
          <i class="fas fa-user"></i> ${order.customerName || 'Unknown'} • 
          <i class="fas fa-phone"></i> ${order.customerPhone || 'N/A'} •
          <i class="fas fa-${order.orderType === 'takeaway' ? 'bag-shopping' : 'utensils'}"></i> ${order.orderType || 'dine-in'}
        </div>
        <div class="order-items-list">${itemTags}</div>
        ${order.notes ? `<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:10px;"><i class="fas fa-note-sticky"></i> ${order.notes}</p>` : ''}
        ${paidAtMarkup}
        <div class="order-card-bottom">
          <span class="order-total">${formatCurrency(order.total)}</span>
          <div class="order-actions">
            ${canAdvance ? `<button class="order-action-btn accept" onclick="updateOrderStatus('${order.id}', '${nextStatus}')"><i class="fas fa-arrow-right"></i> ${nextStatus}</button>` : ''}
            ${canMarkPaid ? `<button class="order-action-btn pay" onclick="markOrderPaid('${order.id}')"><i class="fas fa-wallet"></i> Mark Paid</button>` : ''}
            ${order.status !== 'cancelled' && order.status !== 'delivered' ?
              `<button class="order-action-btn" onclick="updateOrderStatus('${order.id}', 'cancelled')"><i class="fas fa-times"></i> Cancel</button>` : ''}
            ${order.isPaid || order.status === 'cancelled' ?
              `<button class="order-action-btn" onclick="deleteOrder('${order.id}')"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Update order status
async function updateOrderStatus(id, status) {
  try {
    const res = await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      showToast(`Order updated to "${status}"`, 'success');
      fetchOrders();
    }
  } catch (err) {
    showToast('Failed to update order', 'error');
  }
}

async function markOrderPaid(id) {
  try {
    const res = await fetch(`/api/orders/${id}/payment`, {
      method: 'PATCH',
      headers: authHeaders()
    });

    if (res.ok) {
      const order = await res.json();
      showToast(`Order ${formatOrderId(order.id)} marked paid and added to earnings`, 'success');
      fetchOrders();
      return;
    }

    const error = await res.json().catch(() => ({}));
    showToast(error.error || 'Failed to update payment', 'error');
  } catch (err) {
    showToast('Failed to update payment', 'error');
  }
}

// Delete order
async function deleteOrder(id) {
  try {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': adminToken }
    });
    if (res.ok) {
      showToast('Order removed', 'success');
      fetchOrders();
    }
  } catch (err) {
    showToast('Failed to delete order', 'error');
  }
}

// Admin Order Modal
function setupAdminOrderModal() {
  const modal = document.getElementById('adminOrderModal');
  const openBtn = document.getElementById('adminOrderBtn');
  const cancelBtn = document.getElementById('cancelAdminOrder');
  const form = document.getElementById('adminOrderForm');
  const menuContainer = document.getElementById('adminMenuItems');
  const totalDisplay = document.getElementById('adminOrderTotal');

  // Build the menu item picker grouped by category
  const categories = [...new Set(dynamicMenu.map(i => i.category))];
  menuContainer.innerHTML = categories.map(cat => `
    <div style="margin-bottom:12px;">
      <div style="font-family:'Outfit',sans-serif;font-weight:600;font-size:0.85rem;color:var(--neon-pink);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">${cat}</div>
      ${dynamicMenu.filter(i => i.category === cat).map(item => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
          <div style="flex:1;">
            <span style="font-size:0.9rem;">${item.name}</span>
            <span style="color:var(--neon-yellow);font-size:0.85rem;margin-left:8px;">₹${item.price}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" class="qty-btn" data-admin-item="${item.id}" data-action="dec">−</button>
            <span class="qty-number" id="adminQty-${item.id}">0</span>
            <button type="button" class="qty-btn" data-admin-item="${item.id}" data-action="inc">+</button>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  // Qty button handlers
  menuContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-admin-item]');
    if (!btn) return;
    const id = parseInt(btn.dataset.adminItem);
    const action = btn.dataset.action;

    if (!adminCart[id]) adminCart[id] = 0;
    if (action === 'inc') adminCart[id]++;
    if (action === 'dec' && adminCart[id] > 0) adminCart[id]--;
    if (adminCart[id] <= 0) delete adminCart[id];

    document.getElementById(`adminQty-${id}`).textContent = adminCart[id] || 0;

    // Update total
    const total = Object.entries(adminCart).reduce((sum, [itemId, qty]) => {
      const item = dynamicMenu.find(i => i.id === parseInt(itemId));
      return sum + (item ? item.price * qty : 0);
    }, 0);
    totalDisplay.textContent = `₹${total}`;
  });

  openBtn.addEventListener('click', () => {
    adminCart = {};
    menuContainer.querySelectorAll('.qty-number').forEach(el => el.textContent = '0');
    totalDisplay.textContent = '₹0';
    form.reset();
    modal.classList.add('active');
  });

  cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const items = Object.entries(adminCart).map(([itemId, qty]) => {
      const item = dynamicMenu.find(i => i.id === parseInt(itemId));
      return { name: item.name, qty, price: item.price };
    }).filter(i => i.qty > 0);

    if (items.length === 0) {
      showToast('Please add at least one item', 'error');
      return;
    }

    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    const orderData = {
      customerName: document.getElementById('adminCustName').value,
      customerPhone: document.getElementById('adminCustPhone').value,
      orderType: document.getElementById('adminOrderType').value,
      notes: document.getElementById('adminNotes').value,
      items,
      total,
      placedBy: 'admin'
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(orderData)
      });
      if (res.ok) {
        const createdOrder = await res.json();
        modal.classList.remove('active');
        showToast(`Order ${formatOrderId(createdOrder.id)} created successfully!`, 'success');
        fetchOrders();
      }
    } catch (err) {
      showToast('Failed to create order', 'error');
    }
  });
}

// Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

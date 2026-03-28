// ==========================================
// FRY-DAY NIGHT LIGHTS — Admin Page JS
// ==========================================

let dynamicMenu = [];
let allOrders = [];
let currentFilter = 'all';
let adminCart = {};
let adminToken = sessionStorage.getItem('adminToken') || '';

const STATUS_FLOW = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered'
};

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

  // If already logged in, show dashboard
  if (adminToken) {
    showDashboard();
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

function showDashboard() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('adminDashboard').style.display = 'block';

  fetchOrders();
  fetchMenu();
  setupStatusFilters();
  setupAdminOrderModal();

  document.getElementById('refreshBtn').addEventListener('click', fetchOrders);
  setInterval(fetchOrders, 15000);
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
  const revenue = allOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statPreparing').textContent = preparing;
  document.getElementById('statRevenue').textContent = `₹${revenue.toLocaleString()}`;
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

    return `
      <div class="order-card">
        <div class="order-card-top">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span class="order-id">#${order.id.slice(-6)}</span>
            <span class="order-status ${order.status}">${order.status}</span>
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
        <div class="order-card-bottom">
          <span class="order-total">₹${(order.total || 0).toLocaleString()}</span>
          <div class="order-actions">
            ${canAdvance ? `<button class="order-action-btn accept" onclick="updateOrderStatus('${order.id}', '${nextStatus}')"><i class="fas fa-arrow-right"></i> ${nextStatus}</button>` : ''}
            ${order.status !== 'cancelled' && order.status !== 'delivered' ?
              `<button class="order-action-btn" onclick="updateOrderStatus('${order.id}', 'cancelled')"><i class="fas fa-times"></i> Cancel</button>` : ''}
            ${order.status === 'delivered' || order.status === 'cancelled' ?
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
      const item = MENU_ITEMS.find(i => i.id === parseInt(itemId));
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
      const item = MENU_ITEMS.find(i => i.id === parseInt(itemId));
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
        modal.classList.remove('active');
        showToast('Order created successfully!', 'success');
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

// ==========================================
// MENU MANAGER LOGIC
// ==========================================
function openMenuManager() {
  document.getElementById('menuManagerModal').classList.add('active');
  renderAdminMenuList();
}

function renderAdminMenuList() {
  const list = document.getElementById('adminMenuList');
  if (dynamicMenu.length === 0) {
    list.innerHTML = '<p style="text-align:center; padding:10px;">Menu is empty.</p>';
    return;
  }
  list.innerHTML = dynamicMenu.map(item => `
    <div style="display: flex; justify-content: space-between; align-items:center; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <span style="${item.isSoldOut ? 'text-decoration: line-through; opacity: 0.5;' : ''}"><strong>${item.name}</strong> (₹${item.price})</span>
      <div>
        <button onclick="toggleSoldOut(${item.id})" style="background:none; border:none; margin-right: 15px; color:${item.isSoldOut ? 'var(--neon-pink)' : '#aaa'}; cursor:pointer;" title="Toggle Sold Out">
          <i class="fas ${item.isSoldOut ? 'fa-ban' : 'fa-check-circle'}"></i> 
        </button>
        <button onclick="deleteMenuItem(${item.id})" style="background:none; border:none; color:#ff4444; cursor:pointer;" title="Delete Item">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function addMenuItem() {
  const payload = {
    name: document.getElementById('newMenuName').value,
    category: document.getElementById('newMenuCategory').value,
    price: document.getElementById('newMenuPrice').value,
    desc: document.getElementById('newMenuDesc').value,
    image: document.getElementById('newMenuImage').value
  };

  try {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': sessionStorage.getItem('adminToken')
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('Item added successfully!', 'success');
      document.getElementById('addMenuItemForm').reset();
      await fetchMenu();
      renderAdminMenuList();
    } else {
      showToast('Failed to add item', 'error');
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteMenuItem(id) {
  if (!confirm('Are you sure you want to permanently delete this item?')) return;
  try {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': sessionStorage.getItem('adminToken') }
    });
    if (res.ok) {
      showToast('Item deleted!', 'success');
      await fetchMenu();
      renderAdminMenuList();
    }
  } catch (err) {
    console.error(err);
  }
}

async function toggleSoldOut(id) {
  try {
    const res = await fetch(`/api/menu/${id}/soldout`, {
      method: 'PATCH',
      headers: { 'x-admin-token': sessionStorage.getItem('adminToken') }
    });
    if (res.ok) {
      await fetchMenu();
      renderAdminMenuList();
    } else {
      showToast('Failed to sync status', 'error');
    }
  } catch (err) {
    console.error(err);
  }
}

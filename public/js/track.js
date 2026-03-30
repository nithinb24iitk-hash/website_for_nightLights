// ==========================================
// FRY-DAY NIGHT LIGHTS — Tracking Page JS
// ==========================================

const TRACKING_STORAGE_KEY = 'frydayTrackingState';
const TRACKING_SESSION_KEY = 'frydayActiveTrackingOrderId';
const trackedOrders = new Map();
let trackingPollerId = null;

const TRACKING_STEPS = [
  { key: 'pending', label: 'Confirmed', icon: 'fa-receipt' },
  { key: 'preparing', label: 'Preparing', icon: 'fa-fire-burner' },
  { key: 'ready', label: 'Ready', icon: 'fa-bell-concierge' },
  { key: 'delivered', label: 'Delivered', icon: 'fa-hand-holding-heart' },
  { key: 'paid', label: 'Paid', icon: 'fa-wallet' }
];

const TRACKING_COPY = {
  pending: {
    kicker: 'Order Received',
    title: 'Your order is confirmed',
    body: 'We have your ticket and the kitchen queue is lining it up now.',
    alert: 'Sit tight. The team will move this into preparation shortly.'
  },
  preparing: {
    kicker: 'Kitchen Update',
    title: 'Your order is being prepared',
    body: 'Fresh items are on the grill and moving through the kitchen.',
    alert: 'If you need something extra, place another order now and we’ll keep both tracked here.'
  },
  ready: {
    kicker: 'Almost There',
    title: 'Your order is ready',
    body: 'Your food is waiting for handoff at the cafe.',
    alert: 'Head to the counter or your table area. Payment usually happens at handoff.'
  },
  delivered: {
    kicker: 'Served',
    title: 'Your order has been delivered',
    body: 'You’ve received the order. Tracking stays active until payment is marked complete.',
    alert: 'Need anything else? You can place another order while this one remains on your tracking screen.'
  },
  paid: {
    kicker: 'Complete',
    title: 'Order paid and completed',
    body: 'Payment has been recorded. You can keep this here as a recent order or start fresh.',
    alert: 'This order is closed. Start a new order any time.'
  },
  cancelled: {
    kicker: 'Order Closed',
    title: 'This order was cancelled',
    body: 'The order is no longer active, but you can still review the details here.',
    alert: 'Start a fresh order if you still want something from the menu.'
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  setupHamburger();
  setupLookupForm();
  setupTrackingActions();
  seedLookupFormFromStorage();
  await bootstrapTracking();
  showFlashMessage();
  trackingPollerId = setInterval(refreshTrackedOrders, 15000);
});

function setupHamburger() {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks?.classList.toggle('open');
  });
}

function readTrackingState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY) || '{}');
    return {
      activeOrderIds: Array.isArray(parsed.activeOrderIds) ? parsed.activeOrderIds : [],
      recentOrders: Array.isArray(parsed.recentOrders) ? parsed.recentOrders : [],
      selectedOrderId: String(parsed.selectedOrderId || ''),
      customerPhone: String(parsed.customerPhone || ''),
      customerName: String(parsed.customerName || '')
    };
  } catch (err) {
    return {
      activeOrderIds: [],
      recentOrders: [],
      selectedOrderId: '',
      customerPhone: '',
      customerName: ''
    };
  }
}

function writeTrackingState(state) {
  localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({
    activeOrderIds: state.activeOrderIds || [],
    recentOrders: state.recentOrders || [],
    selectedOrderId: state.selectedOrderId || '',
    customerPhone: state.customerPhone || '',
    customerName: state.customerName || ''
  }));
}

function readSessionActiveOrderId() {
  return String(sessionStorage.getItem(TRACKING_SESSION_KEY) || '');
}

function writeSessionActiveOrderId(orderId) {
  const normalizedId = String(orderId || '').trim();
  if (normalizedId) {
    sessionStorage.setItem(TRACKING_SESSION_KEY, normalizedId);
  } else {
    sessionStorage.removeItem(TRACKING_SESSION_KEY);
  }
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '').slice(-15);
}

function normalizeOrderId(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9-]{4,32}$/.test(normalized) ? normalized : '';
}

function isOrderActive(order) {
  return Boolean(order) && !order.isPaid && order.status !== 'cancelled';
}

function getTrackingStage(order) {
  if (!order) return 'pending';
  if (order.status === 'cancelled') return 'cancelled';
  if (order.isPaid) return 'paid';
  return order.status || 'pending';
}

function getDisplayStatus(order) {
  if (!order) return 'Unknown';
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.isPaid) return 'Paid';
  if (order.status === 'delivered') return 'Awaiting Payment';
  return (order.status || 'pending').replace(/-/g, ' ');
}

function formatCurrency(value = 0) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatDateTime(value) {
  if (!value) return 'Just now';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function scrollSelectedOrderIntoView() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;

  const stateCard = document.getElementById('trackingStateCard');
  if (!stateCard || stateCard.hidden) return;

  requestAnimationFrame(() => {
    const targetTop = stateCard.getBoundingClientRect().top + window.scrollY - 84;
    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: 'smooth'
    });
  });
}

function seedLookupFormFromStorage() {
  const sessionOrderId = readSessionActiveOrderId();
  if (!sessionOrderId) return;

  const state = readTrackingState();
  const phoneInput = document.getElementById('lookupPhone');
  if (phoneInput && state.customerPhone) {
    phoneInput.value = state.customerPhone;
  }
}

function mergeTrackedOrders(orders, selectedId = '') {
  if (!Array.isArray(orders) || !orders.length) return;

  const state = readTrackingState();
  const recentMap = new Map(state.recentOrders.map(entry => [String(entry.id), entry]));

  orders.forEach(order => {
    if (!order?.id) return;
    trackedOrders.set(order.id, order);
    recentMap.set(order.id, {
      id: order.id,
      createdAt: order.createdAt || new Date().toISOString(),
      customerPhone: order.customerPhone || '',
      customerName: order.customerName || ''
    });
    if (order.customerPhone) state.customerPhone = order.customerPhone;
    if (order.customerName) state.customerName = order.customerName;
  });

  const recentOrders = [...recentMap.values()]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 10);

  state.recentOrders = recentOrders;
  state.activeOrderIds = recentOrders
    .map(entry => trackedOrders.get(entry.id))
    .filter(isOrderActive)
    .map(order => order.id)
    .slice(0, 6);

  if (selectedId) {
    state.selectedOrderId = selectedId;
  } else if (!recentOrders.find(entry => entry.id === state.selectedOrderId)) {
    state.selectedOrderId = state.activeOrderIds[0] || recentOrders[0]?.id || '';
  }

  writeTrackingState(state);
}

function removeTrackedOrderFromDevice(orderId) {
  const state = readTrackingState();
  state.activeOrderIds = state.activeOrderIds.filter(id => id !== orderId);
  state.recentOrders = state.recentOrders.filter(entry => entry.id !== orderId);
  if (state.selectedOrderId === orderId) {
    state.selectedOrderId = state.activeOrderIds[0] || state.recentOrders[0]?.id || '';
  }
  writeTrackingState(state);
  trackedOrders.delete(orderId);
  if (readSessionActiveOrderId() === orderId) {
    writeSessionActiveOrderId('');
  }
}

async function fetchOrderById(orderId) {
  const normalizedId = normalizeOrderId(orderId);
  if (!normalizedId) throw new Error('No matching order found');

  const res = await fetch(`/api/orders/public/${encodeURIComponent(normalizedId)}`);
  if (!res.ok) {
    throw new Error('No matching order found');
  }
  return res.json();
}

async function fetchOrdersByIds(orderIds) {
  const ids = [...new Set(orderIds.map(normalizeOrderId).filter(Boolean))].slice(0, 10);
  if (!ids.length) return [];

  const res = await fetch(`/api/orders/public?ids=${encodeURIComponent(ids.join(','))}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch recent orders');
  }
  return res.json();
}

async function fetchOrdersByPhone(phone) {
  const phoneDigits = normalizePhone(phone);
  if (phoneDigits.length < 10) throw new Error('Enter a valid phone number');

  const res = await fetch(`/api/orders/public?phone=${encodeURIComponent(phoneDigits)}`);
  if (!res.ok) {
    throw new Error('No matching order found');
  }
  return res.json();
}

async function bootstrapTracking() {
  const params = new URLSearchParams(window.location.search);
  const requestedOrderId = normalizeOrderId(params.get('orderId'));
  const requestedPhone = normalizePhone(params.get('phone'));
  const sessionOrderId = readSessionActiveOrderId();
  const state = readTrackingState();
  let recentDeviceOrders = [];

  try {
    if (state.recentOrders.length) {
      recentDeviceOrders = await fetchOrdersByIds(state.recentOrders.map(entry => entry.id));
      mergeTrackedOrders(recentDeviceOrders);
    }
  } catch (err) {
    console.error('Failed to restore recent tracked orders', err);
  }

  renderDeviceRecentList();

  if (requestedPhone) {
    document.getElementById('lookupPhone').value = requestedPhone;
    await handlePhoneLookup(requestedPhone, { autoSelect: !requestedOrderId, quiet: true });
  }

  if (requestedOrderId) {
    try {
      const existing = trackedOrders.get(requestedOrderId) || await fetchOrderById(requestedOrderId);
      mergeTrackedOrders([existing], requestedOrderId);
      selectOrder(requestedOrderId, { updateUrl: false });
      scrollSelectedOrderIntoView();
      return;
    } catch (err) {
      showToast(err.message || 'Order not found', 'error');
    }
  }

  const latestState = readTrackingState();
  const fallbackId = sessionOrderId || (requestedPhone ? latestState.selectedOrderId : '');
  if (fallbackId && trackedOrders.has(fallbackId)) {
    selectOrder(fallbackId, { updateUrl: false });
  } else {
    if (!requestedOrderId && !requestedPhone && latestState.selectedOrderId && !sessionOrderId) {
      latestState.selectedOrderId = '';
      writeTrackingState(latestState);
    }
    if (sessionOrderId && !latestState.activeOrderIds.includes(sessionOrderId)) {
      writeSessionActiveOrderId('');
    }
    renderSelectedOrder(null);
  }
}

async function refreshTrackedOrders() {
  const state = readTrackingState();
  const ids = state.recentOrders.map(entry => entry.id).filter(Boolean);
  if (!ids.length) return;

  try {
    const orders = await fetchOrdersByIds(ids);
    mergeTrackedOrders(orders);
    renderDeviceRecentList();

    const selectedId = readTrackingState().selectedOrderId;
    if (selectedId && trackedOrders.has(selectedId)) {
      renderSelectedOrder(trackedOrders.get(selectedId));
    } else {
      const sessionOrderId = readSessionActiveOrderId();
      if (sessionOrderId && trackedOrders.has(sessionOrderId)) {
        selectOrder(sessionOrderId, { updateUrl: false });
        return;
      }
      renderSelectedOrder(null);
    }
  } catch (err) {
    console.error('Failed to refresh tracked orders', err);
  }
}

function setupLookupForm() {
  const form = document.getElementById('trackingLookupForm');
  const resetBtn = document.getElementById('lookupResetBtn');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const orderIdInput = document.getElementById('lookupOrderId');
    const phoneInput = document.getElementById('lookupPhone');
    const orderId = normalizeOrderId(orderIdInput?.value);
    const phone = normalizePhone(phoneInput?.value);

    if (!orderId && phone.length < 10) {
      showToast('Enter an order ID or a valid phone number', 'error');
      return;
    }

    if (orderId) {
      try {
        const order = await fetchOrderById(orderId);
        mergeTrackedOrders([order], order.id);
        renderDeviceRecentList();
        selectOrder(order.id);
        scrollSelectedOrderIntoView();
        showToast(`Loaded order ${order.id}`, 'success');
      } catch (err) {
        showToast(err.message || 'Order not found', 'error');
      }
      return;
    }

    await handlePhoneLookup(phone);
  });

  resetBtn?.addEventListener('click', () => {
    document.getElementById('lookupOrderId').value = '';
    document.getElementById('lookupPhone').value = readSessionActiveOrderId() ? readTrackingState().customerPhone || '' : '';
    document.getElementById('phoneResultsCard').hidden = true;
    document.getElementById('phoneResultsList').innerHTML = '';
  });
}

async function handlePhoneLookup(phone, options = {}) {
  const { autoSelect = true, quiet = false } = options;

  try {
    const orders = await fetchOrdersByPhone(phone);
    mergeTrackedOrders(orders, autoSelect && orders[0] ? orders[0].id : '');
    renderDeviceRecentList();
    renderPhoneResultsList(orders, phone);

    if (autoSelect && orders[0]) {
      selectOrder(orders[0].id);
      scrollSelectedOrderIntoView();
    } else if (!orders.length && !quiet) {
      showToast('No orders found for that phone number', 'error');
    }

    if (orders.length && !quiet) {
      showToast(`Found ${orders.length} recent order${orders.length === 1 ? '' : 's'}`, 'success');
    }
  } catch (err) {
    if (!quiet) {
      showToast(err.message || 'Failed to fetch orders', 'error');
    }
  }
}

function setupTrackingActions() {
  const clearBtn = document.getElementById('trackingClearBtn');

  clearBtn?.addEventListener('click', () => {
    const orderId = readTrackingState().selectedOrderId;
    if (!orderId) return;

    removeTrackedOrderFromDevice(orderId);
    renderDeviceRecentList();

    const nextId = readTrackingState().selectedOrderId;
    if (nextId && trackedOrders.has(nextId)) {
      selectOrder(nextId);
      return;
    }

    history.replaceState({}, '', '/track');
    renderSelectedOrder(null);
    showToast('Order removed from your recent list', 'success');
  });
}

function selectOrder(orderId, options = {}) {
  const { updateUrl = true } = options;
  const order = trackedOrders.get(orderId);
  if (!order) {
    renderSelectedOrder(null);
    return;
  }

  const state = readTrackingState();
  state.selectedOrderId = order.id;
  if (order.customerPhone) state.customerPhone = order.customerPhone;
  if (order.customerName) state.customerName = order.customerName;
  writeTrackingState(state);

  renderSelectedOrder(order);
  renderDeviceRecentList();
  renderPhoneResultsList(null, null, true);

  if (updateUrl) {
    history.replaceState({}, '', `/track?orderId=${encodeURIComponent(order.id)}`);
  }
}

function renderSelectedOrder(order) {
  const stateCard = document.getElementById('trackingStateCard');
  const emptyState = document.getElementById('trackingEmptyState');
  const addMoreTop = document.getElementById('trackingAddMoreTop');
  const addMoreBtn = document.getElementById('trackingAddMoreBtn');
  const clearBtn = document.getElementById('trackingClearBtn');
  const snapshotEl = document.getElementById('trackingSnapshot');

  document.body.classList.toggle('has-tracked-order', Boolean(order));

  if (!order) {
    stateCard.hidden = true;
    emptyState.hidden = false;
    addMoreTop.href = '/order';
    addMoreBtn.href = '/order';
    if (snapshotEl) {
      snapshotEl.innerHTML = '';
    }
    writeSessionActiveOrderId('');
    return;
  }

  const stage = getTrackingStage(order);
  const copy = TRACKING_COPY[stage] || TRACKING_COPY.pending;
  const itemCount = (order.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const paymentText = order.isPaid
    ? `Paid on ${formatDateTime(order.paidAt)}`
    : order.status === 'delivered'
      ? 'Awaiting payment at cafe'
      : order.orderType === 'takeaway'
        ? 'Pay at pickup'
        : 'Pay at table';

  stateCard.hidden = false;
  emptyState.hidden = true;

  document.getElementById('trackingKicker').textContent = copy.kicker;
  document.getElementById('trackingTitle').textContent = copy.title;
  document.getElementById('trackingStatusCopy').textContent = copy.body;
  document.getElementById('trackingOrderId').textContent = order.id;
  document.getElementById('trackingStatusBadge').textContent = getDisplayStatus(order);
  document.getElementById('trackingStatusBadge').className = `tracking-status-badge ${stage}`;
  document.getElementById('trackingItemCount').textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

  if (snapshotEl) {
    snapshotEl.innerHTML = `
      <div class="tracking-snapshot-card">
        <span>Items</span>
        <strong>${itemCount}</strong>
      </div>
      <div class="tracking-snapshot-card">
        <span>Mode</span>
        <strong>${order.orderType === 'takeaway' ? 'Takeaway' : 'Dine In'}</strong>
      </div>
      <div class="tracking-snapshot-card">
        <span>Total</span>
        <strong>${formatCurrency(order.total)}</strong>
      </div>
    `;
  }

  renderTrackingProgress(order);

  document.getElementById('trackingMetaGrid').innerHTML = `
    <div class="tracking-meta-card">
      <span>Placed</span>
      <strong>${formatDateTime(order.createdAt)}</strong>
    </div>
    <div class="tracking-meta-card">
      <span>Order Type</span>
      <strong>${order.orderType === 'takeaway' ? 'Takeaway' : 'Dine In'}</strong>
    </div>
    <div class="tracking-meta-card">
      <span>Total</span>
      <strong>${formatCurrency(order.total)}</strong>
    </div>
    <div class="tracking-meta-card">
      <span>Payment</span>
      <strong>${paymentText}</strong>
    </div>
  `;

  document.getElementById('trackingAlert').className = `tracking-alert ${stage}`;
  document.getElementById('trackingAlert').innerHTML = `<i class="fas fa-circle-info"></i><span>${copy.alert}</span>`;

  document.getElementById('trackingSummaryItems').innerHTML = (order.items || []).map(item => `
    <div class="tracking-summary-row">
      <div class="tracking-summary-copy">
        <strong>${item.name}</strong>
        <span>${Number(item.qty) || 0} × ${formatCurrency(item.price)}</span>
      </div>
      <span class="tracking-summary-total">${formatCurrency((Number(item.qty) || 0) * (Number(item.price) || 0))}</span>
    </div>
  `).join('') || '<div class="tracking-list-empty">No items found for this order.</div>';

  const isActiveOrder = isOrderActive(order);
  if (isActiveOrder) {
    writeSessionActiveOrderId(order.id);
  } else if (readSessionActiveOrderId() === order.id) {
    writeSessionActiveOrderId('');
  }

  addMoreTop.href = isActiveOrder ? '/order?addMore=1' : '/order';
  addMoreBtn.href = addMoreTop.href;
  addMoreBtn.innerHTML = isActiveOrder
    ? '<i class="fas fa-plus"></i> Add More Items'
    : '<i class="fas fa-utensils"></i> Start New Order';
  clearBtn.textContent = order.isPaid || order.status === 'cancelled' ? 'Remove from Recent' : 'Hide This Order';
}

function renderTrackingProgress(order) {
  const progressEl = document.getElementById('trackingProgress');
  const stage = getTrackingStage(order);

  if (stage === 'cancelled') {
    progressEl.innerHTML = `
      <div class="tracking-progress-cancelled">
        <i class="fas fa-ban"></i>
        <span>Cancelled</span>
      </div>
    `;
    return;
  }

  const currentIndex = TRACKING_STEPS.findIndex(step => step.key === stage);

  progressEl.innerHTML = TRACKING_STEPS.map((step, index) => {
    const statusClass = index < currentIndex ? 'complete' : index === currentIndex ? 'active' : 'upcoming';
    return `
      <div class="tracking-step ${statusClass}">
        <div class="tracking-step-icon"><i class="fas ${step.icon}"></i></div>
        <div class="tracking-step-copy">
          <strong>${step.label}</strong>
        </div>
      </div>
    `;
  }).join('');
}

function renderDeviceRecentList() {
  const listEl = document.getElementById('deviceRecentList');
  const state = readTrackingState();
  const items = state.recentOrders
    .map(entry => trackedOrders.get(entry.id))
    .filter(Boolean);

  if (!items.length) {
    listEl.innerHTML = '<div class="tracking-list-empty">No recent orders yet.</div>';
    return;
  }

  listEl.innerHTML = items.map(order => renderTrackingListButton(order)).join('');
  listEl.querySelectorAll('[data-order-id]').forEach(button => {
    button.addEventListener('click', () => {
      selectOrder(button.dataset.orderId);
      scrollSelectedOrderIntoView();
    });
  });
}

function renderPhoneResultsList(orders, phone, preserveExisting = false) {
  const card = document.getElementById('phoneResultsCard');
  const listEl = document.getElementById('phoneResultsList');
  const metaEl = document.getElementById('phoneResultsMeta');

  if (preserveExisting) return;

  if (!orders || !orders.length) {
    card.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  card.hidden = false;
  metaEl.textContent = `Showing the latest ${orders.length} order${orders.length === 1 ? '' : 's'} for ${phone}.`;
  listEl.innerHTML = orders.map(order => renderTrackingListButton(order)).join('');
  listEl.querySelectorAll('[data-order-id]').forEach(button => {
    button.addEventListener('click', () => {
      selectOrder(button.dataset.orderId);
      scrollSelectedOrderIntoView();
    });
  });
}

function renderTrackingListButton(order) {
  const stage = getTrackingStage(order);
  const toneLabel = stage === 'paid'
    ? 'Completed'
    : stage === 'cancelled'
      ? 'Closed'
      : stage === 'delivered'
        ? 'Awaiting Pay'
        : 'Active';
  const selectedId = readTrackingState().selectedOrderId;

  return `
    <button type="button" class="tracking-list-item ${selectedId === order.id ? 'active' : ''}" data-order-id="${order.id}">
      <div class="tracking-list-copy">
        <strong>${order.id}</strong>
        <span>${formatDateTime(order.createdAt)} · ${getDisplayStatus(order)}</span>
      </div>
      <div class="tracking-list-meta">
        <span class="tracking-mini-badge ${stage}">${toneLabel}</span>
        <strong>${formatCurrency(order.total)}</strong>
      </div>
    </button>
  `;
}

function showFlashMessage() {
  const message = sessionStorage.getItem('trackingFlashMessage');
  if (!message) return;
  sessionStorage.removeItem('trackingFlashMessage');
  showToast(message, 'success');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

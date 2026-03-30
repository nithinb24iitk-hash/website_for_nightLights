// ==========================================
// FRY-DAY NIGHT LIGHTS — Order Page JS
// ==========================================

let dynamicMenu = [];

let cart = [];
const TRACKING_STORAGE_KEY = 'frydayTrackingState';
const TRACKING_SESSION_KEY = 'frydayActiveTrackingOrderId';
const CART_STORAGE_KEY = 'frydayOrderCartState';

function readStoredCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeStoredCart() {
  try {
    if (!cart.length) {
      localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }

    const compactCart = cart.map(item => ({
      id: Number(item.id),
      qty: Number(item.qty) || 1,
      name: String(item.name || ''),
      price: Number(item.price) || 0,
      image: String(item.image || ''),
      desc: String(item.desc || ''),
      category: String(item.category || '')
    }));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(compactCart));
  } catch (err) {
    // Ignore storage failures and continue checkout flow.
  }
}

function hydrateCartFromStorage() {
  const storedCart = readStoredCart();
  if (!storedCart.length) {
    cart = [];
    return;
  }

  const menuById = new Map(dynamicMenu.map(item => [Number(item.id), item]));
  const hasLiveMenu = dynamicMenu.length > 0;

  cart = storedCart.reduce((acc, entry) => {
    const id = Number(entry.id);
    const qty = Math.min(50, Math.max(1, Number(entry.qty) || 0));
    if (!Number.isFinite(id) || !qty) return acc;

    const menuItem = menuById.get(id);
    if (menuItem && !menuItem.isSoldOut) {
      acc.push({ ...menuItem, qty });
      return acc;
    }

    if (hasLiveMenu) {
      return acc;
    }

    const name = String(entry.name || '').trim();
    const price = Number(entry.price);
    if (!name || !Number.isFinite(price) || price < 0) {
      return acc;
    }

    acc.push({
      id,
      qty,
      name,
      price,
      image: String(entry.image || 'images/burger.png'),
      desc: String(entry.desc || ''),
      category: String(entry.category || 'other')
    });
    return acc;
  }, []);

  writeStoredCart();
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

function getOrderTrackingRef(order) {
  return String(order?.trackingRef || order?.trackingToken || order?.id || '').trim();
}

function rememberTrackedOrder(order) {
  const state = readTrackingState();
  const trackingRef = getOrderTrackingRef(order);
  const recentEntry = {
    id: order.id,
    trackingRef,
    createdAt: order.createdAt || new Date().toISOString(),
    customerPhone: order.customerPhone || '',
    customerName: order.customerName || ''
  };

  state.recentOrders = [
    recentEntry,
    ...state.recentOrders.filter(entry => entry.id !== order.id)
  ].slice(0, 10);

  if (!order.isPaid && order.status !== 'cancelled') {
    state.activeOrderIds = [
      order.id,
      ...state.activeOrderIds.filter(id => id !== order.id)
    ].slice(0, 6);
  }

  state.selectedOrderId = order.id;
  state.customerPhone = order.customerPhone || state.customerPhone;
  state.customerName = order.customerName || state.customerName;
  writeTrackingState(state);
  writeSessionActiveOrderId(order.id);
}

function getAddMoreMode() {
  return new URLSearchParams(window.location.search).get('addMore') === '1';
}

async function refreshTrackingStateFromServer() {
  const state = readTrackingState();
  const ids = state.recentOrders.map(entry => entry.id).filter(Boolean).slice(0, 10);

  if (!ids.length) {
    return state;
  }

  try {
    const res = await fetch(`/api/orders/public?ids=${encodeURIComponent(ids.join(','))}`);
    if (!res.ok) {
      return state;
    }

    const orders = await res.json();
    const recentMap = new Map(state.recentOrders.map(entry => [entry.id, entry]));

    orders.forEach(order => {
      const previousEntry = recentMap.get(order.id) || {};
      recentMap.set(order.id, {
        id: order.id,
        trackingRef: getOrderTrackingRef(order) || previousEntry.trackingRef || order.id,
        createdAt: order.createdAt || new Date().toISOString(),
        customerPhone: order.customerPhone || previousEntry.customerPhone || '',
        customerName: order.customerName || previousEntry.customerName || ''
      });
      if (order.customerPhone) state.customerPhone = order.customerPhone;
      if (order.customerName) state.customerName = order.customerName;
    });

    state.recentOrders = [...recentMap.values()]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 10);
    state.activeOrderIds = orders
      .filter(order => !order.isPaid && order.status !== 'cancelled')
      .map(order => order.id)
      .slice(0, 6);

    if (!state.recentOrders.find(entry => entry.id === state.selectedOrderId)) {
      state.selectedOrderId = state.activeOrderIds[0] || state.recentOrders[0]?.id || '';
    }

    writeTrackingState(state);
    return state;
  } catch (err) {
    return state;
  }
}

async function handleActiveOrderRouting() {
  const state = await refreshTrackingStateFromServer();
  const sessionOrderId = readSessionActiveOrderId();
  const hasSessionActiveOrder = Boolean(sessionOrderId) && state.activeOrderIds.includes(sessionOrderId);
  const addMoreMode = getAddMoreMode();

  if (!hasSessionActiveOrder) {
    writeSessionActiveOrderId('');
  }

  if (hasSessionActiveOrder && !addMoreMode) {
    const sessionOrderEntry = state.recentOrders.find(entry => entry.id === sessionOrderId);
    const trackingRef = String(sessionOrderEntry?.trackingRef || sessionOrderId || '').trim();
    window.location.replace(`/track?ref=${encodeURIComponent(trackingRef)}`);
    return true;
  }

  const banner = document.getElementById('activeOrderBanner');
  if (banner) {
    banner.hidden = !(hasSessionActiveOrder && addMoreMode);
  }

  if (addMoreMode && hasSessionActiveOrder) {
    const nameInput = document.getElementById('customerName');
    const phoneInput = document.getElementById('customerPhone');
    if (nameInput && state.customerName) {
      nameInput.value = state.customerName;
    }
    if (phoneInput && state.customerPhone) {
      phoneInput.value = state.customerPhone;
    }
  } else if (addMoreMode && !hasSessionActiveOrder) {
    const nextUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  }

  return false;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
  });

  if (await handleActiveOrderRouting()) {
    return;
  }

  try {
    const res = await fetch('/api/menu');
    dynamicMenu = await res.json();
  } catch (err) {
    console.error('Failed to load menu data');
  }

  hydrateCartFromStorage();
  renderMenu('all');
  setupFilters();
  setupCheckout();
  renderCart();
});

// Render menu items
function renderMenu(category) {
  const grid = document.getElementById('orderMenuGrid');
  const filtered = category === 'all' ? dynamicMenu : dynamicMenu.filter(i => i.category === category);

  grid.innerHTML = filtered.map(item => `
    <div class="order-item-card ${item.isSoldOut ? 'item-sold-out' : ''}" data-category="${item.category}">
      <div class="order-item-image" style="position:relative;">
        ${item.isSoldOut ? '<div class="sold-out-overlay">SOLD OUT</div>' : ''}
        <img src="${item.image}" alt="${item.name}" loading="lazy">
      </div>
      <div class="order-item-info">
        <h4>${item.name}</h4>
        <p class="item-desc">${item.desc}</p>
        <div class="order-item-bottom">
          <span class="item-price">₹${item.price}</span>
          <button class="add-to-cart-btn" onclick="addToCart(${item.id})" title="Add to cart" ${item.isSoldOut ? 'disabled' : ''}>
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// Filters
function setupFilters() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMenu(btn.dataset.category);
    });
  });
}

// Add to cart
function addToCart(id) {
  const item = dynamicMenu.find(i => i.id === id);
  const existing = cart.find(c => c.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...item, qty: 1 });
  }
  renderCart();
  const sidebar = document.getElementById('cartSidebar');
  if (sidebar) {
    sidebar.classList.remove('bump');
    void sidebar.offsetWidth; // trigger DOM reflow to restart animation
    sidebar.classList.add('bump');
  }
  showToast(`${item.name} added to cart!`, 'success');
}

// Update quantity
function updateQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(c => c.id !== id);
  }
  renderCart();
}

// Render cart
function renderCart() {
  const container = document.getElementById('cartItems');
  const summary = document.getElementById('cartSummary');
  const countEl = document.getElementById('cartCount');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');

  const totalItems = cart.reduce((sum, c) => sum + c.qty, 0);
  const totalPrice = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  countEl.textContent = totalItems;

  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Your cart is empty</p></div>`;
    summary.style.display = 'none';
    checkoutBtn.disabled = true;
    renderMobileCartBar(totalItems, totalPrice);
    renderCheckoutSummary(totalItems, totalPrice);
    return;
  }

  summary.style.display = 'block';
  totalEl.textContent = `₹${totalPrice}`;
  checkoutBtn.disabled = false;

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-image"><img src="${item.image}" alt="${item.name}"></div>
      <div class="cart-item-details">
        <h5>${item.name}</h5>
        <span class="cart-item-price">₹${item.price * item.qty}</span>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
        <span class="qty-number">${item.qty}</span>
        <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
      </div>
    </div>
  `).join('');

  renderMobileCartBar(totalItems, totalPrice);
  renderCheckoutSummary(totalItems, totalPrice);
  writeStoredCart();
}

function renderMobileCartBar(totalItems, totalPrice) {
  const mobileBar = document.getElementById('mobileCartBar');
  const countEl = document.getElementById('mcbCount');
  const totalEl = document.getElementById('mcbTotal');

  if (!mobileBar || !countEl || !totalEl) return;

  const itemLabel = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
  countEl.textContent = itemLabel;
  totalEl.textContent = `₹${totalPrice}`;
  mobileBar.hidden = totalItems === 0;
}

function getSelectedOrderType() {
  return document.querySelector('input[name="orderType"]:checked')?.value || 'dine-in';
}

function renderCheckoutMeta(totalItems) {
  const itemsEl = document.getElementById('checkoutStatItems');
  const modeEl = document.getElementById('checkoutStatMode');
  const paymentEl = document.getElementById('checkoutStatPayment');
  const actionNoteEl = document.getElementById('checkoutActionNote');
  const orderType = getSelectedOrderType();

  if (itemsEl) {
    itemsEl.textContent = String(totalItems);
  }

  if (modeEl) {
    modeEl.textContent = orderType === 'takeaway' ? 'Takeaway' : 'Dine In';
  }

  if (paymentEl) {
    paymentEl.textContent = orderType === 'takeaway' ? 'At Pickup' : 'At Table';
  }

  if (actionNoteEl) {
    actionNoteEl.textContent = orderType === 'takeaway'
      ? 'Payment is collected when you pick up the order.'
      : 'Payment is collected at the cafe after the order is served.';
  }
}

function renderCheckoutSummary(totalItems, totalPrice) {
  const summaryEl = document.getElementById('checkoutSummary');
  const submitBtn = document.querySelector('#orderForm button[type="submit"]');
  const actionTotalEl = document.getElementById('checkoutActionTotal');

  if (!summaryEl || !submitBtn || !actionTotalEl) return;

  renderCheckoutMeta(totalItems);

  if (cart.length === 0) {
    actionTotalEl.textContent = '₹0';
    summaryEl.innerHTML = `
      <div class="checkout-summary-empty">
        <i class="fas fa-bag-shopping"></i>
        <p>Your cart is empty. Add a few late-night favorites to continue.</p>
      </div>
    `;
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = false;
  actionTotalEl.textContent = `₹${totalPrice}`;

  const reviewItemsMarkup = cart.map(item => `
    <div class="review-item">
      <div class="review-item-copy">
        <strong>${item.name}</strong>
        <span>₹${item.price} each</span>
      </div>
      <div class="review-item-actions">
        <div class="review-qty">
          <button type="button" class="qty-btn" onclick="updateQty(${item.id}, -1)" aria-label="Decrease ${item.name} quantity">−</button>
          <span class="qty-number">${item.qty}</span>
          <button type="button" class="qty-btn" onclick="updateQty(${item.id}, 1)" aria-label="Increase ${item.name} quantity">+</button>
        </div>
        <span class="review-line-total">₹${item.price * item.qty}</span>
      </div>
    </div>
  `).join('');

  const useCompactMobileSummary = window.matchMedia('(max-width: 768px)').matches;
  const summaryItemsMarkup = useCompactMobileSummary
    ? `
      <details class="checkout-summary-disclosure">
        <summary class="checkout-summary-toggle">
          <span class="checkout-summary-toggle-copy">Review order items</span>
          <span class="checkout-summary-toggle-meta">
            <strong>${totalItems} ${totalItems === 1 ? 'item' : 'items'}</strong>
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </span>
        </summary>
        <div class="checkout-summary-items">
          ${reviewItemsMarkup}
        </div>
      </details>
    `
    : `
      <div class="checkout-summary-items">
        ${reviewItemsMarkup}
      </div>
    `;

  summaryEl.innerHTML = `
    <div class="checkout-summary-head">
      <div>
        <span class="checkout-summary-label">Order Overview</span>
        <h4>${totalItems} ${totalItems === 1 ? 'item' : 'items'} selected</h4>
      </div>
      <button type="button" class="btn-ghost review-clear-btn" onclick="clearCart()" aria-label="Clear cart">
        Clear cart
      </button>
    </div>
    ${summaryItemsMarkup}
    <div class="review-total">
      <span>Total</span>
      <span>₹${totalPrice}</span>
    </div>
  `;
}

function clearCart() {
  cart = [];
  renderCart();
}

// Clear cart
document.getElementById('clearCartBtn').addEventListener('click', clearCart);

// Checkout
function setupCheckout() {
  const modal = document.getElementById('checkoutModal');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const mobileCheckoutBtn = document.getElementById('mobileCartBar');
  const cancelBtn = document.getElementById('cancelCheckout');
  const closeBtn = document.getElementById('checkoutClose');
  const form = document.getElementById('orderForm');
  const confirmBtn = document.getElementById('confirmCheckoutBtn');
  const orderTypeInputs = document.querySelectorAll('input[name="orderType"]');
  let isSubmitting = false;

  const getTotals = () => ({
    items: cart.reduce((sum, c) => sum + c.qty, 0),
    total: cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  });

  const isMobileCheckoutView = () => window.matchMedia('(max-width: 768px)').matches;

  const scrollCheckoutIntoView = () => {
    const layout = modal.querySelector('.checkout-layout');
    if (!layout) return;

    if (isMobileCheckoutView()) {
      const formTop = Number(form?.offsetTop || 0);
      layout.scrollTo({ top: Math.max(formTop - 8, 0), left: 0, behavior: 'auto' });
      return;
    }

    layout.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    const totals = getTotals();
    renderCheckoutSummary(totals.items, totals.total);
    modal.classList.add('active');
    document.body.classList.add('checkout-open');
    requestAnimationFrame(scrollCheckoutIntoView);

    if (!isMobileCheckoutView()) {
      const firstEmptyField = form.querySelector('input:invalid, textarea:invalid') || document.getElementById('customerName');
      firstEmptyField?.focus({ preventScroll: true });
    }
  };

  const closeCheckout = () => {
    modal.classList.remove('active');
    document.body.classList.remove('checkout-open');
  };

  checkoutBtn.addEventListener('click', openCheckout);

  if (mobileCheckoutBtn) {
    mobileCheckoutBtn.addEventListener('click', openCheckout);
  }

  cancelBtn.addEventListener('click', closeCheckout);
  closeBtn?.addEventListener('click', closeCheckout);

  orderTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      const totals = getTotals();
      renderCheckoutSummary(totals.items, totals.total);
    });
  });

  window.addEventListener('resize', () => {
    if (!modal.classList.contains('active')) return;
    const totals = getTotals();
    renderCheckoutSummary(totals.items, totals.total);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCheckout();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeCheckout();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (cart.length === 0 || isSubmitting) return;

    isSubmitting = true;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing Order';
    }

    const orderData = {
      customerName: document.getElementById('customerName').value,
      customerPhone: document.getElementById('customerPhone').value,
      orderType: getSelectedOrderType(),
      notes: document.getElementById('orderNotes').value,
      items: cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price })),
      total: cart.reduce((sum, c) => sum + c.price * c.qty, 0),
      placedBy: 'customer'
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (res.ok) {
        const createdOrder = await res.json();
        const trackingRef = getOrderTrackingRef(createdOrder) || createdOrder.id;
        rememberTrackedOrder(createdOrder);
        sessionStorage.setItem('trackingFlashMessage', `Order placed. Tracking ref: ${trackingRef}`);
        cart = [];
        renderCart();
        closeCheckout();
        form.reset();
        window.location.href = `/track?ref=${encodeURIComponent(trackingRef)}`;
      } else {
        showToast('Failed to place order. Please try again.', 'error');
      }
    } catch (err) {
      showToast('Connection error. Please try again.', 'error');
    } finally {
      isSubmitting = false;
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Place Order';
      }
      const totals = getTotals();
      renderCheckoutSummary(totals.items, totals.total);
    }
  });
}

// Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
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

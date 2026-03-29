// ==========================================
// FRY-DAY NIGHT LIGHTS — Order Page JS
// ==========================================

let dynamicMenu = [];

let cart = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
  });

  try {
    const res = await fetch('/api/menu');
    dynamicMenu = await res.json();
  } catch (err) {
    console.error('Failed to load menu data');
  }

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
    <div class="checkout-summary-items">
      ${cart.map(item => `
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
      `).join('')}
    </div>
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

  const openCheckout = () => {
    if (cart.length === 0) return;
    const totals = getTotals();
    renderCheckoutSummary(totals.items, totals.total);
    modal.classList.add('active');
    const firstEmptyField = form.querySelector('input:invalid, textarea:invalid') || document.getElementById('customerName');
    firstEmptyField?.focus({ preventScroll: true });
  };

  const closeCheckout = () => {
    modal.classList.remove('active');
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
      items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
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
        cart = [];
        renderCart();
        closeCheckout();
        form.reset();
        showToast(`🎉 Order ${createdOrder.id} placed successfully! We\'ll prepare it right away.`, 'success');
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

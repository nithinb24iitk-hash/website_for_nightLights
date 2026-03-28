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
  setupCartToggle();
  setupCheckout();
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

// Cart toggle (mobile)
function setupCartToggle() {
  const toggle = document.getElementById('cartToggle');
  const sidebar = document.getElementById('cartSidebar');
  if (toggle) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('expanded');
    });
  }
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
  const countMobileEl = document.getElementById('cartCountMobile');
  const totalEl = document.getElementById('cartTotal');

  const totalItems = cart.reduce((sum, c) => sum + c.qty, 0);
  const totalPrice = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  countEl.textContent = totalItems;
  if (countMobileEl) countMobileEl.textContent = totalItems;

  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Your cart is empty</p></div>`;
    summary.style.display = 'none';
    return;
  }

  summary.style.display = 'block';
  totalEl.textContent = `₹${totalPrice}`;

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
}

// Clear cart
document.getElementById('clearCartBtn').addEventListener('click', () => {
  cart = [];
  renderCart();
});

// Checkout
function setupCheckout() {
  const modal = document.getElementById('checkoutModal');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const cancelBtn = document.getElementById('cancelCheckout');
  const form = document.getElementById('orderForm');

  checkoutBtn.addEventListener('click', () => {
    if (cart.length === 0) return;
    modal.classList.add('active');
  });

  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const orderData = {
      customerName: document.getElementById('customerName').value,
      customerPhone: document.getElementById('customerPhone').value,
      orderType: document.getElementById('orderType').value,
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
        cart = [];
        renderCart();
        modal.classList.remove('active');
        form.reset();
        showToast('🎉 Order placed successfully! We\'ll prepare it right away.', 'success');
      } else {
        showToast('Failed to place order. Please try again.', 'error');
      }
    } catch (err) {
      showToast('Connection error. Please try again.', 'error');
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

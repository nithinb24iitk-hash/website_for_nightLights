// ==========================================
// FRY-DAY NIGHT LIGHTS — Order Page JS
// ==========================================

const MENU_ITEMS = [
  // Burgers
  { id: 1, name: 'Classic Smash Burger', category: 'burgers', price: 149, desc: 'Juicy smashed patty with melted cheese, lettuce, tomato & our secret sauce', image: 'images/burger.png' },
  { id: 2, name: 'Double Trouble Burger', category: 'burgers', price: 199, desc: 'Double patty loaded with cheese, caramelized onions & crispy bacon', image: 'images/burger.png' },
  { id: 3, name: 'Spicy Chicken Burger', category: 'burgers', price: 179, desc: 'Crispy fried chicken with spicy mayo, pickles & fresh vegetables', image: 'images/burger.png' },
  { id: 4, name: 'Veggie Crunch Burger', category: 'burgers', price: 129, desc: 'Crispy vegetable patty with fresh lettuce, tomato & mint chutney', image: 'images/burger.png' },

  // Fries
  { id: 5, name: 'Classic Salted Fries', category: 'fries', price: 89, desc: 'Golden crispy fries with the perfect amount of seasoning', image: 'images/fries.png' },
  { id: 6, name: 'Loaded Cheese Fries', category: 'fries', price: 149, desc: 'Fries smothered in nacho cheese sauce with jalapeños & herbs', image: 'images/fries.png' },
  { id: 7, name: 'Peri Peri Fries', category: 'fries', price: 109, desc: 'Spicy peri peri seasoned fries that pack a punch', image: 'images/fries.png' },
  { id: 8, name: 'Masala Magic Fries', category: 'fries', price: 119, desc: 'Indian spiced fries with chaat masala, onions & coriander', image: 'images/fries.png' },

  // Pizza
  { id: 9, name: 'Margherita Pizza', category: 'pizza', price: 199, desc: 'Classic tomato sauce, fresh mozzarella & basil leaves', image: 'images/pizza.png' },
  { id: 10, name: 'Pepperoni Feast', category: 'pizza', price: 299, desc: 'Loaded with pepperoni, mozzarella & our signature tomato sauce', image: 'images/pizza.png' },
  { id: 11, name: 'Veggie Supreme', category: 'pizza', price: 249, desc: 'Bell peppers, onions, mushrooms, olives & corn with mozzarella', image: 'images/pizza.png' },
  { id: 12, name: 'BBQ Chicken Pizza', category: 'pizza', price: 319, desc: 'Tangy BBQ sauce, grilled chicken, onions & mozzarella cheese', image: 'images/pizza.png' },

  // Milkshakes
  { id: 13, name: 'Mango Madness', category: 'milkshakes', price: 129, desc: 'Fresh Alphonso mango blended with creamy vanilla ice cream', image: 'images/milkshakes.png' },
  { id: 14, name: 'Oreo Blast', category: 'milkshakes', price: 149, desc: 'Crushed Oreos with chocolate ice cream & whipped cream', image: 'images/milkshakes.png' },
  { id: 15, name: 'Strawberry Dream', category: 'milkshakes', price: 139, desc: 'Sweet strawberries blended with vanilla ice cream & milk', image: 'images/milkshakes.png' },
  { id: 16, name: 'Chocolate Overload', category: 'milkshakes', price: 159, desc: 'Rich chocolate with brownie chunks & chocolate sauce drizzle', image: 'images/milkshakes.png' },

  // Desserts
  { id: 17, name: 'Classic Vanilla Scoop', category: 'desserts', price: 79, desc: 'Creamy vanilla bean ice cream in a waffle cone', image: 'images/desserts.png' },
  { id: 18, name: 'Chocolate Fudge Sundae', category: 'desserts', price: 149, desc: 'Chocolate ice cream with hot fudge, nuts & whipped cream', image: 'images/desserts.png' },
  { id: 19, name: 'Brownie with Ice Cream', category: 'desserts', price: 169, desc: 'Warm chocolate brownie topped with vanilla ice cream & sauce', image: 'images/desserts.png' },
  { id: 20, name: 'Mango Ice Cream Cup', category: 'desserts', price: 99, desc: 'Two scoops of fresh mango ice cream with mango chunks', image: 'images/desserts.png' },
];

let cart = [];

document.addEventListener('DOMContentLoaded', () => {
  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
  });

  renderMenu('all');
  setupFilters();
  setupCartToggle();
  setupCheckout();
});

// Render menu items
function renderMenu(category) {
  const grid = document.getElementById('orderMenuGrid');
  const filtered = category === 'all' ? MENU_ITEMS : MENU_ITEMS.filter(i => i.category === category);

  grid.innerHTML = filtered.map(item => `
    <div class="order-item-card" data-category="${item.category}">
      <div class="order-item-image">
        <img src="${item.image}" alt="${item.name}" loading="lazy">
      </div>
      <div class="order-item-info">
        <h4>${item.name}</h4>
        <p class="item-desc">${item.desc}</p>
        <div class="order-item-bottom">
          <span class="item-price">₹${item.price}</span>
          <button class="add-to-cart-btn" onclick="addToCart(${item.id})" title="Add to cart">
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
  const item = MENU_ITEMS.find(i => i.id === id);
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

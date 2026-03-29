// ==========================================
// FRY-DAY NIGHT LIGHTS — Admin Menu Page JS
// ==========================================

const MENU_CATEGORY_MAP = {
  burgers: { label: 'Burgers', image: 'images/burger.png' },
  fries: { label: 'Fries', image: 'images/fries.png' },
  pizza: { label: 'Pizza', image: 'images/pizza.png' },
  milkshakes: { label: 'Milkshakes', image: 'images/milkshakes.png' },
  desserts: { label: 'Desserts', image: 'images/desserts.png' }
};

let dynamicMenu = [];
let adminToken = sessionStorage.getItem('adminToken') || '';
let currentStatusFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  setupHamburger();
  setupLogin();
  setupMenuEditor();
  setupMenuFilters();

  if (adminToken) {
    showMenuManager();
  } else {
    showLoginOverlay();
  }
});

function setupHamburger() {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks?.classList.toggle('open');
  });
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-token': adminToken
  };
}

function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  const page = document.getElementById('menuAdminPage');
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
  page.style.display = 'none';
}

function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  const page = document.getElementById('menuAdminPage');
  overlay.classList.add('hidden');
  overlay.style.display = 'none';
  page.style.display = 'block';
}

function setupLogin() {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.style.display = 'none';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('adminPassword').value })
      });

      const data = await res.json();
      if (!res.ok || !data.token) {
        errorEl.textContent = 'Incorrect password. Please try again.';
        errorEl.style.display = 'block';
        return;
      }

      adminToken = data.token;
      sessionStorage.setItem('adminToken', adminToken);
      await showMenuManager();
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }
  });
}

async function showMenuManager() {
  hideLoginOverlay();
  await fetchMenu();
  renderMenuStats();
  renderMenuList();
  renderPreviewCard();
}

function handleUnauthorized(res) {
  if (res.status !== 401) return false;
  adminToken = '';
  sessionStorage.removeItem('adminToken');
  showLoginOverlay();
  showToast('Session expired. Please log in again.', 'error');
  return true;
}

async function fetchMenu() {
  const res = await fetch('/api/menu');
  dynamicMenu = await res.json();
}

function getCategoryMeta(category) {
  return MENU_CATEGORY_MAP[category] || { label: category || 'Menu', image: 'images/burger.png' };
}

function formatCurrency(value = 0) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function getPreviewState() {
  const category = document.getElementById('menuItemCategory').value || 'burgers';
  const categoryMeta = getCategoryMeta(category);
  const name = document.getElementById('menuItemName').value.trim() || 'New menu item';
  const desc = document.getElementById('menuItemDesc').value.trim() || 'Description will appear here as you type.';
  const price = document.getElementById('menuItemPrice').value;
  const image = document.getElementById('menuItemImage').value.trim() || categoryMeta.image;
  const isSoldOut = document.getElementById('menuItemSoldOut').checked;

  return {
    category,
    categoryLabel: categoryMeta.label,
    name,
    desc,
    price: Number(price) || 0,
    image,
    isSoldOut
  };
}

function renderPreviewCard() {
  const preview = getPreviewState();
  document.getElementById('menuPreviewImage').src = preview.image;
  document.getElementById('menuPreviewImage').alt = preview.name;
  document.getElementById('menuPreviewCategory').textContent = preview.categoryLabel;
  document.getElementById('menuPreviewName').textContent = preview.name;
  document.getElementById('menuPreviewDesc').textContent = preview.desc;
  document.getElementById('menuPreviewPrice').textContent = formatCurrency(preview.price);
  document.getElementById('menuPreviewStatus').hidden = !preview.isSoldOut;
}

function updateEditorMode() {
  const editingId = document.getElementById('editingMenuId').value;
  const isEditing = Boolean(editingId);
  document.getElementById('menuEditorTitle').textContent = isEditing ? 'Edit Menu Item' : 'Add New Item';
  document.getElementById('menuEditorCopy').textContent = isEditing
    ? 'Update this item, then save the changes back to the live menu.'
    : 'Use this panel to create a new item and preview how it will look.';
  document.getElementById('saveMenuItemBtn').innerHTML = isEditing
    ? '<i class="fas fa-floppy-disk"></i> Save Changes'
    : '<i class="fas fa-plus"></i> Add Item';
  document.getElementById('cancelMenuEditBtn').style.display = isEditing ? 'inline-flex' : 'none';
}

function resetMenuEditor() {
  document.getElementById('menuItemForm').reset();
  document.getElementById('editingMenuId').value = '';
  document.getElementById('menuItemCategory').value = 'burgers';
  updateEditorMode();
  renderPreviewCard();
}

function populateEditor(item) {
  document.getElementById('editingMenuId').value = String(item.id);
  document.getElementById('menuItemName').value = item.name || '';
  document.getElementById('menuItemCategory').value = item.category || 'burgers';
  document.getElementById('menuItemPrice').value = item.price || '';
  document.getElementById('menuItemImage').value = item.image || '';
  document.getElementById('menuItemDesc').value = item.desc || '';
  document.getElementById('menuItemSoldOut').checked = Boolean(item.isSoldOut);
  updateEditorMode();
  renderPreviewCard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupMenuEditor() {
  const form = document.getElementById('menuItemForm');
  const refreshBtn = document.getElementById('menuRefreshBtn');
  const newItemBtn = document.getElementById('newMenuItemBtn');
  const resetBtn = document.getElementById('resetMenuEditorBtn');
  const cancelBtn = document.getElementById('cancelMenuEditBtn');
  const cardGrid = document.getElementById('menuManagerGrid');

  ['menuItemName', 'menuItemCategory', 'menuItemPrice', 'menuItemImage', 'menuItemDesc', 'menuItemSoldOut'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderPreviewCard);
    document.getElementById(id)?.addEventListener('change', renderPreviewCard);
  });

  form?.addEventListener('submit', submitMenuItemForm);
  refreshBtn?.addEventListener('click', async () => {
    await fetchMenu();
    renderMenuStats();
    renderMenuList();
    showToast('Menu refreshed', 'success');
  });
  newItemBtn?.addEventListener('click', resetMenuEditor);
  resetBtn?.addEventListener('click', resetMenuEditor);
  cancelBtn?.addEventListener('click', resetMenuEditor);

  cardGrid?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const itemId = Number(button.dataset.id);
    const item = dynamicMenu.find(entry => entry.id === itemId);
    if (!item) return;

    if (button.dataset.action === 'edit') {
      populateEditor(item);
      return;
    }

    if (button.dataset.action === 'soldout') {
      await toggleSoldOut(item.id, item.isSoldOut);
      return;
    }

    if (button.dataset.action === 'delete') {
      await deleteMenuItem(item.id, item.name);
    }
  });

  updateEditorMode();
}

async function submitMenuItemForm(event) {
  event.preventDefault();

  const editingId = document.getElementById('editingMenuId').value;
  const payload = {
    name: document.getElementById('menuItemName').value.trim(),
    category: document.getElementById('menuItemCategory').value,
    price: Number(document.getElementById('menuItemPrice').value),
    image: document.getElementById('menuItemImage').value.trim(),
    desc: document.getElementById('menuItemDesc').value.trim(),
    isSoldOut: document.getElementById('menuItemSoldOut').checked
  };

  if (!payload.name || !payload.category || !payload.price) {
    showToast('Name, category, and price are required.', 'error');
    return;
  }

  const submitBtn = document.getElementById('saveMenuItemBtn');
  submitBtn.disabled = true;

  try {
    const res = await fetch(editingId ? `/api/menu/${editingId}` : '/api/menu', {
      method: editingId ? 'PATCH' : 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    if (handleUnauthorized(res)) return;

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      showToast(error.error || 'Failed to save menu item', 'error');
      return;
    }

    await fetchMenu();
    renderMenuStats();
    renderMenuList();
    resetMenuEditor();
    showToast(editingId ? 'Menu item updated' : 'Menu item added', 'success');
  } catch (err) {
    showToast('Failed to save menu item', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function toggleSoldOut(id, isSoldOut) {
  try {
    const res = await fetch(`/api/menu/${id}/soldout`, {
      method: 'PATCH',
      headers: { 'x-admin-token': adminToken }
    });

    if (handleUnauthorized(res)) return;

    if (!res.ok) {
      showToast('Failed to update status', 'error');
      return;
    }

    await fetchMenu();
    renderMenuStats();
    renderMenuList();

    if (document.getElementById('editingMenuId').value === String(id)) {
      const refreshedItem = dynamicMenu.find(item => item.id === id);
      if (refreshedItem) {
        populateEditor(refreshedItem);
      }
    }

    showToast(isSoldOut ? 'Item marked available' : 'Item marked sold out', 'success');
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

async function deleteMenuItem(id, name) {
  if (!confirm(`Delete "${name}" permanently?`)) return;

  try {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': adminToken }
    });

    if (handleUnauthorized(res)) return;

    if (!res.ok) {
      showToast('Failed to delete item', 'error');
      return;
    }

    await fetchMenu();
    renderMenuStats();
    renderMenuList();

    if (document.getElementById('editingMenuId').value === String(id)) {
      resetMenuEditor();
    }

    showToast('Menu item deleted', 'success');
  } catch (err) {
    showToast('Failed to delete item', 'error');
  }
}

function setupMenuFilters() {
  const searchInput = document.getElementById('menuSearchInput');
  const categoryFilter = document.getElementById('menuCategoryFilter');
  const statusButtons = document.querySelectorAll('#menuStatusFilters .status-filter-btn');

  searchInput?.addEventListener('input', renderMenuList);
  categoryFilter?.addEventListener('change', renderMenuList);

  statusButtons.forEach(button => {
    button.addEventListener('click', () => {
      statusButtons.forEach(entry => entry.classList.remove('active'));
      button.classList.add('active');
      currentStatusFilter = button.dataset.status;
      renderMenuList();
    });
  });
}

function renderMenuStats() {
  const total = dynamicMenu.length;
  const soldOut = dynamicMenu.filter(item => item.isSoldOut).length;
  const live = total - soldOut;
  const categories = new Set(dynamicMenu.map(item => item.category).filter(Boolean)).size;

  document.getElementById('menuStatTotal').textContent = total;
  document.getElementById('menuStatLive').textContent = live;
  document.getElementById('menuStatSoldOut').textContent = soldOut;
  document.getElementById('menuStatCategories').textContent = categories;
}

function getFilteredMenu() {
  const query = document.getElementById('menuSearchInput').value.trim().toLowerCase();
  const category = document.getElementById('menuCategoryFilter').value;

  return dynamicMenu.filter(item => {
    const matchesStatus = currentStatusFilter === 'all'
      || (currentStatusFilter === 'soldout' && item.isSoldOut)
      || (currentStatusFilter === 'live' && !item.isSoldOut);
    const matchesCategory = category === 'all' || item.category === category;
    const haystack = `${item.name} ${item.desc} ${item.category}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesStatus && matchesCategory && matchesQuery;
  });
}

function renderMenuList() {
  const grid = document.getElementById('menuManagerGrid');
  const filtered = getFilteredMenu();

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="menu-manager-empty">
        <i class="fas fa-filter-circle-xmark"></i>
        <p>No menu items match the current filters.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const categoryMeta = getCategoryMeta(item.category);
    return `
      <article class="menu-item-admin-card ${item.isSoldOut ? 'soldout' : ''}">
        <div class="menu-item-admin-media">
          <img src="${item.image || categoryMeta.image}" alt="${item.name}" loading="lazy">
          <span class="menu-item-admin-category">${categoryMeta.label}</span>
        </div>
        <div class="menu-item-admin-body">
          <div class="menu-item-admin-head">
            <div>
              <h4>${item.name}</h4>
              <p>${item.desc || 'No description yet.'}</p>
            </div>
            <span class="menu-item-admin-price">${formatCurrency(item.price)}</span>
          </div>
          <div class="menu-item-admin-footer">
            <span class="menu-item-status ${item.isSoldOut ? 'soldout' : 'live'}">
              <i class="fas ${item.isSoldOut ? 'fa-ban' : 'fa-circle-check'}"></i>
              ${item.isSoldOut ? 'Sold Out' : 'Available'}
            </span>
            <div class="menu-item-admin-actions">
              <button type="button" class="order-action-btn" data-action="edit" data-id="${item.id}">
                <i class="fas fa-pen"></i> Edit
              </button>
              <button type="button" class="order-action-btn ${item.isSoldOut ? 'accept' : 'pay'}" data-action="soldout" data-id="${item.id}">
                <i class="fas ${item.isSoldOut ? 'fa-eye' : 'fa-ban'}"></i> ${item.isSoldOut ? 'Make Live' : 'Sold Out'}
              </button>
              <button type="button" class="order-action-btn danger" data-action="delete" data-id="${item.id}">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

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

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const escapeHtml = require('escape-html');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fryday@admin2026';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'fryday-admin-token-secret';

// Security Middleware
app.use(helmet()); 
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit payload size to prevent DOS

// Rate Limiting (100 reqs per 15 min per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, 
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

app.use(express.static('public'));

// Ensure orders file exists
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
}

function readOrders() {
  const data = fs.readFileSync(ORDERS_FILE, 'utf8');
  return JSON.parse(data);
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Auth middleware for admin routes
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET all orders (admin only)
app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = readOrders();
  res.json(orders);
});

// POST new order
app.post('/api/orders', (req, res) => {
  const orders = readOrders();
  
  // Basic input validation/sanitization to prevent XSS
  const customerName = escapeHtml(req.body.customerName || 'Unknown');
  const customerPhone = escapeHtml(req.body.customerPhone || 'N/A');
  const orderType = escapeHtml(req.body.orderType || 'dine-in');
  const notes = escapeHtml(req.body.notes || '');

  const newOrder = {
    id: Date.now().toString(),
    ...req.body, // safe because it's only read by our controlled JS
    customerName,
    customerPhone,
    orderType,
    notes,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  // Cap items array size
  if (newOrder.items && newOrder.items.length > 50) {
     return res.status(400).json({ error: 'Too many items in order' });
  }

  orders.unshift(newOrder);
  writeOrders(orders);
  res.status(201).json(newOrder);
});

// PATCH update order status (admin only)
app.patch('/api/orders/:id/status', requireAdmin, (req, res) => {
  const orders = readOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = req.body.status;
  writeOrders(orders);
  res.json(order);
});

// DELETE an order (admin only)
app.delete('/api/orders/:id', requireAdmin, (req, res) => {
  let orders = readOrders();
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  orders.splice(idx, 1);
  writeOrders(orders);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🔥 Fry-Day Night Lights server running at http://localhost:${PORT}`);
});

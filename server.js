require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const escapeHtml = require('escape-html');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fryday@admin2026';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'fryday-admin-token-secret';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fryday';

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Database Model
const orderSchema = new mongoose.Schema({
  id: String,
  customerName: String,
  customerPhone: String,
  orderType: String,
  notes: String,
  status: { type: String, default: 'pending' },
  items: Array,
  total: Number,
  placedBy: String,
  createdAt: String
});
const Order = mongoose.model('Order', orderSchema);

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

// GET all orders (admin only)
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Database error fetching orders' });
  }
});

// POST new order
app.post('/api/orders', async (req, res) => {
  // Basic input validation/sanitization to prevent XSS
  const customerName = escapeHtml(req.body.customerName || 'Unknown');
  const customerPhone = escapeHtml(req.body.customerPhone || 'N/A');
  const orderType = escapeHtml(req.body.orderType || 'dine-in');
  const notes = escapeHtml(req.body.notes || '');

  const newOrder = new Order({
    id: Date.now().toString(),
    ...req.body, // safe because it's only read by our controlled JS
    customerName,
    customerPhone,
    orderType,
    notes,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  
  // Cap items array size
  if (newOrder.items && newOrder.items.length > 50) {
     return res.status(400).json({ error: 'Too many items in order' });
  }

  try {
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save order to database' });
  }
});

// PATCH update order status (admin only)
app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { status: req.body.status },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// DELETE an order (admin only)
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const result = await Order.findOneAndDelete({ id: req.params.id });
    if (!result) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Fry-Day Night Lights server running at http://localhost:${PORT}`);
});

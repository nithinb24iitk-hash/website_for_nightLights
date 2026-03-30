require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const escapeHtml = require('escape-html');
const crypto = require('crypto');
const fs = require('fs');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fryday@admin2026';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'fryday-admin-token-secret';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fryday';
const MENU_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'menu');
const MENU_UPLOAD_DIR_RESOLVED = path.resolve(MENU_UPLOAD_DIR);
const MENU_DEFAULT_IMAGES = Object.freeze({
  burgers: 'images/burger.png',
  fries: 'images/fries.png',
  pizza: 'images/pizza.png',
  milkshakes: 'images/milkshakes.png',
  desserts: 'images/desserts.png'
});
const VALID_ORDER_TYPES = new Set(['dine-in', 'takeaway']);
const MAX_ORDER_ITEMS = 30;
const MAX_ITEM_QTY = 20;
const MAX_CUSTOMER_NAME_LENGTH = 60;
const MAX_CUSTOMER_PHONE_LENGTH = 20;
const MAX_ORDER_NOTES_LENGTH = 300;

fs.mkdirSync(MENU_UPLOAD_DIR, { recursive: true });

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Order Model
const orderSchema = new mongoose.Schema({
  id: String,
  trackingToken: { type: String, unique: true, sparse: true },
  customerName: String,
  customerPhone: String,
  customerPhoneLookup: String,
  orderType: String,
  notes: String,
  status: { type: String, default: 'pending' },
  items: Array,
  total: Number,
  placedBy: String,
  createdAt: String,
  isPaid: { type: Boolean, default: false },
  paidAt: String
});
const Order = mongoose.model('Order', orderSchema);

// Counter Model
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

// Menu Item Model
const menuItemSchema = new mongoose.Schema({
  id: Number,
  name: String,
  category: String,
  price: Number,
  desc: String,
  image: String,
  isSoldOut: { type: Boolean, default: false }
});
const MenuItem = mongoose.model('MenuItem', menuItemSchema);

const menuUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, MENU_UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      const safeExtension = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension) ? extension : '.jpg';
      callback(null, `menu-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`);
    }
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      callback(null, true);
      return;
    }

    callback(new Error('INVALID_IMAGE_TYPE'));
  }
});

function handleMenuUpload(req, res, next) {
  menuUpload.single('imageFile')(req, res, err => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Image size must stay under 3MB' });
      return;
    }

    if (err.message === 'INVALID_IMAGE_TYPE') {
      res.status(400).json({ error: 'Only image files are allowed' });
      return;
    }

    res.status(400).json({ error: 'Failed to process image upload' });
  });
}

function getOrderDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value || '0000';
  const month = parts.find(part => part.type === 'month')?.value || '00';
  const day = parts.find(part => part.type === 'day')?.value || '00';

  return `${year}${month}${day}`;
}

async function generateOrderId(now = new Date()) {
  const dateKey = getOrderDateKey(now);
  const counter = await Counter.findOneAndUpdate(
    { key: `order:${dateKey}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  return `FDNL-${dateKey}-${String(counter.seq).padStart(3, '0')}`;
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '').slice(-15);
}

function normalizePhoneLookupKey(value = '') {
  const digits = normalizePhone(value);
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function sanitizeInlineText(value = '', maxLength = 120) {
  return escapeHtml(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, maxLength);
}

function normalizeOrderType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_ORDER_TYPES.has(normalized) ? normalized : 'dine-in';
}

async function validateAndPriceOrderItems(rawItems = []) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    return { error: 'Add at least one menu item to continue' };
  }

  if (rawItems.length > MAX_ORDER_ITEMS) {
    return { error: 'Too many items in order' };
  }

  const qtyById = new Map();
  for (const entry of rawItems) {
    const itemId = Number(entry?.id);
    const qty = Number(entry?.qty);

    if (!Number.isInteger(itemId) || !Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY) {
      return { error: 'Provide valid item quantities' };
    }

    const nextQty = (qtyById.get(itemId) || 0) + qty;
    if (nextQty > MAX_ITEM_QTY) {
      return { error: 'Quantity is too high for one menu item' };
    }
    qtyById.set(itemId, nextQty);
  }

  const ids = [...qtyById.keys()];
  const menuItems = await MenuItem.find({ id: { $in: ids } }).select({ id: 1, name: 1, price: 1, isSoldOut: 1 });
  const menuById = new Map(menuItems.map(item => [Number(item.id), item]));

  if (menuById.size !== ids.length) {
    return { error: 'Some menu items were not found. Refresh and try again.' };
  }

  let total = 0;
  const pricedItems = [];

  for (const itemId of ids) {
    const menuItem = menuById.get(itemId);
    if (!menuItem || menuItem.isSoldOut) {
      return { error: 'Some selected items are sold out right now' };
    }

    const qty = qtyById.get(itemId) || 0;
    const unitPrice = Math.round(Number(menuItem.price) || 0);
    if (qty <= 0 || unitPrice <= 0) {
      return { error: 'Invalid menu pricing detected. Please refresh and try again.' };
    }

    total += unitPrice * qty;
    pricedItems.push({
      id: menuItem.id,
      name: menuItem.name,
      qty,
      price: unitPrice
    });
  }

  if (total <= 0) {
    return { error: 'Order total must be greater than zero' };
  }

  return { items: pricedItems, total };
}

async function generateTrackingToken() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = crypto.randomBytes(8).toString('hex').toUpperCase();
    const exists = await Order.exists({ trackingToken: candidate });
    if (!exists) return candidate;
  }

  throw new Error('Unable to generate tracking token');
}

function normalizeOrderId(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^FDNL-\d{8}-\d{3,6}$/.test(normalized) ? normalized : '';
}

function normalizeTrackingRef(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{10,24}$/.test(normalized) ? normalized : '';
}

function normalizeMenuCategory(value = '') {
  const category = String(value || '').trim().toLowerCase();
  return MENU_DEFAULT_IMAGES[category] ? category : 'burgers';
}

function getDefaultMenuImage(category = 'burgers') {
  return MENU_DEFAULT_IMAGES[normalizeMenuCategory(category)] || MENU_DEFAULT_IMAGES.burgers;
}

function parseBoolean(value) {
  return String(value).toLowerCase() === 'true';
}

function removeUploadedMenuFile(file) {
  if (!file?.path) return;

  fs.unlink(file.path, () => {});
}

function isUploadedMenuImage(image = '') {
  return /^\/?uploads\/menu\/[^/]+$/i.test(String(image || ''));
}

function removeUploadedMenuImageByPath(image = '') {
  if (!isUploadedMenuImage(image)) return;

  const normalized = String(image).replace(/^\/+/, '');
  const filePath = path.resolve(__dirname, 'public', normalized);
  if (!filePath.startsWith(MENU_UPLOAD_DIR_RESOLVED)) return;

  fs.unlink(filePath, () => {});
}

function serializePublicOrder(order) {
  const trackingRef = normalizeTrackingRef(order.trackingToken) || order.id;
  return {
    id: order.id,
    trackingRef,
    orderType: order.orderType,
    status: order.status,
    items: order.items || [],
    total: Number(order.total) || 0,
    createdAt: order.createdAt,
    isPaid: Boolean(order.isPaid),
    paidAt: order.paidAt || ''
  };
}

// Seed Default Menu if Empty
async function seedMenu() {
  const count = await MenuItem.countDocuments();
  if (count === 0) {
    console.log('🌱 Seeding initial menu into MongoDB...');
    const defaultMenu = [
      { id: 1, name: 'Classic Smash Burger', category: 'burgers', price: 149, desc: 'Juicy smashed patty with melted cheese, lettuce, tomato & our secret sauce', image: 'images/burger.png' },
      { id: 2, name: 'Double Trouble Burger', category: 'burgers', price: 199, desc: 'Double patty loaded with cheese, caramelized onions & crispy bacon', image: 'images/burger.png' },
      { id: 3, name: 'Spicy Chicken Burger', category: 'burgers', price: 179, desc: 'Crispy fried chicken with spicy mayo, pickles & fresh vegetables', image: 'images/burger.png' },
      { id: 4, name: 'Veggie Crunch Burger', category: 'burgers', price: 129, desc: 'Crispy vegetable patty with fresh lettuce, tomato & mint chutney', image: 'images/burger.png' },
      { id: 5, name: 'Classic Salted Fries', category: 'fries', price: 89, desc: 'Golden crispy fries with the perfect amount of seasoning', image: 'images/fries.png' },
      { id: 6, name: 'Loaded Cheese Fries', category: 'fries', price: 149, desc: 'Fries smothered in nacho cheese sauce with jalapeños & herbs', image: 'images/fries.png' },
      { id: 7, name: 'Peri Peri Fries', category: 'fries', price: 109, desc: 'Spicy peri peri seasoned fries that pack a punch', image: 'images/fries.png' },
      { id: 8, name: 'Masala Magic Fries', category: 'fries', price: 119, desc: 'Indian spiced fries with chaat masala, onions & coriander', image: 'images/fries.png' },
      { id: 9, name: 'Margherita Pizza', category: 'pizza', price: 199, desc: 'Classic tomato sauce, fresh mozzarella & basil leaves', image: 'images/pizza.png' },
      { id: 10, name: 'Pepperoni Feast', category: 'pizza', price: 299, desc: 'Loaded with pepperoni, mozzarella & our signature tomato sauce', image: 'images/pizza.png' },
      { id: 11, name: 'Veggie Supreme', category: 'pizza', price: 249, desc: 'Bell peppers, onions, mushrooms, olives & corn with mozzarella', image: 'images/pizza.png' },
      { id: 12, name: 'BBQ Chicken Pizza', category: 'pizza', price: 319, desc: 'Tangy BBQ sauce, grilled chicken, onions & mozzarella cheese', image: 'images/pizza.png' },
      { id: 13, name: 'Mango Madness', category: 'milkshakes', price: 129, desc: 'Fresh Alphonso mango blended with creamy vanilla ice cream', image: 'images/milkshakes.png' },
      { id: 14, name: 'Oreo Blast', category: 'milkshakes', price: 149, desc: 'Crushed Oreos with chocolate ice cream & whipped cream', image: 'images/milkshakes.png' },
      { id: 15, name: 'Strawberry Dream', category: 'milkshakes', price: 139, desc: 'Sweet strawberries blended with vanilla ice cream & milk', image: 'images/milkshakes.png' },
      { id: 16, name: 'Chocolate Overload', category: 'milkshakes', price: 159, desc: 'Rich chocolate with brownie chunks & chocolate sauce drizzle', image: 'images/milkshakes.png' },
      { id: 17, name: 'Classic Vanilla Scoop', category: 'desserts', price: 79, desc: 'Creamy vanilla bean ice cream in a waffle cone', image: 'images/desserts.png' },
      { id: 18, name: 'Chocolate Fudge Sundae', category: 'desserts', price: 149, desc: 'Chocolate ice cream with hot fudge, nuts & whipped cream', image: 'images/desserts.png' },
      { id: 19, name: 'Brownie with Ice Cream', category: 'desserts', price: 169, desc: 'Warm chocolate brownie topped with vanilla ice cream & sauce', image: 'images/desserts.png' },
      { id: 20, name: 'Mango Ice Cream Cup', category: 'desserts', price: 99, desc: 'Two scoops of fresh mango ice cream with mango chunks', image: 'images/desserts.png' }
    ];
    await MenuItem.insertMany(defaultMenu);
  }
}
mongoose.connection.once('open', seedMenu);

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
})); 
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit payload size to prevent DOS

// Rate Limiting (100 reqs per 15 min per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, 
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

const publicOrderLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 45,
  message: { error: 'Too many tracking lookups. Please try again shortly.' }
});

const phoneOrderLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  skip: req => !String(req.query.phone || '').trim(),
  message: { error: 'Too many phone lookups. Please try again later.' }
});

app.use(express.static('public', { extensions: ['html'] }));

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

// GET all menu items (public)
app.get('/api/menu', async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ id: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Database error fetching menu' });
  }
});

// POST new menu item (admin only)
app.post('/api/menu', requireAdmin, handleMenuUpload, async (req, res) => {
  try {
    const name = escapeHtml(String(req.body.name || '').trim());
    const category = normalizeMenuCategory(req.body.category);
    const price = Number(req.body.price);
    const desc = escapeHtml(String(req.body.desc || '').trim());
    const isSoldOut = parseBoolean(req.body.isSoldOut);

    if (!name || !Number.isFinite(price) || price <= 0) {
      removeUploadedMenuFile(req.file);
      return res.status(400).json({ error: 'Provide a valid name, category, and price' });
    }

    const highestIdItem = await MenuItem.findOne().sort({ id: -1 });
    const nextId = highestIdItem ? highestIdItem.id + 1 : 1;
    const imageSrc = req.file ? `/uploads/menu/${req.file.filename}` : getDefaultMenuImage(category);

    const newItem = new MenuItem({
      id: nextId,
      name,
      category,
      price,
      desc,
      image: imageSrc,
      isSoldOut
    });

    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    removeUploadedMenuFile(req.file);
    res.status(500).json({ error: 'Failed to add menu item' });
  }
});

// UPDATE menu item (admin only)
app.patch('/api/menu/:id', requireAdmin, handleMenuUpload, async (req, res) => {
  try {
    const item = await MenuItem.findOne({ id: Number(req.params.id) });
    if (!item) {
      removeUploadedMenuFile(req.file);
      return res.status(404).json({ error: 'Item not found' });
    }

    const name = escapeHtml(String(req.body.name || '').trim());
    const category = normalizeMenuCategory(req.body.category || item.category);
    const price = Number(req.body.price);
    const desc = escapeHtml(String(req.body.desc || '').trim());
    const retainedImage = String(req.body.currentImage || '').trim();

    if (!name || !Number.isFinite(price) || price <= 0) {
      removeUploadedMenuFile(req.file);
      return res.status(400).json({ error: 'Provide a valid name, category, and price' });
    }

    const previousImage = item.image;
    let imageSrc = item.image;

    if (req.file) {
      imageSrc = `/uploads/menu/${req.file.filename}`;
    } else if (retainedImage && retainedImage === item.image) {
      imageSrc = item.image;
    } else {
      imageSrc = getDefaultMenuImage(category);
    }

    item.name = name;
    item.category = category;
    item.price = price;
    item.desc = desc;
    item.image = imageSrc;
    item.isSoldOut = parseBoolean(req.body.isSoldOut);

    await item.save();

    if (previousImage !== imageSrc) {
      removeUploadedMenuImageByPath(previousImage);
    }

    res.json(item);
  } catch (err) {
    removeUploadedMenuFile(req.file);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// DELETE menu item (admin only)
app.delete('/api/menu/:id', requireAdmin, async (req, res) => {
  try {
    const result = await MenuItem.findOneAndDelete({ id: Number(req.params.id) });
    if (!result) return res.status(404).json({ error: 'Item not found' });

    removeUploadedMenuImageByPath(result.image);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// TOGGLE sold out status (admin only)
app.patch('/api/menu/:id/soldout', requireAdmin, async (req, res) => {
  try {
    const item = await MenuItem.findOne({ id: Number(req.params.id) });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    item.isSoldOut = !item.isSoldOut;
    await item.save();
    
    res.json({ success: true, isSoldOut: item.isSoldOut });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle status' });
  }
});

// GET public orders by ids or phone number
app.get('/api/orders/public', publicOrderLookupLimiter, phoneOrderLookupLimiter, async (req, res) => {
  try {
    const idsParam = String(req.query.ids || '').trim();
    const refsParam = String(req.query.refs || '').trim();
    const phoneDigits = normalizePhone(req.query.phone || '');
    const phoneLookupKey = normalizePhoneLookupKey(req.query.phone || '');

    if (idsParam || refsParam) {
      const ids = idsParam
        .split(',')
        .map(normalizeOrderId)
        .filter(Boolean)
        .slice(0, 8);
      const refs = refsParam
        .split(',')
        .map(normalizeTrackingRef)
        .filter(Boolean)
        .slice(0, 8);

      if (!ids.length && !refs.length) {
        return res.status(400).json({ error: 'Provide valid tracking refs or order IDs' });
      }

      const filters = [];
      if (ids.length) {
        filters.push({ id: { $in: ids } });
      }
      if (refs.length) {
        filters.push({ trackingToken: { $in: refs } });
      }

      const orders = await Order.find(filters.length === 1 ? filters[0] : { $or: filters }).sort({ createdAt: -1 });
      const orderMap = new Map();
      orders.forEach(order => {
        const payload = serializePublicOrder(order);
        orderMap.set(String(order.id), payload);
        if (order.trackingToken) {
          orderMap.set(String(order.trackingToken), payload);
        }
      });
      const requestedKeys = [...new Set([...refs, ...ids])];

      return res.json(requestedKeys.map(key => orderMap.get(key)).filter(Boolean));
    }

    if (phoneDigits && !phoneLookupKey) {
      return res.status(400).json({ error: 'Enter a valid phone number' });
    }

    if (phoneLookupKey) {

      let orders = await Order.find({ customerPhoneLookup: phoneLookupKey })
        .sort({ createdAt: -1 })
        .limit(5);

      // Backward compatibility: older orders may not have lookup key saved yet.
      if (!orders.length) {
        const fallbackCandidates = await Order.find()
          .sort({ createdAt: -1 })
          .limit(200);

        orders = fallbackCandidates
          .filter(order => normalizePhoneLookupKey(order.customerPhone) === phoneLookupKey)
          .slice(0, 5);

        const docsToBackfill = orders
          .filter(order => !order.customerPhoneLookup)
          .map(order => order._id);

        if (docsToBackfill.length) {
          Order.updateMany(
            { _id: { $in: docsToBackfill } },
            { $set: { customerPhoneLookup: phoneLookupKey } }
          ).catch(() => {});
        }
      }

      return res.json(orders.map(serializePublicOrder));
    }

    return res.status(400).json({ error: 'Provide order IDs or phone number' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tracked orders' });
  }
});

// GET a single public order by id or tracking ref
app.get('/api/orders/public/:id', publicOrderLookupLimiter, async (req, res) => {
  try {
    const lookup = String(req.params.id || '');
    const orderId = normalizeOrderId(lookup);
    const trackingRef = normalizeTrackingRef(lookup);
    if (!orderId && !trackingRef) {
      return res.status(404).json({ error: 'Unable to locate that order' });
    }

    const filters = [];
    if (trackingRef) {
      filters.push({ trackingToken: trackingRef });
    }
    if (orderId) {
      filters.push({ id: orderId });
    }

    const order = await Order.findOne(filters.length === 1 ? filters[0] : { $or: filters });
    if (!order) {
      return res.status(404).json({ error: 'Unable to locate that order' });
    }

    res.json(serializePublicOrder(order));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

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
  try {
    const requestedPlacedBy = req.body.placedBy === 'admin' ? 'admin' : 'customer';
    const hasAdminToken = req.headers['x-admin-token'] === ADMIN_TOKEN;
    if (requestedPlacedBy === 'admin' && !hasAdminToken) {
      return res.status(401).json({ error: 'Unauthorized admin order request' });
    }

    const customerName = sanitizeInlineText(req.body.customerName || '', MAX_CUSTOMER_NAME_LENGTH);
    if (customerName.length < 2) {
      return res.status(400).json({ error: 'Please enter a valid customer name' });
    }

    const rawCustomerPhone = String(req.body.customerPhone || '').trim();
    const customerPhoneDigits = normalizePhone(rawCustomerPhone);
    const customerPhoneLookup = normalizePhoneLookupKey(rawCustomerPhone);
    if (customerPhoneDigits.length < 10 || !customerPhoneLookup) {
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    const customerPhone = sanitizeInlineText(rawCustomerPhone, MAX_CUSTOMER_PHONE_LENGTH);
    const orderType = normalizeOrderType(req.body.orderType);
    const notes = sanitizeInlineText(req.body.notes || '', MAX_ORDER_NOTES_LENGTH);
    const placedBy = requestedPlacedBy === 'admin' && hasAdminToken ? 'admin' : 'customer';

    const pricedOrder = await validateAndPriceOrderItems(req.body.items);
    if (pricedOrder.error) {
      return res.status(400).json({ error: pricedOrder.error });
    }

    const { items, total } = pricedOrder;
    const now = new Date();
    const newOrder = new Order({
      id: await generateOrderId(now),
      trackingToken: await generateTrackingToken(),
      customerName,
      customerPhone,
      customerPhoneLookup,
      orderType,
      notes,
      status: 'pending',
      items,
      total,
      placedBy,
      createdAt: now.toISOString(),
      isPaid: false,
      paidAt: ''
    });

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
      { returnDocument: 'after' }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// MARK order as paid (admin only, after delivery)
app.patch('/api/orders/:id/payment', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findOne({ id: req.params.id });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'Only delivered orders can be marked paid' });
    }
    if (order.isPaid) {
      return res.json(order);
    }

    order.isPaid = true;
    order.paidAt = new Date().toISOString();
    await order.save();

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update payment status' });
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

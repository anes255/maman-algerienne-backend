const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'maman-algerienne-secret-2024';

// ─── Uploads directory ───
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

// ─── Middleware ───
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsPath));

// ─── Multer config ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const name = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, name);
  }
});

const imageFilter = (req, file, cb) => {
  if (/jpeg|jpg|png|gif|webp/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only images allowed'), false);
};

const upload = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Helper ───
const toBool = (v) => v === 'on' || v === true || v === 'true';

// ─── Mongoose Schemas ───
const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nameAr: String,
  description: { type: String, required: true },
  descriptionAr: String,
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  images: [String],
  stock: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  titleAr: String,
  content: { type: String, required: true },
  contentAr: String,
  category: { type: String, required: true },
  image: { type: String, required: true },
  contentImages: [String],
  contentBlocks: [{
    id: String,
    type: { type: String, enum: ['heading', 'paragraph', 'image', 'video'], required: true },
    content: String,
    imageUrl: String,
    videoUrl: String,
    settings: {
      headingSize: { type: String, enum: ['h2', 'h3', 'h4'], default: 'h2' },
      imageSize: { type: String, enum: ['small', 'medium', 'large', 'full'], default: 'medium' },
      videoSize: { type: String, enum: ['medium', 'large', 'full'], default: 'large' },
      alignment: { type: String, enum: ['left', 'center', 'right'], default: 'left' }
    },
    order: Number
  }],
  author: { type: String, default: 'Admin' },
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const AdSchema = new mongoose.Schema({
  title: { type: String, required: true },
  image: { type: String, required: true },
  link: String,
  position: { type: String, enum: ['hero', 'sidebar', 'banner', 'sponsor'], default: 'banner' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  shippingAddress: { street: String, city: String, state: String },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: Number
  }],
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const ThemeSchema = new mongoose.Schema({
  primaryColor: { type: String, default: '#FF69B4' },
  secondaryColor: { type: String, default: '#FFC0CB' },
  accentColor: { type: String, default: '#FFB6C1' },
  backgroundColor: { type: String, default: '#FFF5F7' },
  textColor: { type: String, default: '#333333' },
  fontFamily: { type: String, default: 'Cairo, sans-serif' },
  logoText: { type: String, default: 'Maman Algérienne' },
  logoImage: String,
  favicon: String,
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Article = mongoose.model('Article', ArticleSchema);
const Ad = mongoose.model('Ad', AdSchema);
const Order = mongoose.model('Order', OrderSchema);
const Theme = mongoose.model('Theme', ThemeSchema);

const SiteVisitSchema = new mongoose.Schema({
  date: { type: String, unique: true },
  count: { type: Number, default: 0 },
  ips: [String]
}, { timestamps: true });
const SiteVisit = mongoose.model('SiteVisit', SiteVisitSchema);

// ─── Auth Middleware ───
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No authentication token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.isAdmin) next();
  else res.status(403).json({ message: 'Admin access required' });
};

// ─── Database Connection ───
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected:', mongoose.connection.name);
    await seedDefaults();
  } catch (err) {
    console.error('❌ DB Error:', err.message);
    process.exit(1);
  }
};

const seedDefaults = async () => {
  try {
    if (!(await Theme.findOne())) {
      await new Theme().save();
      console.log('✅ Default theme created');
    }
    if (!(await User.findOne({ phoneNumber: '0661201294' }))) {
      const hash = await bcrypt.hash('anesaya', 10);
      await new User({ fullName: 'Admin', phoneNumber: '0661201294', password: hash, isAdmin: true }).save();
      console.log('✅ Admin user created');
    }
  } catch (err) {
    console.error('⚠️ Seed error:', err.message);
  }
};

connectDB();

// ═══════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, phoneNumber, password } = req.body;
    if (await User.findOne({ phoneNumber })) {
      return res.status(400).json({ message: 'رقم الهاتف مستخدم بالفعل' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await new User({ fullName, phoneNumber, password: hash }).save();
    const token = jwt.sign({ userId: user._id, phoneNumber: user.phoneNumber, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: 'تم التسجيل بنجاح',
      token,
      user: { id: user._id, fullName: user.fullName, phoneNumber: user.phoneNumber, isAdmin: false }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    const user = await User.findOne({ phoneNumber });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }
    const token = jwt.sign({ userId: user._id, phoneNumber: user.phoneNumber, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: { id: user._id, fullName: user.fullName, phoneNumber: user.phoneNumber, isAdmin: user.isAdmin }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════
//  PRODUCT ROUTES
// ═══════════════════════════════════════

app.get('/api/products', async (req, res) => {
  try {
    const q = {};
    if (req.query.category) q.category = req.query.category;
    if (req.query.featured) q.featured = true;
    res.json(await Product.find(q).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/products', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 5 }]), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.featured !== undefined) data.featured = toBool(data.featured);
    if (req.files?.image?.[0]) data.image = `/uploads/${req.files.image[0].filename}`;
    else if (!data.image) return res.status(400).json({ message: 'Image required' });
    if (req.files?.images) data.images = req.files.images.map(f => `/uploads/${f.filename}`);
    res.status(201).json(await new Product(data).save());
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.put('/api/products/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 5 }]), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.featured !== undefined) data.featured = toBool(data.featured);
    if (req.files?.image) data.image = `/uploads/${req.files.image[0].filename}`;
    if (req.files?.images) {
      const newImgs = req.files.images.map(f => `/uploads/${f.filename}`);
      data.images = data.images ? [...JSON.parse(data.images), ...newImgs] : newImgs;
    }
    res.json(await Product.findByIdAndUpdate(req.params.id, data, { new: true }));
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
  try { await Product.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════
//  ARTICLE ROUTES
// ═══════════════════════════════════════

app.get('/api/articles', async (req, res) => {
  try {
    const q = {};
    if (req.query.category) q.category = req.query.category;
    if (req.query.featured) q.featured = true;
    res.json(await Article.find(q).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/articles/:id', async (req, res) => {
  try {
    const a = await Article.findById(req.params.id);
    if (!a) return res.status(404).json({ message: 'Article not found' });
    a.views += 1;
    await a.save();
    res.json(a);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/articles', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'contentImages', maxCount: 10 }]), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.featured !== undefined) data.featured = toBool(data.featured);
    if (req.files?.image?.[0]) data.image = `/uploads/${req.files.image[0].filename}`;
    else if (!data.image) return res.status(400).json({ message: 'Thumbnail required' });
    if (req.files?.contentImages) data.contentImages = req.files.contentImages.map(f => `/uploads/${f.filename}`);
    if (data.contentBlocks) try { data.contentBlocks = JSON.parse(data.contentBlocks); } catch {}
    res.status(201).json(await new Article(data).save());
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.put('/api/articles/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'contentImages', maxCount: 10 }]), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.featured !== undefined) data.featured = toBool(data.featured);
    if (req.files?.image) data.image = `/uploads/${req.files.image[0].filename}`;
    if (req.files?.contentImages) {
      const newImgs = req.files.contentImages.map(f => `/uploads/${f.filename}`);
      data.contentImages = data.contentImages ? [...JSON.parse(data.contentImages), ...newImgs] : newImgs;
    }
    if (data.contentBlocks) try { data.contentBlocks = JSON.parse(data.contentBlocks); } catch {}
    res.json(await Article.findByIdAndUpdate(req.params.id, data, { new: true }));
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete('/api/articles/:id', async (req, res) => {
  try { await Article.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════
//  AD ROUTES
// ═══════════════════════════════════════

app.get('/api/ads', async (req, res) => {
  try {
    const q = {};
    if (req.query.position) q.position = req.query.position;
    if (req.query.active !== undefined) q.active = req.query.active === 'true';
    res.json(await Ad.find(q).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/ads', upload.single('image'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) data.image = `/uploads/${req.file.filename}`;
    if (data.active !== undefined) data.active = toBool(data.active);
    if (data.name && !data.title) { data.title = data.name; delete data.name; }
    if (!data.image) return res.status(400).json({ message: 'Image required' });
    res.status(201).json(await new Ad(data).save());
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.put('/api/ads/:id', upload.single('image'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.active !== undefined) data.active = toBool(data.active);
    if (data.name && !data.title) { data.title = data.name; delete data.name; }
    if (req.file) data.image = `/uploads/${req.file.filename}`;
    res.json(await Ad.findByIdAndUpdate(req.params.id, data, { new: true }));
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete('/api/ads/:id', async (req, res) => {
  try { await Ad.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════
//  ORDER ROUTES
// ═══════════════════════════════════════

app.get('/api/orders', async (req, res) => {
  try { res.json(await Order.find().populate('items.product').sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const o = await Order.findById(req.params.id).populate('items.product');
    if (!o) return res.status(404).json({ message: 'Order not found' });
    res.json(o);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = await new Order({ ...req.body, orderNumber: 'ORD-' + Date.now() }).save();
    res.status(201).json(order);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try { res.json(await Order.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
  catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
  try { await Order.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════
//  THEME ROUTES
// ═══════════════════════════════════════

app.get('/api/theme', async (req, res) => {
  try {
    let t = await Theme.findOne();
    if (!t) t = await new Theme().save();
    res.json(t);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/theme', upload.fields([{ name: 'logoImage' }, { name: 'favicon' }]), async (req, res) => {
  try {
    const data = { ...req.body, updatedAt: Date.now() };
    if (req.files?.logoImage) data.logoImage = `/uploads/${req.files.logoImage[0].filename}`;
    if (req.files?.favicon) data.favicon = `/uploads/${req.files.favicon[0].filename}`;
    res.json(await Theme.findOneAndUpdate({}, data, { new: true, upsert: true }));
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ═══════════════════════════════════════
//  STATS & CATEGORIES
// ═══════════════════════════════════════

// Track site visit
app.post('/api/track-visit', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || req.ip || 'unknown';
    const visit = await SiteVisit.findOneAndUpdate(
      { date: today },
      { $inc: { count: 1 }, $addToSet: { ips: ip } },
      { upsert: true, new: true }
    );
    res.json({ today: visit.count, unique: visit.ips.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [products, articles, orders, pendingOrders, revenueAgg, todayVisits, allVisits, users] = await Promise.all([
      Product.countDocuments(),
      Article.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      SiteVisit.findOne({ date: today }),
      SiteVisit.aggregate([{ $group: { _id: null, total: { $sum: '$count' }, uniqueTotal: { $sum: { $size: '$ips' } } } }]),
      User.countDocuments()
    ]);
    res.json({
      products, articles, orders, pendingOrders,
      revenue: revenueAgg[0]?.total || 0,
      users,
      todayVisits: todayVisits?.count || 0,
      todayUniqueVisitors: todayVisits?.ips?.length || 0,
      totalVisits: allVisits[0]?.total || 0,
      totalUniqueVisitors: allVisits[0]?.uniqueTotal || 0
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/categories', async (req, res) => {
  try {
    const [products, articles] = await Promise.all([Product.distinct('category'), Article.distinct('category')]);
    res.json({ products, articles });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Start Server ───
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

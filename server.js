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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Helper function to convert form checkbox values to boolean
const convertCheckboxToBoolean = (value) => {
  if (value === 'on' || value === true || value === 'true') return true;
  if (value === 'off' || value === false || value === 'false') return false;
  return undefined;
};

// MongoDB Connection - ATLAS ONLY (No Local Fallback)
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env file');
    }
    
    console.log('🔌 Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Atlas Connected Successfully');
    console.log('📍 Database:', mongoose.connection.name);
    console.log('🌐 Host:', mongoose.connection.host);
    
    // Initialize default data after connection
    await initializeDefaultData();
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('💡 MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'NOT SET');
    console.error('📖 You must create the database user in MongoDB Atlas first!');
    console.error('📖 See FIX-MONGODB-AUTH-ERROR.md for instructions');
    process.exit(1);
  }
};

// Initialize default data
const initializeDefaultData = async () => {
  try {
    // Create default theme if doesn't exist
    const themeExists = await Theme.findOne();
    if (!themeExists) {
      await new Theme().save();
      console.log('✅ Default theme created');
    }
    
    // Create admin user if doesn't exist
    const adminExists = await User.findOne({ phoneNumber: '+213555123456' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('anesaya', 10);
      const adminUser = new User({
        fullName: 'Admin',
        phoneNumber: '+213555123456',
        password: hashedPassword,
        isAdmin: true
      });
      await adminUser.save();
      console.log('✅ Admin user created - Phone: +213555123456');
    }
  } catch (error) {
    console.error('⚠️  Error initializing default data:', error.message);
  }
};

connectDB();

// File Upload Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, uniqueName);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: function(req, file, cb) {
    if (file.fieldname === 'file') return cb(null, true);
    var allowedTypes = /jpeg|jpg|png|gif|webp/;
    if (allowedTypes.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Separate upload for links - uses memory so we get buffer directly
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Authentication Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'No authentication token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'maman-algerienne-secret-key-2024');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin Middleware
const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

// Models
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String },
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nameAr: { type: String },
  description: { type: String, required: true },
  descriptionAr: { type: String },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  images: [String],
  stock: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  titleAr: { type: String },
  content: { type: String, required: true },
  contentAr: { type: String },
  category: { type: String, required: true },
  image: { type: String, required: true },
  contentImages: [String],
  // Enhanced content blocks for flexible article creation
  contentBlocks: [{
    id: String,
    type: { type: String, enum: ['heading', 'paragraph', 'image', 'video'], required: true },
    content: String, // For heading/paragraph text
    imageUrl: String, // For image blocks
    videoUrl: String, // For video blocks
    settings: {
      headingSize: { type: String, enum: ['h2', 'h3', 'h4'], default: 'h2' }, // For headings
      imageSize: { type: String, enum: ['small', 'medium', 'large', 'full'], default: 'medium' }, // For images
      videoSize: { type: String, enum: ['medium', 'large', 'full'], default: 'large' }, // For videos
      alignment: { type: String, enum: ['left', 'center', 'right'], default: 'left' }
    },
    order: Number
  }],
  author: { type: String, default: 'Admin' },
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const adSchema = new mongoose.Schema({
  title: { type: String, required: true },
  image: { type: String, required: true },
  link: { type: String },
  position: { type: String, enum: ['hero', 'sidebar', 'banner', 'sponsor'], default: 'banner' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  shippingAddress: {
    street: String,
    city: String,
    state: String
  },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: Number
  }],
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now }
});

const themeSchema = new mongoose.Schema({
  primaryColor: { type: String, default: '#FF69B4' },
  secondaryColor: { type: String, default: '#FFC0CB' },
  accentColor: { type: String, default: '#FFB6C1' },
  backgroundColor: { type: String, default: '#FFF5F7' },
  textColor: { type: String, default: '#333333' },
  fontFamily: { type: String, default: 'Cairo, sans-serif' },
  logoText: { type: String, default: 'Maman Algérienne' },
  logoImage: { type: String },
  favicon: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Article = mongoose.model('Article', articleSchema);
const Ad = mongoose.model('Ad', adSchema);
const Order = mongoose.model('Order', orderSchema);
const Theme = mongoose.model('Theme', themeSchema);

const downloadLinkSchema = new mongoose.Schema({
  title: { type: String, required: true },
  titleAr: String,
  description: { type: String, required: true },
  descriptionAr: String,
  image: String,
  fileName: { type: String, required: true },
  fileData: { type: Buffer, required: true },
  fileContentType: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const DownloadLink = mongoose.model('DownloadLink', downloadLinkSchema);

// ===== AUTHENTICATION ROUTES =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, phoneNumber, password } = req.body;

    // Check if user exists by phone number
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(400).json({ message: 'رقم الهاتف مستخدم بالفعل' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      fullName,
      phoneNumber,
      password: hashedPassword,
      isAdmin: false
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber, isAdmin: user.isAdmin },
      process.env.JWT_SECRET || 'maman-algerienne-secret-key-2024',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'تم التسجيل بنجاح',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Find user by phone number
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(401).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber, isAdmin: user.isAdmin },
      process.env.JWT_SECRET || 'maman-algerienne-secret-key-2024',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== PRODUCT ROUTES =====
app.get('/api/products', async (req, res) => {
  try {
    const { category, featured } = req.query;
    let query = {};
    if (category) query.category = category;
    if (featured) query.featured = true;
    
    const products = await Product.find(query).sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/products', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 5 }
]), async (req, res) => {
  try {
    console.log('Creating product...');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    const productData = { ...req.body };
    
    // Convert checkbox value to boolean
    if (productData.featured !== undefined) {
      productData.featured = convertCheckboxToBoolean(productData.featured);
    }
    
    if (req.files && req.files.image && req.files.image[0]) {
      productData.image = `/uploads/${req.files.image[0].filename}`;
    } else if (!productData.image) {
      return res.status(400).json({ message: 'Image is required' });
    }
    
    if (req.files && req.files.images) {
      productData.images = req.files.images.map(file => `/uploads/${file.filename}`);
    }
    
    const product = new Product(productData);
    await product.save();
    console.log('Product created:', product);
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/products/:id', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 5 }
]), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert checkbox value to boolean
    if (updateData.featured !== undefined) {
      updateData.featured = convertCheckboxToBoolean(updateData.featured);
    }
    
    if (req.files && req.files.image) {
      updateData.image = `/uploads/${req.files.image[0].filename}`;
    }
    
    if (req.files && req.files.images) {
      const newImages = req.files.images.map(file => `/uploads/${file.filename}`);
      updateData.images = updateData.images 
        ? [...JSON.parse(updateData.images), ...newImages]
        : newImages;
    }
    
    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== ARTICLE ROUTES =====
app.get('/api/articles', async (req, res) => {
  try {
    const { category, featured } = req.query;
    let query = {};
    if (category) query.category = category;
    if (featured) query.featured = true;
    
    const articles = await Article.find(query).sort({ createdAt: -1 });
    res.json(articles);
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/articles/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    article.views += 1;
    await article.save();
    res.json(article);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/articles', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'contentImages', maxCount: 10 }
]), async (req, res) => {
  try {
    console.log('Creating article...');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    const articleData = { ...req.body };
    
    // Convert checkbox value to boolean
    if (articleData.featured !== undefined) {
      articleData.featured = convertCheckboxToBoolean(articleData.featured);
    }
    
    if (req.files && req.files.image && req.files.image[0]) {
      articleData.image = `/uploads/${req.files.image[0].filename}`;
    } else if (!articleData.image) {
      return res.status(400).json({ message: 'Thumbnail image is required' });
    }
    
    if (req.files && req.files.contentImages) {
      articleData.contentImages = req.files.contentImages.map(file => `/uploads/${file.filename}`);
    }
    
    // Parse contentBlocks if present
    if (articleData.contentBlocks) {
      try {
        articleData.contentBlocks = JSON.parse(articleData.contentBlocks);
      } catch (e) {
        console.error('Error parsing contentBlocks:', e);
      }
    }
    
    const article = new Article(articleData);
    await article.save();
    console.log('Article created:', article);
    res.status(201).json(article);
  } catch (error) {
    console.error('Error creating article:', error);
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/articles/:id', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'contentImages', maxCount: 10 }
]), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert checkbox value to boolean
    if (updateData.featured !== undefined) {
      updateData.featured = convertCheckboxToBoolean(updateData.featured);
    }
    
    if (req.files && req.files.image) {
      updateData.image = `/uploads/${req.files.image[0].filename}`;
    }
    
    if (req.files && req.files.contentImages) {
      const newImages = req.files.contentImages.map(file => `/uploads/${file.filename}`);
      updateData.contentImages = updateData.contentImages 
        ? [...JSON.parse(updateData.contentImages), ...newImages]
        : newImages;
    }
    
    // Parse contentBlocks if present
    if (updateData.contentBlocks) {
      try {
        updateData.contentBlocks = JSON.parse(updateData.contentBlocks);
      } catch (e) {
        console.error('Error parsing contentBlocks:', e);
      }
    }
    
    const article = await Article.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(article);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/articles/:id', async (req, res) => {
  try {
    await Article.findByIdAndDelete(req.params.id);
    res.json({ message: 'Article deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== AD ROUTES =====
app.get('/api/ads', async (req, res) => {
  try {
    const { position, active } = req.query;
    let query = {};
    if (position) query.position = position;
    if (active !== undefined) query.active = active === 'true';
    
    const ads = await Ad.find(query).sort({ createdAt: -1 });
    res.json(ads);
  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/ads', upload.single('image'), async (req, res) => {
  try {
    console.log('Creating ad...');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    const adData = {
      ...req.body,
      image: req.file ? `/uploads/${req.file.filename}` : req.body.image
    };
    
    // Convert checkbox value to boolean
    if (adData.active !== undefined) {
      adData.active = convertCheckboxToBoolean(adData.active);
    }
    
    // Map 'name' field to 'title' if present (form sends 'name' but schema expects 'title')
    if (adData.name && !adData.title) {
      adData.title = adData.name;
      delete adData.name;
    }
    
    if (!adData.image) {
      return res.status(400).json({ message: 'Image is required' });
    }
    
    const ad = new Ad(adData);
    await ad.save();
    console.log('Ad created:', ad);
    res.status(201).json(ad);
  } catch (error) {
    console.error('Error creating ad:', error);
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/ads/:id', upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert checkbox value to boolean
    if (updateData.active !== undefined) {
      updateData.active = convertCheckboxToBoolean(updateData.active);
    }
    
    // Map 'name' field to 'title' if present
    if (updateData.name && !updateData.title) {
      updateData.title = updateData.name;
      delete updateData.name;
    }
    
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }
    const ad = await Ad.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(ad);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    await Ad.findByIdAndDelete(req.params.id);
    res.json({ message: 'Ad deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== ORDER ROUTES =====
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().populate('items.product').sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const orderNumber = 'ORD-' + Date.now();
    const order = new Order({
      ...req.body,
      orderNumber
    });
    await order.save();
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== THEME ROUTES =====
app.get('/api/theme', async (req, res) => {
  try {
    let theme = await Theme.findOne();
    if (!theme) {
      theme = new Theme();
      await theme.save();
    }
    res.json(theme);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/theme', upload.fields([{ name: 'logoImage' }, { name: 'favicon' }]), async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    if (req.files) {
      if (req.files.logoImage) {
        updateData.logoImage = `/uploads/${req.files.logoImage[0].filename}`;
      }
      if (req.files.favicon) {
        updateData.favicon = `/uploads/${req.files.favicon[0].filename}`;
      }
    }
    const theme = await Theme.findOneAndUpdate({}, updateData, { new: true, upsert: true });
    res.json(theme);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ===== STATISTICS ROUTE =====
app.get('/api/stats', async (req, res) => {
  try {
    const productsCount = await Product.countDocuments();
    const articlesCount = await Article.countDocuments();
    const ordersCount = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const totalRevenue = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      products: productsCount,
      articles: articlesCount,
      orders: ordersCount,
      pendingOrders,
      revenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== CATEGORIES ROUTE =====
app.get('/api/categories', async (req, res) => {
  try {
    const productCategories = await Product.distinct('category');
    const articleCategories = await Article.distinct('category');
    res.json({
      products: productCategories,
      articles: articleCategories
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
// ===== DOWNLOAD LINKS ROUTES =====

app.get('/api/links', async (req, res) => {
  try {
    var q = {};
    if (req.query.active !== undefined) q.active = req.query.active === 'true';
    res.json(await DownloadLink.find(q).select('-fileData').sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/links/:id', async (req, res) => {
  try {
    var link = await DownloadLink.findById(req.params.id).select('-fileData');
    if (!link) return res.status(404).json({ message: 'Link not found' });
    res.json(link);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/links/:id/download', async (req, res) => {
  try {
    var link = await DownloadLink.findById(req.params.id);
    if (!link) return res.status(404).json({ message: 'File not found' });
    link.downloads = (link.downloads || 0) + 1;
    await link.save();
    res.set('Content-Type', link.fileContentType);
    res.set('Content-Disposition', 'attachment; filename="' + encodeURIComponent(link.fileName) + '"');
    res.set('Content-Length', link.fileData.length);
    res.send(link.fileData);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/links', uploadMemory.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  try {
    console.log('Creating link - body:', JSON.stringify(req.body));
    console.log('Creating link - files:', req.files ? Object.keys(req.files) : 'none');

    var title = req.body.title;
    var description = req.body.description;
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description required' });
    }

    // Handle image - save to disk
    var imagePath = '';
    if (req.files && req.files.image && req.files.image[0]) {
      var imgFile = req.files.image[0];
      var imgName = Date.now() + '-' + imgFile.originalname.replace(/\s+/g, '-');
      var imgDiskPath = path.join(__dirname, 'uploads', imgName);
      fs.writeFileSync(imgDiskPath, imgFile.buffer);
      imagePath = '/uploads/' + imgName;
      console.log('Image saved to:', imagePath);
    }
    if (!imagePath) {
      return res.status(400).json({ message: 'Cover image required' });
    }

    // Handle file - store buffer in MongoDB
    if (!req.files || !req.files.file || !req.files.file[0]) {
      return res.status(400).json({ message: 'Download file required' });
    }
    var dlFile = req.files.file[0];
    console.log('File:', dlFile.originalname, 'Size:', dlFile.size, 'Type:', dlFile.mimetype);

    // Check size - MongoDB max document is 16MB
    if (dlFile.size > 15 * 1024 * 1024) {
      return res.status(400).json({ message: 'File too large. Maximum 15MB.' });
    }

    var linkData = {
      title: title,
      titleAr: req.body.titleAr || '',
      description: description,
      descriptionAr: req.body.descriptionAr || '',
      image: imagePath,
      fileName: dlFile.originalname,
      fileData: dlFile.buffer,
      fileContentType: dlFile.mimetype,
      fileSize: dlFile.size,
      active: req.body.active !== 'false',
      downloads: 0
    };

    var link = new DownloadLink(linkData);
    await link.save();
    console.log('Link saved:', link._id);

    // Return without fileData
    var result = {
      _id: link._id,
      title: link.title,
      titleAr: link.titleAr,
      description: link.description,
      descriptionAr: link.descriptionAr,
      image: link.image,
      fileName: link.fileName,
      fileSize: link.fileSize,
      fileContentType: link.fileContentType,
      active: link.active,
      downloads: link.downloads,
      createdAt: link.createdAt
    };
    res.status(201).json(result);
  } catch (err) {
    console.error('CREATE LINK ERROR:', err.message, err.stack);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.put('/api/links/:id', uploadMemory.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  try {
    var data = Object.assign({}, req.body);
    if (data.active !== undefined) data.active = convertCheckboxToBoolean(data.active);
    if (req.files && req.files.image && req.files.image[0]) {
      var imgName = Date.now() + '-' + req.files.image[0].originalname.replace(/\s+/g, '-');
      var imgPath = path.join(__dirname, 'uploads', imgName);
      fs.writeFileSync(imgPath, req.files.image[0].buffer);
      data.image = '/uploads/' + imgName;
    }
    if (req.files && req.files.file && req.files.file[0]) {
      data.fileName = req.files.file[0].originalname;
      data.fileData = req.files.file[0].buffer;
      data.fileContentType = req.files.file[0].mimetype;
      data.fileSize = req.files.file[0].size;
    }
    var link = await DownloadLink.findByIdAndUpdate(req.params.id, data, { new: true }).select('-fileData');
    res.json(link);
  } catch (err) {
    console.error('Update link error:', err);
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/links/:id', async (req, res) => {
  try { await DownloadLink.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== SHARE / OG META ENDPOINTS =====
// Test endpoint - visit /api/test to verify latest code is deployed
app.get("/api/test", (req, res) => { res.json({ status: "ok", version: "links-v2", time: new Date().toISOString() }); });

// These return HTML with OG tags for social media crawlers

var FRONTEND_URL = process.env.FRONTEND_URL || 'https://mamanalgerienne.com';
var BACKEND_URL = process.env.BACKEND_URL || 'https://maman-algerienne-backend-azx3.onrender.com';

app.get('/share/article/:id', async (req, res) => {
  try {
    var article = await Article.findById(req.params.id);
    if (!article) return res.redirect(FRONTEND_URL);
    var title = article.titleAr || article.title || 'Maman Algérienne';
    var desc = (article.contentAr || article.content || '').substring(0, 200);
    var image = article.image ? (article.image.startsWith('http') ? article.image : BACKEND_URL + article.image) : '';
    var url = FRONTEND_URL + '/articles/' + article._id;
    res.send('<!DOCTYPE html><html><head>' +
      '<meta charset="utf-8">' +
      '<title>' + title + '</title>' +
      '<meta property="og:title" content="' + title.replace(/"/g, '&quot;') + '">' +
      '<meta property="og:description" content="' + desc.replace(/"/g, '&quot;') + '">' +
      '<meta property="og:image" content="' + image + '">' +
      '<meta property="og:url" content="' + url + '">' +
      '<meta property="og:type" content="article">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + title.replace(/"/g, '&quot;') + '">' +
      '<meta name="twitter:description" content="' + desc.replace(/"/g, '&quot;') + '">' +
      '<meta name="twitter:image" content="' + image + '">' +
      '<meta http-equiv="refresh" content="0;url=' + url + '">' +
      '</head><body>Redirecting...</body></html>');
  } catch (err) { res.redirect(FRONTEND_URL); }
});

app.get('/share/product/:id', async (req, res) => {
  try {
    var product = await Product.findById(req.params.id);
    if (!product) return res.redirect(FRONTEND_URL);
    var title = product.nameAr || product.name || 'Maman Algérienne';
    var desc = (product.descriptionAr || product.description || '').substring(0, 200);
    var image = product.image ? (product.image.startsWith('http') ? product.image : BACKEND_URL + product.image) : '';
    var url = FRONTEND_URL + '/products/' + product._id;
    res.send('<!DOCTYPE html><html><head>' +
      '<meta charset="utf-8">' +
      '<title>' + title + ' - ' + product.price + ' دج</title>' +
      '<meta property="og:title" content="' + title.replace(/"/g, '&quot;') + ' - ' + product.price + ' دج">' +
      '<meta property="og:description" content="' + desc.replace(/"/g, '&quot;') + '">' +
      '<meta property="og:image" content="' + image + '">' +
      '<meta property="og:url" content="' + url + '">' +
      '<meta property="og:type" content="product">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + title.replace(/"/g, '&quot;') + '">' +
      '<meta name="twitter:description" content="' + desc.replace(/"/g, '&quot;') + '">' +
      '<meta name="twitter:image" content="' + image + '">' +
      '<meta http-equiv="refresh" content="0;url=' + url + '">' +
      '</head><body>Redirecting...</body></html>');
  } catch (err) { res.redirect(FRONTEND_URL); }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

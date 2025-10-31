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
app.use('/uploads', express.static('uploads'));

// Helper function to convert form checkbox values to boolean
const convertCheckboxToBoolean = (value) => {
  if (value === 'on' || value === true || value === 'true') return true;
  if (value === 'off' || value === false || value === 'false') return false;
  return undefined;
};

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/maman-algerienne', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.log('MongoDB Error:', err));

// File Upload Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
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
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
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

// Create default theme if doesn't exist
Theme.findOne().then(theme => {
  if (!theme) {
    new Theme().save();
  }
});

// Create admin user if doesn't exist
User.findOne({ email: 'pharmaciegaher@gmail.com' }).then(async admin => {
  if (!admin) {
    const hashedPassword = await bcrypt.hash('anesaya', 10);
    const adminUser = new User({
      fullName: 'Admin',
      email: 'pharmaciegaher@gmail.com',
      phoneNumber: '+213555123456',
      password: hashedPassword,
      isAdmin: true
    });
    await adminUser.save();
    console.log('Admin user created');
  }
});

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
        email: user.email,
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
    const { email, password } = req.body;

    // Find user by email or phone number
    const user = await User.findOne({ 
      $or: [
        { email: email },
        { phoneNumber: email } // Allow login with phone number too
      ]
    });
    if (!user) {
      return res.status(401).json({ message: 'البريد الإلكتروني/رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'البريد الإلكتروني/رقم الهاتف أو كلمة المرور غير صحيحة' });
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
        email: user.email,
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

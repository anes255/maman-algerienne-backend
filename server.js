const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

dotenv.config();

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'domymp9hl',
  api_key: process.env.CLOUDINARY_API_KEY || '449174563823259',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'V6RG7k47L5RAOm4cx7OArK2dvcs'
});

// Upload buffer to Cloudinary
var uploadToCloudinary = function(buffer, options) {
  return new Promise(function(resolve, reject) {
    var stream = cloudinary.uploader.upload_stream(options, function(err, result) {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
};

const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
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
  limits: { fileSize: 100 * 1024 * 1024 }
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

// Image stored in MongoDB
const imageSchema = new mongoose.Schema({
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true },
  filename: String,
  createdAt: { type: Date, default: Date.now }
});
const Image = mongoose.model('Image', imageSchema);

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
  fileUrl: { type: String, required: true },
  filePublicId: String,
  fileContentType: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const DownloadLink = mongoose.model('DownloadLink', downloadLinkSchema);

const commentSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Comment = mongoose.model('Comment', commentSchema);

// ===== SERVE IMAGES FROM MONGODB =====
app.get('/api/images/debug', async (req, res) => {
  try {
    var count = await Image.countDocuments();
    var sample = await Image.find().select('_id contentType filename createdAt').limit(5);
    res.json({ total: count, samples: sample });
  } catch (err) { res.json({ error: err.message }); }
});

app.get('/api/images/:id', async (req, res) => {
  try {
    var img = await Image.findById(req.params.id);
    if (!img) return res.status(404).send('Image not found');
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(img.data);
  } catch (err) {
    res.status(500).send('Error loading image: ' + err.message);
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

app.post('/api/products', uploadMemory.fields([
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
      var imgRes = await uploadToCloudinary(req.files.image[0].buffer, { folder: 'maman-algerienne/products', resource_type: 'image' });
      productData.image = imgRes.secure_url;
    } else if (!productData.image) {
      return res.status(400).json({ message: 'Image is required' });
    }
    
    if (req.files && req.files.images) {
      var imgPromises = req.files.images.map(function(file) { return uploadToCloudinary(file.buffer, { folder: 'maman-algerienne/products', resource_type: 'image' }); });
      var imgResults = await Promise.all(imgPromises);
      productData.images = imgResults.map(function(r) { return r.secure_url; });
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

app.put('/api/products/:id', uploadMemory.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 5 }
]), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert checkbox value to boolean
    if (updateData.featured !== undefined) {
      updateData.featured = convertCheckboxToBoolean(updateData.featured);
    }
    
    if (req.files && req.files.image && req.files.image[0]) {
      var imgRes = await uploadToCloudinary(req.files.image[0].buffer, { folder: 'maman-algerienne/products', resource_type: 'image' });
      updateData.image = imgRes.secure_url;
    }
    
    if (req.files && req.files.images) {
      var imgPromises = req.files.images.map(function(file) { return uploadToCloudinary(file.buffer, { folder: 'maman-algerienne/products', resource_type: 'image' }); });
      var imgResults = await Promise.all(imgPromises);
      const newImages = imgResults.map(function(r) { return r.secure_url; });
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

app.post('/api/articles', uploadMemory.fields([
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
      var imgRes = await uploadToCloudinary(req.files.image[0].buffer, { folder: 'maman-algerienne/articles', resource_type: 'image' });
      articleData.image = imgRes.secure_url;
    } else if (!articleData.image) {
      return res.status(400).json({ message: 'Thumbnail image is required' });
    }
    
    if (req.files && req.files.contentImages) {
      var ciPromises = req.files.contentImages.map(function(file) { return uploadToCloudinary(file.buffer, { folder: 'maman-algerienne/articles', resource_type: 'image' }); });
      var ciResults = await Promise.all(ciPromises);
      articleData.contentImages = ciResults.map(function(r) { return r.secure_url; });
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

app.put('/api/articles/:id', uploadMemory.fields([
  { name: 'image', maxCount: 1 },
  { name: 'contentImages', maxCount: 10 }
]), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert checkbox value to boolean
    if (updateData.featured !== undefined) {
      updateData.featured = convertCheckboxToBoolean(updateData.featured);
    }
    
    if (req.files && req.files.image && req.files.image[0]) {
      var imgRes = await uploadToCloudinary(req.files.image[0].buffer, { folder: 'maman-algerienne/articles', resource_type: 'image' });
      updateData.image = imgRes.secure_url;
    }
    
    if (req.files && req.files.contentImages) {
      var ciPromises = req.files.contentImages.map(function(file) { return uploadToCloudinary(file.buffer, { folder: 'maman-algerienne/articles', resource_type: 'image' }); });
      var ciResults = await Promise.all(ciPromises);
      const newImages = ciResults.map(function(r) { return r.secure_url; });
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

app.post('/api/ads', uploadMemory.single('image'), async (req, res) => {
  try {
    console.log('Creating ad...');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    const adData = {
      ...req.body,
      image: req.file ? (await uploadToCloudinary(req.file.buffer, { folder: 'maman-algerienne/ads', resource_type: 'image' })).secure_url : req.body.image
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

app.put('/api/ads/:id', uploadMemory.single('image'), async (req, res) => {
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
      var adImgRes = await uploadToCloudinary(req.file.buffer, { folder: 'maman-algerienne/ads', resource_type: 'image' });
      updateData.image = adImgRes.secure_url;
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

app.put('/api/theme', uploadMemory.fields([{ name: 'logoImage' }, { name: 'favicon' }]), async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    if (req.files) {
      if (req.files.logoImage) {
        var logoRes = await uploadToCloudinary(req.files.logoImage[0].buffer, { folder: 'maman-algerienne/theme', resource_type: 'image' });
        updateData.logoImage = logoRes.secure_url;
      }
      if (req.files.favicon) {
        var favRes = await uploadToCloudinary(req.files.favicon[0].buffer, { folder: 'maman-algerienne/theme', resource_type: 'image' });
        updateData.favicon = favRes.secure_url;
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
// ===== COMMENT ROUTES =====

app.get('/api/comments/:articleId', async (req, res) => {
  try {
    var comments = await Comment.find({ article: req.params.articleId }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/comments', async (req, res) => {
  try {
    var comments = await Comment.find().populate('article', 'title titleAr').sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/comments', authMiddleware, async (req, res) => {
  try {
    var articleId = req.body.articleId;
    var content = req.body.content;
    if (!articleId || !content) return res.status(400).json({ message: 'Article ID and content required' });
    var user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    var comment = await new Comment({
      article: articleId,
      user: user._id,
      userName: user.fullName,
      content: content
    }).save();
    res.status(201).json(comment);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete('/api/comments/:id', authMiddleware, async (req, res) => {
  try {
    var comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (!req.user.isAdmin && String(comment.user) !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== DOWNLOAD LINKS ROUTES =====

app.get('/api/links', async (req, res) => {
  try {
    var q = {};
    if (req.query.active !== undefined) q.active = req.query.active === 'true';
    res.json(await DownloadLink.find(q).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/links/:id', async (req, res) => {
  try {
    var link = await DownloadLink.findById(req.params.id);
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
    
    // Generate a signed URL that bypasses access restrictions
    var publicId = link.filePublicId;
    if (publicId) {
      var signedUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        sign_url: true,
        type: 'authenticated',
        secure: true
      });
      // Try signed URL first
      try {
        var https = require('https');
        var http = require('http');
        var fileUrl = link.fileUrl;
        var protocol = fileUrl.startsWith('https') ? https : http;
        
        res.set('Content-Type', link.fileContentType || 'application/octet-stream');
        res.set('Content-Disposition', 'attachment; filename="' + (link.fileName || 'download') + '"');
        
        protocol.get(fileUrl, function(fileRes) {
          if (fileRes.statusCode === 200) {
            fileRes.pipe(res);
          } else {
            // Try with signed URL
            protocol.get(signedUrl, function(signedRes) {
              if (signedRes.statusCode === 200) {
                signedRes.pipe(res);
              } else {
                res.status(500).json({ message: 'Could not download file' });
              }
            });
          }
        }).on('error', function() {
          res.status(500).json({ message: 'Download error' });
        });
      } catch (e) {
        res.status(500).json({ message: e.message });
      }
    } else {
      res.redirect(link.fileUrl);
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Test Cloudinary connection
app.get('/api/test-cloudinary', async (req, res) => {
  var cn = process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET';
  var ak = process.env.CLOUDINARY_API_KEY || 'NOT SET';
  var as = process.env.CLOUDINARY_API_SECRET ? 'SET (' + process.env.CLOUDINARY_API_SECRET.length + ' chars)' : 'NOT SET';
  try {
    var result = await cloudinary.api.ping();
    res.json({ status: 'ok', cloud_name: cn, api_key: ak, secret: as, cloudinary: result });
  } catch (err) {
    res.json({ status: 'error', cloud_name: cn, api_key: ak, secret: as, error: err.message, full: JSON.stringify(err).substring(0, 500) });
  }
});

app.post('/api/links', function(req, res) {
  uploadMemory.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }])(req, res, async function(multerErr) {
    if (multerErr) {
      console.error('MULTER ERROR:', multerErr.message);
      return res.status(400).json({ message: 'Upload error: ' + multerErr.message });
    }
    try {
      console.log('=== CREATE LINK ===');
      console.log('Body keys:', Object.keys(req.body));
      console.log('Files:', req.files ? Object.keys(req.files) : 'NONE');

      var title = req.body.title;
      var description = req.body.description;
      if (!title || !description) {
        return res.status(400).json({ message: 'Title and description required' });
      }

      // Upload image to Cloudinary
      var imagePath = '';
      if (req.files && req.files.image && req.files.image[0]) {
        console.log('Uploading image to Cloudinary...');
        var imgResult = await uploadToCloudinary(req.files.image[0].buffer, {
          folder: 'maman-algerienne/link-images',
          resource_type: 'image'
        });
        imagePath = imgResult.secure_url;
        console.log('Image uploaded:', imagePath);
      }
      if (!imagePath) {
        return res.status(400).json({ message: 'Cover image required' });
      }

      // Upload file to Cloudinary
      if (!req.files || !req.files.file || !req.files.file[0]) {
        return res.status(400).json({ message: 'Download file required' });
      }
      var dlFile = req.files.file[0];
      console.log('Uploading file to Cloudinary:', dlFile.originalname, dlFile.size);
      var fileResult = await uploadToCloudinary(dlFile.buffer, {
        folder: 'maman-algerienne/downloads',
        resource_type: 'raw',
        public_id: 'file-' + Date.now(), access_mode: 'public'
      });
      console.log('File uploaded:', fileResult.secure_url);

      var link = await new DownloadLink({
        title: title,
        titleAr: req.body.titleAr || '',
        description: description,
        descriptionAr: req.body.descriptionAr || '',
        image: imagePath,
        fileName: dlFile.originalname,
        fileUrl: fileResult.secure_url,
        filePublicId: fileResult.public_id,
        fileContentType: dlFile.mimetype,
        fileSize: dlFile.size,
        active: req.body.active !== 'false',
        downloads: 0
      }).save();
      console.log('Link saved:', link._id);

      res.status(201).json(link);
    } catch (err) {
      console.error('CREATE LINK ERROR:', err.message, err.stack);
      res.status(500).json({ message: 'Error: ' + err.message });
    }
  });
});

app.put('/api/links/:id', uploadMemory.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  try {
    var data = {};
    if (req.body.title) data.title = req.body.title;
    if (req.body.titleAr !== undefined) data.titleAr = req.body.titleAr;
    if (req.body.description) data.description = req.body.description;
    if (req.body.descriptionAr !== undefined) data.descriptionAr = req.body.descriptionAr;
    if (req.body.active !== undefined) data.active = req.body.active !== 'false';

    if (req.files && req.files.image && req.files.image[0]) {
      var imgResult = await uploadToCloudinary(req.files.image[0].buffer, {
        folder: 'maman-algerienne/link-images',
        resource_type: 'image'
      });
      data.image = imgResult.secure_url;
    }
    if (req.files && req.files.file && req.files.file[0]) {
      var dlFile = req.files.file[0];
      var fileResult = await uploadToCloudinary(dlFile.buffer, {
        folder: 'maman-algerienne/downloads',
        resource_type: 'raw',
        public_id: 'file-' + Date.now(), access_mode: 'public'
      });
      data.fileName = dlFile.originalname;
      data.fileUrl = fileResult.secure_url;
      data.filePublicId = fileResult.public_id;
      data.fileContentType = dlFile.mimetype;
      data.fileSize = dlFile.size;
    }
    var link = await DownloadLink.findByIdAndUpdate(req.params.id, data, { new: true });
    res.json(link);
  } catch (err) {
    console.error('Update link error:', err.message);
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/links/:id', async (req, res) => {
  try {
    var link = await DownloadLink.findById(req.params.id);
    if (link && link.filePublicId) {
      cloudinary.uploader.destroy(link.filePublicId, { resource_type: 'raw' }).catch(function() {});
    }
    await DownloadLink.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== SHARE / OG META ENDPOINTS =====
// Test endpoint - visit /api/test to verify latest code is deployed
app.get("/api/test", (req, res) => { res.json({ status: "ok", version: "cloudinary-v4", time: new Date().toISOString() }); });

// These return HTML with OG tags for social media crawlers

var FRONTEND_URL = process.env.FRONTEND_URL || 'https://mamanalgerienne.com';
var BACKEND_URL = process.env.BACKEND_URL || 'https://maman-algerienne-backend-1.onrender.com';

// Debug: test what a share looks like
app.get('/api/test-share/:id', async (req, res) => {
  try {
    var article = await Article.findById(req.params.id);
    if (!article) return res.json({ error: 'Article not found' });
    var image = article.image ? (article.image.startsWith('http') ? article.image : BACKEND_URL + article.image) : 'NO IMAGE';
    res.json({
      title: article.titleAr || article.title,
      image_raw: article.image,
      image_full: image,
      frontend_url: FRONTEND_URL,
      backend_url: BACKEND_URL
    });
  } catch (err) { res.json({ error: err.message }); }
});

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
